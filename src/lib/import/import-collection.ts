import { createHash } from "node:crypto";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import {
  attacks,
  cardPrintings,
  cardSets,
  games,
  importRecords,
  ownedCards,
  pokemonDetails,
  printingGroupMembers,
  printingGroups,
  printingIdentifiers,
  profiles,
  type OwnedCardMetadata,
  type PrintingMetadata,
} from "@/db/schema";
import {
  mergePrintingIdentityAttributes,
  normalizeIdentityPart,
  printingIdentityAttributesCompatible,
  stablePrintingIdentityKey,
} from "@/lib/printing-identity";

import {
  CollectionCsvError,
  parseCollectionCsv,
  type CollectionCsvHeader,
  type ParsedCollectionRow,
} from "./collection-csv";
import {
  publishedValuesCompatible,
  reconcilePublishedValue,
} from "./published-fact-reconciliation";
import { PRIMARY_COLLECTION_SOURCE_KEY } from "./source-keys";

const DEFAULT_GAME_SLUG = "pokemon-tcg";
const DEFAULT_GAME_NAME = "Pokémon Trading Card Game";

export type ImportCollectionOptions = {
  profileId: number;
  sourceKey?: string;
  gameSlug?: string;
  gameName?: string;
  dryRun?: boolean;
};

export type ImportCollectionResult = {
  profileId: number;
  sourceKey: string;
  importedEntries: number;
  importedQuantity: number;
  collectionEntries: number;
  physicalCards: number;
  createdEntries: number;
  matchedEntries: number;
  missingEntries: number;
};

function printingMetadataFor(row: ParsedCollectionRow): PrintingMetadata {
  return {
    identificationConfidence: row.identificationConfidence,
    visibleMoveOrEffect1: row.visibleMoveOrEffect1,
    ...(row.visibleMoveOrEffect2
      ? { visibleMoveOrEffect2: row.visibleMoveOrEffect2 }
      : {}),
  };
}

function ownedMetadataFor(row: ParsedCollectionRow): OwnedCardMetadata {
  return {
    ...(row.deckPool ? { deckPool: row.deckPool } : {}),
    ...(row.photoBatch ? { photoBatch: row.photoBatch } : {}),
    ...(row.gridPosition ? { gridPosition: row.gridPosition } : {}),
    ...(row.frontPhoto ? { frontPhoto: row.frontPhoto } : {}),
    ...(row.backPhoto ? { backPhoto: row.backPhoto } : {}),
  };
}

function hasPokemonDetails(row: ParsedCollectionRow): boolean {
  return [
    row.pokemonType,
    row.hp,
    row.evolvesFrom,
    row.weakness,
    row.resistance,
    row.retreatCost,
  ].some((value) => value !== null);
}

function printingRowsShareBaseIdentity(
  left: ParsedCollectionRow,
  right: ParsedCollectionRow,
): boolean {
  return (
    normalizeIdentityPart(left.setCode) ===
      normalizeIdentityPart(right.setCode) &&
    normalizeIdentityPart(left.languageCode) ===
      normalizeIdentityPart(right.languageCode) &&
    (left.collectorNumberKey ?? normalizeIdentityPart(left.name)) ===
      (right.collectorNumberKey ?? normalizeIdentityPart(right.name)) &&
    normalizeIdentityPart(left.printingVariantKey) ===
      normalizeIdentityPart(right.printingVariantKey)
  );
}

function printingRowsCanBeSameIdentity(
  left: ParsedCollectionRow,
  right: ParsedCollectionRow,
): boolean {
  return (
    printingRowsShareBaseIdentity(left, right) &&
    printingIdentityAttributesCompatible(left, right) &&
    publishedValuesCompatible(
      left.componentGroup?.groupKey,
      right.componentGroup?.groupKey,
    ) &&
    publishedValuesCompatible(
      left.componentGroup?.componentKey,
      right.componentGroup?.componentKey,
    )
  );
}

function rowConflict(
  row: ParsedCollectionRow,
  existing: ParsedCollectionRow,
  field: CollectionCsvHeader,
): CollectionCsvError {
  return new CollectionCsvError(
    `conflicts with published card facts for the same printing on CSV row ${existing.csvRowNumber}`,
    {
      rowNumber: row.csvRowNumber,
      inventoryId: row.inventoryId,
      field,
    },
  );
}

function assertRowsCompatible(
  existing: ParsedCollectionRow,
  row: ParsedCollectionRow,
): void {
  const facts = [
    [existing.name, row.name, "Name"],
    [existing.canonicalName, row.canonicalName, "English Name"],
    [existing.cardKind, row.cardKind, "Card Kind"],
    [existing.subtype, row.subtype, "Stage / Trainer Subtype"],
    [existing.pokemonType, row.pokemonType, "TCG Type"],
    [existing.hp, row.hp, "HP"],
    [existing.specialRuleBox, row.specialRuleBox, "Special / Rule Box"],
    [existing.rarity, row.rarity, "Finish / Variant"],
    [existing.regulationMark, row.regulationMark, "Regulation Mark"],
    [
      existing.externalReferenceUrl,
      row.externalReferenceUrl,
      "Collector Source",
    ],
    [existing.catalogProvider, row.catalogProvider, "Catalog Provider"],
    [existing.catalogSetId, row.catalogSetId, "Catalog Set ID"],
    [existing.catalogCardId, row.catalogCardId, "Catalog Card ID"],
    [existing.evolvesFrom, row.evolvesFrom, "Evolves From"],
    [existing.abilityRule, row.abilityRule, "Ability / Rule"],
    [existing.weakness, row.weakness, "Weakness"],
    [existing.resistance, row.resistance, "Resistance"],
    [existing.retreatCost, row.retreatCost, "Retreat Cost"],
    [existing.rulesText, row.rulesText, "Trainer / Other Text"],
    [
      existing.identificationConfidence,
      row.identificationConfidence,
      "ID Confidence",
    ],
    [
      existing.visibleMoveOrEffect1,
      row.visibleMoveOrEffect1,
      "Visible Move / Effect 1",
    ],
    [
      existing.visibleMoveOrEffect2,
      row.visibleMoveOrEffect2,
      "Visible Move / Effect 2",
    ],
    [
      existing.componentGroup?.groupType,
      row.componentGroup?.groupType,
      "Component Group Type",
    ],
    [
      existing.componentGroup?.name,
      row.componentGroup?.name,
      "Component Group Name",
    ],
    [
      existing.componentGroup?.expectedComponentCount,
      row.componentGroup?.expectedComponentCount,
      "Expected Component Count",
    ],
  ] as const;

  for (const [known, incoming, field] of facts) {
    if (!publishedValuesCompatible(known, incoming)) {
      throw rowConflict(row, existing, field);
    }
  }

  for (const existingAttack of existing.attacks) {
    const incomingAttack = row.attacks.find(
      (attack) => attack.position === existingAttack.position,
    );
    if (!incomingAttack) continue;

    const attackFacts = [
      [
        existingAttack.name,
        incomingAttack.name,
        `Attack ${existingAttack.position} Name`,
      ],
      [
        existingAttack.cost,
        incomingAttack.cost,
        `Attack ${existingAttack.position} Cost`,
      ],
      [
        existingAttack.damage,
        incomingAttack.damage,
        `Attack ${existingAttack.position} Damage`,
      ],
      [
        existingAttack.effect,
        incomingAttack.effect,
        `Attack ${existingAttack.position} Effect`,
      ],
    ] as const;
    for (const [known, incoming, field] of attackFacts) {
      if (!publishedValuesCompatible(known, incoming)) {
        throw rowConflict(row, existing, field as CollectionCsvHeader);
      }
    }
  }

  for (const role of new Set(
    existing.printedIdentifiers.map((identifier) => identifier.role),
  )) {
    const existingForRole = existing.printedIdentifiers.filter(
      (identifier) => identifier.role === role,
    );
    const incomingForRole = row.printedIdentifiers.filter(
      (identifier) => identifier.role === role,
    );
    if (
      incomingForRole.length > 0 &&
      !existingForRole.some((known) =>
        incomingForRole.some((incoming) =>
          publishedValuesCompatible(known.value, incoming.value),
        ),
      )
    ) {
      throw rowConflict(row, existing, "Printed Identifiers");
    }
  }
}

function validatePrintingConsistency(rows: ParsedCollectionRow[]): void {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const existing = rows[previousIndex]!;
      if (
        normalizeIdentityPart(existing.setCode) ===
          normalizeIdentityPart(row.setCode) &&
        normalizeIdentityPart(existing.languageCode) ===
          normalizeIdentityPart(row.languageCode)
      ) {
        const setFacts = [
          [existing.expansion, row.expansion, "Expansion"],
          [existing.catalogProvider, row.catalogProvider, "Catalog Provider"],
          [existing.catalogSetId, row.catalogSetId, "Catalog Set ID"],
        ] as const;
        for (const [known, incoming, field] of setFacts) {
          if (!publishedValuesCompatible(known, incoming)) {
            throw rowConflict(row, existing, field);
          }
        }
      }

      if (printingRowsCanBeSameIdentity(existing, row)) {
        assertRowsCompatible(existing, row);
      }
    }
  }

  for (const row of rows) {
    const candidates = rows.filter(
      (candidate) =>
        candidate !== row && printingRowsCanBeSameIdentity(candidate, row),
    );
    const hasDistinctCandidates = candidates.some((candidate, index) =>
      candidates
        .slice(index + 1)
        .some((other) => !printingRowsCanBeSameIdentity(candidate, other)),
    );
    if (hasDistinctCandidates) {
      throw new CollectionCsvError(
        "matches multiple distinguishable printings in this CSV; add exact identity facts",
        {
          rowNumber: row.csvRowNumber,
          inventoryId: row.inventoryId,
          field: "Printing Finish",
        },
      );
    }
  }
}

function reconcileRowValue<T extends string | number | readonly string[]>(
  existing: T | null | undefined,
  incoming: T | null | undefined,
  row: ParsedCollectionRow,
  field: CollectionCsvHeader,
): T | null {
  return reconcilePublishedValue(
    existing,
    incoming,
    () =>
      new CollectionCsvError("conflicts with existing shared published data", {
        rowNumber: row.csvRowNumber,
        inventoryId: row.inventoryId,
        field,
      }),
  );
}

class DryRunRollback extends Error {
  constructor() {
    super("Roll back successful collection import dry run.");
    this.name = "DryRunRollback";
  }
}

function runImportTransaction(
  db: AppDatabase,
  dryRun: boolean,
  work: Parameters<AppDatabase["transaction"]>[0],
): void {
  try {
    db.transaction((tx) => {
      const result = work(tx);
      if (dryRun) throw new DryRunRollback();
      return result;
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
}

export function importCollectionCsv(
  db: AppDatabase,
  input: string | Buffer,
  options: ImportCollectionOptions,
): ImportCollectionResult {
  const profileId = options.profileId;
  if (!Number.isInteger(profileId) || profileId <= 0) {
    throw new Error(
      "A valid target profile ID is required for collection import.",
    );
  }

  const targetProfile = db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .get();
  if (!targetProfile) {
    throw new Error(`Collection profile ${profileId} does not exist.`);
  }

  const sourceKey =
    options.sourceKey === undefined
      ? PRIMARY_COLLECTION_SOURCE_KEY
      : options.sourceKey.trim().normalize("NFC");
  if (sourceKey.length === 0) {
    throw new Error(
      "A non-empty source key is required for collection import.",
    );
  }
  if (sourceKey.length > 200) {
    throw new Error("The collection import source key is too long.");
  }
  const gameSlug = options.gameSlug?.trim() || DEFAULT_GAME_SLUG;
  const gameName = options.gameName?.trim() || DEFAULT_GAME_NAME;
  const rows = parseCollectionCsv(input);
  validatePrintingConsistency(rows);

  const sourceHash = createHash("sha256").update(input).digest("hex");
  let createdEntries = 0;
  let matchedEntries = 0;
  let missingEntries = 0;
  let collectionEntries = 0;
  let physicalCards = 0;

  runImportTransaction(db, options.dryRun === true, (tx) => {
    const remainingInventoryIds = new Set(
      tx
        .select({ externalInventoryId: importRecords.externalInventoryId })
        .from(importRecords)
        .where(
          and(
            eq(importRecords.profileId, profileId),
            eq(importRecords.sourceKey, sourceKey),
          ),
        )
        .all()
        .map((record) => record.externalInventoryId),
    );

    let game = tx
      .select({ id: games.id, name: games.name })
      .from(games)
      .where(eq(games.slug, gameSlug))
      .get();
    if (!game) {
      game = tx
        .insert(games)
        .values({ slug: gameSlug, name: gameName })
        .returning({ id: games.id, name: games.name })
        .get();
    } else if (!publishedValuesCompatible(game.name, gameName)) {
      throw new Error(
        `Game ${gameSlug} is already named "${game.name}" and cannot be renamed by collection import.`,
      );
    }

    for (const row of rows) {
      let cardSet = tx
        .select({
          id: cardSets.id,
          name: cardSets.name,
          catalogProvider: cardSets.catalogProvider,
          catalogExternalId: cardSets.catalogExternalId,
        })
        .from(cardSets)
        .where(
          and(
            eq(cardSets.gameId, game.id),
            eq(cardSets.code, row.setCode),
            eq(cardSets.languageCode, row.languageCode),
          ),
        )
        .get();
      if (!cardSet) {
        cardSet = tx
          .insert(cardSets)
          .values({
            gameId: game.id,
            code: row.setCode,
            name: row.expansion,
            languageCode: row.languageCode,
            catalogProvider: row.catalogProvider,
            catalogExternalId: row.catalogSetId,
          })
          .returning({
            id: cardSets.id,
            name: cardSets.name,
            catalogProvider: cardSets.catalogProvider,
            catalogExternalId: cardSets.catalogExternalId,
          })
          .get();
      } else {
        const reconciledName = reconcileRowValue(
          cardSet.name,
          row.expansion,
          row,
          "Expansion",
        );
        const reconciledCatalogProvider = reconcileRowValue(
          cardSet.catalogProvider,
          row.catalogProvider,
          row,
          "Catalog Provider",
        );
        const reconciledCatalogExternalId = reconcileRowValue(
          cardSet.catalogExternalId,
          row.catalogSetId,
          row,
          "Catalog Set ID",
        );
        tx.update(cardSets)
          .set({
            name: reconciledName!,
            catalogProvider: reconciledCatalogProvider,
            catalogExternalId: reconciledCatalogExternalId,
          })
          .where(eq(cardSets.id, cardSet.id))
          .run();
        cardSet = {
          ...cardSet,
          name: reconciledName!,
          catalogProvider: reconciledCatalogProvider,
          catalogExternalId: reconciledCatalogExternalId,
        };
      }

      let componentGroup:
        | {
            id: number;
            groupKey: string;
            groupType: string;
            name: string | null;
            expectedComponentCount: number | null;
          }
        | undefined;
      if (row.componentGroup) {
        componentGroup = tx
          .select({
            id: printingGroups.id,
            groupKey: printingGroups.groupKey,
            groupType: printingGroups.groupType,
            name: printingGroups.name,
            expectedComponentCount: printingGroups.expectedComponentCount,
          })
          .from(printingGroups)
          .where(
            and(
              eq(printingGroups.setId, cardSet.id),
              eq(printingGroups.groupKey, row.componentGroup.groupKey),
            ),
          )
          .get();
        if (!componentGroup) {
          componentGroup = tx
            .insert(printingGroups)
            .values({
              setId: cardSet.id,
              groupKey: row.componentGroup.groupKey,
              groupType: row.componentGroup.groupType,
              name: row.componentGroup.name,
              expectedComponentCount: row.componentGroup.expectedComponentCount,
            })
            .returning({
              id: printingGroups.id,
              groupKey: printingGroups.groupKey,
              groupType: printingGroups.groupType,
              name: printingGroups.name,
              expectedComponentCount: printingGroups.expectedComponentCount,
            })
            .get();
        } else {
          const reconciledGroupType = reconcileRowValue(
            componentGroup.groupType,
            row.componentGroup.groupType,
            row,
            "Component Group Type",
          );
          const reconciledGroupName = reconcileRowValue(
            componentGroup.name,
            row.componentGroup.name,
            row,
            "Component Group Name",
          );
          const reconciledExpectedCount = reconcileRowValue(
            componentGroup.expectedComponentCount,
            row.componentGroup.expectedComponentCount,
            row,
            "Expected Component Count",
          );
          tx.update(printingGroups)
            .set({
              groupType: reconciledGroupType!,
              name: reconciledGroupName,
              expectedComponentCount: reconciledExpectedCount,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(printingGroups.id, componentGroup.id))
            .run();
          componentGroup = {
            ...componentGroup,
            groupType: reconciledGroupType!,
            name: reconciledGroupName,
            expectedComponentCount: reconciledExpectedCount,
          };
        }
      }

      const stableIdentityKey = stablePrintingIdentityKey({
        gameSlug,
        setCode: row.setCode,
        languageCode: row.languageCode,
        name: row.name,
        collectorNumber: row.collectorNumber,
        printingVariantKey: row.printingVariantKey,
        printingFinish: row.printingFinish,
        physicalForm: row.physicalForm,
        cardBackDesign: row.cardBackDesign,
        catalogProvider: row.catalogProvider,
        catalogSetId: row.catalogSetId,
        catalogCardId: row.catalogCardId,
        componentGroupKey: row.componentGroup?.groupKey,
        componentKey: row.componentGroup?.componentKey,
      });
      const exactPrinting = tx
        .select({
          id: cardPrintings.id,
          name: cardPrintings.name,
          collectorNumber: cardPrintings.collectorNumber,
          stableIdentityKey: cardPrintings.stableIdentityKey,
          printingVariantKey: cardPrintings.printingVariantKey,
          languageCode: cardPrintings.languageCode,
          catalogProvider: cardPrintings.catalogProvider,
          catalogExternalId: cardPrintings.catalogExternalId,
          cardBackDesign: cardPrintings.cardBackDesign,
          printingFinish: cardPrintings.printingFinish,
          physicalForm: cardPrintings.physicalForm,
        })
        .from(cardPrintings)
        .where(eq(cardPrintings.stableIdentityKey, stableIdentityKey))
        .get();
      const exactComponent = exactPrinting
        ? tx
            .select({
              groupKey: printingGroups.groupKey,
              componentKey: printingGroupMembers.componentKey,
            })
            .from(printingGroupMembers)
            .innerJoin(
              printingGroups,
              eq(printingGroupMembers.groupId, printingGroups.id),
            )
            .where(eq(printingGroupMembers.printingId, exactPrinting.id))
            .get()
        : undefined;
      const hasCanonicalExactPrinting =
        exactPrinting !== undefined &&
        exactPrinting.stableIdentityKey ===
          stablePrintingIdentityKey({
            gameSlug,
            setCode: row.setCode,
            languageCode: exactPrinting.languageCode,
            name: exactPrinting.name,
            collectorNumber: exactPrinting.collectorNumber,
            printingVariantKey: exactPrinting.printingVariantKey,
            catalogProvider: exactPrinting.catalogProvider,
            catalogSetId: cardSet.catalogExternalId,
            catalogCardId: exactPrinting.catalogExternalId,
            componentGroupKey: exactComponent?.groupKey,
            componentKey: exactComponent?.componentKey,
            cardBackDesign: exactPrinting.cardBackDesign,
            printingFinish: exactPrinting.printingFinish,
            physicalForm: exactPrinting.physicalForm,
          });
      const candidateConditions = [
        eq(cardPrintings.setId, cardSet.id),
        eq(cardPrintings.languageCode, row.languageCode),
        eq(cardPrintings.printingVariantKey, row.printingVariantKey),
        row.collectorNumberKey === null
          ? and(
              isNull(cardPrintings.collectorNumberKey),
              eq(cardPrintings.name, row.name),
            )
          : eq(cardPrintings.collectorNumberKey, row.collectorNumberKey),
      ];
      let candidates = tx
        .select({
          id: cardPrintings.id,
          stableIdentityKey: cardPrintings.stableIdentityKey,
          catalogProvider: cardPrintings.catalogProvider,
          catalogExternalId: cardPrintings.catalogExternalId,
          cardBackDesign: cardPrintings.cardBackDesign,
          printingFinish: cardPrintings.printingFinish,
          physicalForm: cardPrintings.physicalForm,
        })
        .from(cardPrintings)
        .where(and(...candidateConditions))
        .all()
        .filter((candidate) =>
          printingIdentityAttributesCompatible(candidate, row),
        );
      if (componentGroup && row.componentGroup) {
        candidates = candidates.filter((candidate) => {
          const membership = tx
            .select({ componentKey: printingGroupMembers.componentKey })
            .from(printingGroupMembers)
            .where(
              and(
                eq(printingGroupMembers.groupId, componentGroup.id),
                eq(printingGroupMembers.printingId, candidate.id),
              ),
            )
            .get();
          return (
            membership === undefined ||
            membership.componentKey === row.componentGroup?.componentKey
          );
        });
      }
      if (
        hasCanonicalExactPrinting &&
        !candidates.some((candidate) => candidate.id === exactPrinting.id)
      ) {
        throw new CollectionCsvError(
          "catalog identity conflicts with incompatible published printing facts",
          {
            rowNumber: row.csvRowNumber,
            inventoryId: row.inventoryId,
            field: "Catalog Card ID",
          },
        );
      }
      if (!hasCanonicalExactPrinting && candidates.length > 1) {
        throw new CollectionCsvError(
          "matches multiple local printings; add exact distinguishing facts",
          {
            rowNumber: row.csvRowNumber,
            inventoryId: row.inventoryId,
            field: "Catalog Card ID",
          },
        );
      }

      const matchedPrinting = hasCanonicalExactPrinting
        ? exactPrinting
        : candidates[0];
      let printing = matchedPrinting
        ? tx
            .select()
            .from(cardPrintings)
            .where(eq(cardPrintings.id, matchedPrinting.id))
            .get()
        : undefined;
      if (
        printing &&
        row.catalogProvider &&
        row.catalogCardId &&
        printing.catalogProvider !== null &&
        (!publishedValuesCompatible(
          printing.catalogProvider,
          row.catalogProvider,
        ) ||
          !publishedValuesCompatible(
            printing.catalogExternalId,
            row.catalogCardId,
          ))
      ) {
        throw new CollectionCsvError(
          `conflicts with existing printing catalog identity ${printing.catalogProvider}/${printing.catalogExternalId}`,
          {
            rowNumber: row.csvRowNumber,
            inventoryId: row.inventoryId,
            field: "Catalog Card ID",
          },
        );
      }

      const publishedValues = {
        setId: cardSet.id,
        name: row.name,
        canonicalName: row.canonicalName,
        collectorNumber: row.collectorNumber,
        collectorNumberKey: row.collectorNumberKey,
        collectorNumberSort: row.collectorNumberSort,
        stableIdentityKey,
        printingVariantKey: row.printingVariantKey,
        languageCode: row.languageCode,
        catalogProvider: row.catalogProvider,
        catalogExternalId: row.catalogCardId,
        cardBackDesign: row.cardBackDesign,
        printingFinish: row.printingFinish,
        physicalForm: row.physicalForm,
        cardKind: row.cardKind,
        subtype: row.subtype,
        rarity: row.rarity,
        regulationMark: row.regulationMark,
        specialRuleBox: row.specialRuleBox,
        abilityRule: row.abilityRule,
        rulesText: row.rulesText,
        identificationConfidence: row.identificationConfidence,
        externalReferenceUrl: row.externalReferenceUrl,
        metadata: printingMetadataFor(row),
      };
      if (!printing) {
        printing = tx
          .insert(cardPrintings)
          .values(publishedValues)
          .returning()
          .get();
      } else {
        const resolvedAttributes = mergePrintingIdentityAttributes(
          printing,
          row,
        );
        const existingComponent = tx
          .select({
            groupKey: printingGroups.groupKey,
            componentKey: printingGroupMembers.componentKey,
          })
          .from(printingGroupMembers)
          .innerJoin(
            printingGroups,
            eq(printingGroupMembers.groupId, printingGroups.id),
          )
          .where(eq(printingGroupMembers.printingId, printing.id))
          .get();
        if (
          existingComponent &&
          row.componentGroup &&
          (!publishedValuesCompatible(
            existingComponent.groupKey,
            row.componentGroup.groupKey,
          ) ||
            !publishedValuesCompatible(
              existingComponent.componentKey,
              row.componentGroup.componentKey,
            ))
        ) {
          throw new CollectionCsvError(
            "conflicts with existing printing component identity",
            {
              rowNumber: row.csvRowNumber,
              inventoryId: row.inventoryId,
              field: "Component Key",
            },
          );
        }
        const reconciledName = reconcileRowValue(
          printing.name,
          row.name,
          row,
          "Name",
        );
        const reconciledCanonicalName = reconcileRowValue(
          printing.canonicalName,
          row.canonicalName,
          row,
          "English Name",
        );
        const reconciledCollectorNumber = reconcileRowValue(
          printing.collectorNumber,
          row.collectorNumber,
          row,
          "Collector No.",
        );
        const reconciledCatalogProvider = reconcileRowValue(
          printing.catalogProvider,
          row.catalogProvider,
          row,
          "Catalog Provider",
        );
        const reconciledCatalogCardId = reconcileRowValue(
          printing.catalogExternalId,
          row.catalogCardId,
          row,
          "Catalog Card ID",
        );
        const reconciledCardKind = reconcileRowValue(
          printing.cardKind,
          row.cardKind,
          row,
          "Card Kind",
        );
        const reconciledSubtype = reconcileRowValue(
          printing.subtype,
          row.subtype,
          row,
          "Stage / Trainer Subtype",
        );
        const reconciledRarity = reconcileRowValue(
          printing.rarity,
          row.rarity,
          row,
          "Finish / Variant",
        );
        const reconciledRegulationMark = reconcileRowValue(
          printing.regulationMark,
          row.regulationMark,
          row,
          "Regulation Mark",
        );
        const reconciledSpecialRuleBox = reconcileRowValue(
          printing.specialRuleBox,
          row.specialRuleBox,
          row,
          "Special / Rule Box",
        );
        const reconciledAbilityRule = reconcileRowValue(
          printing.abilityRule,
          row.abilityRule,
          row,
          "Ability / Rule",
        );
        const reconciledRulesText = reconcileRowValue(
          printing.rulesText,
          row.rulesText,
          row,
          "Trainer / Other Text",
        );
        const reconciledConfidence = reconcileRowValue(
          printing.identificationConfidence ??
            printing.metadata.identificationConfidence,
          row.identificationConfidence,
          row,
          "ID Confidence",
        );
        const reconciledExternalReferenceUrl = reconcileRowValue(
          printing.externalReferenceUrl,
          row.externalReferenceUrl,
          row,
          "Collector Source",
        );
        const reconciledVisibleMoveOrEffect1 = reconcileRowValue(
          printing.metadata.visibleMoveOrEffect1,
          row.visibleMoveOrEffect1,
          row,
          "Visible Move / Effect 1",
        );
        const reconciledVisibleMoveOrEffect2 = reconcileRowValue(
          printing.metadata.visibleMoveOrEffect2,
          row.visibleMoveOrEffect2,
          row,
          "Visible Move / Effect 2",
        );
        const reconciledMetadata: PrintingMetadata = {
          ...(reconciledConfidence
            ? { identificationConfidence: reconciledConfidence }
            : {}),
          ...(reconciledVisibleMoveOrEffect1
            ? { visibleMoveOrEffect1: reconciledVisibleMoveOrEffect1 }
            : {}),
          ...(reconciledVisibleMoveOrEffect2
            ? { visibleMoveOrEffect2: reconciledVisibleMoveOrEffect2 }
            : {}),
        };
        const reconciledStableIdentityKey = stablePrintingIdentityKey({
          gameSlug,
          setCode: row.setCode,
          languageCode: printing.languageCode,
          name: reconciledName!,
          collectorNumber: reconciledCollectorNumber,
          printingVariantKey: printing.printingVariantKey,
          catalogProvider: reconciledCatalogProvider,
          catalogSetId: cardSet.catalogExternalId,
          catalogCardId: reconciledCatalogCardId,
          componentGroupKey:
            existingComponent?.groupKey ?? row.componentGroup?.groupKey,
          componentKey:
            existingComponent?.componentKey ?? row.componentGroup?.componentKey,
          ...resolvedAttributes,
        });
        const keyOwner = tx
          .select({ id: cardPrintings.id })
          .from(cardPrintings)
          .where(
            and(
              eq(cardPrintings.stableIdentityKey, reconciledStableIdentityKey),
              ne(cardPrintings.id, printing.id),
            ),
          )
          .get();
        if (keyOwner) {
          throw new CollectionCsvError(
            "canonical printing identity is already linked to another printing",
            {
              rowNumber: row.csvRowNumber,
              inventoryId: row.inventoryId,
              field: "Catalog Card ID",
            },
          );
        }
        tx.update(cardPrintings)
          .set({
            name: reconciledName!,
            canonicalName: reconciledCanonicalName,
            collectorNumber: reconciledCollectorNumber,
            collectorNumberKey:
              printing.collectorNumberKey ?? row.collectorNumberKey,
            collectorNumberSort:
              printing.collectorNumber === null && row.collectorNumber !== null
                ? row.collectorNumberSort
                : printing.collectorNumberSort,
            stableIdentityKey: reconciledStableIdentityKey,
            catalogProvider: reconciledCatalogProvider,
            catalogExternalId: reconciledCatalogCardId,
            ...resolvedAttributes,
            cardKind: reconciledCardKind!,
            subtype: reconciledSubtype,
            rarity: reconciledRarity,
            regulationMark: reconciledRegulationMark,
            specialRuleBox: reconciledSpecialRuleBox,
            abilityRule: reconciledAbilityRule,
            rulesText: reconciledRulesText,
            identificationConfidence: reconciledConfidence,
            externalReferenceUrl: reconciledExternalReferenceUrl,
            metadata: reconciledMetadata,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(cardPrintings.id, printing.id))
          .run();
      }

      if (row.printedIdentifiers.length > 0) {
        const existingIdentifiers = tx
          .select()
          .from(printingIdentifiers)
          .where(eq(printingIdentifiers.printingId, printing.id))
          .all();
        for (const role of new Set(
          row.printedIdentifiers.map((identifier) => identifier.role),
        )) {
          const existingForRole = existingIdentifiers.filter(
            (identifier) => identifier.role === role,
          );
          const incomingForRole = row.printedIdentifiers.filter(
            (identifier) => identifier.role === role,
          );
          if (
            existingForRole.length > 0 &&
            !existingForRole.some((existing) =>
              incomingForRole.some((incoming) =>
                publishedValuesCompatible(existing.value, incoming.value),
              ),
            )
          ) {
            throw new CollectionCsvError(
              `conflicts with existing printed identifier for role ${role}`,
              {
                rowNumber: row.csvRowNumber,
                inventoryId: row.inventoryId,
                field: "Printed Identifiers",
              },
            );
          }
        }
        for (const identifier of row.printedIdentifiers) {
          const sameRole = existingIdentifiers.filter(
            (existing) => existing.role === identifier.role,
          );
          const matching = sameRole.find((existing) =>
            publishedValuesCompatible(existing.value, identifier.value),
          );
          if (matching) {
            const reconciledLabel = reconcileRowValue(
              matching.label,
              identifier.label,
              row,
              "Printed Identifiers",
            );
            if (reconciledLabel !== matching.label) {
              tx.update(printingIdentifiers)
                .set({ label: reconciledLabel })
                .where(eq(printingIdentifiers.id, matching.id))
                .run();
            }
          } else {
            tx.insert(printingIdentifiers)
              .values({
                printingId: printing.id,
                role: identifier.role,
                value: identifier.value,
                label: identifier.label,
              })
              .run();
          }
        }
      }
      if (componentGroup && row.componentGroup) {
        const occupied = tx
          .select({ printingId: printingGroupMembers.printingId })
          .from(printingGroupMembers)
          .where(
            and(
              eq(printingGroupMembers.groupId, componentGroup.id),
              eq(
                printingGroupMembers.componentKey,
                row.componentGroup.componentKey,
              ),
            ),
          )
          .get();
        if (occupied && occupied.printingId !== printing.id) {
          throw new CollectionCsvError(
            `component ${row.componentGroup.componentKey} is already assigned in group ${componentGroup.groupKey}`,
            {
              rowNumber: row.csvRowNumber,
              inventoryId: row.inventoryId,
              field: "Component Key",
            },
          );
        }
        tx.insert(printingGroupMembers)
          .values({
            groupId: componentGroup.id,
            printingId: printing.id,
            componentKey: row.componentGroup.componentKey,
          })
          .onConflictDoNothing()
          .run();
      }

      const existingPokemonDetails = tx
        .select()
        .from(pokemonDetails)
        .where(eq(pokemonDetails.printingId, printing.id))
        .get();
      if (!existingPokemonDetails && hasPokemonDetails(row)) {
        tx.insert(pokemonDetails)
          .values({
            printingId: printing.id,
            pokemonType: row.pokemonType,
            hp: row.hp,
            evolvesFrom: row.evolvesFrom,
            weakness: row.weakness,
            resistance: row.resistance,
            retreatCost: row.retreatCost,
          })
          .run();
      } else if (existingPokemonDetails) {
        tx.update(pokemonDetails)
          .set({
            pokemonType: reconcileRowValue(
              existingPokemonDetails.pokemonType,
              row.pokemonType,
              row,
              "TCG Type",
            ),
            hp: reconcileRowValue(existingPokemonDetails.hp, row.hp, row, "HP"),
            evolvesFrom: reconcileRowValue(
              existingPokemonDetails.evolvesFrom,
              row.evolvesFrom,
              row,
              "Evolves From",
            ),
            weakness: reconcileRowValue(
              existingPokemonDetails.weakness,
              row.weakness,
              row,
              "Weakness",
            ),
            resistance: reconcileRowValue(
              existingPokemonDetails.resistance,
              row.resistance,
              row,
              "Resistance",
            ),
            retreatCost: reconcileRowValue(
              existingPokemonDetails.retreatCost,
              row.retreatCost,
              row,
              "Retreat Cost",
            ),
          })
          .where(eq(pokemonDetails.printingId, printing.id))
          .run();
      }

      const existingAttacks = tx
        .select()
        .from(attacks)
        .where(eq(attacks.printingId, printing.id))
        .all();
      for (const attack of row.attacks) {
        const existingAttack = existingAttacks.find(
          (candidate) => candidate.position === attack.position,
        );
        if (!existingAttack) {
          tx.insert(attacks)
            .values({
              printingId: printing.id,
              position: attack.position,
              name: attack.name,
              cost: attack.cost,
              damage: attack.damage,
              effect: attack.effect,
            })
            .run();
        } else {
          tx.update(attacks)
            .set({
              name: reconcileRowValue(
                existingAttack.name,
                attack.name,
                row,
                `Attack ${attack.position} Name` as CollectionCsvHeader,
              )!,
              cost: reconcileRowValue(
                existingAttack.cost,
                attack.cost,
                row,
                `Attack ${attack.position} Cost` as CollectionCsvHeader,
              ) as string[],
              damage: reconcileRowValue(
                existingAttack.damage,
                attack.damage,
                row,
                `Attack ${attack.position} Damage` as CollectionCsvHeader,
              ),
              effect: reconcileRowValue(
                existingAttack.effect,
                attack.effect,
                row,
                `Attack ${attack.position} Effect` as CollectionCsvHeader,
              ),
            })
            .where(eq(attacks.id, existingAttack.id))
            .run();
        }
      }

      const existingImport = tx
        .select({
          importRecordId: importRecords.id,
          ownedCardId: importRecords.ownedCardId,
        })
        .from(importRecords)
        .where(
          and(
            eq(importRecords.profileId, profileId),
            eq(importRecords.sourceKey, sourceKey),
            eq(importRecords.externalInventoryId, row.inventoryId),
          ),
        )
        .get();

      let ownedCardId: number;

      if (existingImport) {
        matchedEntries += 1;
        remainingInventoryIds.delete(row.inventoryId);
        ownedCardId = existingImport.ownedCardId;
        tx.update(ownedCards)
          .set({
            printingId: printing.id,
            quantity: row.quantity,
            condition: row.condition,
            finishVariant: row.finishVariant,
            sealed: row.sealed,
            notes: row.notes,
            metadata: ownedMetadataFor(row),
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(ownedCards.profileId, profileId),
              eq(ownedCards.id, ownedCardId),
            ),
          )
          .run();

        tx.update(importRecords)
          .set({
            rawRow: row.rawRow,
            sourceHash,
            importedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(importRecords.id, existingImport.importRecordId))
          .run();
      } else {
        createdEntries += 1;
        const ownedCard = tx
          .insert(ownedCards)
          .values({
            profileId,
            printingId: printing.id,
            quantity: row.quantity,
            condition: row.condition,
            finishVariant: row.finishVariant,
            sealed: row.sealed,
            notes: row.notes,
            metadata: ownedMetadataFor(row),
          })
          .returning({ id: ownedCards.id })
          .get();
        ownedCardId = ownedCard.id;

        tx.insert(importRecords)
          .values({
            profileId,
            sourceKey,
            externalInventoryId: row.inventoryId,
            ownedCardId,
            rawRow: row.rawRow,
            sourceHash,
          })
          .run();
      }
    }

    const totals = tx
      .select({
        collectionEntries: sql<number>`count(*)`,
        physicalCards: sql<number>`coalesce(sum(${ownedCards.quantity}), 0)`,
      })
      .from(ownedCards)
      .where(eq(ownedCards.profileId, profileId))
      .get();
    if (!totals) {
      throw new Error("Could not calculate collection totals after import");
    }

    collectionEntries = totals.collectionEntries;
    physicalCards = totals.physicalCards;
    missingEntries = remainingInventoryIds.size;
  });

  return {
    profileId,
    sourceKey,
    importedEntries: rows.length,
    importedQuantity: rows.reduce((total, row) => total + row.quantity, 0),
    collectionEntries,
    physicalCards,
    createdEntries,
    matchedEntries,
    missingEntries,
  };
}

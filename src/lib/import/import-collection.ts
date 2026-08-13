import { createHash } from "node:crypto";

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

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
import { stablePrintingIdentityKey } from "@/lib/printing-identity";

import {
  CollectionCsvError,
  parseCollectionCsv,
  type ParsedCollectionRow,
} from "./collection-csv";

const DEFAULT_SOURCE_KEY = "data/seed/collection.csv";
const DEFAULT_GAME_SLUG = "pokemon-tcg";
const DEFAULT_GAME_NAME = "Pokémon Trading Card Game";

export type ImportCollectionOptions = {
  profileId: number;
  sourceKey?: string;
  gameSlug?: string;
  gameName?: string;
};

export type ImportCollectionResult = {
  profileId: number;
  sourceKey: string;
  importedEntries: number;
  importedQuantity: number;
  collectionEntries: number;
  physicalCards: number;
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
    row.abilityRule,
    row.weakness,
    row.resistance,
    row.retreatCost,
  ].some((value) => value !== null);
}

function publishedFactsSignature(row: ParsedCollectionRow): string {
  return JSON.stringify({
    name: row.name,
    canonicalName: row.canonicalName,
    cardKind: row.cardKind,
    subtype: row.subtype,
    pokemonType: row.pokemonType,
    hp: row.hp,
    specialRuleBox: row.specialRuleBox,
    rarity: row.rarity,
    regulationMark: row.regulationMark,
    externalReferenceUrl: row.externalReferenceUrl,
    catalogProvider: row.catalogProvider,
    catalogSetId: row.catalogSetId,
    catalogCardId: row.catalogCardId,
    cardBackDesign: row.cardBackDesign,
    printingFinish: row.printingFinish,
    physicalForm: row.physicalForm,
    printedIdentifiers: row.printedIdentifiers,
    componentGroup: row.componentGroup,
    evolvesFrom: row.evolvesFrom,
    abilityRule: row.abilityRule,
    attacks: row.attacks,
    weakness: row.weakness,
    resistance: row.resistance,
    retreatCost: row.retreatCost,
    rulesText: row.rulesText,
  });
}

function validatePrintingConsistency(rows: ParsedCollectionRow[]): void {
  const identities = new Map<
    string,
    { row: ParsedCollectionRow; signature: string }
  >();

  for (const row of rows) {
    const identity = [
      row.catalogProvider && row.catalogCardId
        ? `${row.catalogProvider}:${row.catalogSetId}:${row.catalogCardId}`
        : `${row.setCode}:${row.collectorNumberKey ?? row.name}`,
      row.printingVariantKey,
      row.printingFinish,
      row.physicalForm,
      row.cardBackDesign,
      row.componentGroup?.groupKey,
      row.componentGroup?.componentKey,
      row.languageCode,
    ].join("\u001f");
    const signature = publishedFactsSignature(row);
    const existing = identities.get(identity);

    if (existing && existing.signature !== signature) {
      throw new CollectionCsvError(
        `conflicts with published card facts for the same printing on CSV row ${existing.row.csvRowNumber}`,
        {
          rowNumber: row.csvRowNumber,
          inventoryId: row.inventoryId,
          field: "Collector No.",
        },
      );
    }

    identities.set(identity, { row, signature });
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

  const sourceKey = options.sourceKey?.trim() || DEFAULT_SOURCE_KEY;
  const gameSlug = options.gameSlug?.trim() || DEFAULT_GAME_SLUG;
  const gameName = options.gameName?.trim() || DEFAULT_GAME_NAME;
  const rows = parseCollectionCsv(input);
  validatePrintingConsistency(rows);

  const sourceHash = createHash("sha256").update(input).digest("hex");

  db.transaction((tx) => {
    const game = tx
      .insert(games)
      .values({ slug: gameSlug, name: gameName })
      .onConflictDoUpdate({
        target: games.slug,
        set: { name: gameName },
      })
      .returning({ id: games.id })
      .get();

    for (const row of rows) {
      let cardSet = tx
        .select({
          id: cardSets.id,
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
            catalogProvider: cardSets.catalogProvider,
            catalogExternalId: cardSets.catalogExternalId,
          })
          .get();
      } else {
        if (
          row.catalogProvider &&
          row.catalogSetId &&
          cardSet.catalogProvider !== null &&
          (cardSet.catalogProvider !== row.catalogProvider ||
            cardSet.catalogExternalId !== row.catalogSetId)
        ) {
          throw new CollectionCsvError(
            `conflicts with existing set catalog identity ${cardSet.catalogProvider}/${cardSet.catalogExternalId}`,
            {
              rowNumber: row.csvRowNumber,
              inventoryId: row.inventoryId,
              field: "Catalog Set ID",
            },
          );
        }
        tx.update(cardSets)
          .set({
            name: row.expansion,
            ...(row.catalogProvider && row.catalogSetId
              ? {
                  catalogProvider: row.catalogProvider,
                  catalogExternalId: row.catalogSetId,
                }
              : {}),
          })
          .where(eq(cardSets.id, cardSet.id))
          .run();
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
        } else if (
          componentGroup.groupType !== row.componentGroup.groupType ||
          (componentGroup.name !== null &&
            row.componentGroup.name !== null &&
            componentGroup.name !== row.componentGroup.name) ||
          (componentGroup.expectedComponentCount !== null &&
            row.componentGroup.expectedComponentCount !== null &&
            componentGroup.expectedComponentCount !==
              row.componentGroup.expectedComponentCount)
        ) {
          throw new CollectionCsvError(
            `conflicts with existing component group ${componentGroup.groupKey}`,
            {
              rowNumber: row.csvRowNumber,
              inventoryId: row.inventoryId,
              field: "Component Group Key",
            },
          );
        } else if (
          (componentGroup.name === null && row.componentGroup.name !== null) ||
          (componentGroup.expectedComponentCount === null &&
            row.componentGroup.expectedComponentCount !== null)
        ) {
          tx.update(printingGroups)
            .set({
              name: componentGroup.name ?? row.componentGroup.name,
              expectedComponentCount:
                componentGroup.expectedComponentCount ??
                row.componentGroup.expectedComponentCount,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(printingGroups.id, componentGroup.id))
            .run();
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
          stableIdentityKey: cardPrintings.stableIdentityKey,
          catalogProvider: cardPrintings.catalogProvider,
          catalogExternalId: cardPrintings.catalogExternalId,
          cardBackDesign: cardPrintings.cardBackDesign,
        })
        .from(cardPrintings)
        .where(eq(cardPrintings.stableIdentityKey, stableIdentityKey))
        .get();
      const candidateConditions = [
        eq(cardPrintings.setId, cardSet.id),
        eq(cardPrintings.languageCode, row.languageCode),
        eq(cardPrintings.printingVariantKey, row.printingVariantKey),
        row.printingFinish === null
          ? isNull(cardPrintings.printingFinish)
          : eq(cardPrintings.printingFinish, row.printingFinish),
        row.physicalForm === null
          ? isNull(cardPrintings.physicalForm)
          : eq(cardPrintings.physicalForm, row.physicalForm),
        row.collectorNumberKey === null
          ? and(
              isNull(cardPrintings.collectorNumberKey),
              eq(cardPrintings.name, row.name),
            )
          : eq(cardPrintings.collectorNumberKey, row.collectorNumberKey),
      ];
      if (row.cardBackDesign !== null) {
        const compatibleBack = or(
          isNull(cardPrintings.cardBackDesign),
          eq(cardPrintings.cardBackDesign, row.cardBackDesign),
        );
        if (compatibleBack) candidateConditions.push(compatibleBack);
      }
      let candidates = tx
        .select({
          id: cardPrintings.id,
          stableIdentityKey: cardPrintings.stableIdentityKey,
          catalogProvider: cardPrintings.catalogProvider,
          catalogExternalId: cardPrintings.catalogExternalId,
          cardBackDesign: cardPrintings.cardBackDesign,
        })
        .from(cardPrintings)
        .where(and(...candidateConditions))
        .all();
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
        exactPrinting &&
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
      if (candidates.length > 1) {
        throw new CollectionCsvError(
          "matches multiple local printings; add exact distinguishing facts",
          {
            rowNumber: row.csvRowNumber,
            inventoryId: row.inventoryId,
            field: "Catalog Card ID",
          },
        );
      }

      let printing = exactPrinting ?? candidates[0];
      if (
        printing &&
        row.catalogProvider &&
        row.catalogCardId &&
        printing.catalogProvider !== null &&
        (printing.catalogProvider !== row.catalogProvider ||
          printing.catalogExternalId !== row.catalogCardId)
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
          .returning({
            id: cardPrintings.id,
            stableIdentityKey: cardPrintings.stableIdentityKey,
            catalogProvider: cardPrintings.catalogProvider,
            catalogExternalId: cardPrintings.catalogExternalId,
            cardBackDesign: cardPrintings.cardBackDesign,
          })
          .get();
      } else {
        tx.update(cardPrintings)
          .set({
            ...publishedValues,
            stableIdentityKey:
              row.catalogProvider && printing.catalogProvider === null
                ? stableIdentityKey
                : printing.stableIdentityKey,
            catalogProvider:
              row.catalogProvider ?? printing.catalogProvider ?? null,
            catalogExternalId:
              row.catalogCardId ?? printing.catalogExternalId ?? null,
            cardBackDesign:
              printing.cardBackDesign ?? row.cardBackDesign ?? null,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(cardPrintings.id, printing.id))
          .run();
      }

      if (row.printedIdentifiers.length > 0) {
        tx.insert(printingIdentifiers)
          .values(
            row.printedIdentifiers.map((identifier) => ({
              printingId: printing.id,
              role: identifier.role,
              value: identifier.value,
              label: identifier.label,
            })),
          )
          .onConflictDoNothing()
          .run();
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

      if (hasPokemonDetails(row)) {
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
          .onConflictDoUpdate({
            target: pokemonDetails.printingId,
            set: {
              pokemonType: row.pokemonType,
              hp: row.hp,
              evolvesFrom: row.evolvesFrom,
              weakness: row.weakness,
              resistance: row.resistance,
              retreatCost: row.retreatCost,
            },
          })
          .run();
      } else {
        tx.delete(pokemonDetails)
          .where(eq(pokemonDetails.printingId, printing.id))
          .run();
      }

      for (const attack of row.attacks) {
        tx.insert(attacks)
          .values({
            printingId: printing.id,
            position: attack.position,
            name: attack.name,
            cost: attack.cost,
            damage: attack.damage,
            effect: attack.effect,
          })
          .onConflictDoUpdate({
            target: [attacks.printingId, attacks.position],
            set: {
              name: attack.name,
              cost: attack.cost,
              damage: attack.damage,
              effect: attack.effect,
            },
          })
          .run();
      }

      if (row.attacks.length === 0) {
        tx.delete(attacks).where(eq(attacks.printingId, printing.id)).run();
      } else {
        tx.delete(attacks)
          .where(
            and(
              eq(attacks.printingId, printing.id),
              gt(attacks.position, row.attacks.length),
            ),
          )
          .run();
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
        ownedCardId = existingImport.ownedCardId;
        tx.update(ownedCards)
          .set({
            printingId: printing.id,
            quantity: row.quantity,
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
        const ownedCard = tx
          .insert(ownedCards)
          .values({
            profileId,
            printingId: printing.id,
            quantity: row.quantity,
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
  });

  const totals = db
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

  return {
    profileId,
    sourceKey,
    importedEntries: rows.length,
    importedQuantity: rows.reduce((total, row) => total + row.quantity, 0),
    collectionEntries: totals.collectionEntries,
    physicalCards: totals.physicalCards,
  };
}

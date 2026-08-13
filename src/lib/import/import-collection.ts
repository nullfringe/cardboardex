import { createHash } from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import {
  attacks,
  cardPrintings,
  cardSets,
  games,
  importRecords,
  ownedCards,
  pokemonDetails,
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
  return row.deckPool ? { deckPool: row.deckPool } : {};
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
        ? `${row.catalogProvider}:${row.catalogCardId}`
        : `${row.setCode}:${row.collectorNumberKey ?? row.name}`,
      row.printingVariantKey,
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
      const cardSet = tx
        .insert(cardSets)
        .values({
          gameId: game.id,
          code: row.setCode,
          name: row.expansion,
          languageCode: row.languageCode,
          catalogProvider: row.catalogProvider,
          catalogExternalId: row.catalogSetId,
        })
        .onConflictDoUpdate({
          target: [cardSets.gameId, cardSets.code, cardSets.languageCode],
          set: {
            name: row.expansion,
            catalogProvider: sql`coalesce(excluded.catalog_provider, ${cardSets.catalogProvider})`,
            catalogExternalId: sql`coalesce(excluded.catalog_external_id, ${cardSets.catalogExternalId})`,
          },
        })
        .returning({ id: cardSets.id })
        .get();

      const printing = tx
        .insert(cardPrintings)
        .values({
          setId: cardSet.id,
          name: row.name,
          canonicalName: row.canonicalName,
          collectorNumber: row.collectorNumber,
          collectorNumberKey: row.collectorNumberKey,
          collectorNumberSort: row.collectorNumberSort,
          stableIdentityKey: stablePrintingIdentityKey({
            gameSlug,
            setCode: row.setCode,
            languageCode: row.languageCode,
            name: row.name,
            collectorNumber: row.collectorNumber,
            printingVariantKey: row.printingVariantKey,
            catalogProvider: row.catalogProvider,
            catalogCardId: row.catalogCardId,
          }),
          printingVariantKey: row.printingVariantKey,
          languageCode: row.languageCode,
          catalogProvider: row.catalogProvider,
          catalogExternalId: row.catalogCardId,
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
        })
        .onConflictDoUpdate({
          target: [cardPrintings.stableIdentityKey],
          set: {
            name: row.name,
            canonicalName: row.canonicalName,
            collectorNumber: row.collectorNumber,
            collectorNumberKey: row.collectorNumberKey,
            collectorNumberSort: row.collectorNumberSort,
            catalogProvider: row.catalogProvider,
            catalogExternalId: row.catalogCardId,
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
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
        .returning({ id: cardPrintings.id })
        .get();

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

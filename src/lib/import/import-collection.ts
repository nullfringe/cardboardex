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
  type OwnedCardMetadata,
  type PrintingMetadata,
} from "@/db/schema";

import {
  CollectionCsvError,
  parseCollectionCsv,
  type ParsedCollectionRow,
} from "./collection-csv";

const DEFAULT_SOURCE_KEY = "data/seed/collection.csv";
const DEFAULT_GAME_SLUG = "pokemon-tcg";
const DEFAULT_GAME_NAME = "Pokémon Trading Card Game";

export type ImportCollectionOptions = {
  sourceKey?: string;
  gameSlug?: string;
  gameName?: string;
};

export type ImportCollectionResult = {
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
    cardKind: row.cardKind,
    subtype: row.subtype,
    pokemonType: row.pokemonType,
    hp: row.hp,
    specialRuleBox: row.specialRuleBox,
    rarity: row.rarity,
    regulationMark: row.regulationMark,
    externalReferenceUrl: row.externalReferenceUrl,
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
      row.setCode.toLocaleLowerCase("en-US"),
      row.collectorNumberKey,
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
  options: ImportCollectionOptions = {},
): ImportCollectionResult {
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
        .values({ gameId: game.id, code: row.setCode, name: row.expansion })
        .onConflictDoUpdate({
          target: [cardSets.gameId, cardSets.code],
          set: { name: row.expansion },
        })
        .returning({ id: cardSets.id })
        .get();

      const printing = tx
        .insert(cardPrintings)
        .values({
          setId: cardSet.id,
          name: row.name,
          collectorNumber: row.collectorNumber,
          collectorNumberKey: row.collectorNumberKey,
          collectorNumberSort: row.collectorNumberSort,
          printingVariantKey: row.printingVariantKey,
          languageCode: row.languageCode,
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
          target: [
            cardPrintings.setId,
            cardPrintings.collectorNumberKey,
            cardPrintings.printingVariantKey,
            cardPrintings.languageCode,
          ],
          set: {
            name: row.name,
            collectorNumber: row.collectorNumber,
            collectorNumberSort: row.collectorNumberSort,
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
          .where(eq(ownedCards.id, ownedCardId))
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
    .get();

  if (!totals) {
    throw new Error("Could not calculate collection totals after import");
  }

  return {
    sourceKey,
    importedEntries: rows.length,
    importedQuantity: rows.reduce((total, row) => total + row.quantity, 0),
    collectionEntries: totals.collectionEntries,
    physicalCards: totals.physicalCards,
  };
}

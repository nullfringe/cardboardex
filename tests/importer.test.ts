import fs from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  attacks,
  cardPrintings,
  cardSets,
  games,
  importRecords,
  ownedCards,
  pokemonDetails,
} from "@/db/schema";
import {
  CollectionCsvError,
  importCollectionCsv,
  parseCollectionCsv,
} from "@/lib/import";

const fixturePath = path.resolve(process.cwd(), "data/seed/collection.csv");
const fixture = fs.readFileSync(fixturePath);
const fixtureText = fixture.toString("utf8");

function requiredResult<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`Expected query result for ${description}`);
  }

  return value;
}

describe("collection CSV parsing", () => {
  it("parses the BOM-prefixed fixture and derives its inventory totals", () => {
    expect(fixture.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));

    const rows = parseCollectionCsv(fixture);

    expect(rows).toHaveLength(69);
    expect(rows.reduce((total, row) => total + row.quantity, 0)).toBe(72);
    expect(
      rows.filter((row) => row.quantity === 2).map((row) => row.name),
    ).toEqual(["Electrike", "Silvally", "Tremendous Bomb"]);
  });

  it("normalizes blank fields while preserving meaningful zero and Unicode", () => {
    const rows = parseCollectionCsv(fixture);
    const maschiff = rows.find((row) => row.name === "Maschiff");
    const baltoy = rows.find((row) => row.name === "Baltoy");
    const abra = rows.find((row) => row.name === "Abra");

    expect(maschiff).toMatchObject({
      cardKind: "Pokémon",
      notes: null,
      resistance: null,
      collectorNumberKey: "57/84",
    });
    expect(baltoy?.attacks[0]?.damage).toBe("30×");
    expect(baltoy?.weakness).toBe("Grass ×2");
    expect(abra).toMatchObject({
      collectorNumber: "43/102",
      collectorNumberKey: "43/102",
      regulationMark: null,
      retreatCost: 0,
    });
  });

  it("extracts only explicit rarity, ownership variant, and sealed tokens", () => {
    const rows = parseCollectionCsv(fixture);
    const bulbasaur = rows.find((row) => row.name === "Bulbasaur");
    const abra = rows.find((row) => row.name === "Abra");

    expect(bulbasaur).toMatchObject({
      rarity: "Illustration Rare",
      finishVariant: "Mega Evolution stamped promo",
      sealed: true,
      printingVariantKey: "standard",
    });
    expect(abra).toMatchObject({
      rarity: "Common",
      finishVariant: "Base Set Unlimited; regular non-holo",
      sealed: false,
      printingVariantKey: "standard",
    });
    expect(abra?.notes).toContain("condition tentatively Moderately Played");
  });

  it("requires the exact ordered header schema", () => {
    const invalidHeader = fixtureText.replace(
      "Inventory ID,Card Kind",
      "Inventory Key,Card Kind",
    );

    expect(() => parseCollectionCsv(invalidHeader)).toThrowError(
      /header mismatch at column 1: expected "Inventory ID", received "Inventory Key"/u,
    );
  });

  it("reports the row, inventory ID, and field for invalid values", () => {
    const invalidQuantity = fixtureText.replace(
      "1,Pokémon,Maschiff,Darkness,Basic,70,1,",
      "1,Pokémon,Maschiff,Darkness,Basic,70,0,",
    );

    expect(() => parseCollectionCsv(invalidQuantity)).toThrowError(
      /CSV row 2, Inventory ID 1, field "Quantity": a positive integer; received "0"/u,
    );
  });

  it("rejects duplicate provenance IDs before import", () => {
    const duplicateInventoryId = fixtureText.replace(
      "2,Pokémon,Gligar",
      "1,Pokémon,Gligar",
    );

    expect(() => parseCollectionCsv(duplicateInventoryId)).toThrowError(
      CollectionCsvError,
    );
    expect(() => parseCollectionCsv(duplicateInventoryId)).toThrowError(
      /CSV row 3, Inventory ID 1, field "Inventory ID": duplicates Inventory ID first seen on CSV row 2/u,
    );
  });
});

describe("collection import", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
  });

  afterEach(() => {
    connection.sqlite.close();
  });

  it("imports the normalized fixture and preserves raw provenance", () => {
    const result = importCollectionCsv(connection.db, fixture);

    expect(result).toEqual({
      sourceKey: "data/seed/collection.csv",
      importedEntries: 69,
      importedQuantity: 72,
      collectionEntries: 69,
      physicalCards: 72,
    });

    const counts = {
      games: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(games)
          .get(),
        "game count",
      ).value,
      sets: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(cardSets)
          .get(),
        "set count",
      ).value,
      printings: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(cardPrintings)
          .get(),
        "printing count",
      ).value,
      owned: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(ownedCards)
          .get(),
        "owned-card count",
      ).value,
      details: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(pokemonDetails)
          .get(),
        "Pokémon-detail count",
      ).value,
      attacks: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(attacks)
          .get(),
        "attack count",
      ).value,
      imports: requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(importRecords)
          .get(),
        "import-record count",
      ).value,
    };

    expect(counts).toEqual({
      games: 1,
      sets: 6,
      printings: 69,
      owned: 69,
      details: 61,
      attacks: 86,
      imports: 69,
    });

    const bulbasaur = requiredResult(
      connection.db
        .select({
          rarity: cardPrintings.rarity,
          finishVariant: ownedCards.finishVariant,
          sealed: ownedCards.sealed,
          rawRow: importRecords.rawRow,
          sourceHash: importRecords.sourceHash,
        })
        .from(cardPrintings)
        .innerJoin(ownedCards, eq(ownedCards.printingId, cardPrintings.id))
        .innerJoin(importRecords, eq(importRecords.ownedCardId, ownedCards.id))
        .where(eq(cardPrintings.name, "Bulbasaur"))
        .get(),
      "Bulbasaur",
    );

    expect(bulbasaur).toMatchObject({
      rarity: "Illustration Rare",
      finishVariant: "Mega Evolution stamped promo",
      sealed: true,
    });
    expect(bulbasaur.sourceHash).toMatch(/^[a-f\d]{64}$/u);
    expect(bulbasaur.rawRow["Finish / Variant"]).toBe(
      "Illustration Rare; Mega Evolution stamped promo; factory sealed",
    );
  });

  it("keeps vintage blanks, zero retreat cost, and tentative condition as notes", () => {
    importCollectionCsv(connection.db, fixture);

    const abra = requiredResult(
      connection.db
        .select({
          regulationMark: cardPrintings.regulationMark,
          collectorNumber: cardPrintings.collectorNumber,
          retreatCost: pokemonDetails.retreatCost,
          condition: ownedCards.condition,
          notes: ownedCards.notes,
        })
        .from(cardPrintings)
        .innerJoin(
          pokemonDetails,
          eq(pokemonDetails.printingId, cardPrintings.id),
        )
        .innerJoin(ownedCards, eq(ownedCards.printingId, cardPrintings.id))
        .where(eq(cardPrintings.name, "Abra"))
        .get(),
      "Abra",
    );

    expect(abra).toMatchObject({
      regulationMark: null,
      collectorNumber: "43/102",
      retreatCost: 0,
      condition: null,
    });
    expect(abra.notes).toContain("tentatively Moderately Played");
  });

  it("is idempotent and updates rather than increments imported ownership", () => {
    importCollectionCsv(connection.db, fixture);
    const ownedIdsBefore = connection.db
      .select({ id: ownedCards.id })
      .from(ownedCards)
      .orderBy(ownedCards.id)
      .all();

    const secondResult = importCollectionCsv(connection.db, fixture);
    const ownedIdsAfter = connection.db
      .select({ id: ownedCards.id })
      .from(ownedCards)
      .orderBy(ownedCards.id)
      .all();
    const physicalCards = requiredResult(
      connection.db
        .select({ value: sql<number>`sum(${ownedCards.quantity})` })
        .from(ownedCards)
        .get(),
      "physical-card total",
    ).value;

    expect(secondResult.collectionEntries).toBe(69);
    expect(secondResult.physicalCards).toBe(72);
    expect(ownedIdsAfter).toEqual(ownedIdsBefore);
    expect(physicalCards).toBe(72);
  });

  it("does not mutate the database when file validation fails", () => {
    const invalidQuantity = fixtureText.replace(
      "1,Pokémon,Maschiff,Darkness,Basic,70,1,",
      "1,Pokémon,Maschiff,Darkness,Basic,70,0,",
    );

    expect(() =>
      importCollectionCsv(connection.db, invalidQuantity),
    ).toThrowError(CollectionCsvError);

    const ownedCount = requiredResult(
      connection.db
        .select({ value: sql<number>`count(*)` })
        .from(ownedCards)
        .get(),
      "owned-card count",
    ).value;
    expect(ownedCount).toBe(0);
  });
});

import fs from "node:fs";
import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
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
  printingGroupMembers,
  printingGroups,
  printingIdentifiers,
  profiles,
} from "@/db/schema";
import {
  COLLECTION_CSV_HEADERS,
  COLLECTION_CSV_OPTIONAL_HEADERS,
  CollectionCsvError,
  importCollectionCsv,
  parseCollectionCsv,
  type CollectionCsvHeader,
} from "@/lib/import";
import { stablePrintingIdentityKey } from "@/lib/printing-identity";
import { createProfileService } from "@/lib/services/profile-service";
import { createCollectionService } from "@/lib/services/collection-service";

const fixturePath = path.resolve(process.cwd(), "data/seed/collection.csv");
const fixture = fs.readFileSync(fixturePath);
const fixtureText = fixture.toString("utf8");
const japaneseFixture = fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/japanese-vintage.csv"),
);
const abraCollectorSource =
  "https://bulbapedia.bulbagarden.net/wiki/Abra_(Base_Set_43)";

const catalogingHeaders = COLLECTION_CSV_OPTIONAL_HEADERS.slice(6);

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function catalogingFixture(includeCondition = true): string {
  const [header, firstRow, ...remainingRows] = japaneseFixture
    .toString("utf8")
    .trimEnd()
    .split("\n");
  const firstValues = [
    "Pocket Monsters Card Game",
    "regular non-holo",
    "standard",
    "species/pokedex-number: No.025; promo/release-identifier: JP-01",
    "starter-panorama",
    "multi-card-artwork",
    "Starter Panorama",
    "2",
    "top",
    "batch-1996-01",
    "A1",
    "IMG_0001-front.jpg",
    "IMG_0001-back.jpg",
    "Near Mint",
  ];
  const headers = includeCondition
    ? catalogingHeaders
    : catalogingHeaders.slice(0, -1);
  const values = includeCondition ? firstValues : firstValues.slice(0, -1);
  const blankValues = headers.map(() => "");

  return [
    `${header},${headers.map(csvCell).join(",")}`,
    `${firstRow},${values.map(csvCell).join(",")}`,
    ...remainingRows.map(
      (row) => `${row},${blankValues.map(csvCell).join(",")}`,
    ),
  ].join("\n");
}

const importHeaders = [
  ...COLLECTION_CSV_HEADERS,
  ...COLLECTION_CSV_OPTIONAL_HEADERS,
];

const baseImportRow: Record<CollectionCsvHeader, string> = Object.fromEntries(
  importHeaders.map((header) => [header, ""]),
) as Record<CollectionCsvHeader, string>;
Object.assign(baseImportRow, {
  "Inventory ID": "IMPORT-1",
  "Card Kind": "Pokémon",
  Name: "Charmander",
  "TCG Type": "Fire",
  "Stage / Trainer Subtype": "Basic",
  HP: "50",
  Quantity: "1",
  "Visible Move / Effect 1": "Ember",
  "ID Confidence": "High",
  "Collector No.": "46/102",
  Expansion: "Base Set",
  "Set ID": "TEST-BASE",
  "Attack 1 Name": "Ember",
  "Attack 1 Cost": "Fire Colorless",
  "Attack 1 Damage": "30",
  Weakness: "Water ×2",
  "Retreat Cost": "1",
  "Finish / Variant": "Common",
  Language: "en",
  "Printing Variant": "unlimited",
});

function collectionCsv(
  rows: Array<Partial<Record<CollectionCsvHeader, string>>>,
): string {
  return [
    importHeaders.map(csvCell).join(","),
    ...rows.map((overrides) => {
      const row = { ...baseImportRow, ...overrides };
      return importHeaders.map((header) => csvCell(row[header])).join(",");
    }),
  ].join("\n");
}

function tableSnapshot(connection: DatabaseConnection): object {
  return {
    games: connection.db.select().from(games).all(),
    sets: connection.db.select().from(cardSets).all(),
    printings: connection.db.select().from(cardPrintings).all(),
    identifiers: connection.db.select().from(printingIdentifiers).all(),
    groups: connection.db.select().from(printingGroups).all(),
    members: connection.db.select().from(printingGroupMembers).all(),
    details: connection.db.select().from(pokemonDetails).all(),
    attacks: connection.db.select().from(attacks).all(),
    owned: connection.db.select().from(ownedCards).all(),
    imports: connection.db.select().from(importRecords).all(),
  };
}

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
      languageCode: "en",
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
      finishVariant: "regular non-holo",
      sealed: false,
      printingVariantKey: "unlimited",
    });
    expect(abra?.notes).toContain("condition tentatively Moderately Played");
  });

  it("keeps vintage publishing variants as distinct printing identities", () => {
    const firstEdition = parseCollectionCsv(
      fixtureText.replace(
        "Base Set Unlimited; regular non-holo",
        "Base Set 1st Edition; regular non-holo",
      ),
    ).find((row) => row.name === "Abra");
    const shadowless = parseCollectionCsv(
      fixtureText.replace(
        "Base Set Unlimited; regular non-holo",
        "Base Set Shadowless; regular non-holo",
      ),
    ).find((row) => row.name === "Abra");

    expect(firstEdition).toMatchObject({
      printingVariantKey: "first-edition",
      finishVariant: "regular non-holo",
    });
    expect(shadowless).toMatchObject({
      printingVariantKey: "shadowless",
      finishVariant: "regular non-holo",
    });
    expect(firstEdition?.printingVariantKey).not.toBe(
      shadowless?.printingVariantKey,
    );
  });

  it("accepts optional international columns and absent collector identifiers", () => {
    expect(parseCollectionCsv(japaneseFixture)).toMatchObject([
      {
        name: "ピカチュウ",
        canonicalName: "Pikachu",
        collectorNumber: null,
        collectorNumberKey: null,
        languageCode: "ja",
        catalogProvider: "tcgdex",
        catalogSetId: "PMCG1",
        catalogCardId: "PMCG1-035",
        printingVariantKey: "standard",
      },
      {
        name: "ケーシィ",
        canonicalName: "Abra",
        collectorNumber: null,
        languageCode: "ja",
        printingVariantKey: "no-rarity",
        finishVariant: "regular non-holo",
      },
    ]);
  });

  it("accepts explicit cataloging and photo-provenance columns", () => {
    expect(parseCollectionCsv(catalogingFixture())[0]).toMatchObject({
      name: "ピカチュウ",
      collectorNumber: null,
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
      printedIdentifiers: [
        { role: "species/pokedex-number", value: "No.025" },
        { role: "promo/release-identifier", value: "JP-01" },
      ],
      componentGroup: {
        groupKey: "starter-panorama",
        groupType: "multi-card-artwork",
        name: "Starter Panorama",
        expectedComponentCount: 2,
        componentKey: "top",
      },
      finishVariant: "regular non-holo",
      photoBatch: "batch-1996-01",
      gridPosition: "A1",
      frontPhoto: "IMG_0001-front.jpg",
      backPhoto: "IMG_0001-back.jpg",
      condition: "Near Mint",
    });
    expect(
      parseCollectionCsv(catalogingFixture(false))[0]?.condition,
    ).toBeNull();
  });

  it("preserves numeric and normalized textual Inventory IDs as provenance text", () => {
    const rows = parseCollectionCsv(
      collectionCsv([
        { "Inventory ID": "001" },
        {
          "Inventory ID": "  EKA\u0301H-20260813-B19-A3  ",
          "Collector No.": "47/102",
          Name: "Squirtle",
        },
      ]),
    );

    expect(rows.map((row) => row.inventoryId)).toEqual([
      "001",
      "EKÁH-20260813-B19-A3",
    ]);
  });

  it("preserves non-numeric published identifiers without treating embedded digits as a sort number", () => {
    const [abra] = parseCollectionCsv(
      fixtureText.replace("43/102", "PROMO-123"),
    ).filter((row) => row.name === "Abra");

    expect(abra).toMatchObject({
      collectorNumber: "PROMO-123",
      collectorNumberKey: "promo-123",
      collectorNumberSort: 2_147_483_647,
    });
  });

  it("accepts blank Collector Source but rejects malformed nonblank values", () => {
    const blankSource = fixtureText.replace(abraCollectorSource, "");

    expect(
      parseCollectionCsv(blankSource).find((row) => row.name === "Abra"),
    ).toMatchObject({ externalReferenceUrl: null });
    expect(
      parseCollectionCsv(fixtureText).find((row) => row.name === "Abra"),
    ).toMatchObject({ externalReferenceUrl: abraCollectorSource });
    expect(() =>
      parseCollectionCsv(fixtureText.replace(abraCollectorSource, "not a URL")),
    ).toThrowError(
      /CSV row 70, Inventory ID 69, field "Collector Source": must be a valid URL; received "not a URL"/u,
    );
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
  let profileId: number;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
    profileId = requiredResult(
      connection.db.select({ id: profiles.id }).from(profiles).get(),
      "default profile",
    ).id;
  });

  afterEach(() => {
    connection.sqlite.close();
  });

  it("imports the normalized fixture and preserves raw provenance", () => {
    const result = importCollectionCsv(connection.db, fixture, { profileId });

    expect(result).toEqual({
      profileId,
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

    expect(
      connection.db
        .select({ externalReferenceUrl: cardPrintings.externalReferenceUrl })
        .from(cardPrintings)
        .where(eq(cardPrintings.name, "Abra"))
        .get(),
    ).toEqual({ externalReferenceUrl: abraCollectorSource });
  });

  it("imports cards with blank Collector Source as valid local printings", () => {
    const blankSource = fixtureText.replace(abraCollectorSource, "");

    const result = importCollectionCsv(connection.db, blankSource, {
      profileId,
    });

    expect(result).toMatchObject({ collectionEntries: 69, physicalCards: 72 });
    expect(
      connection.db
        .select({
          externalReferenceUrl: cardPrintings.externalReferenceUrl,
          ownedCardId: ownedCards.id,
        })
        .from(cardPrintings)
        .innerJoin(ownedCards, eq(ownedCards.printingId, cardPrintings.id))
        .where(eq(cardPrintings.name, "Abra"))
        .get(),
    ).toEqual({ externalReferenceUrl: null, ownedCardId: expect.any(Number) });
  });

  it("keeps vintage blanks, zero retreat cost, and tentative condition as notes", () => {
    importCollectionCsv(connection.db, fixture, { profileId });

    const abra = requiredResult(
      connection.db
        .select({
          regulationMark: cardPrintings.regulationMark,
          collectorNumber: cardPrintings.collectorNumber,
          printingVariantKey: cardPrintings.printingVariantKey,
          languageCode: cardPrintings.languageCode,
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
      printingVariantKey: "unlimited",
      languageCode: "en",
      retreatCost: 0,
      condition: null,
    });
    expect(abra.notes).toContain("tentatively Moderately Played");
  });

  it("is idempotent and updates rather than increments imported ownership", () => {
    importCollectionCsv(connection.db, fixture, { profileId });
    const ownedIdsBefore = connection.db
      .select({ id: ownedCards.id })
      .from(ownedCards)
      .orderBy(ownedCards.id)
      .all();

    const secondResult = importCollectionCsv(connection.db, fixture, {
      profileId,
    });
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
    expect(connection.db.select().from(profiles).all()).toHaveLength(1);
    expect(connection.db.select().from(importRecords).all()).toHaveLength(69);
  });

  it("does not mutate the database when file validation fails", () => {
    const invalidQuantity = fixtureText.replace(
      "1,Pokémon,Maschiff,Darkness,Basic,70,1,",
      "1,Pokémon,Maschiff,Darkness,Basic,70,0,",
    );

    expect(() =>
      importCollectionCsv(connection.db, invalidQuantity, { profileId }),
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

  it("allows the same import provenance IDs in separate profiles", () => {
    const secondProfile = createProfileService(connection.db).createProfile({
      name: "Ekah",
    });

    const first = importCollectionCsv(connection.db, fixture, { profileId });
    const secondFixture = fixtureText.replace(
      "1,Pokémon,Maschiff,Darkness,Basic,70,1,",
      "1,Pokémon,Maschiff,Darkness,Basic,70,3,",
    );
    const second = importCollectionCsv(connection.db, secondFixture, {
      profileId: secondProfile.id,
    });

    expect(first).toMatchObject({
      collectionEntries: 69,
      physicalCards: 72,
    });
    expect(second).toMatchObject({
      collectionEntries: 69,
      physicalCards: 74,
    });
    expect(
      requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(cardPrintings)
          .get(),
        "printing count",
      ).value,
    ).toBe(69);
    expect(
      requiredResult(
        connection.db
          .select({ value: sql<number>`count(*)` })
          .from(importRecords)
          .get(),
        "import record count",
      ).value,
    ).toBe(138);

    const secondOwnedBefore = requiredResult(
      connection.db
        .select({
          ownedCardId: ownedCards.id,
          quantity: ownedCards.quantity,
        })
        .from(importRecords)
        .innerJoin(ownedCards, eq(importRecords.ownedCardId, ownedCards.id))
        .where(
          and(
            eq(importRecords.profileId, secondProfile.id),
            eq(importRecords.externalInventoryId, "1"),
          ),
        )
        .get(),
      "second-profile inventory record",
    );

    importCollectionCsv(connection.db, fixture, { profileId });

    expect(
      connection.db
        .select({
          ownedCardId: ownedCards.id,
          quantity: ownedCards.quantity,
        })
        .from(importRecords)
        .innerJoin(ownedCards, eq(importRecords.ownedCardId, ownedCards.id))
        .where(
          and(
            eq(importRecords.profileId, secondProfile.id),
            eq(importRecords.externalInventoryId, "1"),
          ),
        )
        .get(),
    ).toEqual(secondOwnedBefore);
  });

  it("imports Japanese vintage cards idempotently into an isolated profile", () => {
    importCollectionCsv(connection.db, fixture, { profileId });
    const secondProfile = createProfileService(connection.db).createProfile({
      name: "International Collection",
    });

    const first = importCollectionCsv(connection.db, japaneseFixture, {
      profileId: secondProfile.id,
      sourceKey: "tests/fixtures/japanese-vintage.csv",
    });
    const ownedIds = connection.db
      .select({ id: ownedCards.id })
      .from(ownedCards)
      .where(eq(ownedCards.profileId, secondProfile.id))
      .orderBy(ownedCards.id)
      .all();
    const second = importCollectionCsv(connection.db, japaneseFixture, {
      profileId: secondProfile.id,
      sourceKey: "tests/fixtures/japanese-vintage.csv",
    });

    expect(first).toMatchObject({
      importedEntries: 2,
      importedQuantity: 2,
      collectionEntries: 2,
      physicalCards: 2,
    });
    expect(second).toMatchObject({ collectionEntries: 2, physicalCards: 2 });
    expect(
      connection.db
        .select({ id: ownedCards.id })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, secondProfile.id))
        .orderBy(ownedCards.id)
        .all(),
    ).toEqual(ownedIds);
    expect(
      connection.db
        .select({ count: sql<number>`count(*)` })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, profileId))
        .get(),
    ).toEqual({ count: 69 });

    const service = createCollectionService(connection.db);
    expect(
      service
        .listCollection(secondProfile.slug, { search: "Pikachu" })
        .map((card) => card.name),
    ).toEqual(["ピカチュウ"]);
    expect(
      service
        .listCollection(secondProfile.slug, { search: "ケーシィ" })
        .map((card) => card.canonicalName),
    ).toEqual(["Abra"]);
    expect(
      service.listCollection(secondProfile.slug, { languageCode: "ja" }),
    ).toHaveLength(2);
    expect(service.getCollectionFacets(secondProfile.slug).languages).toEqual([
      { value: "ja", label: "Japanese", count: 2 },
    ]);
    expect(
      connection.db
        .select({ count: sql<number>`count(*)` })
        .from(importRecords)
        .where(eq(importRecords.profileId, secondProfile.id))
        .get(),
    ).toEqual({ count: 2 });
  });

  it("reconciles later exact catalog identity without duplicating imported printings", () => {
    const localOnly = japaneseFixture
      .toString("utf8")
      .replace(
        "ja,Pikachu,tcgdex,PMCG1,PMCG1-035,standard",
        "ja,Pikachu,,,,standard",
      )
      .replace(
        "ja,Abra,tcgdex,PMCG1,PMCG1-043,no-rarity",
        "ja,Abra,,,,no-rarity",
      );
    const options = {
      profileId,
      sourceKey: "tests/fixtures/catalog-enrichment.csv",
    };

    importCollectionCsv(connection.db, localOnly, options);
    const before = connection.db
      .select({
        id: cardPrintings.id,
        stableIdentityKey: cardPrintings.stableIdentityKey,
        catalogExternalId: cardPrintings.catalogExternalId,
      })
      .from(cardPrintings)
      .orderBy(cardPrintings.id)
      .all();
    const ownedBefore = connection.db
      .select({ id: ownedCards.id, printingId: ownedCards.printingId })
      .from(ownedCards)
      .orderBy(ownedCards.id)
      .all();

    importCollectionCsv(connection.db, japaneseFixture, options);

    const enriched = connection.db
      .select({
        id: cardPrintings.id,
        stableIdentityKey: cardPrintings.stableIdentityKey,
        catalogExternalId: cardPrintings.catalogExternalId,
      })
      .from(cardPrintings)
      .orderBy(cardPrintings.id)
      .all();
    expect(enriched).toEqual([
      {
        id: before[0]?.id,
        stableIdentityKey: "catalog:tcgdex:ja:pmcg1:pmcg1-035:standard",
        catalogExternalId: "PMCG1-035",
      },
      {
        id: before[1]?.id,
        stableIdentityKey: "catalog:tcgdex:ja:pmcg1:pmcg1-043:no-rarity",
        catalogExternalId: "PMCG1-043",
      },
    ]);
    expect(
      connection.db
        .select({ id: ownedCards.id, printingId: ownedCards.printingId })
        .from(ownedCards)
        .orderBy(ownedCards.id)
        .all(),
    ).toEqual(ownedBefore);
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(2);
    expect(connection.db.select().from(pokemonDetails).all()).toHaveLength(2);
    expect(connection.db.select().from(attacks).all()).toHaveLength(2);

    const beforeConflict = connection.db.select().from(cardPrintings).all();
    const conflicting = japaneseFixture
      .toString("utf8")
      .replaceAll("PMCG1-035", "PMCG1-999");
    expect(() =>
      importCollectionCsv(connection.db, conflicting, options),
    ).toThrow(/conflicts with existing printing catalog identity/u);
    expect(connection.db.select().from(cardPrintings).all()).toEqual(
      beforeConflict,
    );
    expect(
      connection.db
        .select({ id: ownedCards.id, printingId: ownedCards.printingId })
        .from(ownedCards)
        .orderBy(ownedCards.id)
        .all(),
    ).toEqual(ownedBefore);
  });

  it("enriches missing printing attributes and preserves them on legacy re-import", () => {
    const options = {
      profileId,
      sourceKey: "tests/fixtures/printing-attribute-enrichment.csv",
    };

    importCollectionCsv(connection.db, japaneseFixture, options);
    const printingIdsBefore = connection.db
      .select({ id: cardPrintings.id })
      .from(cardPrintings)
      .orderBy(cardPrintings.id)
      .all();
    const ownershipBefore = connection.db
      .select({ id: ownedCards.id, printingId: ownedCards.printingId })
      .from(ownedCards)
      .orderBy(ownedCards.id)
      .all();

    importCollectionCsv(connection.db, catalogingFixture(), options);
    const enriched = connection.db
      .select({
        id: cardPrintings.id,
        name: cardPrintings.name,
        stableIdentityKey: cardPrintings.stableIdentityKey,
        cardBackDesign: cardPrintings.cardBackDesign,
        printingFinish: cardPrintings.printingFinish,
        physicalForm: cardPrintings.physicalForm,
      })
      .from(cardPrintings)
      .where(eq(cardPrintings.name, "ピカチュウ"))
      .get();

    expect(enriched).toEqual({
      id: printingIdsBefore[0]?.id,
      name: "ピカチュウ",
      stableIdentityKey:
        "catalog:tcgdex:ja:pmcg1:pmcg1-035:standard:finish:regular%20non-holo:form:standard:back:pocket%20monsters%20card%20game:group:starter-panorama:component:top",
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
    });
    expect(enriched?.stableIdentityKey).toBe(
      stablePrintingIdentityKey({
        gameSlug: "pokemon-tcg",
        setCode: "JP-PMCG1",
        languageCode: "ja",
        name: "ピカチュウ",
        collectorNumber: null,
        printingVariantKey: "standard",
        catalogProvider: "tcgdex",
        catalogSetId: "PMCG1",
        catalogCardId: "PMCG1-035",
        cardBackDesign: enriched?.cardBackDesign,
        printingFinish: enriched?.printingFinish,
        physicalForm: enriched?.physicalForm,
        componentGroupKey: "starter-panorama",
        componentKey: "top",
      }),
    );
    expect(
      connection.db
        .select({ id: ownedCards.id, printingId: ownedCards.printingId })
        .from(ownedCards)
        .orderBy(ownedCards.id)
        .all(),
    ).toEqual(ownershipBefore);

    importCollectionCsv(connection.db, japaneseFixture, options);

    expect(
      connection.db
        .select({
          id: cardPrintings.id,
          cardBackDesign: cardPrintings.cardBackDesign,
          printingFinish: cardPrintings.printingFinish,
          physicalForm: cardPrintings.physicalForm,
        })
        .from(cardPrintings)
        .where(eq(cardPrintings.name, "ピカチュウ"))
        .get(),
    ).toEqual({
      id: printingIdsBefore[0]?.id,
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
    });
    expect(
      connection.db
        .select({ id: cardPrintings.id })
        .from(cardPrintings)
        .orderBy(cardPrintings.id)
        .all(),
    ).toEqual(printingIdsBefore);
    expect(
      connection.db
        .select({ id: ownedCards.id, printingId: ownedCards.printingId })
        .from(ownedCards)
        .orderBy(ownedCards.id)
        .all(),
    ).toEqual(ownershipBefore);
  });

  it("rejects ambiguous legacy import across known printing finishes", () => {
    const service = createCollectionService(connection.db);
    const shared = {
      gameSlug: "pokemon-tcg",
      gameName: "Pokémon Trading Card Game",
      setCode: "JP-PMCG1",
      setName: "拡張パック",
      name: "ピカチュウ",
      canonicalName: "Pikachu",
      collectorNumber: null,
      languageCode: "ja",
      printingVariantKey: "standard",
      physicalForm: "standard",
      cardKind: "Pokémon",
      subtype: "Basic",
      pokemonType: "Lightning",
      hp: 40,
      quantity: 1,
    } as const;
    service.createCollectionEntry("my-collection", {
      ...shared,
      printingFinish: "holo",
    });
    service.createCollectionEntry("my-collection", {
      ...shared,
      printingFinish: "reverse holo",
    });
    const printingsBefore = connection.db.select().from(cardPrintings).all();
    const ownedBefore = connection.db.select().from(ownedCards).all();

    expect(() =>
      importCollectionCsv(connection.db, japaneseFixture, {
        profileId,
        sourceKey: "tests/fixtures/ambiguous-legacy.csv",
      }),
    ).toThrow(/matches multiple local printings/u);
    expect(connection.db.select().from(cardPrintings).all()).toEqual(
      printingsBefore,
    );
    expect(connection.db.select().from(ownedCards).all()).toEqual(ownedBefore);
    expect(
      connection.db
        .select({
          catalogProvider: cardSets.catalogProvider,
          catalogExternalId: cardSets.catalogExternalId,
        })
        .from(cardSets)
        .get(),
    ).toEqual({ catalogProvider: null, catalogExternalId: null });
  });

  it("imports optional photo provenance and printing catalog data idempotently", () => {
    const input = catalogingFixture();
    const options = {
      profileId,
      sourceKey: "photo-batches/batch-1996-01.csv",
    };

    const first = importCollectionCsv(connection.db, input, options);
    const ownedIdsBefore = connection.db
      .select({ id: ownedCards.id })
      .from(ownedCards)
      .orderBy(ownedCards.id)
      .all();
    const second = importCollectionCsv(connection.db, input, options);
    const detail = createCollectionService(connection.db)
      .listCollection("my-collection")
      .find((entry) => entry.name === "ピカチュウ");

    expect(first).toMatchObject({ collectionEntries: 2, physicalCards: 2 });
    expect(second).toMatchObject({ collectionEntries: 2, physicalCards: 2 });
    expect(
      connection.db
        .select({ id: ownedCards.id })
        .from(ownedCards)
        .orderBy(ownedCards.id)
        .all(),
    ).toEqual(ownedIdsBefore);
    expect(detail).toBeDefined();
    expect(
      createCollectionService(connection.db).getCollectionEntry(
        "my-collection",
        detail!.ownedCardId,
      ),
    ).toMatchObject({
      collectorNumber: null,
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
      photoBatch: "batch-1996-01",
      gridPosition: "A1",
      frontPhoto: "IMG_0001-front.jpg",
      backPhoto: "IMG_0001-back.jpg",
      printedIdentifiers: [
        { role: "species/pokedex-number", value: "No.025" },
        { role: "promo/release-identifier", value: "JP-01" },
      ],
      printingGroups: [
        {
          groupKey: "starter-panorama",
          groupType: "multi-card-artwork",
          expectedComponentCount: 2,
          componentKey: "top",
        },
      ],
    });
    expect(connection.db.select().from(printingIdentifiers).all()).toHaveLength(
      2,
    );
    expect(connection.db.select().from(printingGroups).all()).toHaveLength(1);
    expect(
      connection.db.select().from(printingGroupMembers).all(),
    ).toHaveLength(1);
  });

  it("updates evolving textual provenance ownership without crossing profile boundaries", () => {
    const profileService = createProfileService(connection.db);
    const ekah = profileService.createProfile({ name: "Ekah" });
    const sourceKey = "ekah-collection";
    const inventoryId = "EKAH-20260813-B01-A1";
    const initial = collectionCsv([
      {
        "Inventory ID": inventoryId,
        Notes: "first photo pass",
        Condition: "Near Mint",
        "Photo Batch": "batch-001",
      },
    ]);

    importCollectionCsv(connection.db, initial, {
      profileId: ekah.id,
      sourceKey,
    });
    const before = requiredResult(
      connection.db
        .select({
          importRecordId: importRecords.id,
          ownedCardId: ownedCards.id,
          printingId: ownedCards.printingId,
        })
        .from(importRecords)
        .innerJoin(ownedCards, eq(importRecords.ownedCardId, ownedCards.id))
        .where(eq(importRecords.profileId, ekah.id))
        .get(),
      "initial Ekah provenance",
    );

    const updated = collectionCsv([
      {
        "Inventory ID": inventoryId,
        Quantity: "3",
        Notes: "second photo pass",
        Condition: "Lightly Played",
        "Photo Batch": "batch-002",
      },
    ]);
    const updatedResult = importCollectionCsv(connection.db, updated, {
      profileId: ekah.id,
      sourceKey,
    });
    const after = requiredResult(
      connection.db
        .select({
          importRecordId: importRecords.id,
          ownedCardId: ownedCards.id,
          printingId: ownedCards.printingId,
          quantity: ownedCards.quantity,
          condition: ownedCards.condition,
          notes: ownedCards.notes,
          metadata: ownedCards.metadata,
        })
        .from(importRecords)
        .innerJoin(ownedCards, eq(importRecords.ownedCardId, ownedCards.id))
        .where(eq(importRecords.profileId, ekah.id))
        .get(),
      "updated Ekah provenance",
    );

    expect(after).toMatchObject({
      ...before,
      quantity: 3,
      condition: "Lightly Played",
      notes: "second photo pass",
      metadata: { photoBatch: "batch-002" },
    });
    expect(updatedResult).toMatchObject({
      collectionEntries: 1,
      physicalCards: 3,
    });

    importCollectionCsv(
      connection.db,
      collectionCsv([
        {
          "Inventory ID": inventoryId,
          Notes: "my independent copy",
          Condition: "Damaged",
        },
      ]),
      { profileId, sourceKey },
    );

    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(1);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
    expect(connection.db.select().from(importRecords).all()).toHaveLength(2);
    expect(
      connection.db
        .select({ quantity: ownedCards.quantity, notes: ownedCards.notes })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, profileId))
        .get(),
    ).toEqual({ quantity: 1, notes: "my independent copy" });
    expect(
      connection.db
        .select({ quantity: ownedCards.quantity, notes: ownedCards.notes })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, ekah.id))
        .get(),
    ).toEqual({ quantity: 3, notes: "second photo pass" });
  });

  it("merges sparse duplicate rows within one CSV and rejects known contradictions", () => {
    const sparse = {
      "Inventory ID": "SPARSE-FIRST",
      "TCG Type": "",
      HP: "",
      "Attack 1 Name": "",
      "Attack 1 Cost": "",
      "Attack 1 Damage": "",
      Weakness: "",
      "Retreat Cost": "",
      "Finish / Variant": "",
    } satisfies Partial<Record<CollectionCsvHeader, string>>;
    const rich = { "Inventory ID": "RICH-SECOND" };

    importCollectionCsv(connection.db, collectionCsv([sparse, rich]), {
      profileId,
      sourceKey: "sparse-duplicates",
    });

    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(1);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
    expect(connection.db.select().from(pokemonDetails).get()).toMatchObject({
      pokemonType: "Fire",
      hp: 50,
      weakness: "Water ×2",
      retreatCost: 1,
    });
    expect(connection.db.select().from(attacks).all()).toMatchObject([
      { name: "Ember", damage: "30" },
    ]);

    const beforeConflict = tableSnapshot(connection);
    expect(() =>
      importCollectionCsv(
        connection.db,
        collectionCsv([
          { "Inventory ID": "CONFLICT-1", HP: "50" },
          { "Inventory ID": "CONFLICT-2", HP: "60" },
        ]),
        { profileId, sourceKey: "within-file-conflict" },
      ),
    ).toThrow(/conflicts with published card facts/u);
    expect(tableSnapshot(connection)).toEqual(beforeConflict);
  });

  it("preserves rich shared facts for sparse profile imports and rejects attack conflicts atomically", () => {
    const ekah = createProfileService(connection.db).createProfile({
      name: "Ekah",
    });
    const rich = collectionCsv([
      {
        "Inventory ID": "RICH-1",
        "English Name": "Charmander",
        "Collector Source": "https://example.com/cards/charmander",
        "Card Back Design": "International Pokémon back",
        "Printing Finish": "regular non-holo",
        "Physical Form": "standard",
        "Printed Identifiers": "species/pokedex-number: No.004",
      },
    ]);
    importCollectionCsv(connection.db, rich, {
      profileId,
      sourceKey: "my-rich-copy",
    });
    const printingBefore = requiredResult(
      connection.db.select().from(cardPrintings).get(),
      "rich shared printing",
    );

    const sparse = collectionCsv([
      {
        "Inventory ID": "EKAH-SPARSE-1",
        "TCG Type": "",
        HP: "",
        "English Name": "",
        "Collector Source": "",
        "Attack 1 Name": "",
        "Attack 1 Cost": "",
        "Attack 1 Damage": "",
        Weakness: "",
        "Retreat Cost": "",
        "Finish / Variant": "",
        "Card Back Design": "",
        "Printing Finish": "",
        "Physical Form": "",
        "Printed Identifiers": "",
      },
    ]);
    importCollectionCsv(connection.db, sparse, {
      profileId: ekah.id,
      sourceKey: "ekah-collection",
    });

    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(1);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
    expect(connection.db.select().from(cardPrintings).get()).toMatchObject({
      id: printingBefore.id,
      canonicalName: "Charmander",
      rarity: "Common",
      externalReferenceUrl: "https://example.com/cards/charmander",
      cardBackDesign: "International Pokémon back",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
    });
    expect(connection.db.select().from(pokemonDetails).get()).toMatchObject({
      pokemonType: "Fire",
      hp: 50,
      weakness: "Water ×2",
      retreatCost: 1,
    });
    expect(connection.db.select().from(attacks).all()).toMatchObject([
      { name: "Ember", cost: ["Fire", "Colorless"], damage: "30" },
    ]);
    expect(
      connection.db.select().from(printingIdentifiers).all(),
    ).toMatchObject([{ role: "species/pokedex-number", value: "No.004" }]);

    importCollectionCsv(
      connection.db,
      collectionCsv([
        {
          "Inventory ID": "EKAH-EQUIVALENT-2",
          "Attack 1 Name": "ember",
          "TCG Type": "fire",
        },
      ]),
      { profileId: ekah.id, sourceKey: "equivalent-facts" },
    );
    expect(connection.db.select().from(attacks).get()?.name).toBe("Ember");

    const beforeConflict = tableSnapshot(connection);
    expect(() =>
      importCollectionCsv(
        connection.db,
        collectionCsv([
          { "Inventory ID": "EKAH-CONFLICT", "Attack 1 Damage": "40" },
        ]),
        { profileId: ekah.id, sourceKey: "attack-conflict" },
      ),
    ).toThrow(/conflicts with existing shared published data/u);
    expect(tableSnapshot(connection)).toEqual(beforeConflict);
  });

  it("enriches sparse shared facts in place and rolls back realistic dry runs", () => {
    const sparse = collectionCsv([
      {
        "Inventory ID": "SPARSE-ORIGINAL",
        "Collector No.": "47/102",
        Name: "Squirtle",
        "TCG Type": "",
        HP: "",
        "Attack 1 Name": "",
        "Attack 1 Cost": "",
        "Attack 1 Damage": "",
        Weakness: "",
        "Retreat Cost": "",
        "Finish / Variant": "",
      },
    ]);
    importCollectionCsv(connection.db, sparse, {
      profileId,
      sourceKey: "sparse-original",
    });
    const sparsePrinting = requiredResult(
      connection.db.select().from(cardPrintings).get(),
      "sparse original printing",
    );
    const ownershipBefore = connection.db.select().from(ownedCards).all();
    const rich = collectionCsv([
      {
        "Inventory ID": "RICH-ENRICHMENT",
        "Collector No.": "47/102",
        Name: "Squirtle",
        "English Name": "Squirtle",
        "Printed Identifiers": "species/pokedex-number: No.007",
      },
    ]);
    const beforeDryRun = tableSnapshot(connection);

    const dryRunResult = importCollectionCsv(connection.db, rich, {
      profileId,
      sourceKey: "rich-enrichment",
      dryRun: true,
    });

    expect(dryRunResult).toMatchObject({
      importedEntries: 1,
      importedQuantity: 1,
      collectionEntries: 1,
      physicalCards: 1,
    });
    expect(tableSnapshot(connection)).toEqual(beforeDryRun);

    importCollectionCsv(connection.db, rich, {
      profileId,
      sourceKey: "rich-enrichment",
    });
    expect(connection.db.select().from(cardPrintings).get()).toMatchObject({
      id: sparsePrinting.id,
      canonicalName: "Squirtle",
      rarity: "Common",
    });
    expect(connection.db.select().from(pokemonDetails).get()).toMatchObject({
      pokemonType: "Fire",
      hp: 50,
    });
    expect(
      connection.db
        .select({ printingId: ownedCards.printingId })
        .from(ownedCards)
        .where(eq(ownedCards.id, ownershipBefore[0]!.id))
        .get(),
    ).toEqual({ printingId: sparsePrinting.id });
  });

  it("dry-runs the complete creation path without consuming IDs, then imports it", () => {
    const input = collectionCsv([
      {
        "Inventory ID": "DRY-RUN-COMPLETE",
        Condition: "Near Mint",
        "Printed Identifiers": "species/pokedex-number: No.004",
        "Component Group Key": "starter-scene",
        "Component Group Type": "multi-card-artwork",
        "Component Group Name": "Starter Scene",
        "Expected Component Count": "2",
        "Component Key": "left",
      },
    ]);
    const before = tableSnapshot(connection);

    importCollectionCsv(connection.db, input, {
      profileId,
      sourceKey: "dry-run-complete",
      dryRun: true,
    });

    expect(tableSnapshot(connection)).toEqual(before);
    importCollectionCsv(connection.db, input, {
      profileId,
      sourceKey: "dry-run-complete",
    });
    expect(connection.db.select().from(cardSets).get()?.id).toBe(1);
    expect(connection.db.select().from(cardPrintings).get()?.id).toBe(1);
    expect(connection.db.select().from(printingGroups).get()?.id).toBe(1);
    expect(connection.db.select().from(pokemonDetails).all()).toHaveLength(1);
    expect(connection.db.select().from(attacks).all()).toHaveLength(1);
    expect(connection.db.select().from(printingIdentifiers).all()).toHaveLength(
      1,
    );
    expect(connection.db.select().from(ownedCards).get()).toMatchObject({
      id: 1,
      condition: "Near Mint",
    });
    expect(connection.db.select().from(importRecords).all()).toHaveLength(1);
  });

  it("rejects set and Pokémon contradictions without partial mutation", () => {
    importCollectionCsv(
      connection.db,
      collectionCsv([{ "Inventory ID": "KNOWN" }]),
      {
        profileId,
        sourceKey: "known",
      },
    );
    const before = tableSnapshot(connection);

    expect(() =>
      importCollectionCsv(
        connection.db,
        collectionCsv([{ "Inventory ID": "HP-CONFLICT", HP: "60" }]),
        { profileId, sourceKey: "hp-conflict", dryRun: true },
      ),
    ).toThrow(/conflicts with existing shared published data/u);
    expect(tableSnapshot(connection)).toEqual(before);

    expect(() =>
      importCollectionCsv(
        connection.db,
        collectionCsv([
          {
            "Inventory ID": "SET-CONFLICT",
            "Collector No.": "47/102",
            Name: "Squirtle",
            Expansion: "A Different Set Name",
          },
        ]),
        { profileId, sourceKey: "set-conflict" },
      ),
    ).toThrow(/conflicts with existing shared published data/u);
    expect(tableSnapshot(connection)).toEqual(before);
  });
});

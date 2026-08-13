import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  attacks,
  cardPrintings,
  cardSets,
  games,
  ownedCards,
  pokemonDetails,
  printingGroupMembers,
  printingGroups,
  printingIdentifiers,
} from "@/db/schema";
import {
  createCollectionService,
  type CollectionService,
} from "@/lib/services/collection-service";
import { createProfileService } from "@/lib/services/profile-service";
import { stablePrintingIdentityKey } from "@/lib/printing-identity";
import type { CreateCollectionEntryInput } from "@/lib/types/collection";

const profileSlug = "my-collection";

function cardInput(
  overrides: Partial<CreateCollectionEntryInput> = {},
): CreateCollectionEntryInput {
  return {
    gameSlug: "pokemon-tcg",
    gameName: "Pokémon TCG",
    setCode: "TST",
    setName: "Test Set",
    name: "Test Pokémon",
    collectorNumber: "001/100",
    cardKind: "Pokémon",
    subtype: "Basic",
    pokemonType: "Colorless",
    hp: 60,
    quantity: 1,
    ...overrides,
  };
}

describe("collection service", () => {
  let connection: DatabaseConnection;
  let service: CollectionService;

  beforeEach(() => {
    vi.stubEnv(
      "CARDBOARDEX_TRUSTED_IMAGE_ORIGINS",
      "https://images.example.com",
    );
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
    service = createCollectionService(connection.db);
  });

  afterEach(() => {
    connection.sqlite.close();
    vi.unstubAllEnvs();
  });

  it("creates and reads a detailed collection entry with structured attacks", () => {
    const created = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "ME01",
        setName: "Mega Evolution",
        name: "Bulbasaur",
        collectorNumber: "133/132",
        rarity: "Illustration Rare",
        regulationMark: "I",
        specialRuleBox: "Promotional printing",
        abilityRule: "A useful rule",
        rulesText: "Published card text",
        identificationConfidence: "High",
        visibleMoveOrEffect1: "Bind Down — 10",
        pokemonType: "Grass",
        hp: 80,
        weakness: "Fire ×2",
        retreatCost: 2,
        attacks: [
          {
            name: "Bind Down",
            cost: ["G"],
            damage: "10",
            effect: "The Defending Pokémon can't retreat.",
          },
          {
            name: "Grow",
            cost: [],
            effect: "Search your deck for a card.",
          },
        ],
        finishVariant: "Mega Evolution stamped promo",
        sealed: true,
        notes: "Factory sealed Pokémon promo.",
        deckPool: "Grass deck",
        imageProvider: "fixture",
        imageExternalId: "me01-133",
        imageUrl: "https://images.example.com/me01-133.png",
        externalReferenceUrl: "https://cards.example.test/me01/133",
      }),
    );

    expect(created).toMatchObject({
      gameName: "Pokémon TCG",
      name: "Bulbasaur",
      setName: "Mega Evolution",
      collectorNumber: "133/132",
      rarity: "Illustration Rare",
      pokemonType: "Grass",
      hp: 80,
      quantity: 1,
      finishVariant: "Mega Evolution stamped promo",
      sealed: true,
      visibleMoveOrEffect1: "Bind Down — 10",
      deckPool: "Grass deck",
      externalReferenceUrl: "https://cards.example.test/me01/133",
    });
    expect(created.attacks).toEqual([
      {
        id: expect.any(Number),
        position: 1,
        name: "Bind Down",
        cost: ["G"],
        damage: "10",
        effect: "The Defending Pokémon can't retreat.",
      },
      {
        id: expect.any(Number),
        position: 2,
        name: "Grow",
        cost: [],
        damage: null,
        effect: "Search your deck for a card.",
      },
    ]);

    expect(
      service.getCollectionEntry(profileSlug, created.ownedCardId),
    ).toEqual(created);
  });

  it("searches, filters, sorts, and returns useful facet counts", () => {
    service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "BS",
        setName: "Base Set",
        name: "Abra",
        collectorNumber: "43/102",
        rarity: "Common",
        regulationMark: null,
        pokemonType: "Psychic",
        hp: 30,
        retreatCost: 0,
        finishVariant: "regular non-holo",
      }),
    );
    service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "ME02",
        setName: "Phantasmal Flames",
        name: "Seel",
        collectorNumber: "021/094",
        pokemonType: "Water",
        hp: 80,
      }),
    );
    service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "SWSH12pt5",
        setName: "Crown Zenith",
        name: "Seel",
        collectorNumber: "029/159",
        pokemonType: "Water",
        hp: 70,
      }),
    );
    service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "ME01",
        setName: "Mega Evolution",
        name: "Bulbasaur",
        collectorNumber: "133/132",
        pokemonType: "Grass",
        hp: 80,
        sealed: true,
        finishVariant: "stamped promo",
      }),
    );
    service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "ME05",
        setName: "Pitch Black",
        name: "Tremendous Bomb",
        collectorNumber: "082/084",
        cardKind: "Trainer",
        subtype: "Pokémon Tool",
        pokemonType: null,
        hp: null,
        quantity: 2,
      }),
    );

    expect(
      service
        .listCollection(profileSlug, { search: "SEEL" })
        .map((card) => card.setCode),
    ).toEqual(["SWSH12pt5", "ME02"]);
    expect(
      service
        .listCollection(profileSlug, { search: "43/102" })
        .map((card) => card.name),
    ).toEqual(["Abra"]);
    expect(
      service
        .listCollection(profileSlug, { search: "base set" })
        .map((card) => card.name),
    ).toEqual(["Abra"]);
    expect(service.listCollection(profileSlug, { search: "%" })).toEqual([]);
    expect(
      service
        .listCollection(profileSlug, { pokemonType: "Water" })
        .map((card) => card.name),
    ).toEqual(["Seel", "Seel"]);
    expect(
      service
        .listCollection(profileSlug, { sealed: true })
        .map((card) => card.name),
    ).toEqual(["Bulbasaur"]);
    expect(
      service
        .listCollection(profileSlug, { finishVariant: "regular non-holo" })
        .map((card) => card.name),
    ).toEqual(["Abra"]);
    expect(
      service
        .listCollection(profileSlug, { rarity: "Common" })
        .map((card) => card.name),
    ).toEqual(["Abra"]);
    expect(
      service
        .listCollection(profileSlug, {
          sort: { field: "quantity", direction: "desc" },
        })
        .map((card) => card.name)[0],
    ).toBe("Tremendous Bomb");
    expect(
      service
        .listCollection(profileSlug, {
          sort: { field: "hp", direction: "asc" },
        })
        .map((card) => card.name),
    ).toEqual(["Abra", "Seel", "Bulbasaur", "Seel", "Tremendous Bomb"]);
    expect(
      service
        .listCollection(profileSlug, {
          sort: { field: "collectorNumber", direction: "asc" },
        })
        .map((card) => card.collectorNumber),
    ).toEqual(["021/094", "029/159", "43/102", "082/084", "133/132"]);

    const facets = service.getCollectionFacets(profileSlug);
    expect(facets.games).toEqual([
      { value: "pokemon-tcg", label: "Pokémon TCG", count: 5 },
    ]);
    expect(facets.cardKinds).toEqual([
      { value: "Pokémon", label: "Pokémon", count: 4 },
      { value: "Trainer", label: "Trainer", count: 1 },
    ]);
    expect(facets.pokemonTypes).toContainEqual({
      value: "Water",
      label: "Water",
      count: 2,
    });
    expect(facets.sets).toHaveLength(5);
  });

  it("updates only owned fields and deletes ownership without deleting the printing", () => {
    const created = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "BS",
        setName: "Base Set",
        name: "Abra",
        collectorNumber: "43/102",
        regulationMark: null,
        pokemonType: "Psychic",
        hp: 30,
        retreatCost: 0,
      }),
    );

    const updated = service.updateOwnedCard(profileSlug, created.ownedCardId, {
      quantity: 2,
      condition: "  Moderately Played  ",
      finishVariant: "   ",
      sealed: true,
      notes: "  Visible play wear.  ",
    });

    expect(updated).toMatchObject({
      name: "Abra",
      collectorNumber: "43/102",
      regulationMark: null,
      retreatCost: 0,
      quantity: 2,
      condition: "Moderately Played",
      finishVariant: null,
      sealed: true,
      notes: "Visible play wear.",
    });
    expect(() =>
      service.updateOwnedCard(profileSlug, created.ownedCardId, {
        quantity: 0,
      }),
    ).toThrow();
    expect(() =>
      service.updateOwnedCard(profileSlug, created.ownedCardId, {}),
    ).toThrow();

    expect(
      service.deleteCollectionEntry(profileSlug, created.ownedCardId),
    ).toBe(true);
    expect(
      service.getCollectionEntry(profileSlug, created.ownedCardId),
    ).toBeNull();
    expect(service.listCollection(profileSlug)).toEqual([]);
    expect(
      connection.db.select({ id: cardPrintings.id }).from(cardPrintings).all(),
    ).toHaveLength(1);
    expect(
      connection.db.select({ id: ownedCards.id }).from(ownedCards).all(),
    ).toHaveLength(0);
    expect(
      service.deleteCollectionEntry(profileSlug, created.ownedCardId),
    ).toBe(false);
  });

  it("reuses canonical printing identities while allowing a distinct printing variant", () => {
    const standard = cardInput({
      setCode: "ME05",
      setName: "Pitch Black",
      name: "Maschiff",
      collectorNumber: "057/084",
      pokemonType: "Darkness",
      hp: 70,
    });
    const first = service.createCollectionEntry(profileSlug, standard);
    const second = service.createCollectionEntry(profileSlug, {
      ...standard,
      name: "A conflicting form value must not edit published facts",
      collectorNumber: "57/84",
      condition: "Near Mint",
    });
    const variant = service.createCollectionEntry(profileSlug, {
      ...standard,
      printingVariantKey: "Reverse Holo",
      finishVariant: "Reverse holo",
    });

    expect(second.printingId).toBe(first.printingId);
    expect(second.name).toBe("Maschiff");
    expect(variant.printingId).not.toBe(first.printingId);
    expect(variant.printingVariantKey).toBe("reverse-holo");
    expect(
      connection.db.select({ id: games.id }).from(games).all(),
    ).toHaveLength(1);
    expect(
      connection.db.select({ id: cardSets.id }).from(cardSets).all(),
    ).toHaveLength(1);
    expect(
      connection.db.select({ id: cardPrintings.id }).from(cardPrintings).all(),
    ).toHaveLength(2);
    expect(
      connection.db.select({ id: ownedCards.id }).from(ownedCards).all(),
    ).toHaveLength(3);

    expect(() =>
      service.createCollectionEntry(profileSlug, {
        ...standard,
        quantity: -1,
      }),
    ).toThrow();
  });

  it("supports deterministic collector-numberless Japanese printings", () => {
    const english = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "BS",
        setName: "Base Set",
        name: "Abra",
        collectorNumber: "43/102",
        languageCode: "en",
        printingVariantKey: "unlimited",
      }),
    );
    const japaneseInput = cardInput({
      setCode: "JP-PMCG1",
      setName: "拡張パック",
      name: "ケーシィ",
      canonicalName: "Abra",
      collectorNumber: null,
      languageCode: "ja",
      printingVariantKey: "no-rarity",
      catalogProvider: "tcgdex",
      catalogSetId: "PMCG1",
      catalogCardId: "PMCG1-043",
    });
    const japanese = service.createCollectionEntry(profileSlug, japaneseInput);
    const duplicateOwnership = service.createCollectionEntry(
      profileSlug,
      japaneseInput,
    );

    expect(japanese).toMatchObject({
      name: "ケーシィ",
      canonicalName: "Abra",
      collectorNumber: null,
      languageCode: "ja",
      printingVariantKey: "no-rarity",
      catalogProvider: "tcgdex",
      catalogExternalId: "PMCG1-043",
    });
    expect(japanese.printingId).not.toBe(english.printingId);
    expect(duplicateOwnership.printingId).toBe(japanese.printingId);
    expect(duplicateOwnership.ownedCardId).not.toBe(japanese.ownedCardId);
    expect(japanese.stableIdentityKey).toBe(
      "catalog:tcgdex:ja:pmcg1:pmcg1-043:no-rarity",
    );
    expect(
      service
        .listCollection(profileSlug, {
          sort: { field: "collectorNumber", direction: "asc" },
        })
        .map((card) => card.collectorNumber),
    ).toEqual(["43/102", null, null]);
    expect(
      service.listCollection(profileSlug, { search: "Abra" }),
    ).toHaveLength(3);
    expect(
      service.listCollection(profileSlug, { search: "ケーシィ" }),
    ).toHaveLength(2);
  });

  it("preserves shared CardSet catalog identity during manual creation", () => {
    const existing = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "JP-PMCG1",
        setName: "拡張パック",
        name: "既存のカード",
        collectorNumber: null,
        languageCode: "ja",
        imageProvider: "fixture",
        imageExternalId: "existing-card",
        imageUrl: "https://images.example.com/existing-card.png",
      }),
    );

    const populated = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "JP-PMCG1",
        setName: "拡張パック",
        name: "ピカチュウ",
        collectorNumber: null,
        languageCode: "ja",
        catalogProvider: "tcgdex",
        catalogSetId: "PMCG1",
        catalogCardId: "PMCG1-035",
      }),
    );
    const matching = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "JP-PMCG1",
        setName: "拡張パック",
        name: "ケーシィ",
        collectorNumber: null,
        languageCode: "ja",
        catalogProvider: "tcgdex",
        catalogSetId: "PMCG1",
        catalogCardId: "PMCG1-043",
        printingVariantKey: "no-rarity",
      }),
    );

    expect(populated.catalogProvider).toBe("tcgdex");
    expect(matching.catalogExternalId).toBe("PMCG1-043");
    expect(
      connection.db
        .select({
          catalogProvider: cardSets.catalogProvider,
          catalogExternalId: cardSets.catalogExternalId,
        })
        .from(cardSets)
        .where(eq(cardSets.code, "JP-PMCG1"))
        .get(),
    ).toEqual({ catalogProvider: "tcgdex", catalogExternalId: "PMCG1" });

    const countsBeforeConflict = {
      printings: connection.db.select().from(cardPrintings).all().length,
      owned: connection.db.select().from(ownedCards).all().length,
    };

    expect(() =>
      service.createCollectionEntry(
        profileSlug,
        cardInput({
          setCode: "JP-PMCG1",
          setName: "拡張パック",
          name: "誤ったセット ID",
          collectorNumber: null,
          languageCode: "ja",
          catalogProvider: "tcgdex",
          catalogSetId: "PMCGI",
          catalogCardId: "PMCGI-001",
        }),
      ),
    ).toThrow(/already linked to tcgdex set PMCG1.*PMCGI conflicts/u);
    expect(() =>
      service.createCollectionEntry(
        profileSlug,
        cardInput({
          setCode: "JP-PMCG1",
          setName: "拡張パック",
          name: "Wrong provider",
          collectorNumber: null,
          languageCode: "ja",
          catalogProvider: "another-provider",
          catalogSetId: "PMCG1",
          catalogCardId: "PMCG1-001",
        }),
      ),
    ).toThrow(/already linked to tcgdex set PMCG1.*another-provider/u);

    expect(
      connection.db
        .select({
          catalogProvider: cardSets.catalogProvider,
          catalogExternalId: cardSets.catalogExternalId,
        })
        .from(cardSets)
        .where(eq(cardSets.code, "JP-PMCG1"))
        .get(),
    ).toEqual({ catalogProvider: "tcgdex", catalogExternalId: "PMCG1" });
    expect({
      printings: connection.db.select().from(cardPrintings).all().length,
      owned: connection.db.select().from(ownedCards).all().length,
    }).toEqual(countsBeforeConflict);
    expect(
      service.getCollectionEntry(profileSlug, existing.ownedCardId),
    ).toMatchObject({
      imageUrl: "https://images.example.com/existing-card.png",
    });
  });

  it("models published back, finish, and physical form without requiring them", () => {
    const shared = cardInput({
      setCode: "CAT",
      setName: "Cataloging Test",
      name: "Variant Card",
      collectorNumber: "001/010",
    });
    const earlyBack = service.createCollectionEntry(profileSlug, {
      ...shared,
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
    });
    const internationalBack = service.createCollectionEntry(profileSlug, {
      ...shared,
      cardBackDesign: "international Pokémon",
      printingFinish: "regular non-holo",
      physicalForm: "standard",
    });
    const holo = service.createCollectionEntry(profileSlug, {
      ...shared,
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "holo",
      physicalForm: "standard",
    });
    const oversize = service.createCollectionEntry(profileSlug, {
      ...shared,
      cardBackDesign: "Pocket Monsters Card Game",
      printingFinish: "regular non-holo",
      physicalForm: "oversize",
    });
    const unknownBack = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "CAT",
        setName: "Cataloging Test",
        name: "Blank Back Is Valid",
        collectorNumber: "002/010",
      }),
    );

    expect(
      new Set([
        earlyBack.printingId,
        internationalBack.printingId,
        holo.printingId,
        oversize.printingId,
      ]).size,
    ).toBe(4);
    expect(unknownBack.cardBackDesign).toBeNull();
    expect(
      service.listCollection(profileSlug, {
        cardBackDesign: "Pocket Monsters Card Game",
      }),
    ).toHaveLength(3);
    expect(
      service.listCollection(profileSlug, { printingFinish: "holo" }),
    ).toMatchObject([{ ownedCardId: holo.ownedCardId }]);
    expect(
      service.listCollection(profileSlug, { physicalForm: "oversize" }),
    ).toMatchObject([{ ownedCardId: oversize.ownedCardId }]);
    expect(service.getCollectionFacets(profileSlug)).toMatchObject({
      printingFinishes: expect.arrayContaining([
        { value: "holo", label: "holo", count: 1 },
      ]),
      physicalForms: expect.arrayContaining([
        { value: "oversize", label: "oversize", count: 1 },
      ]),
    });
  });

  it("enriches unknown printing attributes in place using semantic normalization", () => {
    const shared = cardInput({
      setCode: "ENR-ATTR",
      setName: "Attribute Enrichment",
      name: "Enrichment Variant",
      collectorNumber: "003/010",
      imageProvider: "fixture",
      imageExternalId: "enrichment-variant",
      imageUrl: "https://images.example.com/enrichment-variant.png",
      pokemonType: "Psychic",
      hp: 60,
      attacks: [{ name: "Recall", cost: ["P"], damage: "10" }],
    });
    const original = service.createCollectionEntry(profileSlug, shared);
    const finishEnriched = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "  Holo  ",
    });
    const formEnriched = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "holo",
      physicalForm: "  Standard  ",
      cardBackDesign: "Ｐｏｋｅｍｏｎ Back",
    });
    const cosmeticallyEquivalent = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "HOLO",
      physicalForm: "standard",
      cardBackDesign: "Pokemon Back",
    });
    const missingAttributes = service.createCollectionEntry(
      profileSlug,
      shared,
    );

    expect([
      finishEnriched.printingId,
      formEnriched.printingId,
      cosmeticallyEquivalent.printingId,
      missingAttributes.printingId,
    ]).toEqual([
      original.printingId,
      original.printingId,
      original.printingId,
      original.printingId,
    ]);
    expect(cosmeticallyEquivalent).toMatchObject({
      printingFinish: "Holo",
      physicalForm: "Standard",
      cardBackDesign: "Ｐｏｋｅｍｏｎ Back",
      imageUrl: "https://images.example.com/enrichment-variant.png",
    });
    expect(
      service.getCollectionEntry(profileSlug, original.ownedCardId),
    ).toMatchObject({
      printingId: original.printingId,
      printingFinish: "Holo",
      physicalForm: "Standard",
      cardBackDesign: "Ｐｏｋｅｍｏｎ Back",
    });
    const stored = connection.db
      .select({
        stableIdentityKey: cardPrintings.stableIdentityKey,
        name: cardPrintings.name,
        collectorNumber: cardPrintings.collectorNumber,
        printingVariantKey: cardPrintings.printingVariantKey,
        languageCode: cardPrintings.languageCode,
        printingFinish: cardPrintings.printingFinish,
        physicalForm: cardPrintings.physicalForm,
        cardBackDesign: cardPrintings.cardBackDesign,
      })
      .from(cardPrintings)
      .where(eq(cardPrintings.id, original.printingId))
      .get();
    expect(stored?.stableIdentityKey).toBe(
      stablePrintingIdentityKey({
        gameSlug: "pokemon-tcg",
        setCode: "ENR-ATTR",
        languageCode: stored!.languageCode,
        name: stored!.name,
        collectorNumber: stored!.collectorNumber,
        printingVariantKey: stored!.printingVariantKey,
        printingFinish: stored!.printingFinish,
        physicalForm: stored!.physicalForm,
        cardBackDesign: stored!.cardBackDesign,
      }),
    );
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(1);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(5);
    expect(connection.db.select().from(pokemonDetails).all()).toHaveLength(1);
    expect(connection.db.select().from(attacks).all()).toHaveLength(1);
  });

  it("keeps known conflicting finishes distinct and rejects ambiguous missing facts", () => {
    const shared = cardInput({
      setCode: "AMB",
      setName: "Ambiguous Variants",
      name: "Ambiguous Card",
      collectorNumber: "004/010",
      physicalForm: "standard",
    });
    const holo = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "holo",
    });
    const reverse = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "reverse holo",
    });

    expect(reverse.printingId).not.toBe(holo.printingId);
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(2);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);

    expect(() =>
      service.createCollectionEntry(profileSlug, {
        ...shared,
        printingFinish: null,
        physicalForm: null,
      }),
    ).toThrow(/multiple compatible local printings/u);
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(2);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
  });

  it("canonicalizes enriched identity keys and rejects ambiguous missing facts", () => {
    const shared = cardInput({
      setCode: "EXACT",
      setName: "Exact Match Set",
      name: "Exact Match Card",
      collectorNumber: "005/010",
    });
    const original = service.createCollectionEntry(profileSlug, shared);
    const holo = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "holo",
      physicalForm: "standard",
    });
    const distinct = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "reverse holo",
      physicalForm: "standard",
    });

    expect(distinct.printingId).not.toBe(original.printingId);
    expect(holo.printingId).toBe(original.printingId);
    expect(holo.stableIdentityKey).toBe(
      stablePrintingIdentityKey({
        gameSlug: "pokemon-tcg",
        setCode: "EXACT",
        languageCode: "en",
        name: "Exact Match Card",
        collectorNumber: "005/010",
        printingVariantKey: "standard",
        printingFinish: "holo",
        physicalForm: "standard",
      }),
    );
    expect(
      service.getCollectionEntry(profileSlug, original.ownedCardId),
    ).toMatchObject({ printingId: original.printingId });
    connection.db
      .update(cardPrintings)
      .set({
        stableIdentityKey: stablePrintingIdentityKey({
          gameSlug: "pokemon-tcg",
          setCode: "EXACT",
          languageCode: "en",
          name: "Exact Match Card",
          collectorNumber: "005/010",
          printingVariantKey: "standard",
        }),
      })
      .where(eq(cardPrintings.id, original.printingId))
      .run();

    expect(() => service.createCollectionEntry(profileSlug, shared)).toThrow(
      /multiple compatible local printings/u,
    );
    const exactHolo = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "holo",
      physicalForm: "standard",
    });
    const exactReverse = service.createCollectionEntry(profileSlug, {
      ...shared,
      printingFinish: "reverse holo",
      physicalForm: "standard",
    });

    expect(exactHolo.printingId).toBe(holo.printingId);
    expect(exactReverse.printingId).toBe(distinct.printingId);
    expect(exactHolo.stableIdentityKey).toBe(holo.stableIdentityKey);
    expect(
      service.getCollectionEntry(profileSlug, original.ownedCardId),
    ).toMatchObject({
      printingId: original.printingId,
      stableIdentityKey: holo.stableIdentityKey,
    });
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(2);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(5);
  });

  it("rejects partial component-group metadata as controlled validation", () => {
    expect(() =>
      service.createCollectionEntry(
        profileSlug,
        cardInput({
          componentGroup: {
            groupKey: "",
            groupType: "",
            name: "Partially entered group",
            expectedComponentCount: 2,
            componentKey: "",
          },
        }),
      ),
    ).toThrow(/Component group key is required/u);
    expect(connection.db.select().from(printingGroups).all()).toHaveLength(0);
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(0);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(0);
  });

  it("stores semantic printed identifiers without fabricating a collector number", () => {
    const created = service.createCollectionEntry(
      profileSlug,
      cardInput({
        setCode: "JP-PMCG1",
        setName: "拡張パック",
        name: "ヒトカゲ",
        canonicalName: "Charmander",
        collectorNumber: null,
        languageCode: "ja",
        printedIdentifiers: [
          {
            role: "species/pokedex-number",
            value: "No.004",
            label: "Pokédex number",
          },
        ],
      }),
    );

    expect(created.collectorNumber).toBeNull();
    expect(created.printedIdentifiers).toEqual([
      {
        id: expect.any(Number),
        role: "species/pokedex-number",
        value: "No.004",
        label: "Pokédex number",
      },
    ]);
    expect(
      service.listCollection(profileSlug, { search: "No.004" }),
    ).toHaveLength(1);
    expect(connection.db.select().from(printingIdentifiers).all()).toHaveLength(
      1,
    );
  });

  it("keeps generic multi-card components independently ownable", () => {
    const component = cardInput({
      setCode: "CMP",
      setName: "Component Set",
      name: "Combined Card",
      collectorNumber: null,
    });
    const top = service.createCollectionEntry(profileSlug, {
      ...component,
      quantity: 1,
      componentGroup: {
        groupKey: "combined-card",
        groupType: "multi-card-artwork",
        name: "Combined Card",
        expectedComponentCount: 2,
        componentKey: "top",
      },
    });
    const bottom = service.createCollectionEntry(profileSlug, {
      ...component,
      quantity: 2,
      componentGroup: {
        groupKey: "combined-card",
        groupType: "multi-card-artwork",
        name: "Combined Card",
        expectedComponentCount: 2,
        componentKey: "bottom",
      },
    });

    expect(bottom.printingId).not.toBe(top.printingId);
    expect(top.printingGroups).toMatchObject([
      { groupKey: "combined-card", componentKey: "top" },
    ]);
    expect(bottom.printingGroups).toMatchObject([
      { groupKey: "combined-card", componentKey: "bottom" },
    ]);
    expect(connection.db.select().from(printingGroups).all()).toHaveLength(1);
    expect(
      connection.db.select().from(printingGroupMembers).all(),
    ).toHaveLength(2);
    expect(
      service
        .listCollection(profileSlug)
        .reduce((total, entry) => total + entry.quantity, 0),
    ).toBe(3);
  });

  it("reconciles compatible catalog enrichment in place and rejects conflicts atomically", () => {
    const localInput = cardInput({
      setCode: "ENR",
      setName: "Enrichment Set",
      name: "Enrichment Card",
      collectorNumber: "007/100",
      imageProvider: "fixture",
      imageExternalId: "enrichment-card",
      imageUrl: "https://images.example.com/enrichment-card.png",
      pokemonType: "Psychic",
      hp: 70,
      attacks: [{ name: "Remember", cost: ["P"], damage: "20" }],
    });
    const local = service.createCollectionEntry(profileSlug, localInput);
    const originalPrinting = connection.db
      .select()
      .from(cardPrintings)
      .where(eq(cardPrintings.id, local.printingId))
      .get();
    const enriched = service.createCollectionEntry(profileSlug, {
      ...localInput,
      condition: "Near Mint",
      catalogProvider: "test-catalog",
      catalogSetId: "enrichment-set",
      catalogCardId: "enrichment-card-007",
      cardBackDesign: "international Pokémon",
    });

    expect(enriched.printingId).toBe(local.printingId);
    expect(enriched.stableIdentityKey).toBe(
      "catalog:test-catalog:en:enrichment-set:enrichment-card-007:standard:back:international%20pok%C3%A9mon",
    );
    expect(enriched).toMatchObject({
      catalogProvider: "test-catalog",
      catalogExternalId: "enrichment-card-007",
      imageUrl: "https://images.example.com/enrichment-card.png",
      cardBackDesign: "international Pokémon",
    });
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(1);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
    expect(connection.db.select().from(pokemonDetails).all()).toHaveLength(1);
    expect(connection.db.select().from(attacks).all()).toHaveLength(1);
    expect(
      connection.db
        .select({ createdAt: cardPrintings.createdAt })
        .from(cardPrintings)
        .where(eq(cardPrintings.id, local.printingId))
        .get()?.createdAt,
    ).toBe(originalPrinting?.createdAt);

    const beforeConflict = connection.db
      .select()
      .from(cardPrintings)
      .where(eq(cardPrintings.id, local.printingId))
      .get();
    expect(() =>
      service.createCollectionEntry(profileSlug, {
        ...localInput,
        catalogProvider: "test-catalog",
        catalogSetId: "enrichment-set",
        catalogCardId: "conflicting-card-999",
        cardBackDesign: "international Pokémon",
      }),
    ).toThrow(/already linked to catalog identity/u);
    expect(
      connection.db
        .select()
        .from(cardPrintings)
        .where(eq(cardPrintings.id, local.printingId))
        .get(),
    ).toEqual(beforeConflict);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
  });

  it("supports multiple condition lots for one printing", () => {
    const printing = cardInput({
      setCode: "LOT",
      setName: "Condition Lots",
      name: "Lot Card",
      collectorNumber: "010/100",
    });
    const nearMint = service.createCollectionEntry(profileSlug, {
      ...printing,
      quantity: 3,
      condition: "Near Mint",
    });
    const moderatelyPlayed = service.createCollectionEntry(profileSlug, {
      ...printing,
      quantity: 2,
      condition: "Moderately Played",
    });

    expect(moderatelyPlayed.printingId).toBe(nearMint.printingId);
    expect(moderatelyPlayed.ownedCardId).not.toBe(nearMint.ownedCardId);
    expect(service.listCollection(profileSlug)).toMatchObject([
      { quantity: 3, condition: "Near Mint" },
      { quantity: 2, condition: "Moderately Played" },
    ]);
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(1);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(2);
  });

  it("isolates ownership while sharing one canonical printing between profiles", () => {
    const secondProfile = createProfileService(connection.db).createProfile({
      name: "Ekah",
    });
    const printing = cardInput({
      setCode: "BS",
      setName: "Base Set",
      name: "Abra",
      collectorNumber: "43/102",
      printingVariantKey: "unlimited",
      pokemonType: "Psychic",
      condition: "Moderately Played",
      notes: "Default profile note",
    });

    const mine = service.createCollectionEntry(profileSlug, printing);
    const theirs = service.createCollectionEntry(secondProfile.slug, {
      ...printing,
      quantity: 3,
      condition: "Lightly Played",
      notes: "Ekah profile note",
    });

    expect(theirs.printingId).toBe(mine.printingId);
    expect(theirs.ownedCardId).not.toBe(mine.ownedCardId);
    expect(service.listCollection(profileSlug)).toHaveLength(1);
    expect(service.listCollection(secondProfile.slug)).toMatchObject([
      { quantity: 3 },
    ]);
    expect(
      service.getCollectionEntry(profileSlug, theirs.ownedCardId),
    ).toBeNull();
    expect(
      service.updateOwnedCard(profileSlug, theirs.ownedCardId, { quantity: 9 }),
    ).toBeNull();
    expect(service.deleteCollectionEntry(profileSlug, theirs.ownedCardId)).toBe(
      false,
    );
    expect(
      service.getCollectionEntry(secondProfile.slug, theirs.ownedCardId),
    ).toMatchObject({
      quantity: 3,
      condition: "Lightly Played",
      notes: "Ekah profile note",
    });
    expect(
      service.getCollectionEntry(profileSlug, mine.ownedCardId),
    ).toMatchObject({
      quantity: 1,
      condition: "Moderately Played",
      notes: "Default profile note",
    });
    expect(
      service.listCollection(profileSlug, { search: "Abra" }),
    ).toHaveLength(1);
    expect(
      service.listCollection(secondProfile.slug, { pokemonType: "Psychic" }),
    ).toHaveLength(1);
    expect(service.getCollectionFacets(profileSlug).pokemonTypes).toEqual([
      { value: "Psychic", label: "Psychic", count: 1 },
    ]);
    expect(
      connection.db.select({ id: cardPrintings.id }).from(cardPrintings).all(),
    ).toHaveLength(1);
    expect(
      connection.db.select({ id: ownedCards.id }).from(ownedCards).all(),
    ).toHaveLength(2);

    expect(
      service.deleteCollectionEntry(secondProfile.slug, theirs.ownedCardId),
    ).toBe(true);
    expect(
      service.getCollectionEntry(profileSlug, mine.ownedCardId),
    ).toMatchObject({ quantity: 1, notes: "Default profile note" });
    expect(
      connection.db.select({ id: cardPrintings.id }).from(cardPrintings).all(),
    ).toHaveLength(1);
  });

  it("lists, creates, and renames stable local profile identities", () => {
    const profiles = createProfileService(connection.db);
    expect(profiles.listProfiles()).toMatchObject([
      { slug: "my-collection", name: "My Collection" },
    ]);

    const first = profiles.createProfile({ name: "Ekah" });
    const second = profiles.createProfile({ name: "Ekah" });
    const renamed = profiles.renameProfile(first.slug, {
      name: "Ekah's Collection",
    });

    expect(first.slug).toBe("ekah");
    expect(second.slug).toBe("ekah-2");
    expect(renamed).toMatchObject({
      slug: "ekah",
      name: "Ekah's Collection",
    });
    expect(profiles.listProfiles()).toHaveLength(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { cardPrintings, cardSets, games, ownedCards } from "@/db/schema";
import {
  createCollectionService,
  type CollectionService,
} from "@/lib/services/collection-service";
import { createProfileService } from "@/lib/services/profile-service";
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
      "catalog:tcgdex:ja:pmcg1-043:no-rarity",
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

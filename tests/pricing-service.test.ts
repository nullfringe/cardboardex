import { count } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { marketPriceObservations } from "@/db/schema";
import { createCollectionService } from "@/lib/services/collection-service";
import { createPricingService } from "@/lib/services/pricing-service";
import { createProfileService } from "@/lib/services/profile-service";

describe("collection market valuation", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
  });

  afterEach(() => connection.sqlite.close());

  it("shares provider observations, excludes sealed lots, and preserves manual history", () => {
    const collection = createCollectionService(connection.db);
    const pricing = createPricingService(connection.db);
    const created = collection.createCollectionEntry("my-collection", {
      gameSlug: "pokemon-tcg",
      gameName: "Pokémon TCG",
      setCode: "TST",
      setName: "Test Set",
      name: "Test Pokémon",
      collectorNumber: "001/100",
      cardKind: "Pokémon",
      quantity: 2,
    });
    connection.db
      .insert(marketPriceObservations)
      .values({
        printingId: created.printingId,
        ownedCardId: null,
        provider: "tcgcsv-tcgplayer",
        providerProductId: "7001",
        providerVariant: "Normal",
        currency: "USD",
        marketPriceMinor: 250,
        lowPriceMinor: 200,
        midPriceMinor: 275,
        highPriceMinor: 400,
        directLowPriceMinor: null,
        observationType: "provider",
        observationKey: "provider-test-observation",
        sourceUrl: "https://www.tcgplayer.com/product/7001/test-pokemon",
        sourceUpdatedAt: null,
        firstSeenAt: "2026-08-14T20:00:00.000Z",
        lastSeenAt: "2026-08-14T20:00:00.000Z",
        note: null,
      })
      .run();

    let item = collection.listCollection("my-collection")[0]!;
    expect(item.marketEstimate).toMatchObject({
      unitAmountMinor: 250,
      manual: false,
      priceCondition: null,
      conditionAssumed: false,
    });
    expect(pricing.summarize([item])).toMatchObject({
      estimatedValueMinor: 500,
      valuedEntries: 1,
      valuedPhysicalCards: 2,
      assumedEntries: 0,
      assumedPhysicalCards: 0,
      defaultPricingCondition: "Lightly Played",
    });

    collection.updateOwnedCard("my-collection", created.ownedCardId, {
      sealed: true,
    });
    item = collection.listCollection("my-collection")[0]!;
    expect(item.marketEstimate).toBeNull();

    expect(
      pricing.setManualEstimate("my-collection", created.ownedCardId, {
        amount: "3.75",
        note: "Comparable sealed sale",
      }),
    ).toMatchObject({
      unitAmountMinor: 375,
      manual: true,
      note: "Comparable sealed sale",
    });
    item = collection.listCollection("my-collection")[0]!;
    expect(pricing.summarize([item]).estimatedValueMinor).toBe(750);

    expect(
      pricing.clearManualEstimate("my-collection", created.ownedCardId),
    ).toBeNull();
    expect(
      collection.listCollection("my-collection")[0]!.marketEstimate,
    ).toBeNull();
    expect(
      connection.db
        .select({ count: count() })
        .from(marketPriceObservations)
        .get()?.count,
    ).toBe(3);

    collection.updateOwnedCard("my-collection", created.ownedCardId, {
      sealed: false,
    });
    expect(
      collection.listCollection("my-collection")[0]!.marketEstimate,
    ).toMatchObject({ unitAmountMinor: 250, manual: false });
  });

  it("uses exact card conditions and a configurable profile assumption for unknown conditions", () => {
    const collection = createCollectionService(connection.db);
    const pricing = createPricingService(connection.db);
    const profiles = createProfileService(connection.db);
    const created = collection.createCollectionEntry("my-collection", {
      gameSlug: "pokemon-tcg",
      gameName: "Pokémon TCG",
      setCode: "TST",
      setName: "Test Set",
      name: "Condition Test Pokémon",
      collectorNumber: "002/100",
      cardKind: "Pokémon",
      quantity: 2,
    });

    for (const [index, condition, marketPriceMinor] of [
      [1, "Near Mint", 250],
      [2, "Lightly Played", 180],
      [3, "Moderately Played", 125],
    ] as const) {
      connection.db
        .insert(marketPriceObservations)
        .values({
          printingId: created.printingId,
          ownedCardId: null,
          provider: "tcgplayer-marketplace",
          providerProductId: "7002",
          providerSkuId: `720${index}`,
          providerVariant: "Normal",
          priceCondition: condition,
          currency: "USD",
          marketPriceMinor,
          lowPriceMinor: null,
          midPriceMinor: null,
          highPriceMinor: null,
          directLowPriceMinor: null,
          observationType: "provider",
          observationKey: `condition-test-${index}`,
          sourceUrl: "https://www.tcgplayer.com/product/7002/test",
          sourceUpdatedAt: null,
          firstSeenAt: "2026-08-14T20:00:00.000Z",
          lastSeenAt: "2026-08-14T20:00:00.000Z",
          note: null,
        })
        .run();
    }

    let item = collection.listCollection("my-collection")[0]!;
    expect(item.condition).toBeNull();
    expect(item.marketEstimate).toMatchObject({
      unitAmountMinor: 180,
      priceCondition: "Lightly Played",
      conditionAssumed: true,
    });
    expect(pricing.summarize([item], "Lightly Played")).toMatchObject({
      estimatedValueMinor: 360,
      assumedEntries: 1,
      assumedPhysicalCards: 2,
      defaultPricingCondition: "Lightly Played",
    });

    profiles.updateProfile("my-collection", {
      defaultPricingCondition: "Moderately Played",
    });
    item = collection.listCollection("my-collection")[0]!;
    expect(item.condition).toBeNull();
    expect(item.marketEstimate).toMatchObject({
      unitAmountMinor: 125,
      priceCondition: "Moderately Played",
      conditionAssumed: true,
    });

    collection.updateOwnedCard("my-collection", created.ownedCardId, {
      condition: "Near Mint",
    });
    item = collection.listCollection("my-collection")[0]!;
    expect(item.marketEstimate).toMatchObject({
      unitAmountMinor: 250,
      priceCondition: "Near Mint",
      conditionAssumed: false,
    });
  });

  it("rejects imprecise or malformed manual amounts", () => {
    const created = createCollectionService(
      connection.db,
    ).createCollectionEntry("my-collection", {
      gameSlug: "pokemon-tcg",
      gameName: "Pokémon TCG",
      setCode: "TST",
      setName: "Test Set",
      name: "Test Pokémon",
      collectorNumber: "001/100",
      cardKind: "Pokémon",
      quantity: 1,
    });
    const pricing = createPricingService(connection.db);
    expect(() =>
      pricing.setManualEstimate("my-collection", created.ownedCardId, {
        amount: "1.234",
      }),
    ).toThrow();
    expect(() =>
      pricing.setManualEstimate("my-collection", created.ownedCardId, {
        amount: "-1.00",
      }),
    ).toThrow();
  });
});

import { count } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { marketPriceObservations } from "@/db/schema";
import type { MarketPriceFetch } from "@/lib/pricing/tcgcsv-market-pricing";
import { syncMarketPrices } from "@/lib/pricing/sync-market-prices";
import { createCollectionService } from "@/lib/services/collection-service";
import type { CreateCollectionEntryInput } from "@/lib/types/collection";

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
    printingVariantKey: "standard",
    printingFinish: "non-holo",
    cardKind: "Pokémon",
    rarity: "Common",
    quantity: 2,
    ...overrides,
  };
}

function syncFetch(marketPrice: number): MarketPriceFetch {
  return vi.fn<MarketPriceFetch>(async (input, init) => {
    const response = (value: unknown) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (input === "https://tcgcsv.com/tcgplayer/3/groups") {
      return response({
        success: true,
        errors: [],
        results: [
          {
            categoryId: 3,
            groupId: 9001,
            name: "TST: Test Set",
            abbreviation: "TST",
          },
        ],
      });
    }
    if (input === "https://tcgcsv.com/tcgplayer/3/9001/products") {
      return response({
        success: true,
        errors: [],
        results: [
          {
            productId: 7001,
            name: "Test Pokémon",
            categoryId: 3,
            groupId: 9001,
            url: "https://www.tcgplayer.com/product/7001/test-pokemon",
            extendedData: [
              { name: "Number", value: "001/100" },
              { name: "Rarity", value: "Common" },
            ],
          },
        ],
      });
    }
    if (input === "https://tcgcsv.com/tcgplayer/3/9001/prices") {
      return response({
        success: true,
        errors: [],
        results: [
          {
            productId: 7001,
            subTypeName: "Normal",
            lowPrice: 0.1,
            midPrice: 0.25,
            highPrice: 1.5,
            marketPrice,
            directLowPrice: null,
          },
        ],
      });
    }
    if (
      input === "https://mp-search-api.tcgplayer.com/v2/product/7001/details"
    ) {
      return response({
        productId: 7001,
        skus: [
          {
            sku: 7101,
            language: "English",
            condition: "Near Mint",
            variant: "Normal",
          },
          {
            sku: 7102,
            language: "English",
            condition: "Lightly Played",
            variant: "Normal",
          },
          {
            sku: 7103,
            language: "English",
            condition: "Moderately Played",
            variant: "Normal",
          },
          {
            sku: 7104,
            language: "English",
            condition: "Heavily Played",
            variant: "Normal",
          },
          {
            sku: 7105,
            language: "English",
            condition: "Damaged",
            variant: "Normal",
          },
        ],
      });
    }
    if (
      input ===
      "https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search"
    ) {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        skuIds: [7101, 7102, 7103, 7104, 7105],
      });
      return response([
        { skuId: 7101, marketPrice: 0.4 },
        { skuId: 7102, marketPrice: 0.3 },
        { skuId: 7103, marketPrice: 0.2 },
        { skuId: 7104, marketPrice: 0.1 },
        { skuId: 7105, marketPrice: 0.05 },
      ]);
    }
    throw new Error(`Unexpected test URL: ${input}`);
  });
}

describe("market price sync", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
    createCollectionService(connection.db).createCollectionEntry(
      "my-collection",
      cardInput(),
    );
  });

  afterEach(() => connection.sqlite.close());

  it("supports dry run, idempotence, and append-only price changes", async () => {
    const options = {
      requestDelayMs: 0,
      tcgCsvRequestIntervalMs: 0,
      tcgplayerRequestIntervalMs: 0,
    };
    const dryRun = await syncMarketPrices(connection.db, {
      ...options,
      dryRun: true,
      fetchImpl: syncFetch(0.2),
      now: () => new Date("2026-08-14T20:00:00.000Z"),
    });
    expect(dryRun).toMatchObject({
      priced: 1,
      conditionPriced: 1,
      conditionUnresolved: 0,
      newObservations: 6,
      unchangedObservations: 0,
      dryRun: true,
    });
    expect(
      connection.db
        .select({ count: count() })
        .from(marketPriceObservations)
        .get()?.count,
    ).toBe(0);

    const first = await syncMarketPrices(connection.db, {
      ...options,
      fetchImpl: syncFetch(0.2),
      now: () => new Date("2026-08-14T20:01:00.000Z"),
    });
    expect(first).toMatchObject({
      priced: 1,
      conditionPriced: 1,
      conditionUnresolved: 0,
      newObservations: 6,
      unchangedObservations: 0,
    });

    const second = await syncMarketPrices(connection.db, {
      ...options,
      fetchImpl: syncFetch(0.2),
      now: () => new Date("2026-08-14T20:02:00.000Z"),
    });
    expect(second).toMatchObject({
      priced: 1,
      newObservations: 0,
      unchangedObservations: 6,
    });
    expect(
      connection.db
        .select({ count: count() })
        .from(marketPriceObservations)
        .get()?.count,
    ).toBe(6);
    expect(
      connection.db.select().from(marketPriceObservations).get()?.lastSeenAt,
    ).toBe("2026-08-14T20:02:00.000Z");

    const changed = await syncMarketPrices(connection.db, {
      ...options,
      fetchImpl: syncFetch(0.35),
      now: () => new Date("2026-08-14T20:03:00.000Z"),
    });
    expect(changed.newObservations).toBe(1);
    expect(
      connection.db
        .select({ count: count() })
        .from(marketPriceObservations)
        .get()?.count,
    ).toBe(7);
    expect(
      createCollectionService(connection.db).listCollection("my-collection")[0]
        ?.marketEstimate,
    ).toMatchObject({
      unitAmountMinor: 30,
      basis: "market",
      priceCondition: "Lightly Played",
      conditionAssumed: true,
    });
  });

  it("reports an unmatched printing as unresolved without writing a guess", async () => {
    const service = createCollectionService(connection.db);
    service.createCollectionEntry(
      "my-collection",
      cardInput({
        name: "Missing Pokémon",
        collectorNumber: "002/100",
      }),
    );

    const result = await syncMarketPrices(connection.db, {
      fetchImpl: syncFetch(0.2),
      requestDelayMs: 0,
      tcgCsvRequestIntervalMs: 0,
      tcgplayerRequestIntervalMs: 0,
    });
    expect(result).toMatchObject({
      totalPrintings: 2,
      priced: 1,
      conditionPriced: 1,
      unresolved: 1,
      failed: 0,
    });
    expect(result.issues[0]).toMatchObject({
      name: "Missing Pokémon",
      outcome: "unresolved",
    });
  });
});

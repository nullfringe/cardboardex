import { describe, expect, it, vi } from "vitest";

import {
  createTcgCsvMarketPricingClient,
  isTcgCsvMarketUrl,
  type MarketPriceFetch,
  TcgCsvMarketPricingError,
  type TcgCsvMarketPriceIdentity,
} from "@/lib/pricing/tcgcsv-market-pricing";

const identity: TcgCsvMarketPriceIdentity = {
  gameSlug: "pokemon-tcg",
  languageCode: "en",
  setCode: "TST",
  setName: "Test Set",
  name: "Test Pokémon",
  canonicalName: null,
  collectorNumber: "001/100",
  printingVariantKey: "standard",
  printingFinish: "non-holo",
  rarity: "Common",
};

function jsonResponse(value: unknown, contentType = "application/json") {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

function pricingFetch({
  collectorNumber = "001/100",
  groupName = "TST: Test Set",
  productRows,
  priceRows,
}: {
  collectorNumber?: string;
  groupName?: string;
  productRows?: Array<Record<string, unknown>>;
  priceRows?: Array<Record<string, unknown>>;
} = {}) {
  return vi.fn<MarketPriceFetch>(async (input) => {
    if (input === "https://tcgcsv.com/tcgplayer/3/groups") {
      return jsonResponse({
        success: true,
        errors: [],
        results: [
          {
            categoryId: 3,
            groupId: 9001,
            name: groupName,
            abbreviation: "TST",
          },
        ],
      });
    }
    if (input === "https://tcgcsv.com/tcgplayer/3/9001/products") {
      return jsonResponse({
        success: true,
        errors: [],
        results: productRows ?? [
          {
            productId: 7001,
            name: "Test Pokémon",
            cleanName: "Test Pokemon",
            categoryId: 3,
            groupId: 9001,
            url: "https://www.tcgplayer.com/product/7001/test-pokemon",
            extendedData: [
              { name: "Number", value: collectorNumber },
              { name: "Rarity", value: "Common" },
            ],
          },
        ],
      });
    }
    if (input === "https://tcgcsv.com/tcgplayer/3/9001/prices") {
      return jsonResponse({
        success: true,
        errors: [],
        results: priceRows ?? [
          {
            productId: 7001,
            subTypeName: "Normal",
            lowPrice: 0.1,
            midPrice: 0.25,
            highPrice: 1.5,
            marketPrice: 0.2,
            directLowPrice: null,
          },
        ],
      });
    }
    throw new Error(`Unexpected test URL: ${input}`);
  });
}

describe("TCGCSV market pricing", () => {
  it("resolves an exact product, finish, and USD market observation", async () => {
    const fetchImpl = pricingFetch();
    const client = createTcgCsvMarketPricingClient({
      fetchImpl,
      requestIntervalMs: 0,
    });

    await expect(client.resolvePrice(identity)).resolves.toEqual({
      provider: "tcgcsv-tcgplayer",
      providerProductId: "7001",
      providerVariant: "Normal",
      currency: "USD",
      marketPriceMinor: 20,
      lowPriceMinor: 10,
      midPriceMinor: 25,
      highPriceMinor: 150,
      directLowPriceMinor: null,
      sourceUrl: "https://www.tcgplayer.com/product/7001/test-pokemon",
      sourceUpdatedAt: null,
      pricingVariantAssumed: false,
      productResolution: "catalog-match",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("requires an exact collector number and uses Normal as an annotated unknown-finish fallback", async () => {
    const wrongNumber = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({ collectorNumber: "002/100" }),
      requestIntervalMs: 0,
    });
    await expect(wrongNumber.resolvePrice(identity)).resolves.toBeNull();

    const multipleFinishes = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({
        priceRows: [
          { productId: 7001, subTypeName: "Normal", marketPrice: 0.2 },
          {
            productId: 7001,
            subTypeName: "Reverse Holofoil",
            marketPrice: 0.8,
          },
        ],
      }),
      requestIntervalMs: 0,
    });
    await expect(
      multipleFinishes.resolvePrice({ ...identity, printingFinish: null }),
    ).resolves.toMatchObject({
      providerVariant: "Normal",
      pricingVariantAssumed: true,
    });
    await expect(
      multipleFinishes.resolvePrice({
        ...identity,
        printingFinish: "Reverse Holofoil",
      }),
    ).resolves.toMatchObject({
      providerVariant: "Reverse Holofoil",
      marketPriceMinor: 80,
      pricingVariantAssumed: false,
    });
  });

  it("normalizes harmless product-name formatting while retaining exact collector matching", async () => {
    const client = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({
        productRows: [
          {
            productId: 7001,
            name: "Test-Pokémon!",
            cleanName: "Test Pokemon",
            categoryId: 3,
            groupId: 9001,
            url: "https://www.tcgplayer.com/product/7001/test-pokemon",
            extendedData: [
              { name: "Card Number", value: "1 / 100" },
              { name: "Rarity", value: "Common" },
            ],
          },
        ],
      }),
      requestIntervalMs: 0,
    });
    await expect(client.resolvePrice(identity)).resolves.toMatchObject({
      providerProductId: "7001",
    });
  });

  it("accepts a unique modern set group with only a block-name prefix and zero-padded code difference", async () => {
    const client = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({
        groupName: "ME2: Mega Evolution — Phantasmal Flames",
      }),
      requestIntervalMs: 0,
    });
    await expect(
      client.resolvePrice({
        ...identity,
        setCode: "ME02",
        setName: "Phantasmal Flames",
      }),
    ).resolves.toMatchObject({ providerProductId: "7001" });
  });

  it("does not choose between materially plausible product candidates", async () => {
    const client = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({
        productRows: [7001, 7002].map((productId) => ({
          productId,
          name: "Test Pokémon",
          categoryId: 3,
          groupId: 9001,
          extendedData: [
            { name: "Number", value: "001/100" },
            { name: "Rarity", value: "Common" },
          ],
        })),
      }),
      requestIntervalMs: 0,
    });
    await expect(client.resolvePrice(identity)).resolves.toBeNull();
    await expect(client.resolvePriceDetailed(identity)).resolves.toMatchObject({
      diagnostic: { code: "multiple-product-candidates" },
    });
  });

  it("does not invent a default when unknown finishes have no ordinary subtype", async () => {
    const client = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({
        priceRows: [
          { productId: 7001, subTypeName: "Holofoil", marketPrice: 1.2 },
          {
            productId: 7001,
            subTypeName: "Reverse Holofoil",
            marketPrice: 0.8,
          },
        ],
      }),
      requestIntervalMs: 0,
    });
    await expect(
      client.resolvePriceDetailed({ ...identity, printingFinish: null }),
    ).resolves.toMatchObject({
      price: null,
      diagnostic: { code: "finish-subtype-ambiguous" },
    });
  });

  it("keeps special and vintage printing variants strict", async () => {
    const client = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({
        productRows: [
          {
            productId: 7001,
            name: "Test Pokémon (1st Edition)",
            cleanName: "Test Pokémon",
            categoryId: 3,
            groupId: 9001,
            extendedData: [
              { name: "Number", value: "001/100" },
              { name: "Rarity", value: "Common" },
            ],
          },
        ],
      }),
      requestIntervalMs: 0,
    });
    await expect(client.resolvePriceDetailed(identity)).resolves.toMatchObject({
      price: null,
      diagnostic: { code: "variant-mismatch" },
    });
  });

  it("does not accept a set-code match when the set name conflicts", async () => {
    const client = createTcgCsvMarketPricingClient({
      fetchImpl: pricingFetch({ groupName: "TST: Different Set" }),
      requestIntervalMs: 0,
    });

    await expect(client.resolvePrice(identity)).resolves.toBeNull();
  });

  it("caches group, product, and price responses within one sync client", async () => {
    const fetchImpl = pricingFetch();
    const client = createTcgCsvMarketPricingClient({
      fetchImpl,
      requestIntervalMs: 0,
    });
    await client.resolvePrice(identity);
    await client.resolvePrice(identity);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("constrains provider URLs and rejects non-JSON responses", async () => {
    expect(isTcgCsvMarketUrl("https://tcgcsv.com/tcgplayer/3/groups")).toBe(
      true,
    );
    expect(
      isTcgCsvMarketUrl("https://tcgcsv.com/tcgplayer/3/9001/prices"),
    ).toBe(true);
    expect(
      isTcgCsvMarketUrl("https://tcgcsv.com.evil.test/tcgplayer/3/groups"),
    ).toBe(false);

    const client = createTcgCsvMarketPricingClient({
      fetchImpl: vi.fn<MarketPriceFetch>(async () =>
        jsonResponse({ success: true, results: [] }, "text/html"),
      ),
      requestIntervalMs: 0,
    });
    await expect(client.resolvePrice(identity)).rejects.toThrowError(
      TcgCsvMarketPricingError,
    );
  });
});

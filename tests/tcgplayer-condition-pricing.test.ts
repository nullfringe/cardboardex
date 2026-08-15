import { describe, expect, it, vi } from "vitest";

import type { MarketPriceFetch } from "@/lib/pricing/tcgcsv-market-pricing";
import {
  createTcgplayerConditionPricingClient,
  isTcgplayerConditionPriceUrl,
  TcgplayerConditionPricingError,
} from "@/lib/pricing/tcgplayer-condition-pricing";

function jsonResponse(value: unknown, contentType = "application/json") {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

function conditionFetch() {
  return vi.fn<MarketPriceFetch>(async (input, init) => {
    if (
      input === "https://mp-search-api.tcgplayer.com/v2/product/42402/details"
    ) {
      return jsonResponse({
        productId: 42402,
        skus: [
          {
            sku: 460037,
            language: "English",
            condition: "Near Mint",
            variant: "Normal",
          },
          {
            sku: 447569,
            language: "English",
            condition: "Lightly Played",
            variant: "Normal",
          },
          {
            sku: 999999,
            language: "English",
            condition: "Near Mint",
            variant: "Holofoil",
          },
        ],
      });
    }
    if (
      input ===
      "https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search"
    ) {
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        skuIds: [460037, 447569],
      });
      return jsonResponse([
        {
          skuId: 460037,
          marketPrice: 15.31,
          calculatedAt: "2026-08-14T15:14:23.814Z",
        },
        {
          skuId: 447569,
          marketPrice: 8.29,
          calculatedAt: "2026-08-14T14:07:10.516Z",
        },
      ]);
    }
    throw new Error(`Unexpected test URL: ${input}`);
  });
}

describe("TCGplayer condition pricing", () => {
  it("resolves exact language, printing, and condition SKU prices", async () => {
    const client = createTcgplayerConditionPricingClient({
      fetchImpl: conditionFetch(),
      requestIntervalMs: 0,
    });

    await expect(
      client.resolvePrices({
        languageCode: "en",
        providerProductId: "42402",
        providerVariant: "Normal",
        sourceUrl:
          "https://www.tcgplayer.com/product/42402/pokemon-base-set-pikachu",
      }),
    ).resolves.toEqual([
      {
        provider: "tcgplayer-marketplace",
        providerProductId: "42402",
        providerSkuId: "460037",
        providerVariant: "Normal",
        priceCondition: "Near Mint",
        currency: "USD",
        marketPriceMinor: 1531,
        lowPriceMinor: null,
        midPriceMinor: null,
        highPriceMinor: null,
        directLowPriceMinor: null,
        sourceUrl:
          "https://www.tcgplayer.com/product/42402/pokemon-base-set-pikachu?Language=English&Condition=Near+Mint&Printing=Normal",
        sourceUpdatedAt: "2026-08-14T15:14:23.814Z",
      },
      {
        provider: "tcgplayer-marketplace",
        providerProductId: "42402",
        providerSkuId: "447569",
        providerVariant: "Normal",
        priceCondition: "Lightly Played",
        currency: "USD",
        marketPriceMinor: 829,
        lowPriceMinor: null,
        midPriceMinor: null,
        highPriceMinor: null,
        directLowPriceMinor: null,
        sourceUrl:
          "https://www.tcgplayer.com/product/42402/pokemon-base-set-pikachu?Language=English&Condition=Lightly+Played&Printing=Normal",
        sourceUpdatedAt: "2026-08-14T14:07:10.516Z",
      },
    ]);
  });

  it("constrains marketplace URLs and rejects malformed responses", async () => {
    expect(
      isTcgplayerConditionPriceUrl(
        "https://mp-search-api.tcgplayer.com/v2/product/42402/details",
      ),
    ).toBe(true);
    expect(
      isTcgplayerConditionPriceUrl(
        "https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search",
      ),
    ).toBe(true);
    expect(
      isTcgplayerConditionPriceUrl(
        "https://mp-search-api.tcgplayer.com.evil.test/v2/product/42402/details",
      ),
    ).toBe(false);

    const client = createTcgplayerConditionPricingClient({
      fetchImpl: vi.fn<MarketPriceFetch>(async () =>
        jsonResponse([], "text/html"),
      ),
      requestIntervalMs: 0,
    });
    await expect(
      client.resolvePrices({
        languageCode: "en",
        providerProductId: "42402",
        providerVariant: "Normal",
        sourceUrl: null,
      }),
    ).rejects.toThrowError(TcgplayerConditionPricingError);
  });
});

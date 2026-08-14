import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { MarketPriceFetch } from "@/lib/pricing/tcgcsv-market-pricing";
import {
  isTcgDexMarketCardUrl,
  resolveTcgDexMarketProduct,
  type TcgDexMarketProductIdentity,
} from "@/lib/pricing/tcgdex-market-product";

const abraFixture = fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/tcgdex-base1-43.json"),
  "utf8",
);

const identity: TcgDexMarketProductIdentity = {
  gameSlug: "pokemon-tcg",
  languageCode: "en",
  setCode: "BS",
  setName: "Base Set",
  collectorNumber: "43/102",
  printingVariantKey: "unlimited",
  catalogProvider: null,
  catalogSetProvider: null,
  catalogSetId: null,
  catalogCardId: null,
};

describe("exact TCGdex market product identity", () => {
  it("extracts only the selected printing variant's TCGplayer product", async () => {
    const fetchImpl = vi.fn<MarketPriceFetch>(async (input) => {
      expect(input).toBe("https://api.tcgdex.net/v2/en/cards/base1-43");
      return new Response(abraFixture, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await expect(
      resolveTcgDexMarketProduct(identity, { fetchImpl }),
    ).resolves.toEqual({
      productId: 42386,
      cardId: "base1-43",
      setId: "base1",
      variantId: "base1-normal-unlimited",
    });
    await expect(
      resolveTcgDexMarketProduct(
        { ...identity, printingVariantKey: "first-edition" },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
  });

  it("accepts only constrained language-specific card URLs", () => {
    expect(
      isTcgDexMarketCardUrl("https://api.tcgdex.net/v2/en/cards/base1-43"),
    ).toBe(true);
    expect(
      isTcgDexMarketCardUrl(
        "https://api.tcgdex.net.evil.test/v2/en/cards/base1-43",
      ),
    ).toBe(false);
    expect(
      isTcgDexMarketCardUrl(
        "https://api.tcgdex.net/v2/en/cards/base1-43?variant=first",
      ),
    ).toBe(false);
  });
});

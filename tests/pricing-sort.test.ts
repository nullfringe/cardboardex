import { describe, expect, it } from "vitest";

import { compareMarketPriceEstimates } from "@/lib/pricing/money";
import type { MarketPriceEstimate } from "@/lib/types/pricing";

function estimate(
  unitAmountMinor: number,
  currency = "USD",
): MarketPriceEstimate {
  return {
    observationId: unitAmountMinor + 1,
    printingId: 1,
    ownedCardId: null,
    provider: "fixture",
    providerProductId: "fixture-product",
    providerSkuId: null,
    providerVariant: "Normal",
    priceCondition: null,
    conditionAssumed: false,
    conditionOverridden: false,
    currency,
    unitAmountMinor,
    basis: "market",
    marketPriceMinor: unitAmountMinor,
    lowPriceMinor: null,
    midPriceMinor: null,
    highPriceMinor: null,
    directLowPriceMinor: null,
    sourceUrl: null,
    sourceUpdatedAt: null,
    lastSeenAt: "2026-08-14T20:00:00.000Z",
    manual: false,
    note: null,
  };
}

describe("market price sorting", () => {
  const inexpensive = estimate(125);
  const expensive = estimate(975);

  it("sorts selected per-card estimates in either direction", () => {
    expect(
      compareMarketPriceEstimates(inexpensive, expensive, "asc"),
    ).toBeLessThan(0);
    expect(
      compareMarketPriceEstimates(inexpensive, expensive, "desc"),
    ).toBeGreaterThan(0);
  });

  it("keeps unresolved and non-USD estimates last in both directions", () => {
    const euro = estimate(100, "EUR");
    expect(compareMarketPriceEstimates(null, inexpensive, "asc")).toBe(1);
    expect(compareMarketPriceEstimates(null, inexpensive, "desc")).toBe(1);
    expect(compareMarketPriceEstimates(euro, inexpensive, "asc")).toBe(1);
    expect(compareMarketPriceEstimates(euro, inexpensive, "desc")).toBe(1);
  });

  it("treats a zero-dollar estimate as a resolved price", () => {
    expect(
      compareMarketPriceEstimates(estimate(0), inexpensive, "asc"),
    ).toBeLessThan(0);
  });
});

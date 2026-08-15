import { describe, expect, it } from "vitest";

import {
  abbreviatedMarketCondition,
  DEFAULT_MARKET_CONDITION,
  marketConditionFromText,
} from "@/lib/pricing/conditions";

describe("market conditions", () => {
  it("normalizes common collection condition labels", () => {
    expect(DEFAULT_MARKET_CONDITION).toBe("Lightly Played");
    expect(marketConditionFromText("NM")).toBe("Near Mint");
    expect(marketConditionFromText("lightly-played")).toBe("Lightly Played");
    expect(marketConditionFromText("Moderately Played")).toBe(
      "Moderately Played",
    );
    expect(marketConditionFromText("HP")).toBe("Heavily Played");
    expect(marketConditionFromText("dmg")).toBe("Damaged");
  });

  it("does not guess from unknown or compound condition text", () => {
    expect(marketConditionFromText(null)).toBeNull();
    expect(marketConditionFromText("Unknown")).toBeNull();
    expect(marketConditionFromText("LP to MP")).toBeNull();
  });

  it("uses compact labels in collection cards", () => {
    expect(abbreviatedMarketCondition("Near Mint")).toBe("NM");
    expect(abbreviatedMarketCondition("Lightly Played")).toBe("LP");
    expect(abbreviatedMarketCondition("Damaged")).toBe("DMG");
  });
});

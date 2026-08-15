import { describe, expect, it } from "vitest";

import {
  formatMarketPriceSyncResult,
  parseMarketPriceSyncArguments,
} from "@/lib/pricing/price-sync-command";

describe("prices:sync command", () => {
  it("parses dry-run and help without accepting unknown options", () => {
    expect(parseMarketPriceSyncArguments([])).toEqual({ dryRun: false });
    expect(parseMarketPriceSyncArguments(["--dry-run"])).toEqual({
      dryRun: true,
    });
    expect(parseMarketPriceSyncArguments(["--help"])).toEqual({ help: true });
    expect(() =>
      parseMarketPriceSyncArguments(["--profile", "thomas"]),
    ).toThrow("Unknown prices:sync option");
  });

  it("formats coverage, dry-run safety, and exact-match issues", () => {
    expect(
      formatMarketPriceSyncResult({
        totalPrintings: 3,
        attempted: 3,
        priced: 1,
        conditionPriced: 1,
        conditionUnresolved: 0,
        newObservations: 1,
        unchangedObservations: 0,
        unresolved: 1,
        failed: 1,
        unresolvedByReason: { "finish-subtype-ambiguous": 1 },
        dryRun: true,
        issues: [
          {
            printingId: 2,
            name: "Unknown Card",
            outcome: "unresolved",
            reason: "finish-subtype-ambiguous",
            message: "No exact finish.",
          },
        ],
      }),
    ).toContain(
      "Dry run completed successfully; no price observations were written.",
    );
  });
});

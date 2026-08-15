import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  syncMarketPrices,
  type MarketPriceSyncOptions,
  type MarketPriceSyncResult,
} from "@/lib/pricing/sync-market-prices";

export const MARKET_PRICE_SYNC_HELP = `Usage: npm run prices:sync -- [--dry-run]

Fetch exact TCGplayer market observations through TCGdex and TCGCSV.

Options:
  --dry-run  Resolve and validate prices without writing observations
  --help     Show this help`;

export type MarketPriceSyncCommandOptions = {
  dryRun: boolean;
};

export function parseMarketPriceSyncArguments(
  arguments_: string[],
): MarketPriceSyncCommandOptions | { help: true } {
  let dryRun = false;
  for (const argument of arguments_) {
    switch (argument) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
      case "-h":
        return { help: true };
      default:
        throw new Error(`Unknown prices:sync option: ${argument}`);
    }
  }
  return { dryRun };
}

export function formatMarketPriceSyncResult(
  result: MarketPriceSyncResult,
): string {
  const lines = [
    `${result.dryRun ? "Validated" : "Checked"} ${result.totalPrintings} Pokémon TCG printings for market prices.`,
    `${result.priced} priced: ${result.newObservations} ${result.dryRun ? "new projected" : "new"} observations, ${result.unchangedObservations} unchanged; ${result.unresolved} unresolved; ${result.failed} failed.`,
    `${result.conditionPriced} printings have condition-level prices; ${result.conditionUnresolved} have only a product-level reference.`,
  ];
  if (result.dryRun) {
    lines.push(
      "Dry run completed successfully; no price observations were written.",
    );
  }
  for (const issue of result.issues) {
    lines.push(
      `[${issue.outcome}] ${issue.name} (printing ${issue.printingId}): ${issue.message}`,
    );
  }
  return lines.join("\n");
}

export async function runMarketPriceSyncCommand(
  command: MarketPriceSyncCommandOptions,
  syncOptions: Omit<MarketPriceSyncOptions, "dryRun"> = {},
): Promise<MarketPriceSyncResult> {
  const connection = createDatabaseConnection(resolveDatabasePath());
  try {
    runMigrations(connection.db);
    return await syncMarketPrices(connection.db, {
      ...syncOptions,
      dryRun: command.dryRun,
    });
  } finally {
    connection.sqlite.close();
  }
}

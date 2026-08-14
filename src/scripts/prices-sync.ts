import {
  formatMarketPriceSyncResult,
  MARKET_PRICE_SYNC_HELP,
  parseMarketPriceSyncArguments,
  runMarketPriceSyncCommand,
} from "@/lib/pricing/price-sync-command";

async function main(): Promise<void> {
  const options = parseMarketPriceSyncArguments(process.argv.slice(2));
  if ("help" in options) {
    console.log(MARKET_PRICE_SYNC_HELP);
    return;
  }

  const result = await runMarketPriceSyncCommand(options);
  console.log(formatMarketPriceSyncResult(result));
  if (result.failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

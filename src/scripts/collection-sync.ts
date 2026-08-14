import {
  formatProfileCollectionSyncResult,
  parseProfileCollectionSyncArguments,
  PROFILE_COLLECTION_SYNC_HELP,
  runProfileCollectionSyncCommand,
} from "@/lib/import/profile-sync-command";

async function main(): Promise<void> {
  const options = parseProfileCollectionSyncArguments(process.argv.slice(2));
  if ("help" in options) {
    console.log(PROFILE_COLLECTION_SYNC_HELP);
    return;
  }

  console.log(
    formatProfileCollectionSyncResult(
      await runProfileCollectionSyncCommand(options),
    ),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

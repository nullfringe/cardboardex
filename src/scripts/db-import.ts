import {
  COLLECTION_IMPORT_HELP,
  formatCollectionImportResult,
  parseCollectionImportArguments,
  runCollectionImportCommand,
} from "@/lib/import/import-command";

function main(): void {
  const options = parseCollectionImportArguments(process.argv.slice(2));
  if ("help" in options) {
    console.log(COLLECTION_IMPORT_HELP);
    return;
  }

  console.log(
    formatCollectionImportResult(runCollectionImportCommand(options)),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

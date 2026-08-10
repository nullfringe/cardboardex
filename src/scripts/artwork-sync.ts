import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { syncOfficialPokemonArtwork } from "@/lib/images/sync-official-pokemon-artwork";

async function main(): Promise<void> {
  const databasePath = resolveDatabasePath();
  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    const result = await syncOfficialPokemonArtwork(connection.db);

    console.log(
      [
        `Official artwork sync checked ${result.totalPrintings} Pokémon TCG printings.`,
        `${result.resolved} resolved, ${result.alreadyResolved} already resolved, ${result.unresolved} unresolved, ${result.unsupportedSources} without an official source, ${result.failed} failed.`,
      ].join("\n"),
    );

    for (const issue of result.issues) {
      console.warn(
        `[${issue.outcome}] ${issue.name} (printing ${issue.printingId}): ${issue.message}`,
      );
    }

    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    connection.sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

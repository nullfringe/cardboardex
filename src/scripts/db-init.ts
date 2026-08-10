import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";

function main(): void {
  const databasePath = resolveDatabasePath();
  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    console.log(`Initialized Cardboardex database at ${databasePath}`);
  } finally {
    connection.sqlite.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

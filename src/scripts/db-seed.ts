import fs from "node:fs";
import path from "node:path";

import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { importCollectionCsv } from "@/lib/import";

const seedPath = path.resolve(process.cwd(), "data/seed/collection.csv");
const sourceKey = "data/seed/collection.csv";

function main(): void {
  const databasePath = resolveDatabasePath();
  const csv = fs.readFileSync(seedPath);
  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    const result = importCollectionCsv(connection.db, csv, { sourceKey });

    console.log(
      `Seeded ${result.importedEntries} collection entries (${result.importedQuantity} physical cards) from ${result.sourceKey}.`,
    );
    console.log(
      `Database now contains ${result.collectionEntries} collection entries and ${result.physicalCards} physical cards.`,
    );
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

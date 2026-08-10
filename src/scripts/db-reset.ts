import fs from "node:fs";
import path from "node:path";

import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { importCollectionCsv } from "@/lib/import";
import {
  assertResetConfirmed,
  assertSafeResetTarget,
} from "@/lib/security/reset-safety";

const seedPath = path.resolve(process.cwd(), "data/seed/collection.csv");
const sourceKey = "data/seed/collection.csv";

function removeDatabaseFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  if (!fs.lstatSync(filePath).isFile()) {
    throw new Error(
      `Refusing to remove non-regular database file: ${filePath}`,
    );
  }

  fs.unlinkSync(filePath);
}

function main(): void {
  const databasePath = assertSafeResetTarget(resolveDatabasePath());
  assertResetConfirmed(process.argv.slice(2), databasePath);
  removeDatabaseFile(databasePath);
  removeDatabaseFile(`${databasePath}-shm`);
  removeDatabaseFile(`${databasePath}-wal`);
  removeDatabaseFile(`${databasePath}-journal`);

  const csv = fs.readFileSync(seedPath);
  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    const result = importCollectionCsv(connection.db, csv, { sourceKey });
    console.log(
      `Reset ${databasePath} with ${result.collectionEntries} collection entries and ${result.physicalCards} physical cards.`,
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

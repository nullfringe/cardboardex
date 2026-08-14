import fs from "node:fs";

import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  assertResetConfirmed,
  assertSafeResetTarget,
} from "@/lib/security/reset-safety";

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

  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    console.log(`Reset ${databasePath} with an empty collection catalog.`);
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

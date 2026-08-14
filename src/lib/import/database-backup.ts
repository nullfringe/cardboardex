import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

export type DatabaseBackup = {
  absolutePath: string;
  displayPath: string;
};

function backupFilename(databasePath: string, now: Date): string {
  const databaseName = path
    .basename(databasePath)
    .replace(/\.(?:sqlite3?|db)$/iu, "");
  const timestamp = now.toISOString().replace(/[.:]/gu, "-");
  return `${databaseName}.backup-${timestamp}.sqlite`;
}

export async function createDatabaseBackup(
  sqlite: Database.Database,
  databasePath: string,
  options: { backupDirectory?: string; now?: Date } = {},
): Promise<DatabaseBackup | null> {
  if (databasePath === ":memory:") return null;

  const backupDirectory = path.resolve(
    /* turbopackIgnore: true */
    options.backupDirectory ?? path.join(path.dirname(databasePath), "backups"),
  );
  fs.mkdirSync(backupDirectory, { recursive: true });

  const destination = path.join(
    backupDirectory,
    backupFilename(databasePath, options.now ?? new Date()),
  );
  if (fs.existsSync(destination)) {
    throw new Error(`Database backup already exists: ${destination}`);
  }

  await sqlite.backup(destination);
  return {
    absolutePath: destination,
    displayPath: path.relative(process.cwd(), destination) || destination,
  };
}

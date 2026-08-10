import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export type DatabaseConnection = {
  db: AppDatabase;
  sqlite: Database.Database;
};

const defaultDatabasePath = path.resolve(
  process.cwd(),
  "data/cardboardex.sqlite",
);

export function resolveDatabasePath(): string {
  return process.env.CARDBOARDEX_DB_PATH
    ? path.resolve(process.env.CARDBOARDEX_DB_PATH)
    : defaultDatabasePath;
}

export function createDatabaseConnection(
  databasePath = resolveDatabasePath(),
): DatabaseConnection {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  if (databasePath !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
  };
}

const globalDatabase = globalThis as typeof globalThis & {
  cardboardexDatabase?: DatabaseConnection;
};

export function getDatabaseConnection(): DatabaseConnection {
  if (!globalDatabase.cardboardexDatabase) {
    globalDatabase.cardboardexDatabase = createDatabaseConnection();
  }

  return globalDatabase.cardboardexDatabase;
}

export function getDatabase(): AppDatabase {
  return getDatabaseConnection().db;
}

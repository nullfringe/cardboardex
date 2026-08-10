import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppDatabase } from "./client";

export function runMigrations(db: AppDatabase): void {
  migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "src/db/migrations"),
  });
}

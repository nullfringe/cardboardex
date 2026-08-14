import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const migrationsPath = path.resolve(process.cwd(), "src/db/migrations");

describe("market price observation migration", () => {
  let connection: DatabaseConnection;
  let previousMigrationsPath: string;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    previousMigrationsPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-pricing-migrations-"),
    );
    fs.mkdirSync(path.join(previousMigrationsPath, "meta"));

    for (const migration of [
      "0000_initial_schema.sql",
      "0001_vintage_printing_identity.sql",
      "0002_collection_profiles.sql",
      "0003_international_vintage_identity.sql",
      "0004_printing_cataloging.sql",
      "0005_profile_slug_aliases.sql",
    ]) {
      fs.copyFileSync(
        path.join(migrationsPath, migration),
        path.join(previousMigrationsPath, migration),
      );
    }

    const journal = JSON.parse(
      fs.readFileSync(path.join(migrationsPath, "meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] } & Record<string, unknown>;
    fs.writeFileSync(
      path.join(previousMigrationsPath, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 6) }),
    );
    migrate(connection.db, { migrationsFolder: previousMigrationsPath });
  });

  afterEach(() => {
    connection.sqlite.close();
    fs.rmSync(previousMigrationsPath, { recursive: true, force: true });
  });

  it("preserves an existing owned card and adds constrained price history", () => {
    connection.sqlite
      .prepare("INSERT INTO games (id, slug, name) VALUES (1, ?, ?)")
      .run("pokemon-tcg", "Pokémon TCG");
    connection.sqlite
      .prepare(
        "INSERT INTO card_sets (id, game_id, code, name) VALUES (2, 1, ?, ?)",
      )
      .run("TST", "Test Set");
    connection.sqlite
      .prepare(
        `INSERT INTO card_printings
          (id, set_id, name, collector_number, collector_number_key,
           collector_number_sort, stable_identity_key, printing_variant_key,
           language_code, card_kind)
         VALUES (3, 2, ?, ?, ?, 1, ?, 'standard', 'en', ?)`,
      )
      .run("Test Pokémon", "001/100", "1/100", "test-printing", "Pokémon");
    connection.sqlite
      .prepare(
        `INSERT INTO owned_cards
          (id, profile_id, printing_id, quantity)
         VALUES (4, 1, 3, 2)`,
      )
      .run();

    runMigrations(connection.db);
    runMigrations(connection.db);

    expect(
      connection.sqlite
        .prepare(
          "SELECT id, profile_id, printing_id, quantity FROM owned_cards",
        )
        .get(),
    ).toEqual({ id: 4, profile_id: 1, printing_id: 3, quantity: 2 });

    connection.sqlite
      .prepare(
        `INSERT INTO market_price_observations
          (printing_id, owned_card_id, provider, provider_product_id,
           provider_variant, currency, market_price_minor, observation_type,
           observation_key)
         VALUES (3, NULL, 'tcgcsv-tcgplayer', '7001', 'Normal', 'USD', 125,
           'provider', 'migration-provider-observation')`,
      )
      .run();

    expect(
      connection.sqlite
        .prepare(
          "SELECT printing_id, currency, market_price_minor FROM market_price_observations",
        )
        .get(),
    ).toEqual({ printing_id: 3, currency: "USD", market_price_minor: 125 });
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

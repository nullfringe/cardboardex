import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const migrationsPath = path.resolve(process.cwd(), "src/db/migrations");

describe("condition-aware pricing migration", () => {
  let connection: DatabaseConnection;
  let previousMigrationsPath: string;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    previousMigrationsPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-condition-pricing-migrations-"),
    );
    fs.mkdirSync(path.join(previousMigrationsPath, "meta"));

    for (const migration of [
      "0000_initial_schema.sql",
      "0001_vintage_printing_identity.sql",
      "0002_collection_profiles.sql",
      "0003_international_vintage_identity.sql",
      "0004_printing_cataloging.sql",
      "0005_profile_slug_aliases.sql",
      "0006_market_price_observations.sql",
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
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 7) }),
    );
    migrate(connection.db, { migrationsFolder: previousMigrationsPath });
  });

  afterEach(() => {
    connection.sqlite.close();
    fs.rmSync(previousMigrationsPath, { recursive: true, force: true });
  });

  it("preserves profiles and observations while adding pricing conditions", () => {
    connection.sqlite
      .prepare("UPDATE profiles SET name = ? WHERE id = 1")
      .run("Thomas");
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
          (id, set_id, name, collector_number_sort, stable_identity_key,
           printing_variant_key, language_code, card_kind)
         VALUES (3, 2, 'Test Pokémon', 1, 'test-printing', 'standard', 'en',
           'Pokémon')`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO owned_cards
          (id, profile_id, printing_id, quantity, condition)
         VALUES (4, 1, 3, 1, 'Moderately Played')`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO market_price_observations
          (printing_id, provider, provider_product_id, provider_variant,
           currency, market_price_minor, observation_type, observation_key)
         VALUES (3, 'tcgcsv-tcgplayer', '7001', 'Normal', 'USD', 125,
           'provider', 'existing-product-price')`,
      )
      .run();

    runMigrations(connection.db);
    runMigrations(connection.db);

    expect(
      connection.sqlite
        .prepare(
          "SELECT name, default_pricing_condition FROM profiles WHERE id = 1",
        )
        .get(),
    ).toEqual({
      name: "Thomas",
      default_pricing_condition: "Lightly Played",
    });
    expect(
      connection.sqlite
        .prepare(
          `SELECT provider_product_id, provider_sku_id, price_condition,
                  market_price_minor
             FROM market_price_observations`,
        )
        .get(),
    ).toEqual({
      provider_product_id: "7001",
      provider_sku_id: null,
      price_condition: null,
      market_price_minor: 125,
    });
    expect(
      connection.sqlite
        .prepare(
          `SELECT condition, pricing_condition_override
             FROM owned_cards WHERE id = 4`,
        )
        .get(),
    ).toEqual({
      condition: "Moderately Played",
      pricing_condition_override: null,
    });
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const migrationsPath = path.resolve(process.cwd(), "src/db/migrations");

describe("printing cataloging migration", () => {
  let connection: DatabaseConnection;
  let previousMigrationsPath: string;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    previousMigrationsPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-cataloging-migrations-"),
    );
    fs.mkdirSync(path.join(previousMigrationsPath, "meta"));

    for (const migration of [
      "0000_initial_schema.sql",
      "0001_vintage_printing_identity.sql",
      "0002_collection_profiles.sql",
      "0003_international_vintage_identity.sql",
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
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 4) }),
    );
    migrate(connection.db, { migrationsFolder: previousMigrationsPath });
  });

  afterEach(() => {
    connection.sqlite.close();
    fs.rmSync(previousMigrationsPath, { recursive: true, force: true });
  });

  it("preserves English and Japanese printing identities and all dependent data", () => {
    connection.sqlite
      .prepare("INSERT INTO games (id, slug, name) VALUES (10, ?, ?)")
      .run("pokemon-tcg", "Pokémon TCG");
    connection.sqlite
      .prepare(
        `INSERT INTO card_sets
          (id, game_id, code, name, language_code, catalog_provider, catalog_external_id)
         VALUES (20, 10, 'BS', 'Base Set', 'en', NULL, NULL),
                (21, 10, 'JP-PMCG1', '拡張パック', 'ja', 'tcgdex', 'PMCG1')`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO card_printings
          (id, set_id, name, canonical_name, collector_number,
           collector_number_key, collector_number_sort, stable_identity_key,
           printing_variant_key, language_code, catalog_provider,
           catalog_external_id, card_kind, image_provider, image_external_id,
           image_url, metadata, created_at, updated_at)
         VALUES
          (30, 20, 'Abra', NULL, '43/102', '43/102', 43,
           'published:pokemon-tcg:en:bs:43/102:unlimited', 'unlimited', 'en',
           NULL, NULL, 'Pokémon', 'fixture', 'abra-43',
           'https://images.example.com/abra-43.png', '{}',
           '2025-01-02 03:04:05', '2025-02-03 04:05:06'),
          (31, 21, 'ケーシィ', 'Abra', NULL, NULL, 2147483647,
           'catalog:tcgdex:ja:pmcg1-043:no-rarity', 'no-rarity', 'ja',
           'tcgdex', 'PMCG1-043', 'Pokémon', NULL, NULL, NULL, '{}',
           '2025-06-07 08:09:10', '2025-07-08 09:10:11')`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO pokemon_details
          (printing_id, pokemon_type, hp, weakness, retreat_cost)
         VALUES (30, 'Psychic', 30, 'Psychic ×2', 0),
                (31, 'Psychic', 30, 'Psychic ×2', 0)`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO attacks
          (id, printing_id, position, name, cost, damage)
         VALUES (40, 30, 1, 'Psyshock', '["P"]', '10'),
                (41, 31, 1, 'PsyShock', '["P"]', '10')`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO owned_cards
          (id, profile_id, printing_id, quantity, condition, finish_variant,
           sealed, notes, metadata, created_at, updated_at)
         VALUES
          (50, 1, 30, 3, 'Moderately Played', 'regular non-holo', 0,
           'English lot', '{"deckPool":"binder"}',
           '2025-03-04 05:06:07', '2025-04-05 06:07:08'),
          (51, 1, 31, 1, NULL, 'regular non-holo', 0,
           'Japanese lot', '{}',
           '2025-08-09 10:11:12', '2025-09-10 11:12:13')`,
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO import_records
          (id, profile_id, source_key, external_inventory_id, owned_card_id,
           raw_row, source_hash, imported_at)
         VALUES (60, 1, 'legacy.csv', 'abra-en', 50, '{"Name":"Abra"}',
                 'english-hash', '2025-05-06 07:08:09'),
                (61, 1, 'legacy.csv', 'abra-ja', 51, '{"Name":"ケーシィ"}',
                 'japanese-hash', '2025-10-11 12:13:14')`,
      )
      .run();

    runMigrations(connection.db);

    expect(
      connection.sqlite
        .prepare(
          `SELECT id, stable_identity_key, card_back_design, printing_finish,
                  physical_form, image_provider, image_external_id, image_url,
                  created_at, updated_at
           FROM card_printings ORDER BY id`,
        )
        .all(),
    ).toEqual([
      {
        id: 30,
        stable_identity_key: "published:pokemon-tcg:en:bs:43/102:unlimited",
        card_back_design: null,
        printing_finish: null,
        physical_form: null,
        image_provider: "fixture",
        image_external_id: "abra-43",
        image_url: "https://images.example.com/abra-43.png",
        created_at: "2025-01-02 03:04:05",
        updated_at: "2025-02-03 04:05:06",
      },
      {
        id: 31,
        stable_identity_key: "catalog:tcgdex:ja:pmcg1-043:no-rarity",
        card_back_design: null,
        printing_finish: null,
        physical_form: null,
        image_provider: null,
        image_external_id: null,
        image_url: null,
        created_at: "2025-06-07 08:09:10",
        updated_at: "2025-07-08 09:10:11",
      },
    ]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT id, printing_id, quantity FROM owned_cards ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: 50, printing_id: 30, quantity: 3 },
      { id: 51, printing_id: 31, quantity: 1 },
    ]);
    expect(
      connection.sqlite
        .prepare("SELECT id, owned_card_id FROM import_records ORDER BY id")
        .all(),
    ).toEqual([
      { id: 60, owned_card_id: 50 },
      { id: 61, owned_card_id: 51 },
    ]);
    expect(
      connection.sqlite
        .prepare("SELECT printing_id FROM pokemon_details")
        .all(),
    ).toEqual([{ printing_id: 30 }, { printing_id: 31 }]);
    expect(
      connection.sqlite.prepare("SELECT printing_id FROM attacks").all(),
    ).toEqual([{ printing_id: 30 }, { printing_id: 31 }]);
    expect(
      connection.sqlite.prepare("SELECT * FROM printing_identifiers").all(),
    ).toEqual([]);
    expect(
      connection.sqlite.prepare("SELECT * FROM printing_groups").all(),
    ).toEqual([]);
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

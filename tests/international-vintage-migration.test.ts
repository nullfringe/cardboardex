import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const migrationsPath = path.resolve(process.cwd(), "src/db/migrations");

describe("international vintage identity migration", () => {
  let connection: DatabaseConnection;
  let previousMigrationsPath: string;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    previousMigrationsPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-international-migrations-"),
    );
    fs.mkdirSync(path.join(previousMigrationsPath, "meta"));

    for (const migration of [
      "0000_initial_schema.sql",
      "0001_vintage_printing_identity.sql",
      "0002_collection_profiles.sql",
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
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }),
    );
    migrate(connection.db, { migrationsFolder: previousMigrationsPath });
  });

  afterEach(() => {
    connection.sqlite.close();
    fs.rmSync(previousMigrationsPath, { recursive: true, force: true });
  });

  it("preserves current profiles, ownership, provenance, English identity, and artwork", () => {
    connection.sqlite
      .prepare("INSERT INTO games (id, slug, name) VALUES (1, ?, ?)")
      .run("pokemon-tcg", "Pokémon TCG");
    connection.sqlite
      .prepare(
        "INSERT INTO card_sets (id, game_id, code, name) VALUES (2, 1, ?, ?)",
      )
      .run("BS", "Base Set");
    connection.sqlite
      .prepare(
        `INSERT INTO card_printings
          (id, set_id, name, collector_number, collector_number_key,
           collector_number_sort, printing_variant_key, language_code,
           card_kind, image_provider, image_external_id, image_url,
           external_reference_url, metadata, created_at, updated_at)
         VALUES (3, 2, ?, ?, ?, 43, ?, 'en', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "Abra",
        "43/102",
        "43/102",
        "unlimited",
        "Pokémon",
        "tcgdex-tcgplayer",
        "base1-43/unlimited/tcgplayer-42386",
        "https://tcgplayer-cdn.tcgplayer.com/product/42386_in_1000x1000.jpg",
        "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/series/base1/43/",
        '{"identificationConfidence":"high"}',
        "2025-01-02 03:04:05",
        "2025-02-03 04:05:06",
      );
    connection.sqlite
      .prepare(
        "INSERT INTO pokemon_details (printing_id, pokemon_type, hp, retreat_cost) VALUES (3, 'Psychic', 30, 0)",
      )
      .run();
    connection.sqlite
      .prepare(
        "INSERT INTO attacks (id, printing_id, position, name, cost, damage) VALUES (4, 3, 1, 'Psyshock', '[\"P\"]', '10')",
      )
      .run();
    connection.sqlite
      .prepare(
        `INSERT INTO owned_cards
          (id, profile_id, printing_id, quantity, condition, finish_variant,
           sealed, notes, metadata, created_at, updated_at)
         VALUES (5, 1, 3, 3, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        "Moderately Played",
        "regular non-holo",
        "migration note",
        '{"deckPool":"binder"}',
        "2025-03-04 05:06:07",
        "2025-04-05 06:07:08",
      );
    connection.sqlite
      .prepare(
        `INSERT INTO import_records
          (id, profile_id, source_key, external_inventory_id, owned_card_id,
           raw_row, source_hash, imported_at)
         VALUES (7, 1, ?, ?, 5, ?, ?, ?)`,
      )
      .run(
        "legacy.csv",
        "inventory-42",
        '{"Name":"Abra"}',
        "legacy-hash",
        "2025-05-06 07:08:09",
      );

    runMigrations(connection.db);

    expect(
      connection.sqlite.prepare("SELECT * FROM profiles WHERE id = 1").get(),
    ).toMatchObject({ slug: "my-collection", name: "My Collection" });
    expect(
      connection.sqlite.prepare("SELECT * FROM card_sets WHERE id = 2").get(),
    ).toMatchObject({
      code: "BS",
      name: "Base Set",
      language_code: "en",
      catalog_provider: null,
      catalog_external_id: null,
    });
    expect(
      connection.sqlite
        .prepare("SELECT * FROM card_printings WHERE id = 3")
        .get(),
    ).toMatchObject({
      id: 3,
      name: "Abra",
      canonical_name: null,
      collector_number: "43/102",
      collector_number_key: "43/102",
      stable_identity_key: "published:pokemon-tcg:en:bs:43/102:unlimited",
      printing_variant_key: "unlimited",
      language_code: "en",
      image_provider: "tcgdex-tcgplayer",
      image_external_id: "base1-43/unlimited/tcgplayer-42386",
      image_url:
        "https://tcgplayer-cdn.tcgplayer.com/product/42386_in_1000x1000.jpg",
    });
    expect(
      connection.sqlite.prepare("SELECT * FROM owned_cards WHERE id = 5").get(),
    ).toMatchObject({
      profile_id: 1,
      printing_id: 3,
      quantity: 3,
      condition: "Moderately Played",
      notes: "migration note",
    });
    expect(
      connection.sqlite
        .prepare("SELECT * FROM import_records WHERE id = 7")
        .get(),
    ).toMatchObject({
      profile_id: 1,
      owned_card_id: 5,
      source_key: "legacy.csv",
      source_hash: "legacy-hash",
    });
    expect(
      connection.sqlite.prepare("SELECT * FROM pokemon_details").all(),
    ).toHaveLength(1);
    expect(
      connection.sqlite.prepare("SELECT * FROM attacks").all(),
    ).toHaveLength(1);
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

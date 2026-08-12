import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const migrationsPath = path.resolve(process.cwd(), "src/db/migrations");

describe("collection profile migration", () => {
  let connection: DatabaseConnection;
  let legacyMigrationsPath: string;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    legacyMigrationsPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-legacy-migrations-"),
    );
    fs.mkdirSync(path.join(legacyMigrationsPath, "meta"));

    for (const migration of [
      "0000_initial_schema.sql",
      "0001_vintage_printing_identity.sql",
    ]) {
      fs.copyFileSync(
        path.join(migrationsPath, migration),
        path.join(legacyMigrationsPath, migration),
      );
    }

    const journal = JSON.parse(
      fs.readFileSync(path.join(migrationsPath, "meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] } & Record<string, unknown>;
    fs.writeFileSync(
      path.join(legacyMigrationsPath, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
    );
    migrate(connection.db, { migrationsFolder: legacyMigrationsPath });
  });

  afterEach(() => {
    connection.sqlite.close();
    fs.rmSync(legacyMigrationsPath, { recursive: true, force: true });
  });

  it("preserves legacy ownership and provenance in the default profile", () => {
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
           card_kind, image_provider, image_url, metadata, created_at, updated_at)
         VALUES (3, 2, ?, ?, ?, 43, ?, 'en', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "Abra",
        "43/102",
        "43/102",
        "unlimited",
        "Pokémon",
        "fixture",
        "https://images.example.test/abra.png",
        '{"identificationConfidence":"high"}',
        "2025-01-02 03:04:05",
        "2025-02-03 04:05:06",
      );
    connection.sqlite
      .prepare(
        `INSERT INTO owned_cards
          (id, printing_id, quantity, condition, finish_variant, sealed, notes,
           metadata, created_at, updated_at)
         VALUES (5, 3, 3, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .run(
        "Moderately Played",
        "regular non-holo",
        "legacy note",
        '{"deckPool":"binder"}',
        "2025-03-04 05:06:07",
        "2025-04-05 06:07:08",
      );
    connection.sqlite
      .prepare(
        `INSERT INTO import_records
          (id, source_key, external_inventory_id, owned_card_id, raw_row,
           source_hash, imported_at)
         VALUES (7, ?, ?, 5, ?, ?, ?)`,
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
      connection.sqlite.prepare("SELECT * FROM profiles").all(),
    ).toMatchObject([{ slug: "my-collection", name: "My Collection" }]);
    expect(
      connection.sqlite
        .prepare(
          `SELECT owned_cards.*, profiles.slug AS profile_slug
           FROM owned_cards
           JOIN profiles ON profiles.id = owned_cards.profile_id`,
        )
        .get(),
    ).toMatchObject({
      id: 5,
      printing_id: 3,
      quantity: 3,
      condition: "Moderately Played",
      finish_variant: "regular non-holo",
      sealed: 1,
      notes: "legacy note",
      metadata: '{"deckPool":"binder"}',
      created_at: "2025-03-04 05:06:07",
      updated_at: "2025-04-05 06:07:08",
      profile_slug: "my-collection",
    });
    expect(
      connection.sqlite.prepare("SELECT * FROM import_records").get(),
    ).toMatchObject({
      id: 7,
      profile_id: 1,
      owned_card_id: 5,
      source_key: "legacy.csv",
      external_inventory_id: "inventory-42",
      raw_row: '{"Name":"Abra"}',
      source_hash: "legacy-hash",
      imported_at: "2025-05-06 07:08:09",
    });
    expect(
      connection.sqlite
        .prepare("SELECT count(*) AS count FROM card_printings")
        .get(),
    ).toEqual({ count: 1 });
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { importRecords, ownedCards } from "@/db/schema";
import {
  formatCollectionImportResult,
  parseCollectionImportArguments,
  runCollectionImportCommand,
} from "@/lib/import/import-command";
import { createProfileService } from "@/lib/services/profile-service";

const fixturePath = path.resolve(process.cwd(), "data/seed/collection.csv");

describe("db:import command", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let previousDatabasePath: string | undefined;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-import-test-"),
    );
    databasePath = path.join(temporaryDirectory, "cardboardex.sqlite");
    previousDatabasePath = process.env.CARDBOARDEX_DB_PATH;
    process.env.CARDBOARDEX_DB_PATH = databasePath;

    const connection = createDatabaseConnection(databasePath);
    try {
      runMigrations(connection.db);
      createProfileService(connection.db).createProfile({ name: "Ekah" });
    } finally {
      connection.sqlite.close();
    }
  });

  afterEach(() => {
    if (previousDatabasePath === undefined) {
      delete process.env.CARDBOARDEX_DB_PATH;
    } else {
      process.env.CARDBOARDEX_DB_PATH = previousDatabasePath;
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("parses explicit arguments and provides help without requiring them", () => {
    expect(parseCollectionImportArguments(["--help"])).toEqual({ help: true });
    expect(
      parseCollectionImportArguments([
        "--profile",
        "ekah",
        "--file",
        fixturePath,
        "--source-key",
        "ekah-collection",
        "--dry-run",
      ]),
    ).toEqual({
      profileSlug: "ekah",
      filePath: fixturePath,
      sourceKey: "ekah-collection",
      dryRun: true,
    });
    expect(() => parseCollectionImportArguments([])).toThrow(
      /--profile is required/u,
    );
    expect(() =>
      parseCollectionImportArguments([
        "--profile",
        "ekah",
        "--file",
        fixturePath,
        "--source-key",
        "   ",
      ]),
    ).toThrow(/--source-key is required/u);
  });

  it("rejects nonexistent profiles and invalid file targets clearly", () => {
    expect(() =>
      runCollectionImportCommand({
        profileSlug: "misspelled",
        filePath: fixturePath,
        sourceKey: "ekah-collection",
        dryRun: false,
      }),
    ).toThrow(/profile "misspelled" does not exist/u);
    expect(() =>
      runCollectionImportCommand({
        profileSlug: "ekah",
        filePath: path.join(temporaryDirectory, "missing.csv"),
        sourceKey: "ekah-collection",
        dryRun: false,
      }),
    ).toThrow(/does not exist or cannot be inspected/u);
    expect(() =>
      runCollectionImportCommand({
        profileSlug: "ekah",
        filePath: temporaryDirectory,
        sourceKey: "ekah-collection",
        dryRun: false,
      }),
    ).toThrow(/not a regular file/u);
  });

  it("runs full reconciliation in dry-run mode and then commits the real import", () => {
    const options = {
      profileSlug: "ekah",
      filePath: fixturePath,
      sourceKey: "ekah-collection",
      dryRun: true,
    } as const;

    const dryRun = runCollectionImportCommand(options);
    expect(dryRun).toMatchObject({
      profileName: "Ekah",
      profileSlug: "ekah",
      sourceKey: "ekah-collection",
      importedEntries: 89,
      importedQuantity: 93,
      collectionEntries: 89,
      physicalCards: 93,
      createdEntries: 89,
      matchedEntries: 0,
      missingEntries: 0,
      dryRun: true,
    });
    expect(formatCollectionImportResult(dryRun)).toContain(
      "no changes were committed",
    );

    let connection = createDatabaseConnection(databasePath);
    try {
      expect(
        connection.db
          .select({ count: sql<number>`count(*)` })
          .from(ownedCards)
          .get(),
      ).toEqual({ count: 0 });
      expect(connection.db.select().from(importRecords).all()).toHaveLength(0);
    } finally {
      connection.sqlite.close();
    }

    const imported = runCollectionImportCommand({ ...options, dryRun: false });
    expect(imported).toMatchObject({
      collectionEntries: 89,
      physicalCards: 93,
      dryRun: false,
    });

    connection = createDatabaseConnection(databasePath);
    try {
      expect(connection.db.select().from(ownedCards).all()).toHaveLength(89);
      expect(connection.db.select().from(importRecords).all()).toHaveLength(89);
    } finally {
      connection.sqlite.close();
    }
  });
});

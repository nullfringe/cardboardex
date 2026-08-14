import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { ownedCards } from "@/db/schema";
import {
  formatProfileCollectionSyncResult,
  parseProfileCollectionSyncArguments,
  runProfileCollectionSyncCommand,
} from "@/lib/import/profile-sync-command";
import { PRIMARY_COLLECTION_SOURCE_KEY } from "@/lib/import/profile-collection-sync";
import { createProfileService } from "@/lib/services/profile-service";

const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/japanese-vintage.csv",
);

describe("collection:sync command", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let previousDatabasePath: string | undefined;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "cardboardex-sync-test-"),
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

  it("parses the simple profile-and-file interface", () => {
    expect(parseProfileCollectionSyncArguments(["--help"])).toEqual({
      help: true,
    });
    expect(
      parseProfileCollectionSyncArguments([
        "--profile",
        "ekah",
        "--file",
        fixturePath,
        "--dry-run",
      ]),
    ).toEqual({
      profileSlug: "ekah",
      filePath: fixturePath,
      dryRun: true,
    });
    expect(() => parseProfileCollectionSyncArguments([])).toThrow(
      /--profile is required/u,
    );
  });

  it("previews transactionally, then backs up and imports", async () => {
    const options = {
      profileSlug: "ekah",
      filePath: fixturePath,
      dryRun: true,
    } as const;

    const preview = await runProfileCollectionSyncCommand(options);
    expect(preview).toMatchObject({
      sourceKey: PRIMARY_COLLECTION_SOURCE_KEY,
      importedEntries: 2,
      importedQuantity: 2,
      collectionEntries: 2,
      physicalCards: 2,
      createdEntries: 2,
      matchedEntries: 0,
      missingEntries: 0,
      backupPath: null,
      dryRun: true,
    });
    expect(formatProfileCollectionSyncResult(preview)).toContain(
      "no changes were committed",
    );

    const imported = await runProfileCollectionSyncCommand({
      ...options,
      dryRun: false,
    });
    expect(imported).toMatchObject({
      collectionEntries: 2,
      physicalCards: 2,
      createdEntries: 2,
      matchedEntries: 0,
      dryRun: false,
    });
    expect(imported.backupPath).not.toBeNull();
    expect(
      fs.existsSync(path.resolve(process.cwd(), imported.backupPath!)),
    ).toBe(true);

    const connection = createDatabaseConnection(databasePath);
    try {
      expect(
        connection.db
          .select({ count: sql<number>`count(*)` })
          .from(ownedCards)
          .get(),
      ).toEqual({ count: 2 });
    } finally {
      connection.sqlite.close();
    }
  });
});

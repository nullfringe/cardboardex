import fs from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { importRecords, ownedCards, profiles } from "@/db/schema";
import { importCollectionCsv } from "@/lib/import/import-collection";
import {
  MultipleCollectionSourcesError,
  PRIMARY_COLLECTION_SOURCE_KEY,
  syncProfileCollectionCsv,
} from "@/lib/import/profile-collection-sync";
import { createProfileService } from "@/lib/services/profile-service";

const fixture = fs.readFileSync(
  path.resolve(process.cwd(), "data/seed/collection.csv"),
);
const smallFixture = fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/japanese-vintage.csv"),
);

describe("profile collection CSV sync", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
  });

  afterEach(() => {
    connection.sqlite.close();
  });

  it("adopts a migrated collection's sole source key without duplicating ownership", () => {
    const defaultProfile = connection.db.select().from(profiles).get();
    if (!defaultProfile) throw new Error("Expected the default profile.");
    const profile = createProfileService(connection.db).renameProfile(
      defaultProfile.slug,
      { name: "Thomas" },
    );

    importCollectionCsv(connection.db, fixture, {
      profileId: profile.id,
      sourceKey: "data/seed/collection.csv",
    });
    const ownedIdsBefore = connection.db
      .select({ id: ownedCards.id })
      .from(ownedCards)
      .where(eq(ownedCards.profileId, profile.id))
      .all();

    const preview = syncProfileCollectionCsv(
      connection.db,
      profile.slug,
      fixture,
      { dryRun: true },
    );
    expect(preview).toMatchObject({
      sourceKey: "data/seed/collection.csv",
      reusedExistingSource: true,
      createdEntries: 0,
      matchedEntries: 89,
      missingEntries: 0,
      collectionEntries: 89,
      physicalCards: 93,
    });

    const imported = syncProfileCollectionCsv(
      connection.db,
      profile.slug,
      fixture,
    );
    expect(imported).toMatchObject({
      sourceKey: "data/seed/collection.csv",
      createdEntries: 0,
      matchedEntries: 89,
    });
    expect(
      connection.db
        .select({ id: ownedCards.id })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, profile.id))
        .all(),
    ).toEqual(ownedIdsBefore);
  });

  it("assigns the standard source to a new profile and stays idempotent", () => {
    const profile = createProfileService(connection.db).createProfile({
      name: "Ekah",
    });

    const preview = syncProfileCollectionCsv(
      connection.db,
      profile.slug,
      smallFixture,
      { dryRun: true },
    );
    expect(preview).toMatchObject({
      sourceKey: PRIMARY_COLLECTION_SOURCE_KEY,
      reusedExistingSource: false,
      createdEntries: 2,
      matchedEntries: 0,
      collectionEntries: 2,
      physicalCards: 2,
    });
    expect(
      connection.db
        .select({ count: sql<number>`count(*)` })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, profile.id))
        .get(),
    ).toEqual({ count: 0 });

    syncProfileCollectionCsv(connection.db, profile.slug, smallFixture);
    const repeated = syncProfileCollectionCsv(
      connection.db,
      profile.slug,
      smallFixture,
    );
    expect(repeated).toMatchObject({
      sourceKey: PRIMARY_COLLECTION_SOURCE_KEY,
      reusedExistingSource: true,
      createdEntries: 0,
      matchedEntries: 2,
      collectionEntries: 2,
      physicalCards: 2,
    });
  });

  it("reports source rows missing from a later CSV and preserves them", () => {
    const profile = connection.db.select().from(profiles).get();
    if (!profile) throw new Error("Expected the default profile.");
    syncProfileCollectionCsv(connection.db, profile.slug, fixture);

    const lines = fixture.toString("utf8").trimEnd().split(/\r?\n/u);
    expect(lines).toHaveLength(90);
    const oneRowMissing = lines.slice(0, -1).join("\n");

    const preview = syncProfileCollectionCsv(
      connection.db,
      profile.slug,
      oneRowMissing,
      { dryRun: true },
    );
    expect(preview).toMatchObject({
      importedEntries: 88,
      createdEntries: 0,
      matchedEntries: 88,
      missingEntries: 1,
      collectionEntries: 89,
      physicalCards: 93,
    });

    const imported = syncProfileCollectionCsv(
      connection.db,
      profile.slug,
      oneRowMissing,
    );
    expect(imported.missingEntries).toBe(1);
    expect(
      connection.db
        .select({ count: sql<number>`count(*)` })
        .from(importRecords)
        .where(eq(importRecords.profileId, profile.id))
        .get(),
    ).toEqual({ count: 89 });
  });

  it("refuses to guess when a profile intentionally has multiple sources", () => {
    const profile = createProfileService(connection.db).createProfile({
      name: "Mixed",
    });
    importCollectionCsv(connection.db, smallFixture, {
      profileId: profile.id,
      sourceKey: "binder-a",
    });
    importCollectionCsv(connection.db, smallFixture, {
      profileId: profile.id,
      sourceKey: "binder-b",
    });

    expect(() =>
      syncProfileCollectionCsv(connection.db, profile.slug, smallFixture),
    ).toThrowError(MultipleCollectionSourcesError);
  });
});

import fs from "node:fs";
import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { cardPrintings, importRecords, ownedCards } from "@/db/schema";
import { importCollectionCsv } from "@/lib/import";
import { LastProfileDeletionError } from "@/lib/repositories/profile-repository";
import { createCollectionService } from "@/lib/services/collection-service";
import { createProfileService } from "@/lib/services/profile-service";

const fixture = fs.readFileSync(
  path.resolve(process.cwd(), "data/seed/collection.csv"),
);
const defaultProfileSlug = "my-collection";

function physicalCards(
  connection: DatabaseConnection,
  profileId: number,
): number {
  return (
    connection.db
      .select({ total: sql<number>`coalesce(sum(${ownedCards.quantity}), 0)` })
      .from(ownedCards)
      .where(eq(ownedCards.profileId, profileId))
      .get()?.total ?? 0
  );
}

describe("profile management", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
  });

  afterEach(() => {
    connection.sqlite.close();
  });

  it("duplicates seeded ownership and provenance without duplicating printings", () => {
    const profileService = createProfileService(connection.db);
    const collectionService = createCollectionService(connection.db);
    const source = profileService.requireProfile(defaultProfileSlug);
    importCollectionCsv(connection.db, fixture, { profileId: source.id });
    connection.db
      .update(cardPrintings)
      .set({
        imageProvider: "fixture",
        imageUrl: "https://images.example/abra",
      })
      .where(eq(cardPrintings.id, 69))
      .run();

    const duplicate = profileService.duplicateProfile(defaultProfileSlug, {
      name: "My Collection Copy",
    });
    const sourceCards = collectionService.listCollection(defaultProfileSlug);
    const duplicateCards = collectionService.listCollection(duplicate.slug);

    expect(duplicate.slug).toBe("my-collection-copy");
    expect(sourceCards).toHaveLength(89);
    expect(duplicateCards).toHaveLength(89);
    expect(physicalCards(connection, source.id)).toBe(93);
    expect(physicalCards(connection, duplicate.id)).toBe(93);
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(89);
    expect(connection.db.select().from(ownedCards).all()).toHaveLength(178);
    expect(
      connection.db
        .select()
        .from(importRecords)
        .where(eq(importRecords.profileId, duplicate.id))
        .all(),
    ).toHaveLength(89);

    const sourceAbra = sourceCards.find((card) => card.name === "Abra");
    const duplicateAbra = duplicateCards.find(
      (card) => card.printingId === sourceAbra?.printingId,
    );
    if (!sourceAbra || !duplicateAbra) throw new Error("Expected copied Abra");

    expect(duplicateAbra.ownedCardId).not.toBe(sourceAbra.ownedCardId);
    expect(duplicateAbra.printingId).toBe(sourceAbra.printingId);
    collectionService.updateOwnedCard(
      duplicate.slug,
      duplicateAbra.ownedCardId,
      {
        quantity: 4,
        condition: "Lightly Played",
        notes: "Changed in the duplicate",
      },
    );
    expect(
      collectionService.getCollectionEntry(
        defaultProfileSlug,
        sourceAbra.ownedCardId,
      ),
    ).toMatchObject({
      quantity: 1,
      condition: null,
      notes: expect.stringContaining("tentatively Moderately Played"),
    });
    expect(
      collectionService.getCollectionEntry(
        duplicate.slug,
        duplicateAbra.ownedCardId,
      ),
    ).toMatchObject({
      quantity: 4,
      condition: "Lightly Played",
      notes: "Changed in the duplicate",
    });
    expect(
      connection.db
        .select({ imageUrl: cardPrintings.imageUrl })
        .from(cardPrintings)
        .where(eq(cardPrintings.id, duplicateAbra.printingId))
        .get(),
    ).toEqual({ imageUrl: "https://images.example/abra" });

    const duplicateImport = connection.db
      .select({
        ownedCardId: importRecords.ownedCardId,
        sourceHash: importRecords.sourceHash,
      })
      .from(importRecords)
      .where(
        and(
          eq(importRecords.profileId, duplicate.id),
          eq(importRecords.externalInventoryId, "1"),
        ),
      )
      .get();
    importCollectionCsv(connection.db, fixture, { profileId: source.id });
    expect(
      connection.db
        .select({
          ownedCardId: importRecords.ownedCardId,
          sourceHash: importRecords.sourceHash,
        })
        .from(importRecords)
        .where(
          and(
            eq(importRecords.profileId, duplicate.id),
            eq(importRecords.externalInventoryId, "1"),
          ),
        )
        .get(),
    ).toEqual(duplicateImport);

    expect(
      collectionService.deleteCollectionEntry(
        duplicate.slug,
        duplicateAbra.ownedCardId,
      ),
    ).toBe(true);
    expect(
      collectionService.getCollectionEntry(
        defaultProfileSlug,
        sourceAbra.ownedCardId,
      ),
    ).toMatchObject({ quantity: 1 });
  });

  it("deletes only the selected profile and its profile-scoped records", () => {
    const profileService = createProfileService(connection.db);
    const collectionService = createCollectionService(connection.db);
    const source = profileService.requireProfile(defaultProfileSlug);
    importCollectionCsv(connection.db, fixture, { profileId: source.id });
    connection.db
      .update(cardPrintings)
      .set({
        imageProvider: "fixture",
        imageUrl: "https://images.example/abra",
      })
      .where(eq(cardPrintings.id, 69))
      .run();
    const duplicate = profileService.duplicateProfile(defaultProfileSlug, {
      name: "Ekah",
    });

    const deletion = profileService.deleteProfile(duplicate.slug);

    expect(deletion.deletedProfile).toMatchObject({ slug: duplicate.slug });
    expect(deletion.fallbackProfile).toMatchObject({
      slug: defaultProfileSlug,
    });
    expect(profileService.getProfile(duplicate.slug)).toBeNull();
    expect(
      connection.db
        .select()
        .from(ownedCards)
        .where(eq(ownedCards.profileId, duplicate.id))
        .all(),
    ).toEqual([]);
    expect(
      connection.db
        .select()
        .from(importRecords)
        .where(eq(importRecords.profileId, duplicate.id))
        .all(),
    ).toEqual([]);
    expect(collectionService.listCollection(defaultProfileSlug)).toHaveLength(
      89,
    );
    expect(connection.db.select().from(cardPrintings).all()).toHaveLength(89);
    expect(
      connection.db
        .select({ imageUrl: cardPrintings.imageUrl })
        .from(cardPrintings)
        .where(eq(cardPrintings.id, 69))
        .get(),
    ).toEqual({ imageUrl: "https://images.example/abra" });
  });

  it("duplicates empty profiles and refuses to delete the final profile", () => {
    const profileService = createProfileService(connection.db);
    const collectionService = createCollectionService(connection.db);
    const empty = profileService.createProfile({ name: "Empty Collection" });
    const emptyCopy = profileService.duplicateProfile(empty.slug, {
      name: "Empty Collection Copy",
    });
    const collidingEmptyCopy = profileService.duplicateProfile(empty.slug, {
      name: "Empty Collection Copy",
    });

    expect(collectionService.listCollection(empty.slug)).toEqual([]);
    expect(collectionService.listCollection(emptyCopy.slug)).toEqual([]);
    expect(emptyCopy.slug).toBe("empty-collection-copy");
    expect(collidingEmptyCopy.slug).toBe("empty-collection-copy-2");

    profileService.deleteProfile(emptyCopy.slug);
    profileService.deleteProfile(collidingEmptyCopy.slug);
    profileService.deleteProfile(empty.slug);
    expect(() => profileService.deleteProfile(defaultProfileSlug)).toThrow(
      LastProfileDeletionError,
    );
    expect(profileService.listProfiles()).toMatchObject([
      { slug: defaultProfileSlug },
    ]);
  });
});

import { asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { importRecords, ownedCards, profiles } from "@/db/schema";
import type { DeleteProfileResult, Profile } from "@/lib/types/profile";

export const DEFAULT_PROFILE_SLUG = "my-collection";
export const DEFAULT_PROFILE_NAME = "My Collection";

const profileSelection = {
  id: profiles.id,
  slug: profiles.slug,
  name: profiles.name,
  createdAt: profiles.createdAt,
  updatedAt: profiles.updatedAt,
};

export class ProfileRepository {
  constructor(private readonly db: AppDatabase) {}

  list(): Profile[] {
    return this.db
      .select(profileSelection)
      .from(profiles)
      .orderBy(asc(profiles.id))
      .all();
  }

  getBySlug(slug: string): Profile | null {
    return (
      this.db
        .select(profileSelection)
        .from(profiles)
        .where(eq(profiles.slug, slug))
        .get() ?? null
    );
  }

  ensureDefault(): Profile {
    this.db
      .insert(profiles)
      .values({ slug: DEFAULT_PROFILE_SLUG, name: DEFAULT_PROFILE_NAME })
      .onConflictDoNothing({ target: profiles.slug })
      .run();

    const profile = this.getBySlug(DEFAULT_PROFILE_SLUG);
    if (!profile) {
      throw new Error("Could not create the default collection profile.");
    }
    return profile;
  }

  create(name: string, baseSlug: string): Profile {
    return this.db.transaction((tx) => {
      let suffix = 1;
      let slug = baseSlug;

      while (
        tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.slug, slug))
          .get()
      ) {
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }

      return tx
        .insert(profiles)
        .values({ slug, name })
        .returning(profileSelection)
        .get();
    });
  }

  rename(slug: string, name: string): Profile | null {
    return (
      this.db
        .update(profiles)
        .set({ name, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(profiles.slug, slug))
        .returning(profileSelection)
        .get() ?? null
    );
  }

  duplicate(
    sourceSlug: string,
    name: string,
    baseSlug: string,
  ): Profile | null {
    return this.db.transaction((tx) => {
      const source =
        tx
          .select(profileSelection)
          .from(profiles)
          .where(eq(profiles.slug, sourceSlug))
          .get() ?? null;
      if (!source) return null;

      let suffix = 1;
      let slug = baseSlug;
      while (
        tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.slug, slug))
          .get()
      ) {
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }

      const duplicate = tx
        .insert(profiles)
        .values({ slug, name })
        .returning(profileSelection)
        .get();
      const sourceOwnedCards = tx
        .select({
          id: ownedCards.id,
          printingId: ownedCards.printingId,
          quantity: ownedCards.quantity,
          condition: ownedCards.condition,
          finishVariant: ownedCards.finishVariant,
          sealed: ownedCards.sealed,
          notes: ownedCards.notes,
          metadata: ownedCards.metadata,
        })
        .from(ownedCards)
        .where(eq(ownedCards.profileId, source.id))
        .orderBy(asc(ownedCards.id))
        .all();
      const sourceImports = tx
        .select({
          ownedCardId: importRecords.ownedCardId,
          sourceKey: importRecords.sourceKey,
          externalInventoryId: importRecords.externalInventoryId,
          rawRow: importRecords.rawRow,
          sourceHash: importRecords.sourceHash,
          importedAt: importRecords.importedAt,
        })
        .from(importRecords)
        .where(eq(importRecords.profileId, source.id))
        .all();
      const importsByOwnedCardId = new Map(
        sourceImports.map((record) => [record.ownedCardId, record]),
      );

      for (const sourceOwnedCard of sourceOwnedCards) {
        const ownedCard = tx
          .insert(ownedCards)
          .values({
            profileId: duplicate.id,
            printingId: sourceOwnedCard.printingId,
            quantity: sourceOwnedCard.quantity,
            condition: sourceOwnedCard.condition,
            finishVariant: sourceOwnedCard.finishVariant,
            sealed: sourceOwnedCard.sealed,
            notes: sourceOwnedCard.notes,
            metadata: sourceOwnedCard.metadata,
          })
          .returning({ id: ownedCards.id })
          .get();
        const sourceImport = importsByOwnedCardId.get(sourceOwnedCard.id);

        if (sourceImport) {
          tx.insert(importRecords)
            .values({
              profileId: duplicate.id,
              sourceKey: sourceImport.sourceKey,
              externalInventoryId: sourceImport.externalInventoryId,
              ownedCardId: ownedCard.id,
              rawRow: sourceImport.rawRow,
              sourceHash: sourceImport.sourceHash,
              importedAt: sourceImport.importedAt,
            })
            .run();
        }
      }

      return duplicate;
    });
  }

  delete(slug: string): DeleteProfileResult | null {
    return this.db.transaction((tx) => {
      const profile =
        tx
          .select(profileSelection)
          .from(profiles)
          .where(eq(profiles.slug, slug))
          .get() ?? null;
      if (!profile) return null;

      const profileCount = tx
        .select({ count: sql<number>`count(*)` })
        .from(profiles)
        .get();
      if (!profileCount || profileCount.count <= 1) {
        throw new LastProfileDeletionError();
      }

      tx.delete(ownedCards).where(eq(ownedCards.profileId, profile.id)).run();
      tx.delete(profiles).where(eq(profiles.id, profile.id)).run();

      return {
        deletedProfile: profile,
        remainingProfiles: tx
          .select(profileSelection)
          .from(profiles)
          .orderBy(asc(profiles.id))
          .all(),
      };
    });
  }
}

export class LastProfileDeletionError extends Error {
  constructor() {
    super("The final collection cannot be deleted.");
    this.name = "LastProfileDeletionError";
  }
}

import { asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { profiles } from "@/db/schema";
import type { Profile } from "@/lib/types/profile";

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
}

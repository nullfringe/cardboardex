import { eq } from "drizzle-orm";

import type { AppDatabase } from "./client";
import { profiles } from "./schema";
import { profileSlugFromName } from "@/lib/profiles/slug";
import {
  DEFAULT_PROFILE_NAME,
  DEFAULT_PROFILE_SLUG,
  ProfileRepository,
} from "@/lib/repositories/profile-repository";

/**
 * Profiles created before canonical slugs were supported kept the original
 * `my-collection` slug even after their display name changed. Promote the
 * current name-derived slug once, while retaining the old slug as an alias.
 */
export function normalizeLegacyDefaultProfileSlug(db: AppDatabase): void {
  const legacyProfile = db
    .select({ name: profiles.name })
    .from(profiles)
    .where(eq(profiles.slug, DEFAULT_PROFILE_SLUG))
    .get();

  if (!legacyProfile || legacyProfile.name === DEFAULT_PROFILE_NAME) return;

  const baseSlug = profileSlugFromName(legacyProfile.name);
  if (baseSlug === DEFAULT_PROFILE_SLUG) return;

  new ProfileRepository(db).rename(
    DEFAULT_PROFILE_SLUG,
    legacyProfile.name,
    baseSlug,
  );
}

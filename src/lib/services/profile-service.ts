import { z } from "zod";

import { getDatabase, type AppDatabase } from "@/db/client";
import { ProfileRepository } from "@/lib/repositories/profile-repository";
import type {
  CreateProfileInput,
  Profile,
  UpdateProfileInput,
} from "@/lib/types/profile";

const profileName = z
  .string({ error: "Profile name must be text." })
  .trim()
  .min(1, "Profile name is required.")
  .max(100, "Profile name is too long.");

export const profileSlugSchema = z
  .string({ error: "A profile is required." })
  .trim()
  .min(1, "A profile is required.")
  .max(120, "Profile identifier is too long.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Profile identifier is invalid.");

const createProfileSchema = z.object({ name: profileName }).strict();
const updateProfileSchema = z.object({ name: profileName }).strict();

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super("Profile not found.");
    this.name = "ProfileNotFoundError";
  }
}

export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  listProfiles(): Profile[] {
    return this.repository.list();
  }

  getProfile(slug: string): Profile | null {
    return this.repository.getBySlug(profileSlugSchema.parse(slug));
  }

  requireProfile(slug: string): Profile {
    const profile = this.getProfile(slug);
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }

  ensureDefaultProfile(): Profile {
    return this.repository.ensureDefault();
  }

  createProfile(input: CreateProfileInput): Profile {
    const parsed = createProfileSchema.parse(input);
    const baseSlug = slugify(parsed.name) || "collection";
    return this.repository.create(parsed.name, baseSlug);
  }

  renameProfile(slug: string, input: UpdateProfileInput): Profile {
    const parsedSlug = profileSlugSchema.parse(slug);
    const parsed = updateProfileSchema.parse(input);
    const profile = this.repository.rename(parsedSlug, parsed.name);
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }
}

export function createProfileService(db: AppDatabase): ProfileService {
  return new ProfileService(new ProfileRepository(db));
}

export function getProfileService(): ProfileService {
  return createProfileService(getDatabase());
}

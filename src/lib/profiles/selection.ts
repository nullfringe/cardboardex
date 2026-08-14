import {
  profileSlugSchema,
  type ProfileService,
} from "@/lib/services/profile-service";
import type { Profile } from "@/lib/types/profile";

export type ProfileSearchParameter = string | string[] | undefined;

export function profileParameterValue(
  value: ProfileSearchParameter,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function selectProfile(
  service: ProfileService,
  value: ProfileSearchParameter,
): Profile | null {
  const requestedSlug = profileParameterValue(value)?.trim();
  if (requestedSlug) {
    const parsed = profileSlugSchema.safeParse(requestedSlug);
    return parsed.success ? service.getProfile(parsed.data) : null;
  }

  return service.listProfiles()[0] ?? null;
}

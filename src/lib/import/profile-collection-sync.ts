import { asc, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { importRecords } from "@/db/schema";
import { createProfileService } from "@/lib/services/profile-service";

import {
  importCollectionCsv,
  type ImportCollectionResult,
} from "./import-collection";

export const PRIMARY_COLLECTION_SOURCE_KEY = "primary-collection";

export class MultipleCollectionSourcesError extends Error {
  constructor(
    readonly profileName: string,
    readonly sourceKeys: string[],
  ) {
    super(
      `Collection "${profileName}" has multiple CSV sources (${sourceKeys.join(", ")}). Use the advanced db:import command to select one explicitly.`,
    );
    this.name = "MultipleCollectionSourcesError";
  }
}

export type ProfileCollectionSyncResult = ImportCollectionResult & {
  profileName: string;
  profileSlug: string;
  reusedExistingSource: boolean;
};

export function resolveProfileCollectionSource(
  db: AppDatabase,
  profileId: number,
  profileName: string,
): { sourceKey: string; reusedExistingSource: boolean } {
  const sourceKeys = db
    .selectDistinct({ sourceKey: importRecords.sourceKey })
    .from(importRecords)
    .where(eq(importRecords.profileId, profileId))
    .orderBy(asc(importRecords.sourceKey))
    .all()
    .map((record) => record.sourceKey);

  if (sourceKeys.length > 1) {
    throw new MultipleCollectionSourcesError(profileName, sourceKeys);
  }

  return sourceKeys[0]
    ? { sourceKey: sourceKeys[0], reusedExistingSource: true }
    : {
        sourceKey: PRIMARY_COLLECTION_SOURCE_KEY,
        reusedExistingSource: false,
      };
}

export function syncProfileCollectionCsv(
  db: AppDatabase,
  profileSlug: string,
  input: string | Buffer,
  options: { dryRun?: boolean } = {},
): ProfileCollectionSyncResult {
  const profile = createProfileService(db).requireProfile(profileSlug);
  const source = resolveProfileCollectionSource(db, profile.id, profile.name);
  const result = importCollectionCsv(db, input, {
    profileId: profile.id,
    sourceKey: source.sourceKey,
    dryRun: options.dryRun,
  });

  return {
    ...result,
    profileName: profile.name,
    profileSlug: profile.slug,
    reusedExistingSource: source.reusedExistingSource,
  };
}

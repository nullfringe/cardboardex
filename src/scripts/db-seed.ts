import fs from "node:fs";
import path from "node:path";

import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { importCollectionCsv } from "@/lib/import";
import { DEFAULT_PROFILE_NAME } from "@/lib/repositories/profile-repository";
import { createProfileService } from "@/lib/services/profile-service";

const seedPath = path.resolve(process.cwd(), "data/seed/collection.csv");
const sourceKey = "data/seed/collection.csv";

function main(): void {
  const databasePath = resolveDatabasePath();
  const csv = fs.readFileSync(seedPath);
  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    const profile = createProfileService(connection.db).ensureDefaultProfile();
    if (profile.name !== DEFAULT_PROFILE_NAME) {
      throw new Error(
        `Refusing to load the public development seed into renamed collection "${profile.name}". Use collection:sync for personal collection updates.`,
      );
    }
    const result = importCollectionCsv(connection.db, csv, {
      profileId: profile.id,
      sourceKey,
    });

    console.log(
      `Seeded ${result.importedEntries} collection entries (${result.importedQuantity} physical cards) into ${profile.name} from ${result.sourceKey}.`,
    );
    console.log(
      `Database now contains ${result.collectionEntries} collection entries and ${result.physicalCards} physical cards.`,
    );
  } finally {
    connection.sqlite.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

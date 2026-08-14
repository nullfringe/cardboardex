import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { profileSlugSchema } from "@/lib/services/profile-service";

import { createDatabaseBackup } from "./database-backup";
import {
  syncProfileCollectionCsv,
  type ProfileCollectionSyncResult,
} from "./profile-collection-sync";

export const PROFILE_COLLECTION_SYNC_HELP = `Usage:
  npm run collection:sync -- --profile <profile-slug> --file <csv-path> [--dry-run]

Options:
  --profile <slug>       Existing target collection profile slug (required)
  --file <path>          Complete collection CSV file to import (required)
  --dry-run              Validate and preview without changing the database
  --help                 Show this help
`;

export type ProfileCollectionSyncCommandOptions = {
  profileSlug: string;
  filePath: string;
  dryRun: boolean;
};

export type ProfileCollectionSyncCommandResult = ProfileCollectionSyncResult & {
  filePath: string;
  dryRun: boolean;
  backupPath: string | null;
};

export class ProfileCollectionSyncCliError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ProfileCollectionSyncCliError";
  }
}

function requiredOption(
  value: string | undefined,
  option: "--profile" | "--file",
): string {
  const normalized = value?.trim().normalize("NFC");
  if (!normalized) {
    throw new ProfileCollectionSyncCliError(
      `${option} is required. Run with --help for usage.`,
    );
  }
  return normalized;
}

export function parseProfileCollectionSyncArguments(
  args: string[],
): ProfileCollectionSyncCommandOptions | { help: true } {
  let parsed: {
    values: {
      profile?: string;
      file?: string;
      "dry-run"?: boolean;
      help?: boolean;
    };
  };
  try {
    parsed = parseArgs({
      args,
      allowPositionals: false,
      strict: true,
      options: {
        profile: { type: "string" },
        file: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }) as typeof parsed;
  } catch (error) {
    throw new ProfileCollectionSyncCliError(
      error instanceof Error ? error.message : String(error),
      error,
    );
  }

  if (parsed.values.help) return { help: true };

  const profileSlug = requiredOption(parsed.values.profile, "--profile");
  const parsedProfile = profileSlugSchema.safeParse(profileSlug);
  if (!parsedProfile.success) {
    throw new ProfileCollectionSyncCliError(
      parsedProfile.error.issues[0]?.message ??
        "Profile identifier is invalid.",
    );
  }

  return {
    profileSlug: parsedProfile.data,
    filePath: path.resolve(requiredOption(parsed.values.file, "--file")),
    dryRun: parsed.values["dry-run"] ?? false,
  };
}

function readCollectionFile(filePath: string): Buffer {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    throw new ProfileCollectionSyncCliError(
      `Import file does not exist or cannot be inspected: ${filePath}`,
      error,
    );
  }
  if (!stat.isFile()) {
    throw new ProfileCollectionSyncCliError(
      `Import path is not a regular file: ${filePath}`,
    );
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.readFileSync(filePath);
  } catch (error) {
    throw new ProfileCollectionSyncCliError(
      `Import file is not readable: ${filePath}`,
      error,
    );
  }
}

export async function runProfileCollectionSyncCommand(
  options: ProfileCollectionSyncCommandOptions,
): Promise<ProfileCollectionSyncCommandResult> {
  const csv = readCollectionFile(options.filePath);
  const databasePath = resolveDatabasePath();
  const connection = createDatabaseConnection(databasePath);

  try {
    runMigrations(connection.db);
    const preview = syncProfileCollectionCsv(
      connection.db,
      options.profileSlug,
      csv,
      { dryRun: true },
    );
    if (options.dryRun) {
      return {
        ...preview,
        filePath: options.filePath,
        dryRun: true,
        backupPath: null,
      };
    }

    const backup = await createDatabaseBackup(connection.sqlite, databasePath);
    const imported = syncProfileCollectionCsv(
      connection.db,
      options.profileSlug,
      csv,
    );
    return {
      ...imported,
      filePath: options.filePath,
      dryRun: false,
      backupPath: backup?.displayPath ?? null,
    };
  } finally {
    connection.sqlite.close();
  }
}

export function formatProfileCollectionSyncResult(
  result: ProfileCollectionSyncCommandResult,
): string {
  const action = result.dryRun ? "Validated" : "Imported";
  const totalsLabel = result.dryRun
    ? "Projected profile totals"
    : "Profile totals";
  const lines = [
    `${action} ${result.importedEntries} CSV rows (${result.importedQuantity} physical cards) for ${result.profileName}.`,
    `${result.createdEntries} new rows; ${result.matchedEntries} matched existing rows; ${result.missingEntries} existing source rows absent from the CSV.`,
    `${totalsLabel}: ${result.collectionEntries} collection entries, ${result.physicalCards} physical cards.`,
  ];
  if (result.dryRun) {
    lines.push("Dry run completed successfully; no changes were committed.");
  } else if (result.backupPath) {
    lines.push(`Database backup: ${result.backupPath}`);
  }
  if (result.missingEntries > 0) {
    lines.push("Rows absent from the CSV were preserved, not deleted.");
  }
  return lines.join("\n");
}

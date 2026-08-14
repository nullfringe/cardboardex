import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { createDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import {
  createProfileService,
  profileSlugSchema,
} from "@/lib/services/profile-service";

import {
  importCollectionCsv,
  type ImportCollectionResult,
} from "./import-collection";

const MAX_SOURCE_KEY_LENGTH = 200;

export const COLLECTION_IMPORT_HELP = `Usage:
  npm run db:import -- --profile <profile-slug> --file <csv-path> --source-key <stable-source-key> [--dry-run]

Options:
  --profile <slug>       Existing target collection profile slug (required)
  --file <path>          Collection CSV file to import (required)
  --source-key <key>     Stable provenance key across evolving files (required)
  --dry-run              Run full reconciliation and roll back all changes
  --help                 Show this help
`;

export type CollectionImportCommandOptions = {
  profileSlug: string;
  filePath: string;
  sourceKey: string;
  dryRun: boolean;
};

export type CollectionImportCommandResult = ImportCollectionResult & {
  profileName: string;
  profileSlug: string;
  filePath: string;
  dryRun: boolean;
};

export class CollectionImportCliError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CollectionImportCliError";
  }
}

function requiredOption(
  value: string | undefined,
  option: "--profile" | "--file" | "--source-key",
): string {
  const normalized = value?.trim().normalize("NFC");
  if (!normalized) {
    throw new CollectionImportCliError(
      `${option} is required. Run with --help for usage.`,
    );
  }
  return normalized;
}

export function parseCollectionImportArguments(
  args: string[],
): CollectionImportCommandOptions | { help: true } {
  let parsed: {
    values: {
      profile?: string;
      file?: string;
      "source-key"?: string;
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
        "source-key": { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }) as typeof parsed;
  } catch (error) {
    throw new CollectionImportCliError(
      error instanceof Error ? error.message : String(error),
      error,
    );
  }

  if (parsed.values.help) return { help: true };

  const profileSlug = requiredOption(parsed.values.profile, "--profile");
  const parsedProfile = profileSlugSchema.safeParse(profileSlug);
  if (!parsedProfile.success) {
    throw new CollectionImportCliError(
      parsedProfile.error.issues[0]?.message ??
        "Profile identifier is invalid.",
    );
  }
  const filePath = requiredOption(parsed.values.file, "--file");
  const sourceKey = requiredOption(parsed.values["source-key"], "--source-key");
  if (sourceKey.length > MAX_SOURCE_KEY_LENGTH) {
    throw new CollectionImportCliError(
      `--source-key must be at most ${MAX_SOURCE_KEY_LENGTH} characters.`,
    );
  }

  return {
    profileSlug: parsedProfile.data,
    filePath: path.resolve(filePath),
    sourceKey,
    dryRun: parsed.values["dry-run"] ?? false,
  };
}

function readImportFile(filePath: string): Buffer {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    throw new CollectionImportCliError(
      `Import file does not exist or cannot be inspected: ${filePath}`,
      error,
    );
  }
  if (!stat.isFile()) {
    throw new CollectionImportCliError(
      `Import path is not a regular file: ${filePath}`,
    );
  }

  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.readFileSync(filePath);
  } catch (error) {
    throw new CollectionImportCliError(
      `Import file is not readable: ${filePath}`,
      error,
    );
  }
}

export function runCollectionImportCommand(
  options: CollectionImportCommandOptions,
): CollectionImportCommandResult {
  const csv = readImportFile(options.filePath);
  const connection = createDatabaseConnection(resolveDatabasePath());

  try {
    runMigrations(connection.db);
    const profile = createProfileService(connection.db).getProfile(
      options.profileSlug,
    );
    if (!profile) {
      throw new CollectionImportCliError(
        `Collection profile "${options.profileSlug}" does not exist.`,
      );
    }

    const result = importCollectionCsv(connection.db, csv, {
      profileId: profile.id,
      sourceKey: options.sourceKey,
      dryRun: options.dryRun,
    });
    return {
      ...result,
      profileName: profile.name,
      profileSlug: profile.slug,
      filePath: options.filePath,
      dryRun: options.dryRun,
    };
  } finally {
    connection.sqlite.close();
  }
}

export function formatCollectionImportResult(
  result: CollectionImportCommandResult,
): string {
  const action = result.dryRun ? "Validated" : "Imported";
  const lines = [
    `${action} ${result.importedEntries} CSV rows (${result.importedQuantity} physical cards).`,
    `Target profile: ${result.profileName} (${result.profileSlug})`,
    `Source key: ${result.sourceKey}`,
    `Profile totals: ${result.collectionEntries} collection entries, ${result.physicalCards} physical cards.`,
  ];
  if (result.dryRun) {
    lines.push("Dry run completed successfully; no changes were committed.");
  }
  return lines.join("\n");
}

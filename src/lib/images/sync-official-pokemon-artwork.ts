import { asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { cardPrintings, cardSets, games } from "@/db/schema";

import {
  type ArtworkFetch,
  isOfficialPokemonCardSourceUrl,
  resolveOfficialPokemonArtwork,
} from "./official-pokemon-artwork";

const DEFAULT_REQUEST_DELAY_MS = 150;

export type ArtworkSyncIssue = {
  printingId: number;
  name: string;
  sourceUrl: string | null;
  outcome: "unresolved" | "failed" | "unsupported-source";
  message: string;
};

export type ArtworkSyncResult = {
  totalPrintings: number;
  alreadyResolved: number;
  attempted: number;
  resolved: number;
  unresolved: number;
  unsupportedSources: number;
  failed: number;
  issues: ArtworkSyncIssue[];
};

export type ArtworkSyncOptions = {
  fetchImpl?: ArtworkFetch;
  requestDelayMs?: number;
  timeoutMs?: number;
};

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Official Pokémon artwork resolution failed.";
}

export async function syncOfficialPokemonArtwork(
  db: AppDatabase,
  options: ArtworkSyncOptions = {},
): Promise<ArtworkSyncResult> {
  const printings = db
    .select({
      printingId: cardPrintings.id,
      name: cardPrintings.name,
      imageUrl: cardPrintings.imageUrl,
      sourceUrl: cardPrintings.externalReferenceUrl,
    })
    .from(cardPrintings)
    .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
    .innerJoin(games, eq(cardSets.gameId, games.id))
    .where(eq(games.slug, "pokemon-tcg"))
    .orderBy(asc(cardPrintings.id))
    .all();

  const result: ArtworkSyncResult = {
    totalPrintings: printings.length,
    alreadyResolved: 0,
    attempted: 0,
    resolved: 0,
    unresolved: 0,
    unsupportedSources: 0,
    failed: 0,
    issues: [],
  };
  let hasAttemptedRequest = false;

  for (const printing of printings) {
    if (printing.imageUrl) {
      result.alreadyResolved += 1;
      continue;
    }

    if (
      !printing.sourceUrl ||
      !isOfficialPokemonCardSourceUrl(printing.sourceUrl)
    ) {
      result.unsupportedSources += 1;
      result.issues.push({
        printingId: printing.printingId,
        name: printing.name,
        sourceUrl: printing.sourceUrl,
        outcome: "unsupported-source",
        message: "No trusted official Pokémon card-database source is stored.",
      });
      continue;
    }

    if (hasAttemptedRequest) {
      await wait(options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS);
    }
    hasAttemptedRequest = true;
    result.attempted += 1;

    try {
      const artwork = await resolveOfficialPokemonArtwork(printing.sourceUrl, {
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      });
      if (!artwork) {
        result.unresolved += 1;
        result.issues.push({
          printingId: printing.printingId,
          name: printing.name,
          sourceUrl: printing.sourceUrl,
          outcome: "unresolved",
          message: "The official page did not expose matching card artwork.",
        });
        continue;
      }

      db.update(cardPrintings)
        .set({
          imageProvider: artwork.provider,
          imageExternalId: artwork.externalId,
          imageUrl: artwork.url,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(cardPrintings.id, printing.printingId))
        .run();
      result.resolved += 1;
    } catch (error) {
      result.failed += 1;
      result.issues.push({
        printingId: printing.printingId,
        name: printing.name,
        sourceUrl: printing.sourceUrl,
        outcome: "failed",
        message: errorMessage(error),
      });
    }
  }

  return result;
}

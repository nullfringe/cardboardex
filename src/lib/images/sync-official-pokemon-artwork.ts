import { asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { cardPrintings, cardSets, games, pokemonDetails } from "@/db/schema";

import {
  type ArtworkFetch,
  isOfficialPokemonCardSourceUrl,
  resolveOfficialPokemonArtwork,
} from "./official-pokemon-artwork";
import { storedMetadataImageProvider } from "./card-image-provider";
import {
  resolveTcgDexPokemonArtwork,
  type TcgDexPokemonArtwork,
} from "./tcgdex-pokemon-artwork";
import {
  resolveVintagePokemonArtwork,
  type VintagePokemonArtwork,
} from "./vintage-pokemon-artwork";

const DEFAULT_REQUEST_DELAY_MS = 150;

export type ArtworkSyncIssue = {
  printingId: number;
  name: string;
  sourceUrl: string | null;
  outcome: "unresolved" | "failed";
  message: string;
};

export type ArtworkSyncResult = {
  totalPrintings: number;
  alreadyResolved: number;
  attempted: number;
  resolved: number;
  unresolved: number;
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
    : "Pokémon artwork resolution failed.";
}

export async function syncPokemonArtwork(
  db: AppDatabase,
  options: ArtworkSyncOptions = {},
): Promise<ArtworkSyncResult> {
  const printings = db
    .select({
      printingId: cardPrintings.id,
      name: cardPrintings.name,
      canonicalName: cardPrintings.canonicalName,
      gameSlug: games.slug,
      setCode: cardSets.code,
      setName: cardSets.name,
      collectorNumber: cardPrintings.collectorNumber,
      printingVariantKey: cardPrintings.printingVariantKey,
      languageCode: cardPrintings.languageCode,
      rarity: cardPrintings.rarity,
      stage: cardPrintings.subtype,
      cardType: cardPrintings.cardKind,
      hp: pokemonDetails.hp,
      catalogProvider: cardPrintings.catalogProvider,
      catalogCardId: cardPrintings.catalogExternalId,
      catalogSetProvider: cardSets.catalogProvider,
      catalogSetId: cardSets.catalogExternalId,
      imageProvider: cardPrintings.imageProvider,
      imageExternalId: cardPrintings.imageExternalId,
      imageUrl: cardPrintings.imageUrl,
      sourceUrl: cardPrintings.externalReferenceUrl,
    })
    .from(cardPrintings)
    .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
    .innerJoin(games, eq(cardSets.gameId, games.id))
    .leftJoin(pokemonDetails, eq(cardPrintings.id, pokemonDetails.printingId))
    .where(eq(games.slug, "pokemon-tcg"))
    .orderBy(asc(cardPrintings.id))
    .all();

  const result: ArtworkSyncResult = {
    totalPrintings: printings.length,
    alreadyResolved: 0,
    attempted: 0,
    resolved: 0,
    unresolved: 0,
    failed: 0,
    issues: [],
  };
  let hasAttemptedRequest = false;

  for (const printing of printings) {
    if (
      storedMetadataImageProvider.resolve({
        gameSlug: printing.gameSlug,
        setCode: printing.setCode,
        collectorNumber: printing.collectorNumber,
        imageProvider: printing.imageProvider,
        imageExternalId: printing.imageExternalId,
        imageUrl: printing.imageUrl,
      })
    ) {
      result.alreadyResolved += 1;
      continue;
    }

    if (hasAttemptedRequest) {
      await wait(options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS);
    }
    hasAttemptedRequest = true;
    result.attempted += 1;

    let artwork:
      | VintagePokemonArtwork
      | TcgDexPokemonArtwork
      | Awaited<ReturnType<typeof resolveOfficialPokemonArtwork>> = null;
    const providerErrors: unknown[] = [];

    try {
      if (
        printing.sourceUrl &&
        isOfficialPokemonCardSourceUrl(printing.sourceUrl)
      ) {
        try {
          artwork = await resolveOfficialPokemonArtwork(printing.sourceUrl, {
            fetchImpl: options.fetchImpl,
            timeoutMs: options.timeoutMs,
          });
        } catch (error) {
          providerErrors.push(error);
        }
      }

      if (!artwork) {
        try {
          artwork = await resolveTcgDexPokemonArtwork(
            {
              gameSlug: printing.gameSlug,
              languageCode: printing.languageCode,
              printingVariantKey: printing.printingVariantKey,
              catalogProvider: printing.catalogProvider,
              catalogSetId:
                printing.catalogProvider === printing.catalogSetProvider
                  ? printing.catalogSetId
                  : null,
              catalogCardId: printing.catalogCardId,
              canonicalName: printing.canonicalName,
              rarity: printing.rarity,
              hp: printing.hp,
              stage: printing.stage,
              cardType: printing.cardType,
            },
            {
              fetchImpl: options.fetchImpl,
              timeoutMs: options.timeoutMs,
            },
          );
        } catch (error) {
          providerErrors.push(error);
        }
      }

      if (!artwork) {
        try {
          artwork = await resolveVintagePokemonArtwork(
            {
              gameSlug: printing.gameSlug,
              setCode: printing.setCode,
              setName: printing.setName,
              collectorNumber: printing.collectorNumber,
              printingVariantKey: printing.printingVariantKey,
              languageCode: printing.languageCode,
            },
            {
              fetchImpl: options.fetchImpl,
              timeoutMs: options.timeoutMs,
            },
          );
        } catch (error) {
          providerErrors.push(error);
        }
      }

      if (!artwork) {
        if (providerErrors.length > 0) {
          throw providerErrors[0];
        }

        result.unresolved += 1;
        result.issues.push({
          printingId: printing.printingId,
          name: printing.name,
          sourceUrl: printing.sourceUrl,
          outcome: "unresolved",
          message:
            "No provider exposed artwork for the exact set, number, language, and printing variant.",
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

/** @deprecated Prefer syncPokemonArtwork; retained for callers of the original API. */
export const syncOfficialPokemonArtwork = syncPokemonArtwork;

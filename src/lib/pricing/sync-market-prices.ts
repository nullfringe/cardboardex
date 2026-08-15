import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import {
  cardPrintings,
  cardSets,
  games,
  marketProviderProducts,
  marketPriceObservations,
} from "@/db/schema";
import {
  createTcgCsvMarketPricingClient,
  type MarketPriceFetch,
  type TcgCsvMarketPriceDiagnosticCode,
  TCGCSV_TCGPLAYER_PRICE_PROVIDER,
} from "@/lib/pricing/tcgcsv-market-pricing";
import { resolveTcgDexMarketProduct } from "@/lib/pricing/tcgdex-market-product";
import { createTcgplayerConditionPricingClient } from "@/lib/pricing/tcgplayer-condition-pricing";
import type { ProviderPriceObservation } from "@/lib/types/pricing";

const DEFAULT_PRINTING_DELAY_MS = 150;

export type MarketPriceSyncIssue = {
  printingId: number;
  name: string;
  outcome: "unresolved" | "failed";
  reason: TcgCsvMarketPriceDiagnosticCode | "upstream-provider-error";
  message: string;
};

export type MarketPriceSyncResult = {
  totalPrintings: number;
  attempted: number;
  priced: number;
  conditionPriced: number;
  conditionUnresolved: number;
  newObservations: number;
  unchangedObservations: number;
  unresolved: number;
  failed: number;
  unresolvedByReason: Partial<Record<TcgCsvMarketPriceDiagnosticCode, number>>;
  dryRun: boolean;
  issues: MarketPriceSyncIssue[];
};

export type MarketPriceSyncOptions = {
  dryRun?: boolean;
  fetchImpl?: MarketPriceFetch;
  timeoutMs?: number;
  requestDelayMs?: number;
  tcgCsvRequestIntervalMs?: number;
  tcgplayerRequestIntervalMs?: number;
  now?: () => Date;
};

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Market-price resolution failed.";
}

function sameObservation(
  existing: typeof marketPriceObservations.$inferSelect,
  candidate: ProviderPriceObservation,
): boolean {
  return (
    existing.provider === candidate.provider &&
    existing.providerProductId === candidate.providerProductId &&
    existing.providerSkuId === candidate.providerSkuId &&
    existing.providerVariant === candidate.providerVariant &&
    existing.pricingVariantAssumed === candidate.pricingVariantAssumed &&
    existing.priceCondition === candidate.priceCondition &&
    existing.currency === candidate.currency &&
    existing.marketPriceMinor === candidate.marketPriceMinor &&
    existing.lowPriceMinor === candidate.lowPriceMinor &&
    existing.midPriceMinor === candidate.midPriceMinor &&
    existing.highPriceMinor === candidate.highPriceMinor &&
    existing.directLowPriceMinor === candidate.directLowPriceMinor
  );
}

function identityFingerprint(printing: {
  gameSlug: string;
  languageCode: string;
  setCode: string;
  setName: string;
  catalogSetId: string | null;
  name: string;
  canonicalName: string | null;
  collectorNumber: string | null;
  printingVariantKey: string;
  printingFinish: string | null;
  rarity: string | null;
  catalogProvider: string | null;
  catalogCardId: string | null;
}): string {
  return createHash("sha256").update(JSON.stringify(printing)).digest("hex");
}

function addUnresolved(
  result: MarketPriceSyncResult,
  printing: { printingId: number; name: string },
  reason: TcgCsvMarketPriceDiagnosticCode,
  message: string,
): void {
  result.unresolved += 1;
  result.unresolvedByReason[reason] =
    (result.unresolvedByReason[reason] ?? 0) + 1;
  result.issues.push({
    printingId: printing.printingId,
    name: printing.name,
    outcome: "unresolved",
    reason,
    message,
  });
}

function latestProviderObservation(
  db: AppDatabase,
  candidate: ProviderPriceObservation,
) {
  return db
    .select()
    .from(marketPriceObservations)
    .where(
      and(
        eq(marketPriceObservations.printingId, candidate.printingId),
        eq(marketPriceObservations.provider, candidate.provider),
        isNull(marketPriceObservations.ownedCardId),
        eq(marketPriceObservations.observationType, "provider"),
        candidate.priceCondition === null
          ? isNull(marketPriceObservations.priceCondition)
          : eq(
              marketPriceObservations.priceCondition,
              candidate.priceCondition,
            ),
      ),
    )
    .orderBy(desc(marketPriceObservations.id))
    .limit(1)
    .get();
}

function observationKey(
  candidate: ProviderPriceObservation,
  observedAt: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...candidate,
        observedAt,
        nonce: randomUUID(),
      }),
    )
    .digest("hex");
}

function persistObservation(
  db: AppDatabase,
  candidate: ProviderPriceObservation,
  observedAt: string,
  dryRun: boolean,
): "new" | "unchanged" {
  const existing = latestProviderObservation(db, candidate);
  if (existing && sameObservation(existing, candidate)) {
    if (!dryRun) {
      db.update(marketPriceObservations)
        .set({
          lastSeenAt: observedAt,
          sourceUpdatedAt:
            candidate.sourceUpdatedAt ?? existing.sourceUpdatedAt,
          sourceUrl: candidate.sourceUrl ?? existing.sourceUrl,
        })
        .where(eq(marketPriceObservations.id, existing.id))
        .run();
    }
    return "unchanged";
  }

  if (!dryRun) {
    db.insert(marketPriceObservations)
      .values({
        ...candidate,
        ownedCardId: null,
        observationType: "provider",
        observationKey: observationKey(candidate, observedAt),
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        note: null,
      })
      .run();
  }
  return "new";
}

function persistProviderProduct(
  db: AppDatabase,
  input: {
    printingId: number;
    providerProductId: string;
    resolutionMethod: "tcgdex-exact" | "cached" | "catalog-match";
    identityFingerprint: string;
    sourceUrl: string | null;
    observedAt: string;
  },
  dryRun: boolean,
): void {
  if (dryRun) return;
  db.insert(marketProviderProducts)
    .values({
      printingId: input.printingId,
      provider: TCGCSV_TCGPLAYER_PRICE_PROVIDER,
      providerProductId: input.providerProductId,
      resolutionMethod: input.resolutionMethod,
      identityFingerprint: input.identityFingerprint,
      sourceUrl: input.sourceUrl,
      resolvedAt: input.observedAt,
      updatedAt: input.observedAt,
    })
    .onConflictDoUpdate({
      target: [
        marketProviderProducts.printingId,
        marketProviderProducts.provider,
      ],
      set: {
        providerProductId: input.providerProductId,
        resolutionMethod: input.resolutionMethod,
        identityFingerprint: input.identityFingerprint,
        sourceUrl: input.sourceUrl,
        resolvedAt: input.observedAt,
        updatedAt: input.observedAt,
      },
    })
    .run();
}

export async function syncMarketPrices(
  db: AppDatabase,
  options: MarketPriceSyncOptions = {},
): Promise<MarketPriceSyncResult> {
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
      printingFinish: cardPrintings.printingFinish,
      languageCode: cardPrintings.languageCode,
      rarity: cardPrintings.rarity,
      catalogProvider: cardPrintings.catalogProvider,
      catalogCardId: cardPrintings.catalogExternalId,
      catalogSetProvider: cardSets.catalogProvider,
      catalogSetId: cardSets.catalogExternalId,
    })
    .from(cardPrintings)
    .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
    .innerJoin(games, eq(cardSets.gameId, games.id))
    .where(eq(games.slug, "pokemon-tcg"))
    .orderBy(asc(cardPrintings.id))
    .all();

  const result: MarketPriceSyncResult = {
    totalPrintings: printings.length,
    attempted: 0,
    priced: 0,
    conditionPriced: 0,
    conditionUnresolved: 0,
    newObservations: 0,
    unchangedObservations: 0,
    unresolved: 0,
    failed: 0,
    unresolvedByReason: {},
    dryRun: options.dryRun ?? false,
    issues: [],
  };
  const pricingClient = createTcgCsvMarketPricingClient({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    requestIntervalMs: options.tcgCsvRequestIntervalMs,
  });
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const conditionPricingClient = createTcgplayerConditionPricingClient({
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    requestIntervalMs: options.tcgplayerRequestIntervalMs,
  });
  let attemptedPrinting = false;

  for (const printing of printings) {
    if (attemptedPrinting) {
      await wait(options.requestDelayMs ?? DEFAULT_PRINTING_DELAY_MS);
    }
    attemptedPrinting = true;
    result.attempted += 1;

    const fingerprint = identityFingerprint(printing);
    const cachedProduct = db
      .select()
      .from(marketProviderProducts)
      .where(
        and(
          eq(marketProviderProducts.printingId, printing.printingId),
          eq(marketProviderProducts.provider, TCGCSV_TCGPLAYER_PRICE_PROVIDER),
          eq(marketProviderProducts.identityFingerprint, fingerprint),
        ),
      )
      .get();
    let tcgDexError: unknown;
    let exactTcgplayerProductId: number | null = null;
    let exactProductResolution: "tcgdex-exact" | "cached" | null = null;
    if (cachedProduct) {
      const parsed = Number(cachedProduct.providerProductId);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        exactTcgplayerProductId = parsed;
        exactProductResolution = "cached";
      }
    } else {
      try {
        exactTcgplayerProductId =
          (
            await resolveTcgDexMarketProduct(
              {
                gameSlug: printing.gameSlug,
                languageCode: printing.languageCode,
                setCode: printing.setCode,
                setName: printing.setName,
                collectorNumber: printing.collectorNumber,
                printingVariantKey: printing.printingVariantKey,
                catalogProvider: printing.catalogProvider,
                catalogSetProvider: printing.catalogSetProvider,
                catalogSetId: printing.catalogSetId,
                catalogCardId: printing.catalogCardId,
              },
              {
                fetchImpl: options.fetchImpl,
                timeoutMs: options.timeoutMs,
              },
            )
          )?.productId ?? null;
        exactProductResolution = exactTcgplayerProductId
          ? "tcgdex-exact"
          : null;
      } catch (error) {
        tcgDexError = error;
      }
    }

    try {
      const marketIdentity = {
        gameSlug: printing.gameSlug,
        languageCode: printing.languageCode,
        setCode: printing.setCode,
        setName: printing.setName,
        catalogSetId: printing.catalogSetId,
        name: printing.name,
        canonicalName: printing.canonicalName,
        collectorNumber: printing.collectorNumber,
        printingVariantKey: printing.printingVariantKey,
        printingFinish: printing.printingFinish,
        rarity: printing.rarity,
        exactTcgplayerProductId,
        exactTcgplayerProductResolution: exactProductResolution,
      };
      let resolution = await pricingClient.resolvePriceDetailed(marketIdentity);
      // A cached provider ID is a performance hint, not permanent truth. If
      // TCGCSV no longer exposes it, retry the strict catalog match so a
      // corrected upstream association can replace this mapping.
      if (cachedProduct && !resolution.price) {
        resolution = await pricingClient.resolvePriceDetailed({
          ...marketIdentity,
          exactTcgplayerProductId: null,
          exactTcgplayerProductResolution: null,
        });
      }
      const price = resolution.price;
      if (!price) {
        if (tcgDexError) throw tcgDexError;
        const diagnostic = resolution.diagnostic;
        addUnresolved(
          result,
          printing,
          diagnostic?.code ?? "no-usable-price-rows",
          diagnostic?.message ??
            "No provider exposed a usable price for the resolved printing.",
        );
        continue;
      }

      persistProviderProduct(
        db,
        {
          printingId: printing.printingId,
          providerProductId: price.providerProductId,
          resolutionMethod: price.productResolution,
          identityFingerprint: fingerprint,
          sourceUrl: price.sourceUrl,
          observedAt,
        },
        result.dryRun,
      );

      const status = persistObservation(
        db,
        {
          printingId: printing.printingId,
          ...price,
          providerSkuId: null,
          priceCondition: null,
        },
        observedAt,
        result.dryRun,
      );
      result.priced += 1;
      if (status === "new") result.newObservations += 1;
      else result.unchangedObservations += 1;

      const conditionPrices = await conditionPricingClient.resolvePrices({
        languageCode: printing.languageCode,
        providerProductId: price.providerProductId,
        providerVariant: price.providerVariant,
        sourceUrl: price.sourceUrl,
      });
      if (conditionPrices.length === 0) {
        result.conditionUnresolved += 1;
      } else {
        result.conditionPriced += 1;
        for (const conditionPrice of conditionPrices) {
          const conditionStatus = persistObservation(
            db,
            {
              printingId: printing.printingId,
              ...conditionPrice,
              pricingVariantAssumed: price.pricingVariantAssumed,
            },
            observedAt,
            result.dryRun,
          );
          if (conditionStatus === "new") result.newObservations += 1;
          else result.unchangedObservations += 1;
        }
      }
    } catch (error) {
      result.failed += 1;
      result.issues.push({
        printingId: printing.printingId,
        name: printing.name,
        outcome: "failed",
        reason: "upstream-provider-error",
        message: errorMessage(error),
      });
    }
  }

  return result;
}

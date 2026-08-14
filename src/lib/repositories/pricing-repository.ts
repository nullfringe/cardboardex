import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { marketPriceObservations, ownedCards } from "@/db/schema";
import { selectEstimateAmount } from "@/lib/pricing/money";
import type { MarketPriceEstimate } from "@/lib/types/pricing";

type PriceObservation = typeof marketPriceObservations.$inferSelect;
type EstimableCollectionItem = {
  ownedCardId: number;
  printingId: number;
  sealed: boolean;
  marketEstimate: MarketPriceEstimate | null;
};

function estimateFromObservation(
  observation: PriceObservation,
): MarketPriceEstimate | null {
  const selected = selectEstimateAmount(observation);
  if (!selected) return null;
  return {
    observationId: observation.id,
    printingId: observation.printingId,
    ownedCardId: observation.ownedCardId,
    provider: observation.provider,
    providerProductId: observation.providerProductId,
    providerVariant: observation.providerVariant,
    currency: observation.currency,
    unitAmountMinor: selected.amount,
    basis: selected.basis,
    marketPriceMinor: observation.marketPriceMinor,
    lowPriceMinor: observation.lowPriceMinor,
    midPriceMinor: observation.midPriceMinor,
    highPriceMinor: observation.highPriceMinor,
    directLowPriceMinor: observation.directLowPriceMinor,
    sourceUrl: observation.sourceUrl,
    sourceUpdatedAt: observation.sourceUpdatedAt,
    lastSeenAt: observation.lastSeenAt,
    manual: observation.observationType === "manual-set",
    note: observation.note,
  };
}

export class PricingRepository {
  constructor(private readonly db: AppDatabase) {}

  attachEstimates<T extends EstimableCollectionItem>(items: T[]): T[] {
    if (items.length === 0) return items;
    const ownedCardIds = items.map((item) => item.ownedCardId);
    const printingIds = [...new Set(items.map((item) => item.printingId))];
    const observations = this.db
      .select()
      .from(marketPriceObservations)
      .where(
        or(
          inArray(marketPriceObservations.ownedCardId, ownedCardIds),
          and(
            isNull(marketPriceObservations.ownedCardId),
            inArray(marketPriceObservations.printingId, printingIds),
            eq(marketPriceObservations.observationType, "provider"),
          ),
        ),
      )
      .orderBy(desc(marketPriceObservations.id))
      .all();

    const latestManualByOwnedCard = new Map<number, PriceObservation>();
    const latestProviderByPrinting = new Map<number, PriceObservation>();
    for (const observation of observations) {
      if (
        observation.ownedCardId !== null &&
        observation.observationType !== "provider" &&
        !latestManualByOwnedCard.has(observation.ownedCardId)
      ) {
        latestManualByOwnedCard.set(observation.ownedCardId, observation);
      }
      if (
        observation.ownedCardId === null &&
        observation.observationType === "provider" &&
        !latestProviderByPrinting.has(observation.printingId)
      ) {
        latestProviderByPrinting.set(observation.printingId, observation);
      }
    }

    return items.map((item) => {
      const manual = latestManualByOwnedCard.get(item.ownedCardId);
      const manualEstimate =
        manual?.observationType === "manual-set"
          ? estimateFromObservation(manual)
          : null;
      const provider = latestProviderByPrinting.get(item.printingId);
      const providerEstimate =
        !item.sealed && provider ? estimateFromObservation(provider) : null;
      return {
        ...item,
        marketEstimate: manualEstimate ?? providerEstimate,
      };
    });
  }

  getOwnedPrinting(
    profileId: number,
    ownedCardId: number,
  ): { ownedCardId: number; printingId: number; sealed: boolean } | null {
    return (
      this.db
        .select({
          ownedCardId: ownedCards.id,
          printingId: ownedCards.printingId,
          sealed: ownedCards.sealed,
        })
        .from(ownedCards)
        .where(
          and(
            eq(ownedCards.profileId, profileId),
            eq(ownedCards.id, ownedCardId),
          ),
        )
        .get() ?? null
    );
  }

  setManualEstimate(
    profileId: number,
    ownedCardId: number,
    amountMinor: number,
    note: string | null,
    observedAt = new Date().toISOString(),
  ): boolean {
    const owned = this.getOwnedPrinting(profileId, ownedCardId);
    if (!owned) return false;
    this.db
      .insert(marketPriceObservations)
      .values({
        printingId: owned.printingId,
        ownedCardId,
        provider: "manual",
        providerProductId: null,
        providerVariant: null,
        currency: "USD",
        marketPriceMinor: amountMinor,
        lowPriceMinor: null,
        midPriceMinor: null,
        highPriceMinor: null,
        directLowPriceMinor: null,
        observationType: "manual-set",
        observationKey: `manual-${ownedCardId}-${randomUUID()}`,
        sourceUrl: null,
        sourceUpdatedAt: observedAt,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        note,
      })
      .run();
    return true;
  }

  clearManualEstimate(
    profileId: number,
    ownedCardId: number,
    observedAt = new Date().toISOString(),
  ): boolean {
    const owned = this.getOwnedPrinting(profileId, ownedCardId);
    if (!owned) return false;
    const latestManual = this.db
      .select({ observationType: marketPriceObservations.observationType })
      .from(marketPriceObservations)
      .where(
        and(
          eq(marketPriceObservations.ownedCardId, ownedCardId),
          eq(marketPriceObservations.provider, "manual"),
        ),
      )
      .orderBy(desc(marketPriceObservations.id))
      .limit(1)
      .get();
    if (!latestManual || latestManual.observationType === "manual-clear") {
      return true;
    }
    this.db
      .insert(marketPriceObservations)
      .values({
        printingId: owned.printingId,
        ownedCardId,
        provider: "manual",
        providerProductId: null,
        providerVariant: null,
        currency: "USD",
        marketPriceMinor: null,
        lowPriceMinor: null,
        midPriceMinor: null,
        highPriceMinor: null,
        directLowPriceMinor: null,
        observationType: "manual-clear",
        observationKey: `manual-clear-${ownedCardId}-${randomUUID()}`,
        sourceUrl: null,
        sourceUpdatedAt: observedAt,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        note: null,
      })
      .run();
    return true;
  }
}

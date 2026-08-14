import { z } from "zod";

import { getDatabase, type AppDatabase } from "@/db/client";
import { decimalAmountToMinor, estimateLotValue } from "@/lib/pricing/money";
import { PricingRepository } from "@/lib/repositories/pricing-repository";
import { ProfileRepository } from "@/lib/repositories/profile-repository";
import {
  ProfileNotFoundError,
  profileSlugSchema,
} from "@/lib/services/profile-service";
import type { CollectionListItem } from "@/lib/types/collection";
import type {
  MarketPriceEstimate,
  ProfileValuationSummary,
  SetManualPriceEstimateInput,
} from "@/lib/types/pricing";

const manualEstimateSchema = z
  .object({
    amount: z
      .string({ error: "Manual estimate must be a decimal amount." })
      .trim()
      .refine((value) => decimalAmountToMinor(value) !== null, {
        message:
          "Manual estimate must be a nonnegative USD amount with at most two decimals.",
      }),
    note: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => {
        const normalized = value?.trim().normalize("NFC");
        return normalized ? normalized : null;
      })
      .refine((value) => value === null || value.length <= 1_000, {
        message: "Manual estimate note is too long.",
      }),
  })
  .strict();

function positiveId(value: number): number {
  return z.number().int().positive().parse(value);
}

export class PricingService {
  constructor(
    private readonly repository: PricingRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  private profileId(profileSlug: string): number {
    const profile = this.profiles.getBySlug(
      profileSlugSchema.parse(profileSlug),
    );
    if (!profile) throw new ProfileNotFoundError();
    return profile.id;
  }

  attachEstimates<T extends CollectionListItem>(items: T[]): T[] {
    return this.repository.attachEstimates(items);
  }

  summarize(items: CollectionListItem[]): ProfileValuationSummary {
    return items.reduce<ProfileValuationSummary>(
      (summary, item) => {
        summary.totalEntries += 1;
        summary.totalPhysicalCards += item.quantity;
        if (item.marketEstimate?.currency === summary.currency) {
          summary.valuedEntries += 1;
          summary.valuedPhysicalCards += item.quantity;
          summary.estimatedValueMinor += estimateLotValue(
            item.marketEstimate,
            item.quantity,
          );
        }
        return summary;
      },
      {
        currency: "USD",
        estimatedValueMinor: 0,
        valuedEntries: 0,
        totalEntries: 0,
        valuedPhysicalCards: 0,
        totalPhysicalCards: 0,
      },
    );
  }

  setManualEstimate(
    profileSlug: string,
    ownedCardId: number,
    input: SetManualPriceEstimateInput,
  ): MarketPriceEstimate | null | undefined {
    const parsed = manualEstimateSchema.parse(input);
    const amountMinor = decimalAmountToMinor(parsed.amount);
    if (amountMinor === null) throw new Error("Invalid manual estimate.");
    const saved = this.repository.setManualEstimate(
      this.profileId(profileSlug),
      positiveId(ownedCardId),
      amountMinor,
      parsed.note,
    );
    if (!saved) return undefined;
    return this.currentEstimate(profileSlug, ownedCardId);
  }

  clearManualEstimate(
    profileSlug: string,
    ownedCardId: number,
  ): MarketPriceEstimate | null | undefined {
    const cleared = this.repository.clearManualEstimate(
      this.profileId(profileSlug),
      positiveId(ownedCardId),
    );
    if (!cleared) return undefined;
    return this.currentEstimate(profileSlug, ownedCardId);
  }

  currentEstimate(
    profileSlug: string,
    ownedCardId: number,
  ): MarketPriceEstimate | null | undefined {
    const profileId = this.profileId(profileSlug);
    const owned = this.repository.getOwnedPrinting(
      profileId,
      positiveId(ownedCardId),
    );
    if (!owned) return undefined;
    const [item] = this.repository.attachEstimates([
      {
        ownedCardId: owned.ownedCardId,
        printingId: owned.printingId,
        sealed: owned.sealed,
        marketEstimate: null,
      },
    ]);
    return item?.marketEstimate ?? null;
  }
}

export function createPricingService(db: AppDatabase): PricingService {
  return new PricingService(
    new PricingRepository(db),
    new ProfileRepository(db),
  );
}

export function getPricingService(): PricingService {
  return createPricingService(getDatabase());
}

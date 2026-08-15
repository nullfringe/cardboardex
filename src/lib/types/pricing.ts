import type { MarketCondition } from "@/lib/pricing/conditions";

export type PriceBasis = "market" | "mid" | "low" | "high" | "direct-low";

export type MarketPriceEstimate = {
  observationId: number;
  printingId: number;
  ownedCardId: number | null;
  provider: string;
  providerProductId: string | null;
  providerSkuId: string | null;
  providerVariant: string | null;
  pricingVariantAssumed: boolean;
  priceCondition: MarketCondition | null;
  conditionAssumed: boolean;
  conditionOverridden: boolean;
  currency: string;
  unitAmountMinor: number;
  basis: PriceBasis;
  marketPriceMinor: number | null;
  lowPriceMinor: number | null;
  midPriceMinor: number | null;
  highPriceMinor: number | null;
  directLowPriceMinor: number | null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  lastSeenAt: string;
  manual: boolean;
  note: string | null;
};

export type ProfileValuationSummary = {
  currency: string;
  estimatedValueMinor: number;
  valuedEntries: number;
  totalEntries: number;
  valuedPhysicalCards: number;
  totalPhysicalCards: number;
  assumedEntries: number;
  assumedPhysicalCards: number;
  defaultPricingCondition: MarketCondition;
};

export type SetManualPriceEstimateInput = {
  amount: string;
  note?: string | null;
};

export type ProviderPriceObservation = {
  printingId: number;
  provider: string;
  providerProductId: string;
  providerSkuId: string | null;
  providerVariant: string;
  pricingVariantAssumed: boolean;
  priceCondition: MarketCondition | null;
  currency: string;
  marketPriceMinor: number | null;
  lowPriceMinor: number | null;
  midPriceMinor: number | null;
  highPriceMinor: number | null;
  directLowPriceMinor: number | null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
};

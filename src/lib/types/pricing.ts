export type PriceBasis = "market" | "mid" | "low" | "high" | "direct-low";

export type MarketPriceEstimate = {
  observationId: number;
  printingId: number;
  ownedCardId: number | null;
  provider: string;
  providerProductId: string | null;
  providerVariant: string | null;
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
};

export type SetManualPriceEstimateInput = {
  amount: string;
  note?: string | null;
};

export type ProviderPriceObservation = {
  printingId: number;
  provider: string;
  providerProductId: string;
  providerVariant: string;
  currency: string;
  marketPriceMinor: number | null;
  lowPriceMinor: number | null;
  midPriceMinor: number | null;
  highPriceMinor: number | null;
  directLowPriceMinor: number | null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
};

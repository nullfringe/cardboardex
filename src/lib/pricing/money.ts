import type { MarketPriceEstimate, PriceBasis } from "@/lib/types/pricing";

const MAX_MINOR_AMOUNT = 100_000_000_000;

export function decimalAmountToMinor(value: string): number | null {
  const normalized = value.normalize("NFKC").trim();
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/u.exec(normalized);
  if (!match?.[1]) return null;

  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const amount = whole * 100 + Number(fraction || "0");
  return Number.isSafeInteger(amount) && amount <= MAX_MINOR_AMOUNT
    ? amount
    : null;
}

export function decimalPriceToMinor(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const amount = Math.round(value * 100);
  return Number.isSafeInteger(amount) && amount <= MAX_MINOR_AMOUNT
    ? amount
    : null;
}

export function selectEstimateAmount(prices: {
  marketPriceMinor: number | null;
  midPriceMinor: number | null;
  lowPriceMinor: number | null;
  highPriceMinor: number | null;
  directLowPriceMinor: number | null;
}): { amount: number; basis: PriceBasis } | null {
  const candidates: Array<[PriceBasis, number | null]> = [
    ["market", prices.marketPriceMinor],
    ["mid", prices.midPriceMinor],
    ["low", prices.lowPriceMinor],
    ["high", prices.highPriceMinor],
    ["direct-low", prices.directLowPriceMinor],
  ];
  const selected = candidates.find(([, amount]) => amount !== null);
  return selected?.[1] === null || selected?.[1] === undefined
    ? null
    : { basis: selected[0], amount: selected[1] };
}

export function formatMoney(amountMinor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function estimateLotValue(
  estimate: MarketPriceEstimate,
  quantity: number,
): number {
  return estimate.unitAmountMinor * quantity;
}

export function compareMarketPriceEstimates(
  left: MarketPriceEstimate | null,
  right: MarketPriceEstimate | null,
  direction: "asc" | "desc",
): number {
  const leftAmount = left?.currency === "USD" ? left.unitAmountMinor : null;
  const rightAmount = right?.currency === "USD" ? right.unitAmountMinor : null;

  if (leftAmount === null && rightAmount === null) return 0;
  if (leftAmount === null) return 1;
  if (rightAmount === null) return -1;
  return direction === "desc"
    ? rightAmount - leftAmount
    : leftAmount - rightAmount;
}

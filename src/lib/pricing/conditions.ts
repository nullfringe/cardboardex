export const MARKET_CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;

export type MarketCondition = (typeof MARKET_CONDITIONS)[number];

export const DEFAULT_MARKET_CONDITION: MarketCondition = "Lightly Played";

const conditionAliases = new Map<string, MarketCondition>([
  ["mint", "Near Mint"],
  ["near mint", "Near Mint"],
  ["nm", "Near Mint"],
  ["lightly played", "Lightly Played"],
  ["light play", "Lightly Played"],
  ["lp", "Lightly Played"],
  ["moderately played", "Moderately Played"],
  ["moderate play", "Moderately Played"],
  ["mp", "Moderately Played"],
  ["heavily played", "Heavily Played"],
  ["heavy play", "Heavily Played"],
  ["hp", "Heavily Played"],
  ["damaged", "Damaged"],
  ["damage", "Damaged"],
  ["dmg", "Damaged"],
]);

function normalizedCondition(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function marketConditionFromText(
  value: string | null | undefined,
): MarketCondition | null {
  if (!value?.trim()) return null;
  return conditionAliases.get(normalizedCondition(value)) ?? null;
}

export function isMarketCondition(value: unknown): value is MarketCondition {
  return (
    typeof value === "string" &&
    MARKET_CONDITIONS.includes(value as MarketCondition)
  );
}

export function abbreviatedMarketCondition(condition: MarketCondition): string {
  switch (condition) {
    case "Near Mint":
      return "NM";
    case "Lightly Played":
      return "LP";
    case "Moderately Played":
      return "MP";
    case "Heavily Played":
      return "HP";
    case "Damaged":
      return "DMG";
  }
}

import { languageName } from "@/lib/languages";
import {
  isMarketCondition,
  type MarketCondition,
} from "@/lib/pricing/conditions";
import { decimalPriceToMinor } from "@/lib/pricing/money";
import type { MarketPriceFetch } from "@/lib/pricing/tcgcsv-market-pricing";

export const TCGPLAYER_CONDITION_PRICE_PROVIDER = "tcgplayer-marketplace";

const PRODUCT_API_ORIGIN = "https://mp-search-api.tcgplayer.com";
const PRICE_API_ORIGIN = "https://mpgateway.tcgplayer.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_INTERVAL_MS = 250;
const MAX_RESPONSE_BYTES = 1_000_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type TcgplayerConditionPriceIdentity = {
  languageCode: string;
  providerProductId: string;
  providerVariant: string;
  sourceUrl: string | null;
};

export type TcgplayerConditionPrice = {
  provider: typeof TCGPLAYER_CONDITION_PRICE_PROVIDER;
  providerProductId: string;
  providerSkuId: string;
  providerVariant: string;
  priceCondition: MarketCondition;
  currency: "USD";
  marketPriceMinor: number;
  lowPriceMinor: null;
  midPriceMinor: null;
  highPriceMinor: null;
  directLowPriceMinor: null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
};

type ProductSku = {
  skuId: number;
  language: string;
  condition: MarketCondition;
  variant: string;
};

type SkuMarketPrice = {
  skuId: number;
  marketPriceMinor: number;
  calculatedAt: string | null;
};

export class TcgplayerConditionPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TcgplayerConditionPricingError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function productDetailsUrl(productId: number): string {
  return `${PRODUCT_API_ORIGIN}/v2/product/${productId}/details`;
}

function skuPricesUrl(): string {
  return `${PRICE_API_ORIGIN}/v1/pricepoints/marketprice/skus/search`;
}

export function isTcgplayerConditionPriceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    return (
      (url.origin === PRODUCT_API_ORIGIN &&
        /^\/v2\/product\/[1-9]\d*\/details$/u.test(url.pathname)) ||
      (url.origin === PRICE_API_ORIGIN &&
        url.pathname === "/v1/pricepoints/marketprice/skus/search")
    );
  } catch {
    return false;
  }
}

function isAcceptedJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  return mediaType === "application/json" || mediaType === "text/json";
}

async function fetchJson(
  url: string,
  fetchImpl: MarketPriceFetch,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<unknown> {
  if (!isTcgplayerConditionPriceUrl(url)) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer condition pricing requires a constrained marketplace URL.",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set(
    "user-agent",
    "Cardboardex/0.1 (+https://github.com/nullfringe/cardboardex)",
  );
  const response = await fetchImpl(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer condition pricing unexpectedly redirected.",
    );
  }
  if (!response.ok) {
    throw new TcgplayerConditionPricingError(
      `TCGplayer condition pricing returned HTTP ${response.status}.`,
    );
  }
  if (!isAcceptedJsonMediaType(response.headers.get("content-type"))) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer condition pricing did not return JSON.",
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer condition-pricing metadata was unexpectedly large.",
    );
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer condition-pricing metadata was unexpectedly large.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TcgplayerConditionPricingError(
      "TCGplayer condition pricing returned malformed JSON.",
    );
  }
}

function parseProductSkus(value: unknown, productId: number): ProductSku[] {
  if (
    !isRecord(value) ||
    Number(value.productId) !== productId ||
    !Array.isArray(value.skus)
  ) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer returned invalid product SKU metadata.",
    );
  }

  return value.skus.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const skuId = positiveInteger(candidate.sku);
    const language = optionalText(candidate.language);
    const condition = optionalText(candidate.condition);
    const variant = optionalText(candidate.variant);
    return skuId &&
      language &&
      condition &&
      variant &&
      isMarketCondition(condition)
      ? [{ skuId, language, condition, variant }]
      : [];
  });
}

function parseSkuPrices(value: unknown): SkuMarketPrice[] {
  if (!Array.isArray(value)) {
    throw new TcgplayerConditionPricingError(
      "TCGplayer returned invalid condition-price metadata.",
    );
  }
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const skuId = positiveInteger(candidate.skuId);
    const marketPriceMinor = decimalPriceToMinor(candidate.marketPrice);
    if (!skuId || marketPriceMinor === null) return [];
    const calculatedAt = optionalText(candidate.calculatedAt);
    return [
      {
        skuId,
        marketPriceMinor,
        calculatedAt:
          calculatedAt && !Number.isNaN(new Date(calculatedAt).getTime())
            ? calculatedAt
            : null,
      },
    ];
  });
}

function conditionSourceUrl(
  sourceUrl: string | null,
  language: string,
  condition: MarketCondition,
  variant: string,
): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "tcgplayer.com" &&
        url.hostname !== "www.tcgplayer.com") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.search = "";
    url.hash = "";
    url.searchParams.set("Language", language);
    url.searchParams.set("Condition", condition);
    url.searchParams.set("Printing", variant);
    return url.toString();
  } catch {
    return null;
  }
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

export function createTcgplayerConditionPricingClient({
  fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  requestIntervalMs = DEFAULT_REQUEST_INTERVAL_MS,
}: {
  fetchImpl?: MarketPriceFetch;
  timeoutMs?: number;
  requestIntervalMs?: number;
} = {}) {
  let lastRequestStartedAt: number | null = null;

  const rateLimitedFetch = async (
    url: string,
    init: RequestInit = {},
  ): Promise<unknown> => {
    if (lastRequestStartedAt !== null) {
      await wait(requestIntervalMs - (Date.now() - lastRequestStartedAt));
    }
    lastRequestStartedAt = Date.now();
    return fetchJson(url, fetchImpl, timeoutMs, init);
  };

  return {
    async resolvePrices(
      identity: TcgplayerConditionPriceIdentity,
    ): Promise<TcgplayerConditionPrice[]> {
      const productId = Number(identity.providerProductId);
      if (!Number.isSafeInteger(productId) || productId <= 0) return [];

      const expectedLanguage = languageName(identity.languageCode);
      const expectedVariant = normalizedText(identity.providerVariant);
      const candidates = parseProductSkus(
        await rateLimitedFetch(productDetailsUrl(productId)),
        productId,
      ).filter(
        (sku) =>
          normalizedText(sku.language) === normalizedText(expectedLanguage) &&
          normalizedText(sku.variant) === expectedVariant,
      );

      const unambiguous = new Map<MarketCondition, ProductSku>();
      const ambiguous = new Set<MarketCondition>();
      for (const candidate of candidates) {
        if (unambiguous.has(candidate.condition)) {
          ambiguous.add(candidate.condition);
        } else {
          unambiguous.set(candidate.condition, candidate);
        }
      }
      for (const condition of ambiguous) unambiguous.delete(condition);
      const skus = [...unambiguous.values()];
      if (skus.length === 0) return [];

      const prices = parseSkuPrices(
        await rateLimitedFetch(skuPricesUrl(), {
          method: "POST",
          body: JSON.stringify({ skuIds: skus.map((sku) => sku.skuId) }),
        }),
      );
      const pricesBySku = new Map(prices.map((price) => [price.skuId, price]));

      return skus.flatMap((sku) => {
        const price = pricesBySku.get(sku.skuId);
        if (!price) return [];
        return [
          {
            provider: TCGPLAYER_CONDITION_PRICE_PROVIDER,
            providerProductId: String(productId),
            providerSkuId: String(sku.skuId),
            providerVariant: sku.variant,
            priceCondition: sku.condition,
            currency: "USD" as const,
            marketPriceMinor: price.marketPriceMinor,
            lowPriceMinor: null,
            midPriceMinor: null,
            highPriceMinor: null,
            directLowPriceMinor: null,
            sourceUrl: conditionSourceUrl(
              identity.sourceUrl,
              sku.language,
              sku.condition,
              sku.variant,
            ),
            sourceUpdatedAt: price.calculatedAt,
          },
        ];
      });
    },
  };
}

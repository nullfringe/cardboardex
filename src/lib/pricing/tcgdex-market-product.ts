import { tcgplayerProductIds } from "@/lib/images/tcgplayer-card-image";
import type { MarketPriceFetch } from "@/lib/pricing/tcgcsv-market-pricing";

export const TCGDEX_API_ORIGIN = "https://api.tcgdex.net";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CARD_RESPONSE_BYTES = 500_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type VintageSetIdentity = {
  tcgdexId: string;
  localCodes: readonly string[];
  name: string;
  printedTotal: number;
};

const VINTAGE_SET_IDENTITIES: readonly VintageSetIdentity[] = [
  {
    tcgdexId: "base1",
    localCodes: ["bs", "base1"],
    name: "base set",
    printedTotal: 102,
  },
  {
    tcgdexId: "base2",
    localCodes: ["ju", "base2"],
    name: "jungle",
    printedTotal: 64,
  },
  {
    tcgdexId: "base3",
    localCodes: ["fo", "base3"],
    name: "fossil",
    printedTotal: 62,
  },
  {
    tcgdexId: "base4",
    localCodes: ["bs2", "base4"],
    name: "base set 2",
    printedTotal: 130,
  },
  {
    tcgdexId: "base5",
    localCodes: ["tr", "base5"],
    name: "team rocket",
    printedTotal: 82,
  },
] as const;

export type TcgDexMarketProductIdentity = {
  gameSlug: string;
  languageCode: string;
  setCode: string;
  setName: string;
  collectorNumber: string | null;
  printingVariantKey: string;
  catalogProvider: string | null;
  catalogSetProvider: string | null;
  catalogSetId: string | null;
  catalogCardId: string | null;
};

export type TcgDexMarketProduct = {
  productId: number;
  cardId: string;
  setId: string;
  variantId: string;
};

type TcgDexVariant = {
  subtype?: string;
  stamps: string[];
  size?: string;
  variantId: string;
  pricing?: unknown;
};

type TcgDexCard = {
  id: string;
  localId: string;
  setId: string;
  setName: string;
  printedTotal: number | null;
  variants: TcgDexVariant[];
  pricing?: unknown;
};

export class TcgDexMarketProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TcgDexMarketProductError";
  }
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TcgDexMarketProductError(
      `TCGdex returned invalid ${field} metadata.`,
    );
  }
  return value.trim();
}

function parseVariant(value: unknown): TcgDexVariant | null {
  if (!isRecord(value)) return null;
  const stampsValue = value.stamp ?? value.stamps;
  const stamps = Array.isArray(stampsValue)
    ? stampsValue.filter((stamp): stamp is string => typeof stamp === "string")
    : [];
  try {
    return {
      ...(typeof value.subtype === "string" ? { subtype: value.subtype } : {}),
      ...(typeof value.size === "string" ? { size: value.size } : {}),
      stamps,
      variantId: requiredString(value.variantId, "variant ID"),
      ...(value.pricing !== undefined ? { pricing: value.pricing } : {}),
    };
  } catch {
    return null;
  }
}

function parseCard(value: unknown): TcgDexCard {
  if (!isRecord(value) || !isRecord(value.set)) {
    throw new TcgDexMarketProductError(
      "TCGdex returned an invalid card record.",
    );
  }
  const cardCount = isRecord(value.set.cardCount) ? value.set.cardCount : null;
  const official = cardCount?.official;
  return {
    id: requiredString(value.id, "card ID"),
    localId:
      typeof value.localId === "number"
        ? String(value.localId)
        : requiredString(value.localId, "local ID"),
    setId: requiredString(value.set.id, "set ID"),
    setName: requiredString(value.set.name, "set name"),
    printedTotal: Number.isSafeInteger(official) ? Number(official) : null,
    variants: Array.isArray(value.variants_detailed)
      ? value.variants_detailed
          .map(parseVariant)
          .filter((variant): variant is TcgDexVariant => variant !== null)
      : [],
    ...(value.pricing !== undefined ? { pricing: value.pricing } : {}),
  };
}

function exactVariant(
  variants: TcgDexVariant[],
  printingVariantKey: string,
): TcgDexVariant | null {
  const candidates = variants.filter(
    (variant) => !variant.size || normalized(variant.size) === "standard",
  );
  const key = normalized(printingVariantKey);
  if (key === "standard") {
    const standard = candidates.filter(
      (variant) => !variant.subtype && variant.stamps.length === 0,
    );
    return standard.length === 1 ? (standard[0] ?? null) : null;
  }
  const exact = candidates.filter(
    (variant) =>
      normalized(variant.subtype ?? "") === key ||
      variant.stamps.some((stamp) => normalized(stamp) === key),
  );
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1 || !/^lv-?\d+$/u.test(key)) return null;

  const sole = candidates[0];
  return candidates.length === 1 &&
    sole !== undefined &&
    !sole.subtype &&
    sole.stamps.length === 0
    ? sole
    : null;
}

function collectorIdentity(value: string | null): {
  number: string;
  printedTotal: number;
} | null {
  if (!value) return null;
  const match = /^(\d+)\s*\/\s*(\d+)$/u.exec(value.normalize("NFKC").trim());
  if (!match?.[1] || !match[2]) return null;
  const number = Number(match[1]);
  const printedTotal = Number(match[2]);
  return Number.isSafeInteger(number) &&
    number > 0 &&
    Number.isSafeInteger(printedTotal) &&
    printedTotal > 0
    ? { number: String(number), printedTotal }
    : null;
}

function vintageLookup(identity: TcgDexMarketProductIdentity): {
  cardId: string;
  set: VintageSetIdentity;
  collector: { number: string; printedTotal: number };
} | null {
  if (normalized(identity.languageCode) !== "en") return null;
  const setCode = normalized(identity.setCode);
  const setName = normalized(identity.setName);
  const set = VINTAGE_SET_IDENTITIES.find(
    (candidate) =>
      candidate.name === setName && candidate.localCodes.includes(setCode),
  );
  const collector = collectorIdentity(identity.collectorNumber);
  return set && collector && collector.printedTotal === set.printedTotal
    ? { cardId: `${set.tcgdexId}-${collector.number}`, set, collector }
    : null;
}

function lookupIdentity(identity: TcgDexMarketProductIdentity): {
  cardId: string;
  setId: string;
  vintage: ReturnType<typeof vintageLookup>;
} | null {
  if (
    normalized(identity.catalogProvider ?? "") === "tcgdex" &&
    normalized(identity.catalogSetProvider ?? "") === "tcgdex" &&
    identity.catalogCardId &&
    identity.catalogSetId
  ) {
    return {
      cardId: identity.catalogCardId,
      setId: identity.catalogSetId,
      vintage: null,
    };
  }
  const vintage = vintageLookup(identity);
  return vintage
    ? { cardId: vintage.cardId, setId: vintage.set.tcgdexId, vintage }
    : null;
}

function cardUrl(languageCode: string, cardId: string): string {
  return `${TCGDEX_API_ORIGIN}/v2/${languageCode}/cards/${cardId}`;
}

export function isTcgDexMarketCardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === TCGDEX_API_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/v2\/[a-z]{2}(?:-[a-z]{2})?\/cards\/[a-z0-9.-]+$/iu.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function fetchCard(
  url: string,
  fetchImpl: MarketPriceFetch,
  timeoutMs: number,
): Promise<TcgDexCard | null> {
  if (!isTcgDexMarketCardUrl(url)) {
    throw new TcgDexMarketProductError(
      "TCGdex pricing requires a constrained card URL.",
    );
  }
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Cardboardex/0.1 (+https://github.com/nullfringe/cardboardex)",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) return null;
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new TcgDexMarketProductError(
      "TCGdex pricing metadata unexpectedly redirected.",
    );
  }
  if (!response.ok) {
    throw new TcgDexMarketProductError(
      `TCGdex pricing returned HTTP ${response.status}.`,
    );
  }
  if (
    !response.headers
      .get("content-type")
      ?.toLocaleLowerCase("en-US")
      .startsWith("application/json")
  ) {
    throw new TcgDexMarketProductError("TCGdex pricing did not return JSON.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CARD_RESPONSE_BYTES
  ) {
    throw new TcgDexMarketProductError(
      "TCGdex pricing metadata was unexpectedly large.",
    );
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CARD_RESPONSE_BYTES) {
    throw new TcgDexMarketProductError(
      "TCGdex pricing metadata was unexpectedly large.",
    );
  }
  try {
    return parseCard(JSON.parse(text));
  } catch (error) {
    if (error instanceof TcgDexMarketProductError) throw error;
    throw new TcgDexMarketProductError(
      "TCGdex pricing returned malformed JSON.",
    );
  }
}

export async function resolveTcgDexMarketProduct(
  identity: TcgDexMarketProductIdentity,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { fetchImpl?: MarketPriceFetch; timeoutMs?: number } = {},
): Promise<TcgDexMarketProduct | null> {
  if (normalized(identity.gameSlug) !== "pokemon-tcg") return null;
  const lookup = lookupIdentity(identity);
  if (!lookup) return null;
  const languageCode = normalized(identity.languageCode);
  const card = await fetchCard(
    cardUrl(languageCode, lookup.cardId),
    fetchImpl,
    timeoutMs,
  );
  if (
    !card ||
    normalized(card.id) !== normalized(lookup.cardId) ||
    normalized(card.setId) !== normalized(lookup.setId)
  ) {
    return null;
  }
  if (
    lookup.vintage &&
    (normalized(card.setName) !== lookup.vintage.set.name ||
      card.printedTotal !== lookup.vintage.set.printedTotal ||
      String(Number(card.localId)) !== lookup.vintage.collector.number)
  ) {
    return null;
  }
  const variant = exactVariant(card.variants, identity.printingVariantKey);
  if (!variant) return null;
  const variantProducts = tcgplayerProductIds(variant.pricing);
  let productId =
    variantProducts.length === 1 ? (variantProducts[0] ?? null) : null;
  if (
    !productId &&
    normalized(identity.printingVariantKey) === "standard" &&
    card.variants.length === 1
  ) {
    const cardProducts = tcgplayerProductIds(card.pricing);
    productId = cardProducts.length === 1 ? (cardProducts[0] ?? null) : null;
  }
  return productId
    ? {
        productId,
        cardId: card.id,
        setId: card.setId,
        variantId: variant.variantId,
      }
    : null;
}

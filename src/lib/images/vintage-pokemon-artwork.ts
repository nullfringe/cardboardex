import type { ArtworkFetch } from "./official-pokemon-artwork";
import {
  TCGDEX_TCGPLAYER_ARTWORK_PROVIDER,
  tcgplayerProductIds,
  verifiedTcgplayerImageUrl,
} from "./tcgplayer-card-image";

export const VINTAGE_POKEMON_ARTWORK_PROVIDER =
  TCGDEX_TCGPLAYER_ARTWORK_PROVIDER;
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

export type VintagePokemonArtworkIdentity = {
  gameSlug: string;
  setCode: string;
  setName: string;
  collectorNumber: string | null;
  printingVariantKey: string;
  languageCode: string;
};

export type VintagePokemonArtwork = {
  url: string;
  provider: typeof VINTAGE_POKEMON_ARTWORK_PROVIDER;
  externalId: string;
};

type TcgDexVariant = {
  type: string;
  subtype?: string;
  size?: string;
  stamps: string[];
  variantId: string;
  pricing?: unknown;
};

type TcgDexCard = {
  id: string;
  localId: string;
  setId: string;
  setName: string;
  printedTotal: number;
  variants: TcgDexVariant[];
  pricing?: unknown;
};

export class VintagePokemonArtworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VintagePokemonArtworkError";
  }
}

function normalizedIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

function vintageSetIdentity(
  identity: VintagePokemonArtworkIdentity,
): VintageSetIdentity | null {
  const setCode = normalizedIdentityPart(identity.setCode);
  const setName = normalizedIdentityPart(identity.setName);

  return (
    VINTAGE_SET_IDENTITIES.find(
      (candidate) =>
        candidate.name === setName && candidate.localCodes.includes(setCode),
    ) ?? null
  );
}

function collectorIdentity(value: string | null): {
  number: string;
  printedTotal: number;
} | null {
  if (value === null) return null;
  const match = /^(\d+)\s*\/\s*(\d+)$/u.exec(value.normalize("NFKC").trim());
  const number = Number(match?.[1]);
  const printedTotal = Number(match?.[2]);

  return Number.isSafeInteger(number) &&
    number > 0 &&
    Number.isSafeInteger(printedTotal) &&
    printedTotal > 0
    ? { number: String(number), printedTotal }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new VintagePokemonArtworkError(
      `TCGdex returned invalid ${field} metadata.`,
    );
  }
  return value;
}

function parseVariant(value: unknown): TcgDexVariant | null {
  if (!isRecord(value)) return null;
  const stampsValue = value.stamp ?? value.stamps;
  const stamps = Array.isArray(stampsValue)
    ? stampsValue.filter((stamp): stamp is string => typeof stamp === "string")
    : [];

  try {
    return {
      type: requiredString(value.type, "variant type"),
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

function parseTcgDexCard(value: unknown): TcgDexCard {
  if (!isRecord(value) || !isRecord(value.set)) {
    throw new VintagePokemonArtworkError(
      "TCGdex returned an invalid card record.",
    );
  }

  const cardCount = value.set.cardCount;
  if (!isRecord(cardCount) || !Number.isSafeInteger(cardCount.official)) {
    throw new VintagePokemonArtworkError(
      "TCGdex returned invalid set-count metadata.",
    );
  }

  const variants = Array.isArray(value.variants_detailed)
    ? value.variants_detailed
        .map(parseVariant)
        .filter((variant): variant is TcgDexVariant => variant !== null)
    : [];

  return {
    id: requiredString(value.id, "card ID"),
    localId: String(value.localId),
    setId: requiredString(value.set.id, "set ID"),
    setName: requiredString(value.set.name, "set name"),
    printedTotal: Number(cardCount.official),
    variants,
    ...(value.pricing !== undefined ? { pricing: value.pricing } : {}),
  };
}

function selectPrintingVariant(
  variants: TcgDexVariant[],
  printingVariantKey: string,
): TcgDexVariant | null {
  const standardSize = variants.filter(
    (variant) => variant.size === undefined || variant.size === "standard",
  );
  const key = normalizedIdentityPart(printingVariantKey);
  let matches: TcgDexVariant[];

  switch (key) {
    case "unlimited":
      matches = standardSize.filter(
        (variant) =>
          variant.subtype === "unlimited" &&
          !variant.stamps.includes("1st-edition"),
      );
      break;
    case "first-edition":
      matches = standardSize.filter((variant) =>
        variant.stamps.includes("1st-edition"),
      );
      break;
    case "shadowless":
      matches = standardSize.filter(
        (variant) =>
          variant.subtype === "shadowless" &&
          !variant.stamps.includes("1st-edition"),
      );
      break;
    case "1999-2000-copyright":
      matches = standardSize.filter(
        (variant) => variant.subtype === "1999-2000-copyright",
      );
      break;
    case "standard":
      {
        const soleVariant = standardSize[0];
        matches =
          standardSize.length === 1 &&
          soleVariant !== undefined &&
          soleVariant.subtype === undefined &&
          soleVariant.stamps.length === 0
            ? standardSize
            : [];
      }
      break;
    default:
      matches = [];
  }

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function exactTcgplayerProductId(
  card: TcgDexCard,
  variant: TcgDexVariant,
  printingVariantKey: string,
): number | null {
  const variantProducts = tcgplayerProductIds(variant.pricing);
  if (variantProducts.length === 1) return variantProducts[0] ?? null;

  if (
    normalizedIdentityPart(printingVariantKey) === "standard" &&
    card.variants.length === 1
  ) {
    const cardProducts = tcgplayerProductIds(card.pricing);
    return cardProducts.length === 1 ? (cardProducts[0] ?? null) : null;
  }

  return null;
}

function tcgdexCardUrl(cardId: string): string {
  return `${TCGDEX_API_ORIGIN}/v2/en/cards/${cardId}`;
}

export function isTcgDexVintageCardUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === TCGDEX_API_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/v2\/en\/cards\/[a-z0-9]+-\d+$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function fetchTcgDexCard(
  url: string,
  fetchImpl: ArtworkFetch,
  timeoutMs: number,
): Promise<TcgDexCard | null> {
  if (!isTcgDexVintageCardUrl(url)) {
    throw new VintagePokemonArtworkError(
      "Vintage artwork lookup requires a constrained TCGdex card URL.",
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
    throw new VintagePokemonArtworkError(
      "TCGdex metadata unexpectedly redirected.",
    );
  }
  if (!response.ok) {
    throw new VintagePokemonArtworkError(
      `TCGdex returned HTTP ${response.status}.`,
    );
  }
  if (
    !response.headers
      .get("content-type")
      ?.toLocaleLowerCase("en-US")
      .startsWith("application/json")
  ) {
    throw new VintagePokemonArtworkError("TCGdex did not return JSON.");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CARD_RESPONSE_BYTES
  ) {
    throw new VintagePokemonArtworkError(
      "TCGdex card metadata was unexpectedly large.",
    );
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CARD_RESPONSE_BYTES) {
    throw new VintagePokemonArtworkError(
      "TCGdex card metadata was unexpectedly large.",
    );
  }

  try {
    return parseTcgDexCard(JSON.parse(text));
  } catch (error) {
    if (error instanceof VintagePokemonArtworkError) throw error;
    throw new VintagePokemonArtworkError("TCGdex returned malformed JSON.");
  }
}

export async function resolveVintagePokemonArtwork(
  identity: VintagePokemonArtworkIdentity,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { fetchImpl?: ArtworkFetch; timeoutMs?: number } = {},
): Promise<VintagePokemonArtwork | null> {
  if (
    normalizedIdentityPart(identity.gameSlug) !== "pokemon-tcg" ||
    normalizedIdentityPart(identity.languageCode) !== "en"
  ) {
    return null;
  }

  const set = vintageSetIdentity(identity);
  const collector = collectorIdentity(identity.collectorNumber);
  if (!set || !collector || collector.printedTotal !== set.printedTotal) {
    return null;
  }

  const expectedCardId = `${set.tcgdexId}-${collector.number}`;
  const card = await fetchTcgDexCard(
    tcgdexCardUrl(expectedCardId),
    fetchImpl,
    timeoutMs,
  );
  if (!card) return null;

  if (
    card.id !== expectedCardId ||
    card.localId !== collector.number ||
    card.setId !== set.tcgdexId ||
    normalizedIdentityPart(card.setName) !== set.name ||
    card.printedTotal !== set.printedTotal
  ) {
    return null;
  }

  const variant = selectPrintingVariant(
    card.variants,
    identity.printingVariantKey,
  );
  if (!variant) return null;

  const productId = exactTcgplayerProductId(
    card,
    variant,
    identity.printingVariantKey,
  );
  if (!productId) return null;

  const url = await verifiedTcgplayerImageUrl(productId, fetchImpl, timeoutMs);
  if (!url) return null;

  return {
    url,
    provider: VINTAGE_POKEMON_ARTWORK_PROVIDER,
    externalId: `${card.id}/${variant.variantId}/tcgplayer-${productId}`,
  };
}

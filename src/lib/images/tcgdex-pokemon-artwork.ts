import { isTcgDexCardImageUrl } from "@/lib/security/card-image-policy";

import type { ArtworkFetch } from "./official-pokemon-artwork";
import {
  createTcgCsvPokemonClient,
  TCGCSV_TCGPLAYER_ARTWORK_PROVIDER,
  type TcgCsvPokemonClient,
} from "./tcgcsv-pokemon-artwork";
import {
  exactTcgplayerProductId,
  TCGDEX_TCGPLAYER_ARTWORK_PROVIDER,
  verifiedTcgplayerImageUrl,
} from "./tcgplayer-card-image";

export const TCGDEX_POKEMON_ARTWORK_PROVIDER = "tcgdex";
export const TCGDEX_API_ORIGIN = "https://api.tcgdex.net";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CARD_RESPONSE_BYTES = 500_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type TcgDexPokemonArtworkIdentity = {
  gameSlug: string;
  languageCode: string;
  printingVariantKey: string;
  catalogProvider: string | null;
  catalogSetId: string | null;
  catalogCardId: string | null;
  canonicalName?: string | null;
  rarity?: string | null;
  hp?: number | null;
  stage?: string | null;
  pokemonType?: string | null;
};

export type TcgDexPokemonArtwork = {
  url: string;
  provider:
    | typeof TCGDEX_POKEMON_ARTWORK_PROVIDER
    | typeof TCGDEX_TCGPLAYER_ARTWORK_PROVIDER
    | typeof TCGCSV_TCGPLAYER_ARTWORK_PROVIDER;
  externalId: string;
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
  image: string | null;
  setId: string;
  variants: TcgDexVariant[];
  rarity: string | null;
  hp: number | null;
  stage: string | null;
  pokemonType: string | null;
};

export class TcgDexPokemonArtworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TcgDexPokemonArtworkError";
  }
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new TcgDexPokemonArtworkError(
      `TCGdex returned invalid ${field} metadata.`,
    );
  }
  return value;
}

function requiredIdentifier(value: unknown, field: string): string {
  return typeof value === "string" || typeof value === "number"
    ? requiredString(String(value), field)
    : requiredString(value, field);
}

function optionalPositiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "string" && /^\d+$/u.test(value.trim())
      ? Number(value)
      : value;
  return Number.isSafeInteger(parsed) && Number(parsed) > 0
    ? Number(parsed)
    : null;
}

function uniquePokemonType(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const types = new Map<string, string>();
  for (const candidate of value) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const type = candidate.trim();
    types.set(normalized(type), type);
  }
  return types.size === 1 ? (types.values().next().value ?? null) : null;
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
    throw new TcgDexPokemonArtworkError(
      "TCGdex returned an invalid card record.",
    );
  }

  return {
    id: requiredString(value.id, "card ID"),
    localId: requiredIdentifier(value.localId, "local ID"),
    image: typeof value.image === "string" ? value.image : null,
    setId: requiredString(value.set.id, "set ID"),
    variants: Array.isArray(value.variants_detailed)
      ? value.variants_detailed
          .map(parseVariant)
          .filter((variant): variant is TcgDexVariant => variant !== null)
      : [],
    rarity: typeof value.rarity === "string" ? value.rarity : null,
    hp: optionalPositiveInteger(value.hp),
    stage: typeof value.stage === "string" ? value.stage : null,
    pokemonType: uniquePokemonType(value.types),
  };
}

function exactVariant(
  variants: TcgDexVariant[],
  printingVariantKey: string,
): TcgDexVariant | null {
  const standardSize = variants.filter(
    (variant) => variant.size === undefined || variant.size === "standard",
  );
  const key = normalized(printingVariantKey);
  if (key === "standard") {
    const matches = standardSize.filter(
      (variant) => variant.subtype === undefined && variant.stamps.length === 0,
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  const exactMatches = standardSize.filter(
    (variant) =>
      normalized(variant.subtype ?? "") === key ||
      variant.stamps.some((stamp) => normalized(stamp) === key),
  );
  if (exactMatches.length > 0) {
    return exactMatches.length === 1 ? (exactMatches[0] ?? null) : null;
  }

  if (!/^lv-?\d+$/u.test(key)) return null;

  const soleVariant = standardSize[0];
  return standardSize.length === 1 &&
    soleVariant !== undefined &&
    soleVariant.subtype === undefined &&
    soleVariant.stamps.length === 0
    ? soleVariant
    : null;
}

function cardApiUrl(languageCode: string, cardId: string): string {
  return `${TCGDEX_API_ORIGIN}/v2/${languageCode}/cards/${cardId}`;
}

export function isTcgDexCardApiUrl(value: string): boolean {
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

function exactImageUrl(
  imageBase: string,
  languageCode: string,
  setId: string,
  localId: string,
): string | null {
  const url = `${imageBase.replace(/\/$/u, "")}/high.webp`;
  if (!isTcgDexCardImageUrl(url)) return null;

  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return normalized(parts[0] ?? "") === normalized(languageCode) &&
    normalized(parts[2] ?? "") === normalized(setId) &&
    normalized(parts[3] ?? "") === normalized(localId)
    ? url
    : null;
}

async function fetchCard(
  url: string,
  fetchImpl: ArtworkFetch,
  timeoutMs: number,
): Promise<TcgDexCard | null> {
  if (!isTcgDexCardApiUrl(url)) {
    throw new TcgDexPokemonArtworkError(
      "TCGdex artwork lookup requires a constrained card URL.",
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
    throw new TcgDexPokemonArtworkError(
      "TCGdex metadata unexpectedly redirected.",
    );
  }
  if (!response.ok) {
    throw new TcgDexPokemonArtworkError(
      `TCGdex returned HTTP ${response.status}.`,
    );
  }
  if (
    !response.headers
      .get("content-type")
      ?.toLocaleLowerCase("en-US")
      .startsWith("application/json")
  ) {
    throw new TcgDexPokemonArtworkError("TCGdex did not return JSON.");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CARD_RESPONSE_BYTES
  ) {
    throw new TcgDexPokemonArtworkError(
      "TCGdex card metadata was unexpectedly large.",
    );
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CARD_RESPONSE_BYTES) {
    throw new TcgDexPokemonArtworkError(
      "TCGdex card metadata was unexpectedly large.",
    );
  }

  try {
    return parseCard(JSON.parse(text));
  } catch (error) {
    if (error instanceof TcgDexPokemonArtworkError) throw error;
    throw new TcgDexPokemonArtworkError("TCGdex returned malformed JSON.");
  }
}

export async function resolveTcgDexPokemonArtwork(
  identity: TcgDexPokemonArtworkIdentity,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    tcgCsvClient,
  }: {
    fetchImpl?: ArtworkFetch;
    timeoutMs?: number;
    tcgCsvClient?: TcgCsvPokemonClient;
  } = {},
): Promise<TcgDexPokemonArtwork | null> {
  if (
    normalized(identity.gameSlug) !== "pokemon-tcg" ||
    normalized(identity.catalogProvider ?? "") !== "tcgdex" ||
    !identity.catalogSetId ||
    !identity.catalogCardId
  ) {
    return null;
  }

  const languageCode = normalized(identity.languageCode);
  const card = await fetchCard(
    cardApiUrl(languageCode, identity.catalogCardId),
    fetchImpl,
    timeoutMs,
  );
  if (
    !card ||
    normalized(card.id) !== normalized(identity.catalogCardId) ||
    normalized(card.setId) !== normalized(identity.catalogSetId)
  ) {
    return null;
  }

  const variant = exactVariant(card.variants, identity.printingVariantKey);
  if (!variant) return null;
  if (card.image) {
    const url = exactImageUrl(
      card.image,
      languageCode,
      card.setId,
      card.localId,
    );
    if (!url) return null;

    return {
      url,
      provider: TCGDEX_POKEMON_ARTWORK_PROVIDER,
      externalId: `${languageCode}/${card.id}/${variant.variantId}`,
    };
  }

  if (languageCode !== "ja") return null;
  const productId = exactTcgplayerProductId(variant.pricing);
  if (productId) {
    const url = await verifiedTcgplayerImageUrl(
      productId,
      fetchImpl,
      timeoutMs,
    );
    if (url) {
      return {
        url,
        provider: TCGDEX_TCGPLAYER_ARTWORK_PROVIDER,
        externalId: `${languageCode}/${card.id}/${variant.variantId}/tcgplayer-${productId}`,
      };
    }
  }

  const tcgCsvProduct = await (
    tcgCsvClient ?? createTcgCsvPokemonClient({ fetchImpl, timeoutMs })
  ).resolveProduct({
    catalogSetId: card.setId,
    printingVariantKey: identity.printingVariantKey,
    canonicalName: identity.canonicalName,
    localRarity: identity.rarity,
    localHp: identity.hp,
    localStage: identity.stage,
    localPokemonType: identity.pokemonType,
    tcgDexRarity: card.rarity,
    tcgDexHp: card.hp,
    tcgDexStage: card.stage,
    tcgDexPokemonType: card.pokemonType,
  });
  if (!tcgCsvProduct) return null;
  const url = await verifiedTcgplayerImageUrl(
    tcgCsvProduct.productId,
    fetchImpl,
    timeoutMs,
  );
  if (!url) return null;

  return {
    url,
    provider: TCGCSV_TCGPLAYER_ARTWORK_PROVIDER,
    externalId: `${languageCode}/${card.id}/${variant.variantId}/tcgcsv-${tcgCsvProduct.categoryId}-${tcgCsvProduct.groupId}/tcgplayer-${tcgCsvProduct.productId}`,
  };
}

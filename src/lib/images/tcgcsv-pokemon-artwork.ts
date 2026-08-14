import type { ArtworkFetch } from "./official-pokemon-artwork";

export const TCGCSV_API_ORIGIN = "https://tcgcsv.com";
export const TCGCSV_TCGPLAYER_ARTWORK_PROVIDER = "tcgcsv-tcgplayer";
export const TCGCSV_POKEMON_JAPAN_CATEGORY_ID = 85;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_INTERVAL_MS = 250;
const MAX_PRODUCTS_RESPONSE_BYTES = 2_000_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const TCGCSV_JAPANESE_VINTAGE_GROUPS = [
  {
    setId: "PMCG1",
    printingVariantKey: "standard",
    groupId: 23721,
    groupName: "Expansion Pack",
  },
  {
    setId: "PMCG1",
    printingVariantKey: "no-rarity",
    groupId: 23740,
    groupName: "Expansion Pack (No Rarity)",
  },
  {
    setId: "PMCG2",
    printingVariantKey: "exact TCGdex variant",
    groupId: 23722,
    groupName: "Pokemon Jungle",
  },
  {
    setId: "PMCG4",
    printingVariantKey: "exact TCGdex variant",
    groupId: 23724,
    groupName: "Rocket Gang",
  },
  {
    setId: "PMCG6",
    printingVariantKey: "exact TCGdex variant",
    groupId: 23726,
    groupName: "Challenge from the Darkness",
  },
] as const;

export type TcgCsvPokemonProductIdentity = {
  catalogSetId: string;
  printingVariantKey: string;
  canonicalName: string | null | undefined;
  localRarity?: string | null;
  localHp?: number | null;
  localStage?: string | null;
  localPokemonType?: string | null;
  tcgDexRarity?: string | null;
  tcgDexHp?: number | null;
  tcgDexStage?: string | null;
  tcgDexPokemonType?: string | null;
};

export type TcgCsvPokemonProductMatch = {
  categoryId: typeof TCGCSV_POKEMON_JAPAN_CATEGORY_ID;
  groupId: number;
  productId: number;
};

export type TcgCsvPokemonClient = {
  resolveProduct(
    identity: TcgCsvPokemonProductIdentity,
  ): Promise<TcgCsvPokemonProductMatch | null>;
};

type TcgCsvProduct = {
  productId: number;
  name: string | null;
  cleanName: string | null;
  imageUrl: string | null;
  categoryId: number | null;
  groupId: number | null;
  rarity: string | null;
  hp: number | null;
  stage: string | null;
  pokemonType: string | null;
};

export class TcgCsvPokemonArtworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TcgCsvPokemonArtworkError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedIdentifier(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function normalizedProviderText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function normalizedPokemonStage(value: string): string {
  const normalized = normalizedProviderText(value);
  const compact = normalized.replace(/\s+/gu, "");
  if (compact === "basic") return "basic";
  if (compact === "stage1") return "stage1";
  if (compact === "stage2") return "stage2";
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAcceptedJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  return mediaType === "application/json" || mediaType === "text/json";
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function positiveIntegerFact(value: unknown): number | null {
  const parsed =
    typeof value === "string" && /^\d+$/u.test(value.trim())
      ? Number(value)
      : value;
  return Number.isSafeInteger(parsed) && Number(parsed) > 0
    ? Number(parsed)
    : null;
}

function groupIdFor(setId: string, printingVariantKey: string): number | null {
  const normalizedSet = normalizedIdentifier(setId).toLocaleUpperCase("en-US");
  const variant = normalizedIdentifier(printingVariantKey);
  if (normalizedSet === "PMCG1") {
    if (variant === "standard") return 23721;
    if (variant === "no-rarity") return 23740;
    return null;
  }
  if (normalizedSet === "PMCG2") return 23722;
  if (normalizedSet === "PMCG4") return 23724;
  if (normalizedSet === "PMCG6") return 23726;
  return null;
}

function productsUrl(groupId: number): string {
  return `${TCGCSV_API_ORIGIN}/tcgplayer/${TCGCSV_POKEMON_JAPAN_CATEGORY_ID}/${groupId}/products`;
}

export function isTcgCsvProductsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === TCGCSV_API_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/tcgplayer\/85\/[1-9]\d*\/products$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function extendedData(value: unknown): Map<string, string> {
  const fields = new Map<string, string>();
  if (!Array.isArray(value)) return fields;
  for (const item of value) {
    if (!isRecord(item) || typeof item.value !== "string") continue;
    const fieldName =
      typeof item.name === "string"
        ? item.name
        : typeof item.displayName === "string"
          ? item.displayName
          : null;
    if (!fieldName || !item.value.trim()) continue;
    fields.set(normalizedIdentifier(fieldName), item.value.trim());
  }
  return fields;
}

function parseProduct(value: unknown): TcgCsvProduct | null {
  if (!isRecord(value)) return null;
  const productId = positiveInteger(value.productId);
  if (!productId) return null;
  const fields = extendedData(value.extendedData);

  return {
    productId,
    name: typeof value.name === "string" ? optionalText(value.name) : null,
    cleanName:
      typeof value.cleanName === "string"
        ? optionalText(value.cleanName)
        : null,
    imageUrl:
      typeof value.imageUrl === "string" ? optionalText(value.imageUrl) : null,
    categoryId: positiveInteger(value.categoryId),
    groupId: positiveInteger(value.groupId),
    rarity: optionalText(fields.get("rarity")),
    hp: positiveIntegerFact(fields.get("hp")),
    stage: optionalText(fields.get("stage")),
    pokemonType: optionalText(fields.get("cardtype")),
  };
}

function parseProducts(value: unknown): TcgCsvProduct[] {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.results)
  ) {
    throw new TcgCsvPokemonArtworkError(
      "TCGCSV returned an invalid products record.",
    );
  }
  return value.results
    .map(parseProduct)
    .filter((product): product is TcgCsvProduct => product !== null);
}

async function fetchProducts(
  groupId: number,
  fetchImpl: ArtworkFetch,
  timeoutMs: number,
): Promise<TcgCsvProduct[]> {
  const url = productsUrl(groupId);
  if (!isTcgCsvProductsUrl(url)) {
    throw new TcgCsvPokemonArtworkError(
      "TCGCSV lookup requires a constrained products URL.",
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
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new TcgCsvPokemonArtworkError(
      "TCGCSV products metadata unexpectedly redirected.",
    );
  }
  if (!response.ok) {
    throw new TcgCsvPokemonArtworkError(
      `TCGCSV returned HTTP ${response.status}.`,
    );
  }
  if (!isAcceptedJsonMediaType(response.headers.get("content-type"))) {
    throw new TcgCsvPokemonArtworkError("TCGCSV did not return JSON.");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PRODUCTS_RESPONSE_BYTES
  ) {
    throw new TcgCsvPokemonArtworkError(
      "TCGCSV products metadata was unexpectedly large.",
    );
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PRODUCTS_RESPONSE_BYTES) {
    throw new TcgCsvPokemonArtworkError(
      "TCGCSV products metadata was unexpectedly large.",
    );
  }

  try {
    return parseProducts(JSON.parse(text));
  } catch (error) {
    if (error instanceof TcgCsvPokemonArtworkError) throw error;
    throw new TcgCsvPokemonArtworkError("TCGCSV returned malformed JSON.");
  }
}

type ReconciledFact<T> = { conflict: boolean; value: T | null };

function reconcileTextFact(
  local: string | null | undefined,
  catalog: string | null | undefined,
): ReconciledFact<string> {
  const localValue = optionalText(local);
  const catalogValue = optionalText(catalog);
  return {
    conflict:
      localValue !== null &&
      catalogValue !== null &&
      normalizedProviderText(localValue) !==
        normalizedProviderText(catalogValue),
    value: localValue ?? catalogValue,
  };
}

function reconcileStageFact(
  local: string | null | undefined,
  catalog: string | null | undefined,
): ReconciledFact<string> {
  const localValue = optionalText(local);
  const catalogValue = optionalText(catalog);
  return {
    conflict:
      localValue !== null &&
      catalogValue !== null &&
      normalizedPokemonStage(localValue) !==
        normalizedPokemonStage(catalogValue),
    value: localValue ?? catalogValue,
  };
}

function reconcileHpFact(
  local: number | null | undefined,
  catalog: number | null | undefined,
): ReconciledFact<number> {
  const localValue = positiveIntegerFact(local);
  const catalogValue = positiveIntegerFact(catalog);
  return {
    conflict:
      localValue !== null &&
      catalogValue !== null &&
      localValue !== catalogValue,
    value: localValue ?? catalogValue,
  };
}

function exactTextMatch(left: string, right: string): boolean {
  return normalizedProviderText(left) === normalizedProviderText(right);
}

function exactPokemonStageMatch(left: string, right: string): boolean {
  return normalizedPokemonStage(left) === normalizedPokemonStage(right);
}

function raritySuffix(value: string): "common" | "uncommon" | null {
  const match = value
    .normalize("NFKC")
    .trim()
    .match(/\(([cu])\)$/iu);
  if (!match) return null;
  return match[1]?.toLocaleLowerCase("en-US") === "c" ? "common" : "uncommon";
}

function withoutRaritySuffix(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s*\([cu]\)$/iu, "");
}

function productNameMatches(
  product: TcgCsvProduct,
  canonicalName: string,
  expectedRarity: string | null,
): boolean {
  const names = [product.name, product.cleanName].filter(
    (name): name is string => name !== null,
  );
  const suffixes = names.map(raritySuffix).filter((suffix) => suffix !== null);
  if (suffixes.length > 0) {
    if (
      !expectedRarity ||
      !product.rarity ||
      !exactTextMatch(product.rarity, expectedRarity) ||
      suffixes.some((suffix) => !exactTextMatch(suffix, expectedRarity))
    ) {
      return false;
    }
  }

  return names.some((name) =>
    exactTextMatch(
      raritySuffix(name) ? withoutRaritySuffix(name) : name,
      canonicalName,
    ),
  );
}

function candidateMatches(
  product: TcgCsvProduct,
  categoryId: number,
  groupId: number,
  canonicalName: string,
  rarity: string | null,
  hp: number | null,
  stage: string | null,
  pokemonType: string | null,
): boolean {
  if (
    (product.categoryId !== null && product.categoryId !== categoryId) ||
    (product.groupId !== null && product.groupId !== groupId) ||
    !productNameMatches(product, canonicalName, rarity)
  ) {
    return false;
  }
  if (rarity && (!product.rarity || !exactTextMatch(product.rarity, rarity))) {
    return false;
  }
  if (hp !== null && product.hp !== hp) return false;
  if (stage && product.stage && !exactPokemonStageMatch(product.stage, stage)) {
    return false;
  }
  if (
    pokemonType &&
    product.pokemonType &&
    !exactTextMatch(product.pokemonType, pokemonType)
  ) {
    return false;
  }
  return true;
}

type ReconciledIdentity = {
  canonicalName: string;
  rarity: string | null;
  hp: number | null;
  stage: string | null;
  pokemonType: string | null;
};

function reconciledIdentity(
  identity: TcgCsvPokemonProductIdentity,
): ReconciledIdentity | null {
  const canonicalName = optionalText(identity.canonicalName);
  if (!canonicalName) return null;

  const rarity = reconcileTextFact(identity.localRarity, identity.tcgDexRarity);
  const hp = reconcileHpFact(identity.localHp, identity.tcgDexHp);
  const stage = reconcileStageFact(identity.localStage, identity.tcgDexStage);
  const pokemonType = reconcileTextFact(
    identity.localPokemonType,
    identity.tcgDexPokemonType,
  );
  if (
    rarity.conflict ||
    hp.conflict ||
    stage.conflict ||
    pokemonType.conflict
  ) {
    return null;
  }
  return {
    canonicalName,
    rarity: rarity.value,
    hp: hp.value,
    stage: stage.value,
    pokemonType: pokemonType.value,
  };
}

function matchingProduct(
  identity: ReconciledIdentity,
  groupId: number,
  products: TcgCsvProduct[],
): TcgCsvPokemonProductMatch | null {
  const matches = products.filter((product) =>
    candidateMatches(
      product,
      TCGCSV_POKEMON_JAPAN_CATEGORY_ID,
      groupId,
      identity.canonicalName,
      identity.rarity,
      identity.hp,
      identity.stage,
      identity.pokemonType,
    ),
  );
  if (matches.length !== 1) return null;

  return {
    categoryId: TCGCSV_POKEMON_JAPAN_CATEGORY_ID,
    groupId,
    productId: matches[0]!.productId,
  };
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

export function createTcgCsvPokemonClient({
  fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  fetchImpl?: ArtworkFetch;
  timeoutMs?: number;
} = {}): TcgCsvPokemonClient {
  const productsByGroup = new Map<number, TcgCsvProduct[]>();
  const pendingByGroup = new Map<number, Promise<TcgCsvProduct[]>>();
  let requestQueue = Promise.resolve();
  let lastRequestStartedAt: number | null = null;

  const loadProducts = (groupId: number): Promise<TcgCsvProduct[]> => {
    const cached = productsByGroup.get(groupId);
    if (cached) return Promise.resolve(cached);
    const pending = pendingByGroup.get(groupId);
    if (pending) return pending;

    const request = requestQueue.then(async () => {
      if (lastRequestStartedAt !== null) {
        const remaining =
          DEFAULT_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt);
        await wait(remaining);
      }
      lastRequestStartedAt = Date.now();
      return fetchProducts(groupId, fetchImpl, timeoutMs);
    });
    requestQueue = request.then(
      () => undefined,
      () => undefined,
    );
    const cacheable = request.then((products) => {
      productsByGroup.set(groupId, products);
      return products;
    });
    pendingByGroup.set(groupId, cacheable);
    const clearPending = (): void => {
      if (pendingByGroup.get(groupId) === cacheable) {
        pendingByGroup.delete(groupId);
      }
    };
    void cacheable.then(clearPending, clearPending);
    return cacheable;
  };

  return {
    async resolveProduct(identity) {
      const reconciled = reconciledIdentity(identity);
      const groupId = groupIdFor(
        identity.catalogSetId,
        identity.printingVariantKey,
      );
      if (!reconciled || !groupId) return null;
      const products = await loadProducts(groupId);
      return matchingProduct(reconciled, groupId, products);
    },
  };
}

export async function resolveTcgCsvPokemonProduct(
  identity: TcgCsvPokemonProductIdentity,
  options: {
    fetchImpl?: ArtworkFetch;
    timeoutMs?: number;
  } = {},
): Promise<TcgCsvPokemonProductMatch | null> {
  return createTcgCsvPokemonClient(options).resolveProduct(identity);
}

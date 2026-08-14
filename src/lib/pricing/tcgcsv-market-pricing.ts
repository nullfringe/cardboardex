import { TCGCSV_JAPANESE_VINTAGE_GROUPS } from "@/lib/images/tcgcsv-pokemon-artwork";
import { decimalPriceToMinor } from "@/lib/pricing/money";

export const TCGCSV_API_ORIGIN = "https://tcgcsv.com";
export const TCGCSV_TCGPLAYER_PRICE_PROVIDER = "tcgcsv-tcgplayer";

const POKEMON_CATEGORY_ID = 3;
const POKEMON_JAPAN_CATEGORY_ID = 85;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_INTERVAL_MS = 250;
const MAX_GROUPS_RESPONSE_BYTES = 1_000_000;
const MAX_PRODUCTS_RESPONSE_BYTES = 3_000_000;
const MAX_PRICES_RESPONSE_BYTES = 3_000_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type MarketPriceFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export type TcgCsvMarketPriceIdentity = {
  gameSlug: string;
  languageCode: string;
  setCode: string;
  setName: string;
  catalogSetId?: string | null;
  name: string;
  canonicalName?: string | null;
  collectorNumber: string | null;
  printingVariantKey: string;
  printingFinish: string | null;
  rarity?: string | null;
  exactTcgplayerProductId?: number | null;
};

export type TcgCsvMarketPrice = {
  provider: typeof TCGCSV_TCGPLAYER_PRICE_PROVIDER;
  providerProductId: string;
  providerVariant: string;
  currency: "USD";
  marketPriceMinor: number | null;
  lowPriceMinor: number | null;
  midPriceMinor: number | null;
  highPriceMinor: number | null;
  directLowPriceMinor: number | null;
  sourceUrl: string | null;
  sourceUpdatedAt: null;
};

export type TcgCsvMarketPricingClient = {
  resolvePrice(
    identity: TcgCsvMarketPriceIdentity,
  ): Promise<TcgCsvMarketPrice | null>;
};

type TcgCsvGroup = {
  categoryId: number;
  groupId: number;
  name: string;
  abbreviation: string;
};

type TcgCsvProduct = {
  categoryId: number | null;
  groupId: number | null;
  productId: number;
  name: string | null;
  cleanName: string | null;
  url: string | null;
  collectorNumber: string | null;
  rarity: string | null;
};

type TcgCsvPrice = {
  productId: number;
  subTypeName: string;
  marketPriceMinor: number | null;
  lowPriceMinor: number | null;
  midPriceMinor: number | null;
  highPriceMinor: number | null;
  directLowPriceMinor: number | null;
};

export class TcgCsvMarketPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TcgCsvMarketPricingError";
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

function compactIdentifier(value: string): string {
  return normalizedText(value).replace(/\s+/gu, "");
}

function normalizedCollectorNumber(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .split("/")
    .map((part) => {
      const trimmed = part.trim();
      return /^\d+$/u.test(trimmed)
        ? String(Number(trimmed))
        : compactIdentifier(trimmed);
    })
    .join("/");
}

function isAcceptedJsonMediaType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  return mediaType === "application/json" || mediaType === "text/json";
}

function categoryIdForLanguage(languageCode: string): number | null {
  switch (normalizedText(languageCode)) {
    case "en":
      return POKEMON_CATEGORY_ID;
    case "ja":
      return POKEMON_JAPAN_CATEGORY_ID;
    default:
      return null;
  }
}

function groupsUrl(categoryId: number): string {
  return `${TCGCSV_API_ORIGIN}/tcgplayer/${categoryId}/groups`;
}

function productsUrl(categoryId: number, groupId: number): string {
  return `${TCGCSV_API_ORIGIN}/tcgplayer/${categoryId}/${groupId}/products`;
}

function pricesUrl(categoryId: number, groupId: number): string {
  return `${TCGCSV_API_ORIGIN}/tcgplayer/${categoryId}/${groupId}/prices`;
}

export function isTcgCsvMarketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === TCGCSV_API_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/tcgplayer\/(?:3|85)(?:\/groups|\/[1-9]\d*\/(?:products|prices))$/u.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}

function trustedProductUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "www.tcgplayer.com" ||
        url.hostname === "tcgplayer.com") &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function extendedData(value: unknown): Map<string, string> {
  const fields = new Map<string, string>();
  if (!Array.isArray(value)) return fields;
  for (const item of value) {
    if (!isRecord(item) || typeof item.value !== "string") continue;
    const key =
      typeof item.name === "string"
        ? item.name
        : typeof item.displayName === "string"
          ? item.displayName
          : null;
    if (key && item.value.trim()) {
      fields.set(normalizedText(key), item.value.trim());
    }
  }
  return fields;
}

function parseGroups(value: unknown, categoryId: number): TcgCsvGroup[] {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.results)
  ) {
    throw new TcgCsvMarketPricingError(
      "TCGCSV returned invalid group metadata.",
    );
  }

  return value.results.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const groupId = positiveInteger(candidate.groupId);
    const groupCategoryId = positiveInteger(candidate.categoryId) ?? categoryId;
    const name = optionalText(candidate.name);
    const abbreviation = optionalText(candidate.abbreviation);
    return groupId && groupCategoryId === categoryId && name && abbreviation
      ? [{ categoryId, groupId, name, abbreviation }]
      : [];
  });
}

function parseProducts(value: unknown): TcgCsvProduct[] {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.results)
  ) {
    throw new TcgCsvMarketPricingError(
      "TCGCSV returned invalid product metadata.",
    );
  }

  return value.results.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const productId = positiveInteger(candidate.productId);
    if (!productId) return [];
    const fields = extendedData(candidate.extendedData);
    return [
      {
        productId,
        categoryId: positiveInteger(candidate.categoryId),
        groupId: positiveInteger(candidate.groupId),
        name: optionalText(candidate.name),
        cleanName: optionalText(candidate.cleanName),
        url: trustedProductUrl(candidate.url),
        collectorNumber:
          optionalText(fields.get("number")) ??
          optionalText(fields.get("card number")),
        rarity: optionalText(fields.get("rarity")),
      },
    ];
  });
}

function parsePrices(value: unknown): TcgCsvPrice[] {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.results)
  ) {
    throw new TcgCsvMarketPricingError(
      "TCGCSV returned invalid price metadata.",
    );
  }

  return value.results.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const productId = positiveInteger(candidate.productId);
    const subTypeName = optionalText(candidate.subTypeName);
    if (!productId || !subTypeName) return [];
    const price = {
      productId,
      subTypeName,
      marketPriceMinor: decimalPriceToMinor(candidate.marketPrice),
      lowPriceMinor: decimalPriceToMinor(candidate.lowPrice),
      midPriceMinor: decimalPriceToMinor(candidate.midPrice),
      highPriceMinor: decimalPriceToMinor(candidate.highPrice),
      directLowPriceMinor: decimalPriceToMinor(candidate.directLowPrice),
    };
    return [
      price.marketPriceMinor,
      price.lowPriceMinor,
      price.midPriceMinor,
      price.highPriceMinor,
      price.directLowPriceMinor,
    ].some((item) => item !== null)
      ? [price]
      : [];
  });
}

async function fetchJson(
  url: string,
  fetchImpl: MarketPriceFetch,
  timeoutMs: number,
  maximumBytes: number,
): Promise<unknown> {
  if (!isTcgCsvMarketUrl(url)) {
    throw new TcgCsvMarketPricingError(
      "TCGCSV pricing requires a constrained market-data URL.",
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
    throw new TcgCsvMarketPricingError(
      "TCGCSV pricing metadata unexpectedly redirected.",
    );
  }
  if (!response.ok) {
    throw new TcgCsvMarketPricingError(
      `TCGCSV pricing returned HTTP ${response.status}.`,
    );
  }
  if (!isAcceptedJsonMediaType(response.headers.get("content-type"))) {
    throw new TcgCsvMarketPricingError("TCGCSV pricing did not return JSON.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new TcgCsvMarketPricingError(
      "TCGCSV pricing metadata was unexpectedly large.",
    );
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new TcgCsvMarketPricingError(
      "TCGCSV pricing metadata was unexpectedly large.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TcgCsvMarketPricingError(
      "TCGCSV pricing returned malformed JSON.",
    );
  }
}

function prizePackSeries(printingVariantKey: string): string | null {
  const match = /^play-pokemon-prize-pack-series-(.+)-right-stamp$/u.exec(
    printingVariantKey.normalize("NFKC").trim().toLocaleLowerCase("en-US"),
  );
  return match?.[1] ? normalizedText(match[1]) : null;
}

function normalizedGroupName(group: TcgCsvGroup): string {
  const name = normalizedText(group.name);
  const abbreviation = normalizedText(group.abbreviation);
  return name.startsWith(`${abbreviation} `)
    ? name.slice(abbreviation.length + 1)
    : name;
}

function selectEnglishGroup(
  groups: TcgCsvGroup[],
  identity: TcgCsvMarketPriceIdentity,
): TcgCsvGroup | null {
  const series = prizePackSeries(identity.printingVariantKey);
  if (series) {
    const phrase = `prize pack series ${series}`;
    const matches = groups.filter((group) =>
      normalizedText(group.name).includes(phrase),
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  const code = compactIdentifier(identity.setCode);
  const setName = normalizedText(identity.setName);
  const strong = groups.filter(
    (group) =>
      compactIdentifier(group.abbreviation) === code &&
      normalizedGroupName(group) === setName,
  );
  if (strong.length === 1) return strong[0] ?? null;

  const byName = groups.filter(
    (group) => normalizedGroupName(group) === setName,
  );
  return byName.length === 1 ? (byName[0] ?? null) : null;
}

function japaneseVintageGroupId(
  identity: TcgCsvMarketPriceIdentity,
): number | null {
  const setId = compactIdentifier(identity.catalogSetId ?? identity.setCode);
  const variant = normalizedText(identity.printingVariantKey).replace(
    / /gu,
    "-",
  );
  const candidates = TCGCSV_JAPANESE_VINTAGE_GROUPS.filter((group) => {
    if (compactIdentifier(group.setId) !== setId) return false;
    if (compactIdentifier(group.setId) !== "pmcg1") return true;
    return group.printingVariantKey === variant;
  });
  return candidates.length === 1 ? (candidates[0]?.groupId ?? null) : null;
}

function productNames(product: TcgCsvProduct): string[] {
  return [product.name, product.cleanName].filter(
    (name): name is string => name !== null,
  );
}

function productNameMatches(
  product: TcgCsvProduct,
  identity: TcgCsvMarketPriceIdentity,
): boolean {
  const names = new Set(
    [identity.name, identity.canonicalName]
      .filter((name): name is string => Boolean(name?.trim()))
      .map(normalizedText),
  );
  return productNames(product).some((name) => names.has(normalizedText(name)));
}

function productVariantMatches(
  product: TcgCsvProduct,
  printingVariantKey: string,
): boolean {
  const variant = normalizedText(printingVariantKey).replace(/ /gu, "-");
  const name = normalizedText(productNames(product).join(" "));
  switch (variant) {
    case "standard":
    case "unlimited":
      return !/(?:1st|first) edition|shadowless|1999 2000|no rarity/u.test(
        name,
      );
    case "first-edition":
      return /(?:1st|first) edition/u.test(name);
    case "shadowless":
      return (
        name.includes("shadowless") && !/(?:1st|first) edition/u.test(name)
      );
    case "1999-2000-copyright":
      return name.includes("1999 2000");
    case "no-rarity":
      return true;
    default:
      return prizePackSeries(printingVariantKey) !== null;
  }
}

function selectProduct(
  products: TcgCsvProduct[],
  categoryId: number,
  groupId: number,
  identity: TcgCsvMarketPriceIdentity,
): TcgCsvProduct | null {
  const scoped = products.filter(
    (product) =>
      (product.categoryId === null || product.categoryId === categoryId) &&
      (product.groupId === null || product.groupId === groupId),
  );
  if (identity.exactTcgplayerProductId) {
    const exact = scoped.filter(
      (product) => product.productId === identity.exactTcgplayerProductId,
    );
    return exact.length === 1 ? (exact[0] ?? null) : null;
  }
  if (!identity.collectorNumber) return null;
  const collectorNumber = normalizedCollectorNumber(identity.collectorNumber);
  const rarity = identity.rarity ? normalizedText(identity.rarity) : null;
  const matches = scoped.filter(
    (product) =>
      productNameMatches(product, identity) &&
      product.collectorNumber !== null &&
      normalizedCollectorNumber(product.collectorNumber) === collectorNumber &&
      (!rarity ||
        !product.rarity ||
        normalizedText(product.rarity) === rarity) &&
      productVariantMatches(product, identity.printingVariantKey),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function desiredSubtype(printingFinish: string | null): string | null {
  if (!printingFinish?.trim()) return null;
  const finish = normalizedText(printingFinish);
  if (finish.includes("reverse")) return "reverse";
  if (finish.includes("non holo") || finish === "normal") return "normal";
  if (finish.includes("holo") || finish.includes("foil")) return "holo";
  return finish;
}

function subtypeMatches(actual: string, desired: string): boolean {
  const subtype = normalizedText(actual);
  switch (desired) {
    case "reverse":
      return subtype.includes("reverse");
    case "normal":
      return subtype === "normal" || subtype === "regular";
    case "holo":
      return (
        (subtype.includes("holo") || subtype === "foil") &&
        !subtype.includes("reverse")
      );
    default:
      return subtype === desired;
  }
}

function selectPrice(
  prices: TcgCsvPrice[],
  productId: number,
  printingFinish: string | null,
): TcgCsvPrice | null {
  const candidates = prices.filter((price) => price.productId === productId);
  const desired = desiredSubtype(printingFinish);
  if (!desired) {
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
  }
  const matches = candidates.filter((price) =>
    subtypeMatches(price.subTypeName, desired),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function wait(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

export function createTcgCsvMarketPricingClient({
  fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  requestIntervalMs = DEFAULT_REQUEST_INTERVAL_MS,
}: {
  fetchImpl?: MarketPriceFetch;
  timeoutMs?: number;
  requestIntervalMs?: number;
} = {}): TcgCsvMarketPricingClient {
  const groupsByCategory = new Map<number, TcgCsvGroup[]>();
  const productsByGroup = new Map<string, TcgCsvProduct[]>();
  const pricesByGroup = new Map<string, TcgCsvPrice[]>();
  let requestQueue = Promise.resolve();
  let lastRequestStartedAt: number | null = null;

  const queuedFetch = <T>(load: () => Promise<T>): Promise<T> => {
    const request = requestQueue.then(async () => {
      if (lastRequestStartedAt !== null) {
        await wait(requestIntervalMs - (Date.now() - lastRequestStartedAt));
      }
      lastRequestStartedAt = Date.now();
      return load();
    });
    requestQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  };

  const loadGroups = async (categoryId: number): Promise<TcgCsvGroup[]> => {
    const cached = groupsByCategory.get(categoryId);
    if (cached) return cached;
    const groups = await queuedFetch(async () =>
      parseGroups(
        await fetchJson(
          groupsUrl(categoryId),
          fetchImpl,
          timeoutMs,
          MAX_GROUPS_RESPONSE_BYTES,
        ),
        categoryId,
      ),
    );
    groupsByCategory.set(categoryId, groups);
    return groups;
  };

  const loadProducts = async (
    categoryId: number,
    groupId: number,
  ): Promise<TcgCsvProduct[]> => {
    const key = `${categoryId}/${groupId}`;
    const cached = productsByGroup.get(key);
    if (cached) return cached;
    const products = await queuedFetch(async () =>
      parseProducts(
        await fetchJson(
          productsUrl(categoryId, groupId),
          fetchImpl,
          timeoutMs,
          MAX_PRODUCTS_RESPONSE_BYTES,
        ),
      ),
    );
    productsByGroup.set(key, products);
    return products;
  };

  const loadPrices = async (
    categoryId: number,
    groupId: number,
  ): Promise<TcgCsvPrice[]> => {
    const key = `${categoryId}/${groupId}`;
    const cached = pricesByGroup.get(key);
    if (cached) return cached;
    const prices = await queuedFetch(async () =>
      parsePrices(
        await fetchJson(
          pricesUrl(categoryId, groupId),
          fetchImpl,
          timeoutMs,
          MAX_PRICES_RESPONSE_BYTES,
        ),
      ),
    );
    pricesByGroup.set(key, prices);
    return prices;
  };

  return {
    async resolvePrice(identity) {
      if (normalizedText(identity.gameSlug) !== "pokemon tcg") return null;
      const categoryId = categoryIdForLanguage(identity.languageCode);
      if (!categoryId) return null;

      let groupId: number | null;
      if (categoryId === POKEMON_JAPAN_CATEGORY_ID) {
        groupId = japaneseVintageGroupId(identity);
      } else {
        const group = selectEnglishGroup(
          await loadGroups(categoryId),
          identity,
        );
        groupId = group?.groupId ?? null;
      }
      if (!groupId) return null;

      const [products, prices] = await Promise.all([
        loadProducts(categoryId, groupId),
        loadPrices(categoryId, groupId),
      ]);
      const product = selectProduct(products, categoryId, groupId, identity);
      if (!product) return null;
      const price = selectPrice(
        prices,
        product.productId,
        identity.printingFinish,
      );
      if (!price) return null;

      return {
        provider: TCGCSV_TCGPLAYER_PRICE_PROVIDER,
        providerProductId: String(product.productId),
        providerVariant: price.subTypeName,
        currency: "USD",
        marketPriceMinor: price.marketPriceMinor,
        lowPriceMinor: price.lowPriceMinor,
        midPriceMinor: price.midPriceMinor,
        highPriceMinor: price.highPriceMinor,
        directLowPriceMinor: price.directLowPriceMinor,
        sourceUrl: product.url,
        sourceUpdatedAt: null,
      };
    },
  };
}

import {
  isOfficialPokemonCardImageUrl,
  OFFICIAL_POKEMON_CARD_IMAGE_ORIGIN,
} from "@/lib/security/card-image-policy";

export const OFFICIAL_POKEMON_ARTWORK_PROVIDER =
  "pokemon-official-card-database";
export const OFFICIAL_POKEMON_SOURCE_ORIGIN = "https://www.pokemon.com";

const SOURCE_PATH_PATTERN =
  /^\/us\/pokemon-tcg\/pokemon-cards\/series\/([a-z0-9]+)\/([a-z0-9-]+)\/?$/iu;
const IMAGE_PATH_PATTERN =
  /^\/static-assets\/content-assets\/cms2\/img\/cards\/web\/([^/]+)\/([^/]+)\.(?:jpe?g|png|webp)$/iu;
const META_TAG_PATTERN = /<meta\b[^>]*>/giu;
const ATTRIBUTE_PATTERN =
  /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu;

const MAX_REDIRECTS = 3;
const MAX_SOURCE_PAGE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export type ArtworkFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export type OfficialPokemonArtwork = {
  url: string;
  provider: typeof OFFICIAL_POKEMON_ARTWORK_PROVIDER;
  externalId: string;
};

type OfficialSourceIdentity = {
  setCode: string;
  cardNumber: string;
};

export class OfficialPokemonArtworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialPokemonArtworkError";
  }
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/giu,
    (entity) => {
      const normalized = entity.toLocaleLowerCase("en-US");
      const named = new Map([
        ["&amp;", "&"],
        ["&quot;", '"'],
        ["&apos;", "'"],
        ["&lt;", "<"],
        ["&gt;", ">"],
      ]);
      const namedValue = named.get(normalized);
      if (namedValue !== undefined) return namedValue;

      const radix = normalized.startsWith("&#x") ? 16 : 10;
      const digits = normalized.slice(radix === 16 ? 3 : 2, -1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isSafeInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();

  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLocaleLowerCase("en-US");
    const value = match[2] ?? match[3] ?? match[4];
    if (name && value !== undefined) {
      attributes.set(name, decodeHtmlAttribute(value));
    }
  }

  return attributes;
}

function officialSourceIdentity(value: string): OfficialSourceIdentity | null {
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(SOURCE_PATH_PATTERN);
    if (
      url.origin !== OFFICIAL_POKEMON_SOURCE_ORIGIN ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !pathMatch?.[1] ||
      !pathMatch[2]
    ) {
      return null;
    }

    return {
      setCode: pathMatch[1],
      cardNumber: pathMatch[2],
    };
  } catch {
    return null;
  }
}

export function isOfficialPokemonCardSourceUrl(value: string): boolean {
  return officialSourceIdentity(value) !== null;
}

function sameSourceIdentity(
  left: OfficialSourceIdentity,
  right: OfficialSourceIdentity,
): boolean {
  return (
    left.setCode.toLocaleLowerCase("en-US") ===
      right.setCode.toLocaleLowerCase("en-US") &&
    left.cardNumber.toLocaleLowerCase("en-US") ===
      right.cardNumber.toLocaleLowerCase("en-US")
  );
}

function artworkFromImageUrl(
  value: string,
  source: OfficialSourceIdentity,
): OfficialPokemonArtwork | null {
  if (!isOfficialPokemonCardImageUrl(value)) return null;

  const url = new URL(value);
  const pathMatch = url.pathname.match(IMAGE_PATH_PATTERN);
  const imageSetCode = pathMatch?.[1];
  const imageName = pathMatch?.[2];
  if (!imageSetCode || !imageName) return null;

  const expectedPrefix = `${imageSetCode}_EN_`;
  const imageCardNumber = imageName.startsWith(expectedPrefix)
    ? imageName.slice(expectedPrefix.length)
    : null;
  if (
    imageSetCode.toLocaleLowerCase("en-US") !==
      source.setCode.toLocaleLowerCase("en-US") ||
    imageCardNumber?.toLocaleLowerCase("en-US") !==
      source.cardNumber.toLocaleLowerCase("en-US")
  ) {
    return null;
  }

  return {
    url: url.toString(),
    provider: OFFICIAL_POKEMON_ARTWORK_PROVIDER,
    externalId: `${imageSetCode}/${imageName}`,
  };
}

function canonicalArtworkCandidate(
  source: OfficialSourceIdentity,
): OfficialPokemonArtwork {
  const setCode = source.setCode.toLocaleUpperCase("en-US");
  const imageName = `${setCode}_EN_${source.cardNumber}`;
  return {
    url: `${OFFICIAL_POKEMON_CARD_IMAGE_ORIGIN}/static-assets/content-assets/cms2/img/cards/web/${setCode}/${imageName}.png`,
    provider: OFFICIAL_POKEMON_ARTWORK_PROVIDER,
    externalId: `${setCode}/${imageName}`,
  };
}

export function parseOfficialPokemonArtwork(
  html: string,
  sourceUrl: string,
): OfficialPokemonArtwork | null {
  const source = officialSourceIdentity(sourceUrl);
  if (!source) return null;

  const candidates: string[] = [];
  for (const tag of html.matchAll(META_TAG_PATTERN)) {
    const attributes = parseAttributes(tag[0]);
    const key = (
      attributes.get("property") ?? attributes.get("name")
    )?.toLocaleLowerCase("en-US");
    const content = attributes.get("content");
    if (
      content &&
      (key === "og:image:secure_url" ||
        key === "og:image" ||
        key === "twitter:image")
    ) {
      candidates.push(content);
    }
  }

  for (const candidate of candidates) {
    const artwork = artworkFromImageUrl(candidate, source);
    if (artwork) return artwork;
  }

  return null;
}

function redirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

async function fetchOfficialSourcePage(
  sourceUrl: string,
  fetchImpl: ArtworkFetch,
  timeoutMs: number,
): Promise<{ html: string; sourceUrl: string }> {
  let currentUrl = sourceUrl;
  const expectedIdentity = officialSourceIdentity(sourceUrl);
  if (!expectedIdentity) {
    throw new OfficialPokemonArtworkError(
      "Artwork resolution requires an official Pokémon card-database URL.",
    );
  }

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const currentIdentity = officialSourceIdentity(currentUrl);
    if (
      !currentIdentity ||
      !sameSourceIdentity(expectedIdentity, currentIdentity)
    ) {
      throw new OfficialPokemonArtworkError(
        "Official Pokémon source redirected away from the requested printing.",
      );
    }

    const response = await fetchImpl(currentUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Cardboardex/0.1 (+https://github.com/nullfringe/cardboardex)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (redirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new OfficialPokemonArtworkError(
          "Official Pokémon source exceeded the redirect limit.",
        );
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new OfficialPokemonArtworkError(
        `Official Pokémon source returned HTTP ${response.status}.`,
      );
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.toLocaleLowerCase("en-US").startsWith("text/html")) {
      throw new OfficialPokemonArtworkError(
        "Official Pokémon source did not return HTML.",
      );
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_SOURCE_PAGE_BYTES
    ) {
      throw new OfficialPokemonArtworkError(
        "Official Pokémon source page was unexpectedly large.",
      );
    }

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_SOURCE_PAGE_BYTES) {
      throw new OfficialPokemonArtworkError(
        "Official Pokémon source page was unexpectedly large.",
      );
    }

    return { html, sourceUrl: currentUrl };
  }

  throw new OfficialPokemonArtworkError(
    "Official Pokémon source exceeded the redirect limit.",
  );
}

async function verifyOfficialArtworkCandidate(
  artwork: OfficialPokemonArtwork,
  fetchImpl: ArtworkFetch,
  timeoutMs: number,
): Promise<boolean> {
  if (!isOfficialPokemonCardImageUrl(artwork.url)) return false;

  const response = await fetchImpl(artwork.url, {
    headers: {
      accept: "image/*",
      "user-agent":
        "Cardboardex/0.1 (+https://github.com/nullfringe/cardboardex)",
    },
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers
    .get("content-type")
    ?.toLocaleLowerCase("en-US");

  return response.status === 200 && Boolean(contentType?.startsWith("image/"));
}

export async function resolveOfficialPokemonArtwork(
  sourceUrl: string,
  {
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { fetchImpl?: ArtworkFetch; timeoutMs?: number } = {},
): Promise<OfficialPokemonArtwork | null> {
  const source = officialSourceIdentity(sourceUrl);
  if (!source) {
    throw new OfficialPokemonArtworkError(
      "Artwork resolution requires an official Pokémon card-database URL.",
    );
  }

  let sourceError: unknown;
  try {
    const page = await fetchOfficialSourcePage(sourceUrl, fetchImpl, timeoutMs);
    const metadataArtwork = parseOfficialPokemonArtwork(
      page.html,
      page.sourceUrl,
    );
    if (metadataArtwork) return metadataArtwork;
  } catch (error) {
    sourceError = error;
  }

  const candidate = canonicalArtworkCandidate(source);
  try {
    if (await verifyOfficialArtworkCandidate(candidate, fetchImpl, timeoutMs)) {
      return candidate;
    }
  } catch (candidateError) {
    if (!sourceError) sourceError = candidateError;
  }

  if (sourceError) throw sourceError;
  return null;
}

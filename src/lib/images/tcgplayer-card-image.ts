import {
  isTcgplayerCardImageUrl,
  TCGPLAYER_CARD_IMAGE_ORIGIN,
} from "@/lib/security/card-image-policy";

import type { ArtworkFetch } from "./official-pokemon-artwork";

export const TCGDEX_TCGPLAYER_ARTWORK_PROVIDER = "tcgdex-tcgplayer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function tcgplayerProductIds(value: unknown): number[] {
  if (!isRecord(value)) return [];
  const found = new Set<number>();
  const visit = (candidate: unknown, depth: number): void => {
    if (!isRecord(candidate) || depth > 3) return;
    if (
      Number.isSafeInteger(candidate.productId) &&
      Number(candidate.productId) > 0
    ) {
      found.add(Number(candidate.productId));
    }
    for (const nested of Object.values(candidate)) visit(nested, depth + 1);
  };
  visit(value, 0);
  return [...found];
}

export function exactTcgplayerProductId(value: unknown): number | null {
  const productIds = tcgplayerProductIds(value);
  return productIds.length === 1 ? (productIds[0] ?? null) : null;
}

export async function verifiedTcgplayerImageUrl(
  productId: number,
  fetchImpl: ArtworkFetch,
  timeoutMs: number,
): Promise<string | null> {
  if (!Number.isSafeInteger(productId) || productId <= 0) return null;
  const url = `${TCGPLAYER_CARD_IMAGE_ORIGIN}/product/${productId}_in_1000x1000.jpg`;
  if (!isTcgplayerCardImageUrl(url)) return null;

  const response = await fetchImpl(url, {
    headers: {
      accept: "image/jpeg",
      "user-agent":
        "Cardboardex/0.1 (+https://github.com/nullfringe/cardboardex)",
    },
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });

  return response.status === 200 &&
    response.headers
      .get("content-type")
      ?.toLocaleLowerCase("en-US")
      .startsWith("image/jpeg")
    ? url
    : null;
}

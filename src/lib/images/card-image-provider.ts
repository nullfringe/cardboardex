import { isTrustedCardImageUrl } from "@/lib/security/card-image-policy";

export type CardImageIdentity = {
  gameSlug: string;
  setCode: string;
  collectorNumber: string;
  imageProvider?: string | null;
  imageExternalId?: string | null;
  imageUrl?: string | null;
};

export type CardImageReference = {
  url: string;
  provider: string;
  externalId: string | null;
};

/**
 * A provider translates stable card identity into a displayable card-face image.
 * Implementations may use stored metadata, a future public API, or a local cache.
 */
export interface CardImageProvider {
  readonly key: string;
  resolve(identity: CardImageIdentity): CardImageReference | null;
}

export const storedMetadataImageProvider: CardImageProvider = {
  key: "stored-metadata",
  resolve(identity) {
    if (!identity.imageUrl) return null;

    try {
      const url = new URL(identity.imageUrl);
      if (!isTrustedCardImageUrl(url.toString())) return null;

      return {
        url: url.toString(),
        provider: identity.imageProvider ?? this.key,
        externalId: identity.imageExternalId ?? null,
      };
    } catch {
      return null;
    }
  },
};

const providers: readonly CardImageProvider[] = [storedMetadataImageProvider];

export function resolveCardImage(
  identity: CardImageIdentity,
): CardImageReference | null {
  for (const provider of providers) {
    const image = provider.resolve(identity);
    if (image) return image;
  }

  return null;
}

export function applyCardImagePolicy<T extends CardImageIdentity>(
  identity: T,
): T {
  const image = resolveCardImage(identity);
  return {
    ...identity,
    imageUrl: image?.url ?? null,
  };
}

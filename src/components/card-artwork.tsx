"use client";

import Image, { type ImageLoader } from "next/image";
import { useState } from "react";

type CardArtworkProps = {
  name: string;
  cardKind: string;
  collectorNumber: string | null;
  pokemonType?: string | null;
  imageUrl?: string | null;
  priority?: boolean;
  size?: "tile" | "detail";
};

const passthroughLoader: ImageLoader = ({ src }) => src;

function getInitials(name: string): string {
  const words = name.split(/\s+/u).filter(Boolean);
  if (words.length === 1) {
    return words[0]?.slice(0, 2).toLocaleUpperCase() ?? "CB";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase();
}

function getTypeClass(value: string | null | undefined): string {
  const normalized = value
    ?.toLocaleLowerCase()
    .replace(/[^a-z]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return normalized ? `artwork--${normalized}` : "artwork--neutral";
}

export function CardArtwork({
  name,
  cardKind,
  collectorNumber,
  pokemonType,
  imageUrl,
  priority = false,
  size = "tile",
}: CardArtworkProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showImage = Boolean(imageUrl && imageUrl !== failedUrl);

  return (
    <div
      className={`artwork artwork--${size} ${getTypeClass(pokemonType)}`}
      data-has-image={showImage ? "true" : "false"}
    >
      {showImage && imageUrl ? (
        <Image
          alt={`${name} card face`}
          fill
          loader={passthroughLoader}
          onError={() => setFailedUrl(imageUrl)}
          priority={priority}
          sizes={
            size === "detail"
              ? "(max-width: 760px) 82vw, 390px"
              : "(max-width: 520px) 44vw, 220px"
          }
          src={imageUrl}
          unoptimized
        />
      ) : (
        <div
          className="artwork__placeholder"
          role="img"
          aria-label={`Artwork unavailable for ${name}`}
        >
          <div className="artwork__frame" aria-hidden="true">
            <span className="artwork__kind">{pokemonType ?? cardKind}</span>
            <span className="artwork__initials">{getInitials(name)}</span>
            <span className="artwork__name">{name}</span>
            {collectorNumber ? (
              <span className="artwork__number">{collectorNumber}</span>
            ) : null}
          </div>
          <span className="artwork__unavailable">Artwork not linked</span>
        </div>
      )}
    </div>
  );
}

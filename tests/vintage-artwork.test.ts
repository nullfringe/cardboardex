import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ArtworkFetch } from "@/lib/images/official-pokemon-artwork";
import {
  isTcgDexVintageCardUrl,
  resolveVintagePokemonArtwork,
  VINTAGE_POKEMON_ARTWORK_PROVIDER,
  VintagePokemonArtworkError,
  type VintagePokemonArtworkIdentity,
} from "@/lib/images/vintage-pokemon-artwork";

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), `tests/fixtures/${name}.json`),
    "utf8",
  );
}

const abraIdentity: VintagePokemonArtworkIdentity = {
  gameSlug: "pokemon-tcg",
  setCode: "BS",
  setName: "Base Set",
  collectorNumber: "43/102",
  printingVariantKey: "unlimited",
  languageCode: "en",
};

function successfulFetch(cardFixture: string, productId: number): ArtworkFetch {
  return vi.fn<ArtworkFetch>(async (input, init) => {
    if (init.method === "HEAD") {
      expect(input).toBe(
        `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
      );
      return new Response(null, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }

    return new Response(cardFixture, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("vintage Pokémon artwork", () => {
  it("resolves Base Set 43/102 Unlimited without using a card name", async () => {
    const fetchImpl = successfulFetch(fixture("tcgdex-base1-43"), 42386);

    await expect(
      resolveVintagePokemonArtwork(abraIdentity, { fetchImpl }),
    ).resolves.toEqual({
      url: "https://tcgplayer-cdn.tcgplayer.com/product/42386_in_1000x1000.jpg",
      provider: VINTAGE_POKEMON_ARTWORK_PROVIDER,
      externalId: "base1-43/base1-normal-unlimited/tcgplayer-42386",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.tcgdex.net/v2/en/cards/base1-43",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("uses the same identity path for another Base Set card", async () => {
    const fetchImpl = successfulFetch(fixture("tcgdex-base1-44"), 42387);

    await expect(
      resolveVintagePokemonArtwork(
        { ...abraIdentity, collectorNumber: "44/102" },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      externalId: "base1-44/base1-normal-unlimited/tcgplayer-42387",
    });
  });

  it("does not collapse Base Set printing variants", async () => {
    const cardFixture = fixture("tcgdex-base1-43");

    for (const printingVariantKey of [
      "first-edition",
      "shadowless",
      "1999-2000-copyright",
    ]) {
      const fetchImpl = successfulFetch(cardFixture, 42386);
      await expect(
        resolveVintagePokemonArtwork(
          { ...abraIdentity, printingVariantKey },
          { fetchImpl },
        ),
      ).resolves.toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("resolves a single-variant Base Set 2 card but declines ambiguous Jungle editions", async () => {
    const baseSet2Fetch = successfulFetch(fixture("tcgdex-base4-46"), 42509);
    await expect(
      resolveVintagePokemonArtwork(
        {
          ...abraIdentity,
          setCode: "BS2",
          setName: "Base Set 2",
          collectorNumber: "46/130",
          printingVariantKey: "standard",
        },
        { fetchImpl: baseSet2Fetch },
      ),
    ).resolves.toMatchObject({
      externalId: "base4-46/base-set-2-normal/tcgplayer-42509",
    });

    const jungleFetch = successfulFetch(fixture("tcgdex-base2-60"), 45163);
    await expect(
      resolveVintagePokemonArtwork(
        {
          ...abraIdentity,
          setCode: "JU",
          setName: "Jungle",
          collectorNumber: "60/64",
        },
        { fetchImpl: jungleFetch },
      ),
    ).resolves.toBeNull();
    expect(jungleFetch).toHaveBeenCalledTimes(1);
  });

  it("fails unknown cards gracefully and rejects metadata redirects", async () => {
    const missingFetch = vi.fn<ArtworkFetch>(
      async () => new Response(null, { status: 404 }),
    );
    await expect(
      resolveVintagePokemonArtwork(abraIdentity, {
        fetchImpl: missingFetch,
      }),
    ).resolves.toBeNull();

    const redirectFetch = vi.fn<ArtworkFetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/card" },
        }),
    );
    await expect(
      resolveVintagePokemonArtwork(abraIdentity, {
        fetchImpl: redirectFetch,
      }),
    ).rejects.toBeInstanceOf(VintagePokemonArtworkError);
  });

  it("accepts only the constrained English TCGdex card endpoint", () => {
    expect(
      isTcgDexVintageCardUrl("https://api.tcgdex.net/v2/en/cards/base1-43"),
    ).toBe(true);
    expect(
      isTcgDexVintageCardUrl(
        "https://api.tcgdex.net.evil.test/v2/en/cards/base1-43",
      ),
    ).toBe(false);
    expect(
      isTcgDexVintageCardUrl("https://api.tcgdex.net/v2/fr/cards/base1-43"),
    ).toBe(false);
  });
});

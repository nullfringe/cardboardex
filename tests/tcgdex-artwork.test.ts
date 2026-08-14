import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ArtworkFetch } from "@/lib/images/official-pokemon-artwork";
import { TCGCSV_TCGPLAYER_ARTWORK_PROVIDER } from "@/lib/images/tcgcsv-pokemon-artwork";
import { TCGDEX_TCGPLAYER_ARTWORK_PROVIDER } from "@/lib/images/tcgplayer-card-image";
import {
  isTcgDexCardApiUrl,
  resolveTcgDexPokemonArtwork,
  TCGDEX_POKEMON_ARTWORK_PROVIDER,
  TcgDexPokemonArtworkError,
  type TcgDexPokemonArtworkIdentity,
} from "@/lib/images/tcgdex-pokemon-artwork";

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), `tests/fixtures/${name}.json`),
    "utf8",
  );
}

const modernJapaneseIdentity: TcgDexPokemonArtworkIdentity = {
  gameSlug: "pokemon-tcg",
  languageCode: "ja",
  printingVariantKey: "standard",
  catalogProvider: "tcgdex",
  catalogSetId: "SV2a",
  catalogCardId: "SV2a-025",
};

const vintageJapaneseIdentity: TcgDexPokemonArtworkIdentity = {
  ...modernJapaneseIdentity,
  catalogSetId: "PMCG1",
  catalogCardId: "PMCG1-014",
};

function metadataFetch(cardFixture: string) {
  return vi.fn<ArtworkFetch>(async () =>
    Promise.resolve(
      new Response(cardFixture, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function fallbackFetch(
  cardFixture: string,
  productId: number,
  imageResponse: { status?: number; contentType?: string } = {},
) {
  return vi.fn<ArtworkFetch>(async (input, init) => {
    if (init.method === "HEAD") {
      expect(input).toBe(
        `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
      );
      expect(init).toEqual(expect.objectContaining({ redirect: "manual" }));
      return new Response(null, {
        status: imageResponse.status ?? 200,
        headers: {
          "content-type": imageResponse.contentType ?? "image/jpeg",
        },
      });
    }

    return new Response(cardFixture, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("language-aware TCGdex artwork", () => {
  it("resolves an exact Japanese card to its Japanese TCGdex image", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>(async () =>
      Promise.resolve(
        new Response(fixture("tcgdex-ja-sv2a-025"), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      resolveTcgDexPokemonArtwork(modernJapaneseIdentity, { fetchImpl }),
    ).resolves.toEqual({
      url: "https://assets.tcgdex.net/ja/SV/SV2a/025/high.webp",
      provider: TCGDEX_POKEMON_ARTWORK_PROVIDER,
      externalId: "ja/SV2a-025/generated",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.tcgdex.net/v2/ja/cards/SV2a-025",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retains current 1996 Japanese records as unresolved when no exact image exists", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>(async () =>
      Promise.resolve(
        new Response(fixture("tcgdex-ja-pmcg1-035"), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...modernJapaneseIdentity,
          catalogSetId: "PMCG1",
          catalogCardId: "PMCG1-035",
        },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
  });

  it("selects the ordinary PMCG1 variant and uses only its exact TCGplayer product", async () => {
    const fetchImpl = fallbackFetch(fixture("tcgdex-ja-pmcg1-014"), 90014);

    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, { fetchImpl }),
    ).resolves.toEqual({
      url: "https://tcgplayer-cdn.tcgplayer.com/product/90014_in_1000x1000.jpg",
      provider: TCGDEX_TCGPLAYER_ARTWORK_PROVIDER,
      externalId: "ja/PMCG1-014/pmcg1-014-regular/tcgplayer-90014",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("selects the exact PMCG1 no-rarity variant without borrowing the ordinary product", async () => {
    const fetchImpl = fallbackFetch(fixture("tcgdex-ja-pmcg1-014"), 91014);

    await expect(
      resolveTcgDexPokemonArtwork(
        { ...vintageJapaneseIdentity, printingVariantKey: "no-rarity" },
        { fetchImpl },
      ),
    ).resolves.toEqual({
      url: "https://tcgplayer-cdn.tcgplayer.com/product/91014_in_1000x1000.jpg",
      provider: TCGDEX_TCGPLAYER_ARTWORK_PROVIDER,
      externalId: "ja/PMCG1-014/pmcg1-014-no-rarity/tcgplayer-91014",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses a uniquely corroborated TCGCSV product only after exact TCGdex verification", async () => {
    const card = JSON.parse(fixture("tcgdex-ja-pmcg1-014")) as {
      variants_detailed: Array<Record<string, unknown>>;
    };
    delete card.variants_detailed[0]?.pricing;
    const products = fixture("tcgcsv-pmcg1-23721");
    const fetchImpl = vi.fn<ArtworkFetch>(async (input, init) => {
      if (input === "https://api.tcgdex.net/v2/ja/cards/PMCG1-014") {
        return new Response(JSON.stringify(card), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (input === "https://tcgcsv.com/tcgplayer/85/23721/products") {
        expect(init).toEqual(expect.objectContaining({ redirect: "manual" }));
        return new Response(products, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(input).toBe(
        "https://tcgplayer-cdn.tcgplayer.com/product/575573_in_1000x1000.jpg",
      );
      expect(init).toEqual(
        expect.objectContaining({ method: "HEAD", redirect: "manual" }),
      );
      return new Response(null, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...vintageJapaneseIdentity,
          canonicalName: "Charmander",
          rarity: "Common",
          hp: 50,
          stage: "Basic",
          pokemonType: "Fire",
        },
        { fetchImpl },
      ),
    ).resolves.toEqual({
      url: "https://tcgplayer-cdn.tcgplayer.com/product/575573_in_1000x1000.jpg",
      provider: TCGCSV_TCGPLAYER_ARTWORK_PROVIDER,
      externalId:
        "ja/PMCG1-014/pmcg1-014-regular/tcgcsv-85-23721/tcgplayer-575573",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://attacker.example/not-trusted.jpg",
      expect.anything(),
    );
  });

  it("omits ambiguous multi-type TCGdex metadata instead of choosing one value", async () => {
    const card = JSON.parse(fixture("tcgdex-ja-pmcg1-014")) as {
      types: string[];
      variants_detailed: Array<Record<string, unknown>>;
    };
    card.types = ["Water", "Grass"];
    delete card.variants_detailed[0]?.pricing;
    const fetchImpl = vi.fn<ArtworkFetch>(async (input, init) => {
      if (input === "https://api.tcgdex.net/v2/ja/cards/PMCG1-014") {
        return new Response(JSON.stringify(card), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (input === "https://tcgcsv.com/tcgplayer/85/23721/products") {
        return new Response(fixture("tcgcsv-pmcg1-23721"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(input).toBe(
        "https://tcgplayer-cdn.tcgplayer.com/product/575573_in_1000x1000.jpg",
      );
      expect(init.method).toBe("HEAD");
      return new Response(null, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...vintageJapaneseIdentity,
          canonicalName: "Charmander",
          rarity: "Common",
          hp: 50,
          stage: "Basic",
        },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      provider: TCGCSV_TCGPLAYER_ARTWORK_PROVIDER,
      url: "https://tcgplayer-cdn.tcgplayer.com/product/575573_in_1000x1000.jpg",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("falls through to TCGCSV when the variant-pricing image fails verification", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>(async (input, init) => {
      if (input === "https://api.tcgdex.net/v2/ja/cards/PMCG1-014") {
        return new Response(fixture("tcgdex-ja-pmcg1-014"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (
        input ===
        "https://tcgplayer-cdn.tcgplayer.com/product/90014_in_1000x1000.jpg"
      ) {
        expect(init.method).toBe("HEAD");
        return new Response(null, { status: 404 });
      }
      if (input === "https://tcgcsv.com/tcgplayer/85/23721/products") {
        return new Response(fixture("tcgcsv-pmcg1-23721"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(input).toBe(
        "https://tcgplayer-cdn.tcgplayer.com/product/575573_in_1000x1000.jpg",
      );
      expect(init).toEqual(
        expect.objectContaining({ method: "HEAD", redirect: "manual" }),
      );
      return new Response(null, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...vintageJapaneseIdentity,
          canonicalName: "Charmander",
          rarity: "Common",
          hp: 50,
          stage: "Basic",
          pokemonType: "Fire",
        },
        { fetchImpl },
      ),
    ).resolves.toEqual({
      url: "https://tcgplayer-cdn.tcgplayer.com/product/575573_in_1000x1000.jpg",
      provider: TCGCSV_TCGPLAYER_ARTWORK_PROVIDER,
      externalId:
        "ja/PMCG1-014/pmcg1-014-regular/tcgcsv-85-23721/tcgplayer-575573",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("requires exactly one positive product ID on the selected variant", async () => {
    const missingProduct = JSON.parse(fixture("tcgdex-ja-pmcg1-014")) as {
      variants_detailed: Array<Record<string, unknown>>;
    };
    delete missingProduct.variants_detailed[0]?.pricing;
    const missingFetch = metadataFetch(JSON.stringify(missingProduct));
    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, {
        fetchImpl: missingFetch,
      }),
    ).resolves.toBeNull();
    expect(missingFetch).toHaveBeenCalledTimes(1);

    const multipleProducts = JSON.parse(fixture("tcgdex-ja-pmcg1-014")) as {
      variants_detailed: Array<Record<string, unknown>>;
    };
    multipleProducts.variants_detailed[0]!.pricing = {
      tcgplayer: {
        normal: { productId: 90014 },
        reverse: { productId: 90015 },
      },
    };
    const multipleFetch = metadataFetch(JSON.stringify(multipleProducts));
    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, {
        fetchImpl: multipleFetch,
      }),
    ).resolves.toBeNull();
    expect(multipleFetch).toHaveBeenCalledTimes(1);
  });

  it("does not borrow a product ID from another provider variant", async () => {
    const card = JSON.parse(fixture("tcgdex-ja-pmcg1-014")) as {
      variants_detailed: Array<Record<string, unknown>>;
    };
    delete card.variants_detailed[0]?.pricing;
    const fetchImpl = metadataFetch(JSON.stringify(card));

    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, { fetchImpl }),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("accepts a local lv15 discriminator only for one unqualified exact provider variant", async () => {
    const fetchImpl = fallbackFetch(fixture("tcgdex-ja-pmcg6-062"), 96062);

    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...vintageJapaneseIdentity,
          printingVariantKey: "lv15",
          catalogSetId: "PMCG6",
          catalogCardId: "PMCG6-062",
        },
        { fetchImpl },
      ),
    ).resolves.toEqual({
      url: "https://tcgplayer-cdn.tcgplayer.com/product/96062_in_1000x1000.jpg",
      provider: TCGDEX_TCGPLAYER_ARTWORK_PROVIDER,
      externalId: "ja/PMCG6-062/pmcg6-062-regular/tcgplayer-96062",
    });

    const editionFetch = metadataFetch(fixture("tcgdex-ja-pmcg6-062"));
    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...vintageJapaneseIdentity,
          printingVariantKey: "first-edition",
          catalogSetId: "PMCG6",
          catalogCardId: "PMCG6-062",
        },
        { fetchImpl: editionFetch },
      ),
    ).resolves.toBeNull();
    expect(editionFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps unknown local discriminators unresolved across multiple provider variants", async () => {
    const fetchImpl = metadataFetch(fixture("tcgdex-ja-pmcg1-014"));

    await expect(
      resolveTcgDexPokemonArtwork(
        { ...vintageJapaneseIdentity, printingVariantKey: "lv15" },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("selects a unique no-rarity native image and rejects cross-language images", async () => {
    const exactWithImage = JSON.parse(fixture("tcgdex-ja-pmcg1-035")) as Record<
      string,
      unknown
    >;
    exactWithImage.image = "https://assets.tcgdex.net/ja/PMCG/PMCG1/035";
    const exactFetch = vi.fn<ArtworkFetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify(exactWithImage), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      resolveTcgDexPokemonArtwork(
        {
          ...modernJapaneseIdentity,
          catalogSetId: "PMCG1",
          catalogCardId: "PMCG1-035",
          printingVariantKey: "no-rarity",
        },
        { fetchImpl: exactFetch },
      ),
    ).resolves.toEqual({
      url: "https://assets.tcgdex.net/ja/PMCG/PMCG1/035/high.webp",
      provider: TCGDEX_POKEMON_ARTWORK_PROVIDER,
      externalId: "ja/PMCG1-035/3a83wf50tygukdw4gyjguc5gr",
    });
    expect(exactFetch).toHaveBeenCalledTimes(1);

    const wrongLanguage = fixture("tcgdex-ja-sv2a-025").replace(
      "https://assets.tcgdex.net/ja/",
      "https://assets.tcgdex.net/en/",
    );
    const wrongLanguageFetch = vi.fn<ArtworkFetch>(async () =>
      Promise.resolve(
        new Response(wrongLanguage, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      resolveTcgDexPokemonArtwork(modernJapaneseIdentity, {
        fetchImpl: wrongLanguageFetch,
      }),
    ).resolves.toBeNull();
  });

  it("requires exact card, set, and Japanese language identity for fallback", async () => {
    const card = fixture("tcgdex-ja-pmcg1-014");
    const wrongSetFetch = metadataFetch(card);
    await expect(
      resolveTcgDexPokemonArtwork(
        { ...vintageJapaneseIdentity, catalogSetId: "PMCG4" },
        { fetchImpl: wrongSetFetch },
      ),
    ).resolves.toBeNull();

    const wrongCardRecord = card.replace(
      '"id": "PMCG1-014"',
      '"id": "PMCG1-999"',
    );
    const wrongCardFetch = metadataFetch(wrongCardRecord);
    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, {
        fetchImpl: wrongCardFetch,
      }),
    ).resolves.toBeNull();

    const wrongLanguageFetch = metadataFetch(card);
    await expect(
      resolveTcgDexPokemonArtwork(
        { ...vintageJapaneseIdentity, languageCode: "en" },
        { fetchImpl: wrongLanguageFetch },
      ),
    ).resolves.toBeNull();
    expect(wrongSetFetch).toHaveBeenCalledTimes(1);
    expect(wrongCardFetch).toHaveBeenCalledTimes(1);
    expect(wrongLanguageFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects TCGplayer redirects, invalid MIME, and untrusted native image URLs", async () => {
    const redirectFetch = fallbackFetch(fixture("tcgdex-ja-pmcg1-014"), 90014, {
      status: 302,
    });
    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, {
        fetchImpl: redirectFetch,
      }),
    ).resolves.toBeNull();

    const invalidMimeFetch = fallbackFetch(
      fixture("tcgdex-ja-pmcg1-014"),
      90014,
      { contentType: "text/html" },
    );
    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, {
        fetchImpl: invalidMimeFetch,
      }),
    ).resolves.toBeNull();

    const untrustedNative = JSON.parse(
      fixture("tcgdex-ja-pmcg1-014"),
    ) as Record<string, unknown>;
    untrustedNative.image = "https://attacker.example/PMCG1-014";
    const untrustedFetch = metadataFetch(JSON.stringify(untrustedNative));
    await expect(
      resolveTcgDexPokemonArtwork(vintageJapaneseIdentity, {
        fetchImpl: untrustedFetch,
      }),
    ).resolves.toBeNull();
    expect(untrustedFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts only constrained TCGdex API URLs and rejects redirects", async () => {
    expect(
      isTcgDexCardApiUrl("https://api.tcgdex.net/v2/ja/cards/PMCG1-035"),
    ).toBe(true);
    expect(
      isTcgDexCardApiUrl(
        "https://api.tcgdex.net.evil.test/v2/ja/cards/PMCG1-035",
      ),
    ).toBe(false);

    const fetchImpl = vi.fn<ArtworkFetch>(async () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/card" },
        }),
      ),
    );
    await expect(
      resolveTcgDexPokemonArtwork(modernJapaneseIdentity, { fetchImpl }),
    ).rejects.toBeInstanceOf(TcgDexPokemonArtworkError);
  });
});

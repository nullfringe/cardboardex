import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ArtworkFetch } from "@/lib/images/official-pokemon-artwork";
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

  it("refuses ambiguous no-rarity metadata and cross-language images", async () => {
    const ambiguousWithImage = JSON.parse(
      fixture("tcgdex-ja-pmcg1-035"),
    ) as Record<string, unknown>;
    ambiguousWithImage.image = "https://assets.tcgdex.net/ja/PMCG/PMCG1/035";
    const ambiguousFetch = vi.fn<ArtworkFetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify(ambiguousWithImage), {
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
        { fetchImpl: ambiguousFetch },
      ),
    ).resolves.toBeNull();

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

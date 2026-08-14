import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ArtworkFetch } from "@/lib/images/official-pokemon-artwork";
import {
  createTcgCsvPokemonClient,
  isTcgCsvProductsUrl,
  resolveTcgCsvPokemonProduct,
  TcgCsvPokemonArtworkError,
  type TcgCsvPokemonProductIdentity,
} from "@/lib/images/tcgcsv-pokemon-artwork";

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), `tests/fixtures/${name}.json`),
    "utf8",
  );
}

const charmanderIdentity: TcgCsvPokemonProductIdentity = {
  catalogSetId: "PMCG1",
  printingVariantKey: "standard",
  canonicalName: "Charmander",
  localRarity: "Common",
  localHp: 50,
  localStage: "Basic",
  localPokemonType: "Fire",
  tcgDexRarity: "common",
  tcgDexHp: 50,
  tcgDexStage: "Basic",
  tcgDexPokemonType: "Fire",
};

const metapodIdentity: TcgCsvPokemonProductIdentity = {
  catalogSetId: "PMCG1",
  printingVariantKey: "standard",
  canonicalName: "Metapod",
  localRarity: "Common",
  localHp: 70,
  localStage: "Stage 1",
  localPokemonType: "Grass",
  tcgDexRarity: "Common",
  tcgDexHp: 70,
  tcgDexStage: "Stage1",
  tcgDexPokemonType: "Grass",
};

function productsFetch(
  body: string,
  expectedGroupId: number,
  response: {
    status?: number;
    contentType?: string;
    contentLength?: string;
  } = {},
) {
  return vi.fn<ArtworkFetch>(async (input, init) => {
    expect(input).toBe(
      `https://tcgcsv.com/tcgplayer/85/${expectedGroupId}/products`,
    );
    expect(init).toEqual(
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
    return new Response(body, {
      status: response.status ?? 200,
      headers: {
        "content-type": response.contentType ?? "application/json",
        ...(response.contentLength
          ? { "content-length": response.contentLength }
          : {}),
      },
    });
  });
}

describe("constrained Japanese vintage TCGCSV products", () => {
  it("maps PMCG1 standard to Expansion Pack and uniquely corroborates Charmander", async () => {
    const fetchImpl = productsFetch(fixture("tcgcsv-pmcg1-23721"), 23721);

    await expect(
      resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
    ).resolves.toEqual({ categoryId: 85, groupId: 23721, productId: 575573 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps PMCG1 standard and no-rarity in separate provider groups", async () => {
    const noRarityFetch = productsFetch(fixture("tcgcsv-pmcg1-23740"), 23740);
    await expect(
      resolveTcgCsvPokemonProduct(
        { ...charmanderIdentity, printingVariantKey: "no-rarity" },
        { fetchImpl: noRarityFetch },
      ),
    ).resolves.toEqual({ categoryId: 85, groupId: 23740, productId: 675573 });

    const standardFetch = productsFetch(fixture("tcgcsv-pmcg1-23740"), 23721);
    await expect(
      resolveTcgCsvPokemonProduct(charmanderIdentity, {
        fetchImpl: standardFetch,
      }),
    ).resolves.toBeNull();
  });

  it("maps Rocket Gang independently of Expansion Pack", async () => {
    const rocketIdentity = {
      ...charmanderIdentity,
      catalogSetId: "PMCG4",
      localHp: 40,
      tcgDexHp: 40,
    };
    const rocketFetch = productsFetch(fixture("tcgcsv-pmcg4-23724"), 23724);
    await expect(
      resolveTcgCsvPokemonProduct(rocketIdentity, { fetchImpl: rocketFetch }),
    ).resolves.toEqual({ categoryId: 85, groupId: 23724, productId: 575713 });

    const wrongGroupFetch = productsFetch(fixture("tcgcsv-pmcg1-23721"), 23724);
    await expect(
      resolveTcgCsvPokemonProduct(rocketIdentity, {
        fetchImpl: wrongGroupFetch,
      }),
    ).resolves.toBeNull();
  });

  it("canonicalizes Stage1 and Stage 1 for evolved products", async () => {
    const metapodFetch = productsFetch(fixture("tcgcsv-pmcg1-23721"), 23721);
    await expect(
      resolveTcgCsvPokemonProduct(metapodIdentity, {
        fetchImpl: metapodFetch,
      }),
    ).resolves.toEqual({ categoryId: 85, groupId: 23721, productId: 575583 });

    const darkCharmeleonFetch = productsFetch(
      fixture("tcgcsv-pmcg4-23724"),
      23724,
    );
    await expect(
      resolveTcgCsvPokemonProduct(
        {
          catalogSetId: "PMCG4",
          printingVariantKey: "standard",
          canonicalName: "Dark Charmeleon",
          localRarity: "Uncommon",
          localHp: 50,
          localStage: "Stage 1",
          localPokemonType: "Fire",
          tcgDexRarity: "Uncommon",
          tcgDexHp: 50,
          tcgDexStage: "Stage1",
          tcgDexPokemonType: "Fire",
        },
        { fetchImpl: darkCharmeleonFetch },
      ),
    ).resolves.toEqual({ categoryId: 85, groupId: 23724, productId: 575759 });
  });

  it("maps PMCG2 to the exact Pokemon Jungle group", async () => {
    const body = JSON.stringify({
      success: true,
      errors: [],
      results: [
        {
          productId: 576611,
          name: "Butterfree",
          cleanName: "Butterfree",
          categoryId: 85,
          groupId: 23722,
          extendedData: [
            { name: "Rarity", value: "Uncommon" },
            { name: "HP", value: "70" },
            { name: "Stage", value: "Stage 2" },
            { name: "CardType", value: "Grass" },
          ],
        },
      ],
    });
    const fetchImpl = productsFetch(body, 23722);
    await expect(
      resolveTcgCsvPokemonProduct(
        {
          catalogSetId: "PMCG2",
          printingVariantKey: "standard",
          canonicalName: "Butterfree",
          localRarity: "Uncommon",
          localHp: 70,
          localStage: "Stage 2",
          tcgDexStage: "Stage2",
        },
        { fetchImpl },
      ),
    ).resolves.toEqual({ categoryId: 85, groupId: 23722, productId: 576611 });
  });

  it("uses exact HP and rarity to distinguish the two Koga's Pidgeys", async () => {
    const commonIdentity: TcgCsvPokemonProductIdentity = {
      catalogSetId: "PMCG6",
      printingVariantKey: "lv15",
      canonicalName: "Koga's Pidgey",
      localRarity: "Common",
      localHp: 50,
      tcgDexRarity: "Common",
      tcgDexHp: 50,
    };
    const commonFetch = productsFetch(fixture("tcgcsv-pmcg6-23726"), 23726);
    await expect(
      resolveTcgCsvPokemonProduct(commonIdentity, { fetchImpl: commonFetch }),
    ).resolves.toEqual({ categoryId: 85, groupId: 23726, productId: 575314 });

    const uncommonFetch = productsFetch(fixture("tcgcsv-pmcg6-23726"), 23726);
    await expect(
      resolveTcgCsvPokemonProduct(
        {
          ...commonIdentity,
          localRarity: "Uncommon",
          localHp: 40,
          tcgDexRarity: "Uncommon",
          tcgDexHp: 40,
        },
        { fetchImpl: uncommonFetch },
      ),
    ).resolves.toEqual({ categoryId: 85, groupId: 23726, productId: 575380 });

    const ambiguousFetch = productsFetch(fixture("tcgcsv-pmcg6-23726"), 23726);
    await expect(
      resolveTcgCsvPokemonProduct(
        {
          catalogSetId: "PMCG6",
          printingVariantKey: "lv15",
          canonicalName: "Koga's Pidgey",
        },
        { fetchImpl: ambiguousFetch },
      ),
    ).resolves.toBeNull();
  });

  it("rejects duplicate candidates rather than picking one", async () => {
    const response = JSON.parse(fixture("tcgcsv-pmcg1-23721")) as {
      results: Array<Record<string, unknown>>;
    };
    const match = response.results[1]!;
    response.results.push({ ...match, productId: 999999 });
    const fetchImpl = productsFetch(JSON.stringify(response), 23721);

    await expect(
      resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
    ).resolves.toBeNull();
  });

  it("rejects true and unknown stage conflicts without fuzzy matching", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>();
    await expect(
      resolveTcgCsvPokemonProduct(
        {
          ...metapodIdentity,
          localStage: "Stage 1",
          tcgDexStage: "Stage2",
        },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
    await expect(
      resolveTcgCsvPokemonProduct(
        {
          ...metapodIdentity,
          localStage: "SpecialStage",
          tcgDexStage: "Special Stage",
        },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects exact-name, HP, rarity, stage, and elemental-type disagreements", async () => {
    const body = fixture("tcgcsv-pmcg1-23721");
    for (const identity of [
      { ...charmanderIdentity, canonicalName: "Bulbasaur" },
      { ...charmanderIdentity, localHp: 60, tcgDexHp: 60 },
      {
        ...charmanderIdentity,
        localRarity: "Rare",
        tcgDexRarity: "Rare",
      },
      {
        ...charmanderIdentity,
        localStage: "Stage 1",
        tcgDexStage: "Stage 1",
      },
      {
        ...charmanderIdentity,
        localPokemonType: "Water",
        tcgDexPokemonType: "Water",
      },
    ]) {
      const fetchImpl = productsFetch(body, 23721);
      await expect(
        resolveTcgCsvPokemonProduct(identity, { fetchImpl }),
      ).resolves.toBeNull();
    }
  });

  it("declines unsupported sets and missing canonical names without guessing", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>();
    await expect(
      resolveTcgCsvPokemonProduct(
        { ...charmanderIdentity, catalogSetId: "PMCG3" },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
    await expect(
      resolveTcgCsvPokemonProduct(
        { ...charmanderIdentity, canonicalName: null },
        { fetchImpl },
      ),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches one group once while independently matching several cached cards", async () => {
    const fetchImpl = productsFetch(fixture("tcgcsv-pmcg1-23721"), 23721);
    const client = createTcgCsvPokemonClient({ fetchImpl });

    await expect(
      Promise.all([
        client.resolveProduct(charmanderIdentity),
        client.resolveProduct(metapodIdentity),
        client.resolveProduct({
          ...charmanderIdentity,
          canonicalName: "Caterpie",
          localHp: 40,
          localPokemonType: "Grass",
          tcgDexHp: 40,
          tcgDexPokemonType: "Grass",
        }),
      ]),
    ).resolves.toEqual([
      { categoryId: 85, groupId: 23721, productId: 575573 },
      { categoryId: 85, groupId: 23721, productId: 575583 },
      { categoryId: 85, groupId: 23721, productId: 575572 },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetches each distinct group once", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>(async (input) => {
      const fixtureName = input.includes("/23721/")
        ? "tcgcsv-pmcg1-23721"
        : "tcgcsv-pmcg4-23724";
      return new Response(fixture(fixtureName), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createTcgCsvPokemonClient({ fetchImpl });

    await expect(client.resolveProduct(charmanderIdentity)).resolves.toEqual({
      categoryId: 85,
      groupId: 23721,
      productId: 575573,
    });
    await expect(
      client.resolveProduct({
        ...charmanderIdentity,
        catalogSetId: "PMCG4",
        localHp: 40,
        tcgDexHp: 40,
      }),
    ).resolves.toEqual({
      categoryId: 85,
      groupId: 23724,
      productId: 575713,
    });
    await client.resolveProduct(metapodIdentity);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed non-JSON group response", async () => {
    let requestCount = 0;
    const fetchImpl = vi.fn<ArtworkFetch>(async () => {
      requestCount += 1;
      return requestCount === 1
        ? new Response("temporarily throttled", {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        : new Response(fixture("tcgcsv-pmcg1-23721"), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    });
    const client = createTcgCsvPokemonClient({ fetchImpl });

    await expect(
      client.resolveProduct(charmanderIdentity),
    ).rejects.toBeInstanceOf(TcgCsvPokemonArtworkError);
    await expect(client.resolveProduct(charmanderIdentity)).resolves.toEqual({
      categoryId: 85,
      groupId: 23721,
      productId: 575573,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("paces actual requests to separate groups by at least 250 ms", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<ArtworkFetch>(async (input) => {
        const fixtureName = input.includes("/23721/")
          ? "tcgcsv-pmcg1-23721"
          : "tcgcsv-pmcg4-23724";
        return new Response(fixture(fixtureName), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      const client = createTcgCsvPokemonClient({ fetchImpl });
      await client.resolveProduct(charmanderIdentity);

      const second = client.resolveProduct({
        ...charmanderIdentity,
        catalogSetId: "PMCG4",
        localHp: 40,
        tcgDexHp: 40,
      });
      await vi.advanceTimersByTimeAsync(249);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toEqual({
        categoryId: 85,
        groupId: 23724,
        productId: 575713,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts only the exact HTTPS Pokemon Japan products URL shape", () => {
    expect(
      isTcgCsvProductsUrl("https://tcgcsv.com/tcgplayer/85/23721/products"),
    ).toBe(true);
    for (const value of [
      "http://tcgcsv.com/tcgplayer/85/23721/products",
      "https://user:pass@tcgcsv.com/tcgplayer/85/23721/products",
      "https://tcgcsv.com.evil.test/tcgplayer/85/23721/products",
      "https://tcgcsv.com/tcgplayer/3/23721/products",
      "https://tcgcsv.com/tcgplayer/85/0/products",
      "https://tcgcsv.com/tcgplayer/85/23721/products/extra",
      "https://tcgcsv.com/tcgplayer/85/23721/products?all=true",
      "https://tcgcsv.com/tcgplayer/85/23721/products#fragment",
    ]) {
      expect(isTcgCsvProductsUrl(value)).toBe(false);
    }
  });

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "text/json",
    "text/json; charset=utf-8",
    "TeXt/JsOn; ChArSeT=UTF-8",
  ])("accepts the explicit JSON media type %s", async (contentType) => {
    const fetchImpl = productsFetch(fixture("tcgcsv-pmcg1-23721"), 23721, {
      contentType,
    });
    await expect(
      resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
    ).resolves.toEqual({ categoryId: 85, groupId: 23721, productId: 575573 });
  });

  it.each(["text/html", "text/plain"])(
    "rejects valid-looking JSON served as %s",
    async (contentType) => {
      const fetchImpl = productsFetch(fixture("tcgcsv-pmcg1-23721"), 23721, {
        contentType,
      });
      await expect(
        resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
      ).rejects.toBeInstanceOf(TcgCsvPokemonArtworkError);
    },
  );

  it("rejects malformed JSON under an accepted text/json MIME", async () => {
    const fetchImpl = productsFetch("{", 23721, {
      contentType: "text/json; charset=utf-8",
    });
    await expect(
      resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
    ).rejects.toBeInstanceOf(TcgCsvPokemonArtworkError);
  });

  it("rejects redirects, wrong MIME, malformed JSON, and oversized responses", async () => {
    const cases = [
      productsFetch("", 23721, { status: 302 }),
      productsFetch("{}", 23721, { contentType: "text/html" }),
      productsFetch("{", 23721),
      productsFetch("{}", 23721, { contentLength: "2000001" }),
      productsFetch(" ".repeat(2_000_001), 23721),
    ];
    for (const fetchImpl of cases) {
      await expect(
        resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
      ).rejects.toBeInstanceOf(TcgCsvPokemonArtworkError);
    }
  });

  it("ignores invalid product IDs", async () => {
    const body = JSON.stringify({
      success: true,
      errors: [],
      results: [
        { productId: 0, name: "Charmander" },
        { productId: -1, name: "Charmander" },
        { productId: "not-a-number", name: "Charmander" },
        { productId: "575573", name: "Charmander" },
      ],
    });
    const fetchImpl = productsFetch(body, 23721);
    await expect(
      resolveTcgCsvPokemonProduct(charmanderIdentity, { fetchImpl }),
    ).resolves.toBeNull();
  });
});

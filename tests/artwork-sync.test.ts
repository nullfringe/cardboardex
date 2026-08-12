import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { cardPrintings } from "@/db/schema";
import {
  type ArtworkFetch,
  OFFICIAL_POKEMON_ARTWORK_PROVIDER,
  OfficialPokemonArtworkError,
  isOfficialPokemonCardSourceUrl,
  parseOfficialPokemonArtwork,
  resolveOfficialPokemonArtwork,
} from "@/lib/images/official-pokemon-artwork";
import { syncPokemonArtwork } from "@/lib/images/sync-official-pokemon-artwork";
import { VINTAGE_POKEMON_ARTWORK_PROVIDER } from "@/lib/images/vintage-pokemon-artwork";
import { importCollectionCsv } from "@/lib/import";
import { createCollectionService } from "@/lib/services/collection-service";

const seedPath = path.resolve(process.cwd(), "data/seed/collection.csv");
const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/pokemon-card-page.html",
);
const vintageAbraFixture = fs.readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/tcgdex-base1-43.json"),
  "utf8",
);
const maschiffSource =
  "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/series/me05/57/";
const maschiffImage =
  "https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/ME05/ME05_EN_57.png";

function officialImageForSource(sourceUrl: string): string {
  const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
  const setCode = parts.at(-2)?.toLocaleUpperCase("en-US");
  const cardNumber = parts.at(-1);
  if (!setCode || !cardNumber) throw new Error("Unexpected test source URL");

  return `https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/${setCode}/${setCode}_EN_${cardNumber}.png`;
}

function fetchWithVintageFallback(failSource?: string) {
  return vi.fn<ArtworkFetch>(async (input, init) => {
    if (input === failSource) {
      throw new TypeError("Simulated network failure");
    }
    if (input === "https://api.tcgdex.net/v2/en/cards/base1-43") {
      return new Response(vintageAbraFixture, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (
      input ===
        "https://tcgplayer-cdn.tcgplayer.com/product/42386_in_1000x1000.jpg" &&
      init.method === "HEAD"
    ) {
      return new Response(null, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }

    const imageUrl = officialImageForSource(input);
    return new Response(`<meta content="${imageUrl}" property="og:image">`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });
}

describe("official Pokémon artwork metadata", () => {
  it("parses matching artwork from a stable official-page fixture", () => {
    const html = fs.readFileSync(fixturePath, "utf8");

    expect(parseOfficialPokemonArtwork(html, maschiffSource)).toEqual({
      url: maschiffImage,
      provider: OFFICIAL_POKEMON_ARTWORK_PROVIDER,
      externalId: "ME05/ME05_EN_57",
    });
  });

  it("accepts only the exact official card-database source shape", () => {
    expect(isOfficialPokemonCardSourceUrl(maschiffSource)).toBe(true);
    expect(
      isOfficialPokemonCardSourceUrl(
        "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/series/me05/57",
      ),
    ).toBe(true);
    expect(
      isOfficialPokemonCardSourceUrl(
        "https://assets.pokemon.com/us/pokemon-tcg/pokemon-cards/series/me05/57/",
      ),
    ).toBe(false);
    expect(
      isOfficialPokemonCardSourceUrl(
        "https://www.pokemon.com.evil.test/us/pokemon-tcg/pokemon-cards/series/me05/57/",
      ),
    ).toBe(false);
  });

  it("rejects mismatched or non-card official asset metadata", () => {
    expect(
      parseOfficialPokemonArtwork(
        `<meta property="og:image" content="https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/ME05/ME05_EN_58.png">`,
        maschiffSource,
      ),
    ).toBeNull();
    expect(
      parseOfficialPokemonArtwork(
        `<meta property="og:image" content="https://assets.pokemon.com/static2/_ui/img/favicon.ico">`,
        maschiffSource,
      ),
    ).toBeNull();
  });

  it("follows only trusted same-origin redirects", async () => {
    const html = fs.readFileSync(fixturePath, "utf8");
    const fetchImpl = vi.fn<ArtworkFetch>(async (input) => {
      if (input.endsWith("/")) {
        return new Response(null, {
          status: 301,
          headers: { location: input.slice(0, -1) },
        });
      }

      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    });

    await expect(
      resolveOfficialPokemonArtwork(maschiffSource, { fetchImpl }),
    ).resolves.toMatchObject({ url: maschiffImage });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const unsafeRedirect = vi.fn<ArtworkFetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/card" },
        }),
    );
    await expect(
      resolveOfficialPokemonArtwork(maschiffSource, {
        fetchImpl: unsafeRedirect,
      }),
    ).rejects.toBeInstanceOf(OfficialPokemonArtworkError);
  });

  it("uses only a verified official asset candidate when page metadata is unavailable", async () => {
    const fetchImpl = vi.fn<ArtworkFetch>(async (input, init) => {
      if (init.method === "HEAD") {
        expect(input).toBe(maschiffImage);
        return new Response(null, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }

      return new Response("<title>Pardon Our Interruption</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });

    await expect(
      resolveOfficialPokemonArtwork(maschiffSource, { fetchImpl }),
    ).resolves.toEqual({
      url: maschiffImage,
      provider: OFFICIAL_POKEMON_ARTWORK_PROVIDER,
      externalId: "ME05/ME05_EN_57",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const missingCandidate = vi.fn<ArtworkFetch>(async (_input, init) =>
      init.method === "HEAD"
        ? new Response(null, { status: 404 })
        : new Response("<title>No card metadata</title>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
    );
    await expect(
      resolveOfficialPokemonArtwork(maschiffSource, {
        fetchImpl: missingCandidate,
      }),
    ).resolves.toBeNull();
  });
});

describe("Pokémon artwork sync", () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = createDatabaseConnection(":memory:");
    runMigrations(connection.db);
    importCollectionCsv(connection.db, fs.readFileSync(seedPath));
  });

  afterEach(() => {
    connection.sqlite.close();
  });

  it("enriches official and exact vintage sources once", async () => {
    const fetchImpl = fetchWithVintageFallback();

    const first = await syncPokemonArtwork(connection.db, {
      fetchImpl,
      requestDelayMs: 0,
    });
    expect(first).toMatchObject({
      totalPrintings: 69,
      alreadyResolved: 0,
      attempted: 69,
      resolved: 69,
      unresolved: 0,
      failed: 0,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(70);

    const maschiff = connection.db
      .select({
        imageProvider: cardPrintings.imageProvider,
        imageExternalId: cardPrintings.imageExternalId,
        imageUrl: cardPrintings.imageUrl,
      })
      .from(cardPrintings)
      .where(eq(cardPrintings.name, "Maschiff"))
      .get();
    expect(maschiff).toEqual({
      imageProvider: OFFICIAL_POKEMON_ARTWORK_PROVIDER,
      imageExternalId: "ME05/ME05_EN_57",
      imageUrl: maschiffImage,
    });

    const service = createCollectionService(connection.db);
    expect(service.getCollectionEntry(68)).toMatchObject({
      name: "Bulbasaur",
      sealed: true,
      imageUrl:
        "https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/ME01/ME01_EN_133.png",
    });
    expect(service.getCollectionEntry(69)).toMatchObject({
      name: "Abra",
      imageProvider: VINTAGE_POKEMON_ARTWORK_PROVIDER,
      imageUrl:
        "https://tcgplayer-cdn.tcgplayer.com/product/42386_in_1000x1000.jpg",
    });

    importCollectionCsv(connection.db, fs.readFileSync(seedPath));
    fetchImpl.mockClear();
    const second = await syncPokemonArtwork(connection.db, {
      fetchImpl,
      requestDelayMs: 0,
    });
    expect(second).toMatchObject({
      totalPrintings: 69,
      alreadyResolved: 69,
      attempted: 0,
      resolved: 0,
      unresolved: 0,
      failed: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("persists successful cards when one official resolution fails", async () => {
    const fetchImpl = fetchWithVintageFallback(maschiffSource);

    const result = await syncPokemonArtwork(connection.db, {
      fetchImpl,
      requestDelayMs: 0,
    });
    expect(result).toMatchObject({
      attempted: 69,
      resolved: 68,
      failed: 1,
    });
    expect(
      connection.db
        .select({ imageUrl: cardPrintings.imageUrl })
        .from(cardPrintings)
        .where(eq(cardPrintings.name, "Maschiff"))
        .get(),
    ).toEqual({ imageUrl: null });
    expect(
      connection.db
        .select({ imageUrl: cardPrintings.imageUrl })
        .from(cardPrintings)
        .where(eq(cardPrintings.name, "Gligar"))
        .get()?.imageUrl,
    ).toMatch(/^https:\/\/assets\.pokemon\.com\//u);
  });
});

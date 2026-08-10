import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";
import { apiErrorResponse } from "@/lib/api/error-response";
import {
  applyCardImagePolicy,
  storedMetadataImageProvider,
} from "@/lib/images/card-image-provider";
import {
  getTrustedCardImageOrigins,
  isOfficialPokemonCardImageUrl,
  isTrustedCardImageUrl,
} from "@/lib/security/card-image-policy";
import { isLoopbackHostname } from "@/lib/security/host-policy";
import {
  MAX_MUTATION_BODY_BYTES,
  guardMutationOrigin,
  parseJsonMutationRequest,
} from "@/lib/security/mutation-request";
import {
  assertResetConfirmed,
  assertSafeResetTarget,
} from "@/lib/security/reset-safety";
import {
  createContentSecurityPolicy,
  getSecurityHeaders,
} from "@/lib/security/security-headers";
import {
  createCollectionEntrySchema,
  updateOwnedCardSchema,
} from "@/lib/services/collection-service";

const localOrigin = "http://127.0.0.1:3000";

function mutationRequest({
  origin = localOrigin,
  host = "127.0.0.1:3000",
  contentType = "application/json",
  body = '{"quantity":2}',
  fetchSite = "same-origin",
}: {
  origin?: string | null;
  host?: string;
  contentType?: string | null;
  body?: string;
  fetchSite?: string | null;
} = {}): Request {
  const headers = new Headers({ host });
  if (origin !== null) headers.set("origin", origin);
  if (contentType !== null) headers.set("content-type", contentType);
  if (fetchSite !== null) headers.set("sec-fetch-site", fetchSite);

  return new Request(`${localOrigin}/api/collection/1`, {
    method: "PATCH",
    headers,
    body,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("localhost security boundary", () => {
  it("configures the normal development and production commands for IPv4 loopback", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.dev).toBe("next dev --hostname 127.0.0.1");
    expect(packageJson.scripts.start).toBe("next start --hostname 127.0.0.1");
  });

  it("accepts only explicit loopback hostnames", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("192.168.1.20")).toBe(false);
    expect(isLoopbackHostname("cards.example.com")).toBe(false);
  });

  it("rejects non-loopback Host headers before routing", async () => {
    const allowed = proxy(
      new NextRequest(localOrigin, {
        headers: { host: "127.0.0.1:3000" },
      }),
    );
    const rejected = proxy(
      new NextRequest(localOrigin, {
        headers: { host: "cards.example.com" },
      }),
    );

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({
      error: "Cardboardex only accepts localhost requests.",
    });
  });
});

describe("same-origin JSON mutations", () => {
  it("accepts and parses a normal same-origin JSON mutation", async () => {
    const result = await parseJsonMutationRequest(mutationRequest());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toEqual({ quantity: 2 });
  });

  it("rejects an explicitly cross-origin mutation", async () => {
    const result = await parseJsonMutationRequest(
      mutationRequest({ origin: "https://attacker.example" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({
        error: "Cross-origin mutation requests are forbidden.",
      });
    }
  });

  it("rejects cross-site fetch metadata even when Origin is absent", () => {
    const rejection = guardMutationOrigin(
      mutationRequest({ origin: null, fetchSite: "cross-site" }),
    );

    expect(rejection?.status).toBe(403);
  });

  it("rejects non-loopback Host headers", async () => {
    const result = await parseJsonMutationRequest(
      mutationRequest({
        host: "cards.example.com",
        origin: "http://cards.example.com",
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects inappropriate content types", async () => {
    const result = await parseJsonMutationRequest(
      mutationRequest({ contentType: "text/plain" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(415);
      expect(await result.response.json()).toEqual({
        error: "Mutation request bodies must use application/json.",
      });
    }
  });

  it("returns a controlled 400 for malformed JSON", async () => {
    const result = await parseJsonMutationRequest(
      mutationRequest({ body: '{"quantity":' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual({
        error: "The request body is not valid JSON.",
      });
    }
  });

  it("rejects oversized mutation bodies", async () => {
    const result = await parseJsonMutationRequest(
      mutationRequest({ body: `"${"x".repeat(MAX_MUTATION_BODY_BYTES)}"` }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});

describe("mutation validation and error handling", () => {
  it("rejects unknown fields and validation boundary overflows", () => {
    expect(
      updateOwnedCardSchema.safeParse({ quantity: 1, publishedName: "Abra" })
        .success,
    ).toBe(false);
    expect(
      updateOwnedCardSchema.safeParse({ quantity: 1_000_001 }).success,
    ).toBe(false);
    expect(
      updateOwnedCardSchema.safeParse({ notes: "x".repeat(10_001) }).success,
    ).toBe(false);
  });

  it("does not expose internal error details to API clients", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorResponse(
      new Error("SQLITE_ERROR near secret at /home/private/cardboardex.sqlite"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "An unexpected database error occurred.",
    });
  });
});

describe("remote card-image policy", () => {
  it("trusts only the official Pokémon card-image path by default", () => {
    vi.stubEnv("CARDBOARDEX_TRUSTED_IMAGE_ORIGINS", "");

    expect(getTrustedCardImageOrigins()).toEqual([
      "https://assets.pokemon.com",
    ]);
    expect(isTrustedCardImageUrl("https://images.example.com/card.png")).toBe(
      false,
    );
    const officialImage =
      "https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/ME05/ME05_EN_57.png";
    expect(isOfficialPokemonCardImageUrl(officialImage)).toBe(true);
    expect(isTrustedCardImageUrl(officialImage)).toBe(true);
    expect(
      isTrustedCardImageUrl(
        "https://assets.pokemon.com/static2/_ui/img/favicon.ico",
      ),
    ).toBe(false);
    expect(
      storedMetadataImageProvider.resolve({
        gameSlug: "pokemon-tcg",
        setCode: "BS",
        collectorNumber: "43/102",
        imageUrl: "https://assets.pokemon.com/static2/_ui/img/favicon.ico",
      }),
    ).toBeNull();
  });

  it("allows exact configured public HTTPS origins only", () => {
    vi.stubEnv(
      "CARDBOARDEX_TRUSTED_IMAGE_ORIGINS",
      "https://images.example.com",
    );

    expect(isTrustedCardImageUrl("https://images.example.com/card.png")).toBe(
      true,
    );
    expect(isTrustedCardImageUrl("http://images.example.com/card.png")).toBe(
      false,
    );
    expect(
      isTrustedCardImageUrl("https://images.example.com.evil.test/card.png"),
    ).toBe(false);
    expect(
      isTrustedCardImageUrl("https://user@images.example.com/card.png"),
    ).toBe(false);
  });

  it("rejects local, private, non-HTTPS, and path-bearing configured origins", () => {
    expect(() =>
      getTrustedCardImageOrigins("http://images.example.com"),
    ).toThrow();
    expect(() => getTrustedCardImageOrigins("https://127.0.0.1")).toThrow();
    expect(() => getTrustedCardImageOrigins("https://192.168.1.2")).toThrow();
    expect(() =>
      getTrustedCardImageOrigins("https://metadata.google.internal"),
    ).toThrow();
    expect(() =>
      getTrustedCardImageOrigins("https://images.example.com/path"),
    ).toThrow();
  });

  it("sanitizes unsafe URLs already present in database records", () => {
    vi.stubEnv("CARDBOARDEX_TRUSTED_IMAGE_ORIGINS", "");
    const sanitized = applyCardImagePolicy({
      gameSlug: "pokemon-tcg",
      setCode: "BS",
      collectorNumber: "43/102",
      imageUrl: "http://127.0.0.1:8080/private",
    });

    expect(sanitized.imageUrl).toBeNull();
  });

  it("rejects untrusted image URLs at the mutation schema boundary", () => {
    vi.stubEnv("CARDBOARDEX_TRUSTED_IMAGE_ORIGINS", "");
    const result = createCollectionEntrySchema.safeParse({
      gameSlug: "pokemon-tcg",
      gameName: "Pokémon TCG",
      setCode: "BS",
      setName: "Base Set",
      name: "Abra",
      collectorNumber: "43/102",
      cardKind: "Pokémon",
      quantity: 1,
      imageUrl: "https://images.example.com/abra.png",
    });

    expect(result.success).toBe(false);
  });
});

describe("security headers", () => {
  it("sets the intended production headers without HSTS or unsafe-eval", () => {
    const headers = Object.fromEntries(
      getSecurityHeaders({ development: false }).map(({ key, value }) => [
        key,
        value,
      ]),
    );

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "img-src 'self' data:",
    );
    expect(headers["Content-Security-Policy"]).toContain("'unsafe-inline'");
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
  });

  it("limits the development CSP exception to unsafe-eval and loopback HMR", () => {
    const policy = createContentSecurityPolicy({
      development: true,
      imageOrigins: ["https://images.example.com"],
    });

    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).toContain("ws://127.0.0.1:*");
    expect(policy).toContain("https://images.example.com");
  });
});

describe("destructive reset safety", () => {
  it("requires explicit confirmation", () => {
    expect(() =>
      assertResetConfirmed([], "/tmp/cardboardex-security-test.sqlite"),
    ).toThrow(/without explicit confirmation/u);
    expect(() =>
      assertResetConfirmed(["--yes"], "/tmp/cardboardex-security-test.sqlite"),
    ).not.toThrow();
  });

  it("refuses unsafe reset targets", () => {
    expect(() => assertSafeResetTarget("/")).toThrow();
    expect(() => assertSafeResetTarget("README.md")).toThrow();
    expect(() =>
      assertSafeResetTarget("data/seed/do-not-delete.sqlite"),
    ).toThrow();
    expect(assertSafeResetTarget("/tmp/cardboardex-security-test.sqlite")).toBe(
      "/tmp/cardboardex-security-test.sqlite",
    );
  });
});

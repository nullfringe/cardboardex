import { NextResponse } from "next/server";

import { requestOrigin } from "./host-policy";

export const MAX_MUTATION_BODY_BYTES = 512 * 1024;

type ParsedMutationRequest =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse<{ error: string }> };

function errorResponse(
  error: string,
  status: 400 | 403 | 413 | 415,
): NextResponse<{ error: string }> {
  return NextResponse.json({ error }, { status });
}

export function guardMutationOrigin(
  request: Request,
): NextResponse<{ error: string }> | null {
  const effectiveOrigin = requestOrigin(request);
  if (!effectiveOrigin) {
    return errorResponse("Mutation requests require a loopback Host.", 403);
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLocaleLowerCase();
  if (fetchSite === "cross-site") {
    return errorResponse("Cross-origin mutation requests are forbidden.", 403);
  }

  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin !== null) {
    try {
      const parsedOrigin = new URL(suppliedOrigin);
      if (
        suppliedOrigin !== parsedOrigin.origin ||
        parsedOrigin.origin !== effectiveOrigin.origin
      ) {
        return errorResponse(
          "Cross-origin mutation requests are forbidden.",
          403,
        );
      }
    } catch {
      return errorResponse(
        "Cross-origin mutation requests are forbidden.",
        403,
      );
    }
  } else if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return errorResponse("Cross-origin mutation requests are forbidden.", 403);
  }

  // Forwarded host/proto headers are intentionally ignored: Cardboardex has no
  // trusted reverse proxy in its localhost-only deployment model.
  return null;
}

export async function parseJsonMutationRequest(
  request: Request,
): Promise<ParsedMutationRequest> {
  const originRejection = guardMutationOrigin(request);
  if (originRejection) return { ok: false, response: originRejection };

  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLocaleLowerCase();
  if (mediaType !== "application/json") {
    return {
      ok: false,
      response: errorResponse(
        "Mutation request bodies must use application/json.",
        415,
      ),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_MUTATION_BODY_BYTES
  ) {
    return {
      ok: false,
      response: errorResponse("Mutation request body is too large.", 413),
    };
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: errorResponse("The request body could not be read.", 400),
    };
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_MUTATION_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse("Mutation request body is too large.", 413),
    };
  }

  try {
    return { ok: true, body: JSON.parse(rawBody) as unknown };
  } catch {
    return {
      ok: false,
      response: errorResponse("The request body is not valid JSON.", 400),
    };
  }
}

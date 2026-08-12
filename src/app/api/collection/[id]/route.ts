import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/error-response";
import {
  guardMutationOrigin,
  parseJsonMutationRequest,
} from "@/lib/security/mutation-request";
import { getCollectionService } from "@/lib/services/collection-service";
import type { UpdateOwnedCardInput } from "@/lib/types/collection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function idFromContext(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  return parseId(id);
}

function profileFromUrl(request: Request): string {
  return new URL(request.url).searchParams.get("profile") ?? "";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const id = await idFromContext(context);
    if (id === null) {
      return NextResponse.json(
        { error: "Collection entry not found." },
        { status: 404 },
      );
    }

    const detail = getCollectionService().getCollectionEntry(
      profileFromUrl(request),
      id,
    );
    return detail
      ? NextResponse.json(detail)
      : NextResponse.json(
          { error: "Collection entry not found." },
          { status: 404 },
        );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const parsedRequest = await parseJsonMutationRequest(request);
    if (!parsedRequest.ok) return parsedRequest.response;

    const id = await idFromContext(context);
    if (id === null) {
      return NextResponse.json(
        { error: "Collection entry not found." },
        { status: 404 },
      );
    }

    const detail = getCollectionService().updateOwnedCard(
      profileFromUrl(request),
      id,
      parsedRequest.body as UpdateOwnedCardInput,
    );
    if (!detail) {
      return NextResponse.json(
        { error: "Collection entry not found." },
        { status: 404 },
      );
    }

    revalidatePath("/");
    revalidatePath(`/cards/${id}`);
    return NextResponse.json(detail);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const originRejection = guardMutationOrigin(request);
    if (originRejection) return originRejection;

    const id = await idFromContext(context);
    if (id === null) {
      return NextResponse.json(
        { error: "Collection entry not found." },
        { status: 404 },
      );
    }

    const deleted = getCollectionService().deleteCollectionEntry(
      profileFromUrl(request),
      id,
    );
    if (!deleted) {
      return NextResponse.json(
        { error: "Collection entry not found." },
        { status: 404 },
      );
    }

    revalidatePath("/");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

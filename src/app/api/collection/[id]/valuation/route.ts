import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/error-response";
import {
  guardMutationOrigin,
  parseJsonMutationRequest,
} from "@/lib/security/mutation-request";
import { getPricingService } from "@/lib/services/pricing-service";
import type { SetManualPriceEstimateInput } from "@/lib/types/pricing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function ownedCardId(context: RouteContext): Promise<number | null> {
  const { id: rawId } = await context.params;
  if (!/^\d+$/u.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function profileFromUrl(request: Request): string {
  return new URL(request.url).searchParams.get("profile") ?? "";
}

function notFoundResponse() {
  return NextResponse.json(
    { error: "Collection entry not found." },
    { status: 404 },
  );
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const parsedRequest = await parseJsonMutationRequest(request);
    if (!parsedRequest.ok) return parsedRequest.response;
    const id = await ownedCardId(context);
    if (id === null) return notFoundResponse();

    const estimate = getPricingService().setManualEstimate(
      profileFromUrl(request),
      id,
      parsedRequest.body as SetManualPriceEstimateInput,
    );
    if (estimate === undefined) return notFoundResponse();
    revalidatePath("/");
    revalidatePath(`/cards/${id}`);
    return NextResponse.json({ estimate });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const originRejection = guardMutationOrigin(request);
    if (originRejection) return originRejection;
    const id = await ownedCardId(context);
    if (id === null) return notFoundResponse();

    const estimate = getPricingService().clearManualEstimate(
      profileFromUrl(request),
      id,
    );
    if (estimate === undefined) return notFoundResponse();
    revalidatePath("/");
    revalidatePath(`/cards/${id}`);
    return NextResponse.json({ estimate });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/error-response";
import { parseJsonMutationRequest } from "@/lib/security/mutation-request";
import { getProfileService } from "@/lib/services/profile-service";
import type { DuplicateProfileInput } from "@/lib/types/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const parsedRequest = await parseJsonMutationRequest(request);
    if (!parsedRequest.ok) return parsedRequest.response;

    const { slug } = await context.params;
    const profile = getProfileService().duplicateProfile(
      slug,
      parsedRequest.body as DuplicateProfileInput,
    );
    revalidatePath("/");
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

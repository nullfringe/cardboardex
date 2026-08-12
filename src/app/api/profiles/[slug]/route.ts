import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/error-response";
import { parseJsonMutationRequest } from "@/lib/security/mutation-request";
import { getProfileService } from "@/lib/services/profile-service";
import type { UpdateProfileInput } from "@/lib/types/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const parsedRequest = await parseJsonMutationRequest(request);
    if (!parsedRequest.ok) return parsedRequest.response;

    const { slug } = await context.params;
    const profile = getProfileService().renameProfile(
      slug,
      parsedRequest.body as UpdateProfileInput,
    );
    revalidatePath("/");
    return NextResponse.json(profile);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

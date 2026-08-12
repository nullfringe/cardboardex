import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/error-response";
import { parseJsonMutationRequest } from "@/lib/security/mutation-request";
import { getProfileService } from "@/lib/services/profile-service";
import type { CreateProfileInput } from "@/lib/types/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  try {
    return NextResponse.json({ profiles: getProfileService().listProfiles() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsedRequest = await parseJsonMutationRequest(request);
    if (!parsedRequest.ok) return parsedRequest.response;

    const profile = getProfileService().createProfile(
      parsedRequest.body as CreateProfileInput,
    );
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import { type NextRequest, NextResponse } from "next/server";

import { isLoopbackRequest } from "@/lib/security/host-policy";

export function proxy(request: NextRequest) {
  if (!isLoopbackRequest(request)) {
    return NextResponse.json(
      { error: "Cardboardex only accepts localhost requests." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

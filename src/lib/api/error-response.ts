import { NextResponse } from "next/server";
import { ZodError } from "zod";

type ApiErrorBody = {
  error: string;
  issues?: Array<{ path: string; message: string }>;
};

export function apiErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error:
          error.issues[0]?.message ?? "The request contains invalid values.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "The request body is not valid JSON." },
      { status: 400 },
    );
  }

  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  ) {
    return NextResponse.json(
      { error: "That card identity already exists with conflicting data." },
      { status: 409 },
    );
  }

  console.error("Cardboardex API error", error);
  return NextResponse.json(
    { error: "An unexpected database error occurred." },
    { status: 500 },
  );
}

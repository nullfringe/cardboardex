import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  CardPrintingCatalogConflictError,
  CardSetCatalogConflictError,
  PrintingGroupConflictError,
} from "@/lib/repositories/collection-repository";
import { CollectionCsvError } from "@/lib/import/collection-csv";
import { MultipleCollectionSourcesError } from "@/lib/import/profile-collection-sync";
import { LastProfileDeletionError } from "@/lib/repositories/profile-repository";
import { ProfileNotFoundError } from "@/lib/services/profile-service";

type ApiErrorBody = {
  error: string;
  issues?: Array<{ path: string; message: string }>;
};

export function apiErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ProfileNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof LastProfileDeletionError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof CollectionCsvError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof MultipleCollectionSourcesError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof CardSetCatalogConflictError ||
    error instanceof CardPrintingCatalogConflictError ||
    error instanceof PrintingGroupConflictError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
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

import { NextResponse } from "next/server";

import { guardMutationOrigin } from "@/lib/security/mutation-request";

export const MAX_COLLECTION_CSV_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

type ParsedCollectionUpload =
  | { ok: true; csv: Buffer; filename: string }
  | { ok: false; response: NextResponse<{ error: string }> };

function errorResponse(
  error: string,
  status: 400 | 413 | 415,
): NextResponse<{ error: string }> {
  return NextResponse.json({ error }, { status });
}

export async function parseCollectionCsvUpload(
  request: Request,
): Promise<ParsedCollectionUpload> {
  const originRejection = guardMutationOrigin(request);
  if (originRejection) return { ok: false, response: originRejection };

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("multipart/form-data;") ||
    !contentType.includes("boundary=")
  ) {
    return {
      ok: false,
      response: errorResponse(
        "Collection imports must use a multipart CSV upload.",
        415,
      ),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength >
      MAX_COLLECTION_CSV_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
  ) {
    return {
      ok: false,
      response: errorResponse("The collection CSV is too large.", 413),
    };
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      ok: false,
      response: errorResponse("The collection upload could not be read.", 400),
    };
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return {
      ok: false,
      response: errorResponse("Choose a CSV file to import.", 400),
    };
  }
  if (!uploaded.name.toLowerCase().endsWith(".csv")) {
    return {
      ok: false,
      response: errorResponse("Collection imports must use a .csv file.", 415),
    };
  }
  if (uploaded.size > MAX_COLLECTION_CSV_UPLOAD_BYTES) {
    return {
      ok: false,
      response: errorResponse("The collection CSV is too large.", 413),
    };
  }

  return {
    ok: true,
    csv: Buffer.from(await uploaded.arrayBuffer()),
    filename: uploaded.name,
  };
}

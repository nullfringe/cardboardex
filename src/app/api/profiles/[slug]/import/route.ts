import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getDatabaseConnection, resolveDatabasePath } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { apiErrorResponse } from "@/lib/api/error-response";
import { parseCollectionCsvUpload } from "@/lib/import/collection-upload";
import { createDatabaseBackup } from "@/lib/import/database-backup";
import { syncProfileCollectionCsv } from "@/lib/import/profile-collection-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const upload = await parseCollectionCsvUpload(request);
    if (!upload.ok) return upload.response;

    const mode = new URL(request.url).searchParams.get("mode");
    if (mode !== "preview" && mode !== "apply") {
      return NextResponse.json(
        { error: "Collection import mode must be preview or apply." },
        { status: 400 },
      );
    }

    const { slug } = await context.params;
    const connection = getDatabaseConnection();
    runMigrations(connection.db);

    const preview = syncProfileCollectionCsv(connection.db, slug, upload.csv, {
      dryRun: true,
    });
    if (mode === "preview") {
      return NextResponse.json({
        ...preview,
        filename: upload.filename,
        mode,
        backupPath: null,
      });
    }

    const backup = await createDatabaseBackup(
      connection.sqlite,
      resolveDatabasePath(),
    );
    const imported = syncProfileCollectionCsv(connection.db, slug, upload.csv);
    revalidatePath("/");
    return NextResponse.json({
      ...imported,
      filename: upload.filename,
      mode,
      backupPath: backup?.displayPath ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

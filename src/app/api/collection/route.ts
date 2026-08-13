import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/error-response";
import { parseJsonMutationRequest } from "@/lib/security/mutation-request";
import { getCollectionService } from "@/lib/services/collection-service";
import type {
  CollectionListQuery,
  CollectionSortField,
  CreateCollectionEntryInput,
} from "@/lib/types/collection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sortFields = new Set<CollectionSortField>([
  "name",
  "set",
  "collectorNumber",
  "pokemonType",
  "hp",
  "quantity",
]);

function optionalParameter(
  searchParams: URLSearchParams,
  key: string,
): string | undefined {
  const value = searchParams.get(key)?.trim();
  return value || undefined;
}

function queryFromUrl(request: Request): CollectionListQuery {
  const searchParams = new URL(request.url).searchParams;
  const sortField = optionalParameter(searchParams, "sort");
  const direction = optionalParameter(searchParams, "direction");
  const sealed = optionalParameter(searchParams, "sealed");
  const query: CollectionListQuery = {
    search: optionalParameter(searchParams, "search"),
    gameSlug: optionalParameter(searchParams, "game"),
    languageCode: optionalParameter(searchParams, "language"),
    cardKind: optionalParameter(searchParams, "kind"),
    pokemonType: optionalParameter(searchParams, "type"),
    setCode: optionalParameter(searchParams, "set"),
    subtype: optionalParameter(searchParams, "subtype"),
    rarity: optionalParameter(searchParams, "rarity"),
    printingFinish: optionalParameter(searchParams, "printingFinish"),
    cardBackDesign: optionalParameter(searchParams, "cardBack"),
    physicalForm: optionalParameter(searchParams, "form"),
    finishVariant: optionalParameter(searchParams, "variant"),
  };

  if (sealed === "true" || sealed === "false") {
    query.sealed = sealed === "true";
  }

  if (sortField && sortFields.has(sortField as CollectionSortField)) {
    query.sort = {
      field: sortField as CollectionSortField,
      direction: direction === "desc" ? "desc" : "asc",
    };
  }

  return query;
}

function profileFromUrl(request: Request): string {
  return new URL(request.url).searchParams.get("profile") ?? "";
}

export function GET(request: Request) {
  try {
    const service = getCollectionService();
    const profileSlug = profileFromUrl(request);
    return NextResponse.json({
      items: service.listCollection(profileSlug, queryFromUrl(request)),
      facets: service.getCollectionFacets(profileSlug),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsedRequest = await parseJsonMutationRequest(request);
    if (!parsedRequest.ok) return parsedRequest.response;

    const detail = getCollectionService().createCollectionEntry(
      profileFromUrl(request),
      parsedRequest.body as CreateCollectionEntryInput,
    );
    revalidatePath("/");
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import { CollectionBrowser } from "@/components/collection-browser";
import { SiteHeader } from "@/components/site-header";
import { getCollectionService } from "@/lib/services/collection-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function CollectionPage() {
  const service = getCollectionService();
  const items = service.listCollection();
  const facets = service.getCollectionFacets();

  return (
    <div className="app-shell">
      <SiteHeader />
      <CollectionBrowser facets={facets} initialItems={items} />
    </div>
  );
}

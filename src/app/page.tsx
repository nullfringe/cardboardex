import { CollectionBrowser } from "@/components/collection-browser";
import { SiteHeader } from "@/components/site-header";
import {
  selectProfile,
  type ProfileSearchParameter,
} from "@/lib/profiles/selection";
import { getCollectionService } from "@/lib/services/collection-service";
import { getPricingService } from "@/lib/services/pricing-service";
import { getProfileService } from "@/lib/services/profile-service";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CollectionPageProps = {
  searchParams: Promise<{ profile?: ProfileSearchParameter }>;
};

export default async function CollectionPage({
  searchParams,
}: CollectionPageProps) {
  const params = await searchParams;
  const profileService = getProfileService();
  const profile = selectProfile(profileService, params.profile);
  if (!profile) notFound();

  const profiles = profileService.listProfiles();
  const service = getCollectionService();
  const items = service.listCollection(profile.slug);
  const facets = service.getCollectionFacets(profile.slug);
  const valuation = getPricingService().summarize(
    items,
    profile.defaultPricingCondition,
  );

  return (
    <div className="app-shell">
      <SiteHeader
        activeProfile={profile}
        honorStoredSelection={!params.profile}
        profiles={profiles}
      />
      <CollectionBrowser
        facets={facets}
        initialItems={items}
        profile={profile}
        valuation={valuation}
      />
    </div>
  );
}

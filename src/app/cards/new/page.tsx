import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreateCardForm } from "@/components/create-card-form";
import { SiteHeader } from "@/components/site-header";
import {
  selectProfile,
  type ProfileSearchParameter,
} from "@/lib/profiles/selection";
import { getProfileService } from "@/lib/services/profile-service";

export const metadata: Metadata = {
  title: "Add card",
  description: "Add a card printing and owned copy to Cardboardex.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NewCardPageProps = {
  searchParams: Promise<{ profile?: ProfileSearchParameter }>;
};

export default async function NewCardPage({ searchParams }: NewCardPageProps) {
  const query = await searchParams;
  const profileService = getProfileService();
  const profile = selectProfile(profileService, query.profile);
  if (!profile) notFound();

  return (
    <div className="app-shell">
      <SiteHeader
        activeProfile={profile}
        compact
        profiles={profileService.listProfiles()}
      />
      <CreateCardForm profile={profile} />
    </div>
  );
}

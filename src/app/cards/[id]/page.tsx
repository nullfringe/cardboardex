import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CardDetailView } from "@/components/card-detail-view";
import {
  selectProfile,
  type ProfileSearchParameter,
} from "@/lib/profiles/selection";
import { getCollectionService } from "@/lib/services/collection-service";
import { getProfileService } from "@/lib/services/profile-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CardPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ profile?: ProfileSearchParameter }>;
};

function parseOwnedCardId(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: CardPageProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const query = await searchParams;
  const id = parseOwnedCardId(rawId);
  if (id === null) return { title: "Card not found" };

  const profile = selectProfile(getProfileService(), query.profile);
  if (!profile) return { title: "Card not found" };
  const card = getCollectionService().getCollectionEntry(profile.slug, id);
  return card
    ? {
        title: card.name,
        description: `${card.setName} ${card.collectorNumber}`,
      }
    : { title: "Card not found" };
}

export default async function CardPage({
  params,
  searchParams,
}: CardPageProps) {
  const { id: rawId } = await params;
  const query = await searchParams;
  const id = parseOwnedCardId(rawId);
  if (id === null) notFound();

  const profileService = getProfileService();
  const profile = selectProfile(profileService, query.profile);
  if (!profile) notFound();

  const card = getCollectionService().getCollectionEntry(profile.slug, id);
  if (!card) notFound();

  return (
    <CardDetailView
      card={card}
      profile={profile}
      profiles={profileService.listProfiles()}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CardDetailView } from "@/components/card-detail-view";
import { getCollectionService } from "@/lib/services/collection-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CardPageProps = {
  params: Promise<{ id: string }>;
};

function parseOwnedCardId(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({
  params,
}: CardPageProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = parseOwnedCardId(rawId);
  if (id === null) return { title: "Card not found" };

  const card = getCollectionService().getCollectionEntry(id);
  return card
    ? {
        title: card.name,
        description: `${card.setName} ${card.collectorNumber}`,
      }
    : { title: "Card not found" };
}

export default async function CardPage({ params }: CardPageProps) {
  const { id: rawId } = await params;
  const id = parseOwnedCardId(rawId);
  if (id === null) notFound();

  const card = getCollectionService().getCollectionEntry(id);
  if (!card) notFound();

  return <CardDetailView card={card} />;
}

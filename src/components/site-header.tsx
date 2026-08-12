import { Plus } from "lucide-react";
import Link from "next/link";

import type { Profile } from "@/lib/types/profile";

import { ProfileSwitcher } from "./profile-switcher";

type SiteHeaderProps = {
  compact?: boolean;
  profiles?: Profile[];
  activeProfile?: Profile;
  honorStoredSelection?: boolean;
};

export function SiteHeader({
  compact = false,
  profiles = [],
  activeProfile,
  honorStoredSelection = false,
}: SiteHeaderProps) {
  const profileQuery = activeProfile
    ? `?profile=${encodeURIComponent(activeProfile.slug)}`
    : "";

  return (
    <header className={`site-header${compact ? " site-header--compact" : ""}`}>
      <Link
        className="brand"
        href={`/${profileQuery}`}
        aria-label="Cardboardex collection"
      >
        <span className="brand__mark" aria-hidden="true">
          <span />
          <span />
        </span>
        <span className="brand__wordmark">Cardboardex</span>
      </Link>
      {activeProfile ? (
        <ProfileSwitcher
          activeProfile={activeProfile}
          honorStoredSelection={honorStoredSelection}
          initialProfiles={profiles}
        />
      ) : null}
      <Link
        className="button button--primary button--small"
        href={`/cards/new${profileQuery}`}
      >
        <Plus size={17} aria-hidden="true" />
        <span>Add card</span>
      </Link>
    </header>
  );
}

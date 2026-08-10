import { Plus } from "lucide-react";
import Link from "next/link";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className={`site-header${compact ? " site-header--compact" : ""}`}>
      <Link className="brand" href="/" aria-label="Cardboardex collection">
        <span className="brand__mark" aria-hidden="true">
          <span />
          <span />
        </span>
        <span className="brand__wordmark">Cardboardex</span>
      </Link>
      <Link className="button button--primary button--small" href="/cards/new">
        <Plus size={17} aria-hidden="true" />
        <span>Add card</span>
      </Link>
    </header>
  );
}

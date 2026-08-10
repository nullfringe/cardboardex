import { ArrowLeft, Layers3 } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="app-shell">
      <SiteHeader compact />
      <main className="state-page">
        <Layers3 size={42} aria-hidden="true" />
        <p className="eyebrow">Not found</p>
        <h1>That card is not in this collection.</h1>
        <p>It may have been removed, or the link may no longer be valid.</p>
        <Link className="button button--primary" href="/">
          <ArrowLeft size={18} aria-hidden="true" />
          Back to collection
        </Link>
      </main>
    </div>
  );
}

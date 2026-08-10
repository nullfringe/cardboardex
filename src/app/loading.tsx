import { SiteHeader } from "@/components/site-header";

export default function Loading() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main
        className="collection-main"
        aria-busy="true"
        aria-label="Loading collection"
      >
        <div className="loading-heading skeleton" />
        <div className="loading-controls skeleton" />
        <div className="card-grid" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <div className="card-tile card-tile--skeleton" key={index}>
              <div className="skeleton card-tile__image-skeleton" />
              <div className="skeleton card-tile__line" />
              <div className="skeleton card-tile__line card-tile__line--short" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

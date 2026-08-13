"use client";

import {
  ArrowDownAZ,
  Box,
  Filter,
  Layers3,
  PackageCheck,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import type {
  CollectionFacets,
  CollectionListItem,
  CollectionSortField,
  SortDirection,
} from "@/lib/types/collection";
import type { Profile } from "@/lib/types/profile";
import { languageBadge } from "@/lib/languages";

import { CardArtwork } from "./card-artwork";

type CollectionBrowserProps = {
  initialItems: CollectionListItem[];
  facets: CollectionFacets;
  profile: Profile;
};

type BrowserFilters = {
  gameSlug: string;
  languageCode: string;
  cardKind: string;
  pokemonType: string;
  setCode: string;
  subtype: string;
  printingFinish: string;
  cardBackDesign: string;
  physicalForm: string;
  finishVariant: string;
  rarity: string;
};

const emptyFilters: BrowserFilters = {
  gameSlug: "",
  languageCode: "",
  cardKind: "",
  pokemonType: "",
  setCode: "",
  subtype: "",
  printingFinish: "",
  cardBackDesign: "",
  physicalForm: "",
  finishVariant: "",
  rarity: "",
};

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareNullable<T>(
  left: T | null,
  right: T | null,
  compare: (a: T, b: T) => number,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compare(left, right);
}

function compareItems(
  left: CollectionListItem,
  right: CollectionListItem,
  field: CollectionSortField,
): number {
  switch (field) {
    case "set":
      return (
        collator.compare(left.setName, right.setName) ||
        compareNullable(
          left.collectorNumber,
          right.collectorNumber,
          collator.compare,
        )
      );
    case "collectorNumber":
      return (
        compareNullable(
          left.collectorNumber,
          right.collectorNumber,
          collator.compare,
        ) || collator.compare(left.setName, right.setName)
      );
    case "pokemonType":
      return compareNullable(
        left.pokemonType,
        right.pokemonType,
        collator.compare,
      );
    case "hp":
      return compareNullable(left.hp, right.hp, (a, b) => a - b);
    case "quantity":
      return left.quantity - right.quantity;
    case "name":
    default:
      return collator.compare(left.name, right.name);
  }
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase().trim();
}

function matchesSearch(item: CollectionListItem, query: string): boolean {
  if (!query) return true;
  const haystack = normalizeSearch(
    [
      item.name,
      item.canonicalName,
      item.collectorNumber,
      item.setName,
      item.setCode,
      item.printedIdentifierText,
      item.printingFinish,
      item.cardBackDesign,
      item.physicalForm,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(query);
}

function matchesFilters(
  item: CollectionListItem,
  filters: BrowserFilters,
): boolean {
  return (
    (!filters.gameSlug || item.gameSlug === filters.gameSlug) &&
    (!filters.languageCode || item.languageCode === filters.languageCode) &&
    (!filters.cardKind || item.cardKind === filters.cardKind) &&
    (!filters.pokemonType || item.pokemonType === filters.pokemonType) &&
    (!filters.setCode || item.setCode === filters.setCode) &&
    (!filters.subtype || item.subtype === filters.subtype) &&
    (!filters.printingFinish ||
      item.printingFinish === filters.printingFinish) &&
    (!filters.cardBackDesign ||
      item.cardBackDesign === filters.cardBackDesign) &&
    (!filters.physicalForm || item.physicalForm === filters.physicalForm) &&
    (!filters.finishVariant || item.finishVariant === filters.finishVariant) &&
    (!filters.rarity || item.rarity === filters.rarity)
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: CollectionFacets[keyof CollectionFacets];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field field--compact" htmlFor={id}>
      <span className="field__label">{label}</span>
      <span className="select-wrap">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">All</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function CollectionCard({ item }: { item: CollectionListItem }) {
  return (
    <Link
      className="card-tile"
      href={`/cards/${item.ownedCardId}?profile=${encodeURIComponent(item.profileSlug)}`}
      aria-label={`View ${item.name}`}
    >
      <div className="card-tile__artwork-wrap">
        <CardArtwork
          cardKind={item.cardKind}
          collectorNumber={item.collectorNumber}
          imageUrl={item.imageUrl}
          name={item.name}
          pokemonType={item.pokemonType}
        />
        {item.quantity > 1 ? (
          <span
            className="quantity-badge"
            aria-label={`${item.quantity} owned`}
          >
            ×{item.quantity}
          </span>
        ) : null}
        {item.sealed ? (
          <span className="sealed-badge">
            <PackageCheck size={12} aria-hidden="true" /> Sealed
          </span>
        ) : null}
      </div>
      <div className="card-tile__body">
        <div className="card-tile__heading">
          <div>
            <h2>{item.name}</h2>
            {item.canonicalName && item.canonicalName !== item.name ? (
              <small>{item.canonicalName}</small>
            ) : null}
          </div>
          {item.hp !== null ? (
            <span className="card-tile__hp">{item.hp} HP</span>
          ) : null}
        </div>
        <p className="card-tile__set">
          <span>{item.setName}</span>
          {item.collectorNumber ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.collectorNumber}</span>
            </>
          ) : null}
        </p>
        <div className="card-tile__tags">
          <span className="meta-pill" title={item.languageCode}>
            {languageBadge(item.languageCode)}
          </span>
          {item.pokemonType ? (
            <span
              className={`type-pill type-pill--${item.pokemonType.toLocaleLowerCase()}`}
            >
              <span aria-hidden="true" /> {item.pokemonType}
            </span>
          ) : (
            <span className="meta-pill">{item.cardKind}</span>
          )}
          {item.rarity ? (
            <span className="meta-pill">{item.rarity}</span>
          ) : null}
          {item.printingFinish ? (
            <span className="meta-pill">{item.printingFinish}</span>
          ) : null}
          {item.physicalForm ? (
            <span className="meta-pill">{item.physicalForm}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function CollectionBrowser({
  initialItems,
  facets,
  profile,
}: CollectionBrowserProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<BrowserFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortField, setSortField] = useState<CollectionSortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const totalCards = initialItems.reduce((sum, item) => sum + item.quantity, 0);
  const filteredItems = useMemo(() => {
    const query = normalizeSearch(deferredSearch);
    const direction = sortDirection === "asc" ? 1 : -1;

    return initialItems
      .filter(
        (item) => matchesSearch(item, query) && matchesFilters(item, filters),
      )
      .sort((left, right) => {
        const primary = compareItems(left, right, sortField) * direction;
        return primary || collator.compare(left.name, right.name);
      });
  }, [deferredSearch, filters, initialItems, sortDirection, sortField]);

  function setFilter(key: keyof BrowserFilters, value: string): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters(): void {
    setFilters(emptyFilters);
    setSearch("");
  }

  return (
    <main className="collection-main">
      <section className="collection-intro" aria-labelledby="collection-title">
        <div>
          <p className="eyebrow">{profile.name}</p>
          <h1 id="collection-title">The cards you own.</h1>
        </div>
        <dl className="collection-counts" aria-label="Collection totals">
          <div>
            <dt>Printings</dt>
            <dd>{initialItems.length}</dd>
          </div>
          <div>
            <dt>Physical cards</dt>
            <dd>{totalCards}</dd>
          </div>
        </dl>
      </section>

      <section className="browser-controls" aria-label="Browse collection">
        <div className="browser-controls__primary">
          <label className="search-field">
            <span className="sr-only">Search cards</span>
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search name, set, or number…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={17} aria-hidden="true" />
              </button>
            ) : null}
          </label>

          <button
            className={`control-button${filtersOpen ? " control-button--active" : ""}`}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="collection-filters"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            Filters
            {activeFilterCount ? (
              <span className="control-button__count">{activeFilterCount}</span>
            ) : null}
          </button>

          <label className="sort-control">
            <ArrowDownAZ size={18} aria-hidden="true" />
            <span className="sr-only">Sort cards by</span>
            <select
              value={sortField}
              onChange={(event) =>
                setSortField(event.target.value as CollectionSortField)
              }
            >
              <option value="name">Name</option>
              <option value="set">Set</option>
              <option value="collectorNumber">Collector number</option>
              <option value="pokemonType">Type</option>
              <option value="hp">HP</option>
              <option value="quantity">Quantity</option>
            </select>
          </label>
          <button
            className="direction-button"
            type="button"
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
            title={`Currently ${sortDirection === "asc" ? "ascending" : "descending"}`}
            onClick={() =>
              setSortDirection((value) => (value === "asc" ? "desc" : "asc"))
            }
          >
            {sortDirection === "asc" ? "A–Z" : "Z–A"}
          </button>
        </div>

        {filtersOpen ? (
          <div className="filter-panel" id="collection-filters">
            <div className="filter-panel__heading">
              <span>
                <Filter size={16} aria-hidden="true" /> Narrow the shelf
              </span>
              {activeFilterCount ? (
                <button type="button" onClick={clearFilters}>
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="filter-panel__grid">
              <FilterSelect
                id="filter-game"
                label="Game"
                value={filters.gameSlug}
                options={facets.games}
                onChange={(value) => setFilter("gameSlug", value)}
              />
              <FilterSelect
                id="filter-language"
                label="Language"
                value={filters.languageCode}
                options={facets.languages}
                onChange={(value) => setFilter("languageCode", value)}
              />
              <FilterSelect
                id="filter-kind"
                label="Card kind"
                value={filters.cardKind}
                options={facets.cardKinds}
                onChange={(value) => setFilter("cardKind", value)}
              />
              <FilterSelect
                id="filter-type"
                label="Pokémon type"
                value={filters.pokemonType}
                options={facets.pokemonTypes}
                onChange={(value) => setFilter("pokemonType", value)}
              />
              <FilterSelect
                id="filter-set"
                label="Expansion"
                value={filters.setCode}
                options={facets.sets}
                onChange={(value) => setFilter("setCode", value)}
              />
              <FilterSelect
                id="filter-subtype"
                label="Stage / subtype"
                value={filters.subtype}
                options={facets.subtypes}
                onChange={(value) => setFilter("subtype", value)}
              />
              <FilterSelect
                id="filter-rarity"
                label="Rarity"
                value={filters.rarity}
                options={facets.rarities}
                onChange={(value) => setFilter("rarity", value)}
              />
              {facets.printingFinishes.length ? (
                <FilterSelect
                  id="filter-printing-finish"
                  label="Published finish"
                  value={filters.printingFinish}
                  options={facets.printingFinishes}
                  onChange={(value) => setFilter("printingFinish", value)}
                />
              ) : null}
              {facets.cardBackDesigns.length ? (
                <FilterSelect
                  id="filter-card-back"
                  label="Card back"
                  value={filters.cardBackDesign}
                  options={facets.cardBackDesigns}
                  onChange={(value) => setFilter("cardBackDesign", value)}
                />
              ) : null}
              {facets.physicalForms.length ? (
                <FilterSelect
                  id="filter-physical-form"
                  label="Physical form"
                  value={filters.physicalForm}
                  options={facets.physicalForms}
                  onChange={(value) => setFilter("physicalForm", value)}
                />
              ) : null}
              {facets.finishVariants.length ? (
                <FilterSelect
                  id="filter-variant"
                  label="Finish / variant"
                  value={filters.finishVariant}
                  options={facets.finishVariants}
                  onChange={(value) => setFilter("finishVariant", value)}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="result-bar" aria-live="polite">
        <span>
          {filteredItems.length === initialItems.length
            ? `${initialItems.length} printings`
            : `${filteredItems.length} of ${initialItems.length} printings`}
        </span>
        {activeFilterCount || search ? (
          <button type="button" onClick={clearFilters}>
            Reset view
          </button>
        ) : null}
      </div>

      {filteredItems.length ? (
        <section className="card-grid" aria-label="Cards in collection">
          {filteredItems.map((item) => (
            <CollectionCard item={item} key={item.ownedCardId} />
          ))}
        </section>
      ) : (
        <section className="empty-collection">
          <Box size={36} aria-hidden="true" />
          <h2>No cards match this view.</h2>
          <p>Try a broader search or clear one of the active filters.</p>
          <button className="button" type="button" onClick={clearFilters}>
            Clear search and filters
          </button>
        </section>
      )}

      <footer className="collection-footer">
        <Layers3 size={15} aria-hidden="true" />
        <span>
          Cardboardex keeps published printings separate from the copies you
          own.
        </span>
      </footer>
    </main>
  );
}

import {
  ArrowLeft,
  CircleDollarSign,
  ExternalLink,
  HeartPulse,
  PackageCheck,
  Shield,
  Sparkles,
  Swords,
  Wind,
} from "lucide-react";
import Link from "next/link";

import { languageBadge, languageName } from "@/lib/languages";
import { estimateLotValue, formatMoney } from "@/lib/pricing/money";
import type { CollectionDetail } from "@/lib/types/collection";
import type { Profile } from "@/lib/types/profile";

import { CardArtwork } from "./card-artwork";
import { EnergyCost } from "./energy-cost";
import { OwnedCardEditor } from "./owned-card-editor";
import { SiteHeader } from "./site-header";

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  if (value === null || value === "") return null;

  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function providerLabel(provider: string): string {
  if (provider === "manual") return "Manual estimate";
  if (provider === "tcgcsv-tcgplayer") return "TCGplayer via TCGCSV";
  if (provider === "tcgplayer-marketplace") return "TCGplayer";
  return provider;
}

function observationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function CardDetailView({
  card,
  profile,
  profiles,
}: {
  card: CollectionDetail;
  profile: Profile;
  profiles: Profile[];
}) {
  const hasCombatFacts =
    card.weakness !== null ||
    card.resistance !== null ||
    card.retreatCost !== null;

  return (
    <div className="app-shell">
      <SiteHeader activeProfile={profile} compact profiles={profiles} />
      <main className="detail-main">
        <Link
          className="back-link"
          href={`/?profile=${encodeURIComponent(profile.slug)}`}
        >
          <ArrowLeft size={17} aria-hidden="true" /> Collection
        </Link>

        <div className="detail-layout">
          <section
            className="detail-art-column"
            aria-label={`${card.name} artwork`}
          >
            <CardArtwork
              cardKind={card.cardKind}
              collectorNumber={card.collectorNumber}
              imageUrl={card.imageUrl}
              name={card.name}
              pokemonType={card.pokemonType}
              priority
              size="detail"
            />
            {card.externalReferenceUrl ? (
              <a
                className="source-link"
                href={card.externalReferenceUrl}
                rel="noreferrer"
                target="_blank"
              >
                View identification source{" "}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            ) : null}
          </section>

          <article className="detail-content">
            <header className="detail-heading">
              <p className="eyebrow">
                {card.gameName} · {card.setName}
              </p>
              <div className="detail-title-line">
                <div>
                  <h1>{card.name}</h1>
                  {card.canonicalName && card.canonicalName !== card.name ? (
                    <p>{card.canonicalName}</p>
                  ) : null}
                </div>
                {card.hp !== null ? (
                  <span className="detail-hp">
                    <HeartPulse size={17} aria-hidden="true" /> {card.hp} HP
                  </span>
                ) : null}
              </div>
              <div className="detail-badges">
                <span
                  className="detail-badge"
                  title={languageName(card.languageCode)}
                >
                  {languageBadge(card.languageCode)}
                </span>
                {card.pokemonType ? (
                  <span
                    className={`type-pill type-pill--${card.pokemonType.toLocaleLowerCase()}`}
                  >
                    <span aria-hidden="true" /> {card.pokemonType}
                  </span>
                ) : null}
                <span className="detail-badge">{card.cardKind}</span>
                {card.subtype ? (
                  <span className="detail-badge">{card.subtype}</span>
                ) : null}
                {card.rarity ? (
                  <span className="detail-badge detail-badge--accent">
                    {card.rarity}
                  </span>
                ) : null}
                {card.sealed ? (
                  <span className="detail-badge detail-badge--sealed">
                    <PackageCheck size={13} aria-hidden="true" /> Sealed
                  </span>
                ) : null}
              </div>
            </header>

            <section
              className="detail-section"
              aria-labelledby="printing-heading"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Published printing</p>
                  <h2 id="printing-heading">Card facts</h2>
                </div>
                <span className="set-stamp">{card.setCode}</span>
              </div>
              <dl className="fact-grid">
                <Fact label="Expansion" value={card.setName} />
                <Fact label="Collector no." value={card.collectorNumber} />
                <Fact
                  label="Language"
                  value={languageName(card.languageCode)}
                />
                <Fact
                  label="Printing variant"
                  value={card.printingVariantKey}
                />
                <Fact label="Published finish" value={card.printingFinish} />
                <Fact label="Card-back design" value={card.cardBackDesign} />
                <Fact label="Physical form" value={card.physicalForm} />
                <Fact label="Regulation mark" value={card.regulationMark} />
                <Fact label="Evolves from" value={card.evolvesFrom} />
                <Fact
                  label="Catalog identity"
                  value={
                    card.catalogProvider && card.catalogExternalId
                      ? `${card.catalogProvider}: ${card.catalogExternalId}`
                      : null
                  }
                />
                <Fact
                  label="Artwork provider"
                  value={card.imageUrl ? card.imageProvider : null}
                />
              </dl>
              {card.printedIdentifiers.length ? (
                <dl className="fact-grid">
                  {card.printedIdentifiers.map((identifier) => (
                    <Fact
                      key={identifier.id}
                      label={
                        identifier.label ??
                        identifier.role.replace(/[-/]/gu, " ")
                      }
                      value={identifier.value}
                    />
                  ))}
                </dl>
              ) : null}
              {card.printingGroups.length ? (
                <dl className="fact-grid">
                  {card.printingGroups.map((group) => (
                    <Fact
                      key={group.id}
                      label={group.name ?? group.groupType}
                      value={`${group.componentKey}${group.expectedComponentCount ? ` of ${group.expectedComponentCount}` : ""}`}
                    />
                  ))}
                </dl>
              ) : null}
            </section>

            <section
              className="detail-section market-value-section"
              aria-labelledby="market-value-heading"
            >
              <div className="section-heading section-heading--icon">
                <span className="section-icon">
                  <CircleDollarSign size={17} aria-hidden="true" />
                </span>
                <div>
                  <p className="eyebrow">Secondary market</p>
                  <h2 id="market-value-heading">Estimated value</h2>
                </div>
              </div>
              {card.marketEstimate ? (
                <>
                  <div className="market-value__amount">
                    <strong>
                      {formatMoney(
                        card.marketEstimate.unitAmountMinor,
                        card.marketEstimate.currency,
                      )}
                    </strong>
                    <span>per card</span>
                  </div>
                  {card.quantity > 1 ? (
                    <p className="market-value__lot">
                      Estimated lot value:{" "}
                      <strong>
                        {formatMoney(
                          estimateLotValue(card.marketEstimate, card.quantity),
                          card.marketEstimate.currency,
                        )}
                      </strong>{" "}
                      for {card.quantity} cards
                    </p>
                  ) : null}
                  <dl className="fact-grid market-value__facts">
                    <Fact
                      label="Source"
                      value={providerLabel(card.marketEstimate.provider)}
                    />
                    <Fact
                      label="Price basis"
                      value={card.marketEstimate.basis.replace("-", " ")}
                    />
                    <Fact
                      label="Provider finish"
                      value={
                        card.marketEstimate.providerVariant
                          ? `${card.marketEstimate.providerVariant}${card.marketEstimate.pricingVariantAssumed ? " (fallback)" : ""}`
                          : null
                      }
                    />
                    <Fact
                      label="Price condition"
                      value={
                        card.marketEstimate.priceCondition
                          ? `${card.marketEstimate.priceCondition}${card.marketEstimate.conditionOverridden ? " (per-card override)" : card.marketEstimate.conditionAssumed ? " (profile assumption)" : ""}`
                          : "Unspecified"
                      }
                    />
                    <Fact
                      label="Checked"
                      value={observationDate(card.marketEstimate.lastSeenAt)}
                    />
                    <Fact
                      label="Low"
                      value={
                        card.marketEstimate.lowPriceMinor === null
                          ? null
                          : formatMoney(
                              card.marketEstimate.lowPriceMinor,
                              card.marketEstimate.currency,
                            )
                      }
                    />
                    <Fact
                      label="Mid"
                      value={
                        card.marketEstimate.midPriceMinor === null
                          ? null
                          : formatMoney(
                              card.marketEstimate.midPriceMinor,
                              card.marketEstimate.currency,
                            )
                      }
                    />
                  </dl>
                  {card.marketEstimate.sourceUrl ? (
                    <a
                      className="market-value__source"
                      href={card.marketEstimate.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View marketplace listing{" "}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : null}
                  {card.marketEstimate.note ? (
                    <p className="market-value__note">
                      {card.marketEstimate.note}
                    </p>
                  ) : null}
                  {!card.marketEstimate.manual ? (
                    <p className="market-value__caveat">
                      {card.marketEstimate.pricingVariantAssumed
                        ? "The card's printing finish is unknown; this estimate uses TCGPlayer's ordinary Normal/Regular pricing variant as a fallback."
                        : card.marketEstimate.priceCondition
                          ? card.marketEstimate.conditionOverridden
                            ? `This ungraded estimate uses the per-card ${card.marketEstimate.priceCondition} pricing override; the recorded condition is unchanged.`
                            : card.marketEstimate.conditionAssumed
                              ? `The recorded condition is unknown, so this ungraded estimate uses the profile's ${card.marketEstimate.priceCondition} assumption.`
                              : `Ungraded ${card.marketEstimate.priceCondition} market estimate based on this copy's recorded condition.`
                          : "Condition-level pricing was unavailable, so this is an unadjusted product-level market reference."}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="market-value__empty">
                  <p>No exact market estimate is available.</p>
                  <small>
                    {card.sealed
                      ? "Automatic single-card prices are excluded for sealed copies. Add a manual estimate for this owned lot."
                      : "Run prices:sync again later, or add a manual per-card estimate for this owned lot."}
                  </small>
                </div>
              )}
            </section>

            {card.photoBatch ||
            card.gridPosition ||
            card.frontPhoto ||
            card.backPhoto ? (
              <section
                className="detail-section"
                aria-labelledby="provenance-heading"
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Owned lot</p>
                    <h2 id="provenance-heading">Photo provenance</h2>
                  </div>
                </div>
                <dl className="fact-grid">
                  <Fact label="Photo batch" value={card.photoBatch} />
                  <Fact label="Grid position" value={card.gridPosition} />
                  <Fact label="Front photo" value={card.frontPhoto} />
                  <Fact label="Back photo" value={card.backPhoto} />
                </dl>
              </section>
            ) : null}

            {card.specialRuleBox || card.abilityRule ? (
              <section
                className="detail-section"
                aria-labelledby="ability-heading"
              >
                <div className="section-heading section-heading--icon">
                  <span className="section-icon">
                    <Sparkles size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="eyebrow">Ability / rule</p>
                    <h2 id="ability-heading">
                      {card.specialRuleBox ?? "Printed ability"}
                    </h2>
                  </div>
                </div>
                {card.abilityRule ? (
                  <p className="printed-text">{card.abilityRule}</p>
                ) : null}
              </section>
            ) : null}

            {card.attacks.length ? (
              <section
                className="detail-section"
                aria-labelledby="attacks-heading"
              >
                <div className="section-heading section-heading--icon">
                  <span className="section-icon">
                    <Swords size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="eyebrow">Moves</p>
                    <h2 id="attacks-heading">Attacks</h2>
                  </div>
                </div>
                <div className="attack-list">
                  {card.attacks.map((attack) => (
                    <article className="attack" key={attack.id}>
                      <div className="attack__heading">
                        <EnergyCost cost={attack.cost} />
                        <h3>{attack.name}</h3>
                        {attack.damage ? (
                          <strong>{attack.damage}</strong>
                        ) : null}
                      </div>
                      {attack.effect ? <p>{attack.effect}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {hasCombatFacts ? (
              <section
                className="detail-section detail-section--combat"
                aria-label="Combat details"
              >
                <dl className="combat-facts">
                  {card.weakness ? (
                    <div>
                      <dt>
                        <Swords size={15} aria-hidden="true" /> Weakness
                      </dt>
                      <dd>{card.weakness}</dd>
                    </div>
                  ) : null}
                  {card.resistance ? (
                    <div>
                      <dt>
                        <Shield size={15} aria-hidden="true" /> Resistance
                      </dt>
                      <dd>{card.resistance}</dd>
                    </div>
                  ) : null}
                  {card.retreatCost !== null ? (
                    <div>
                      <dt>
                        <Wind size={15} aria-hidden="true" /> Retreat
                      </dt>
                      <dd>{card.retreatCost}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            {card.rulesText ? (
              <section
                className="detail-section"
                aria-labelledby="rules-heading"
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Printed text</p>
                    <h2 id="rules-heading">Card rule</h2>
                  </div>
                </div>
                <p className="printed-text">{card.rulesText}</p>
              </section>
            ) : null}
          </article>

          <OwnedCardEditor card={card} />
        </div>
      </main>
    </div>
  );
}

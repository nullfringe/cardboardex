import {
  ArrowLeft,
  ExternalLink,
  HeartPulse,
  PackageCheck,
  Shield,
  Sparkles,
  Swords,
  Wind,
} from "lucide-react";
import Link from "next/link";

import type { CollectionDetail } from "@/lib/types/collection";

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

export function CardDetailView({ card }: { card: CollectionDetail }) {
  const hasCombatFacts =
    card.weakness !== null ||
    card.resistance !== null ||
    card.retreatCost !== null;

  return (
    <div className="app-shell">
      <SiteHeader compact />
      <main className="detail-main">
        <Link className="back-link" href="/">
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
                <h1>{card.name}</h1>
                {card.hp !== null ? (
                  <span className="detail-hp">
                    <HeartPulse size={17} aria-hidden="true" /> {card.hp} HP
                  </span>
                ) : null}
              </div>
              <div className="detail-badges">
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
                <Fact label="Regulation mark" value={card.regulationMark} />
                <Fact label="Evolves from" value={card.evolvesFrom} />
              </dl>
            </section>

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

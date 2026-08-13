"use client";

import { ArrowLeft, Check, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { parsePrintedIdentifiers } from "@/lib/printed-identifiers";
import type {
  CreateAttackInput,
  CreateCollectionEntryInput,
} from "@/lib/types/collection";
import type { Profile } from "@/lib/types/profile";

import { CardArtwork } from "./card-artwork";

type DraftAttack = {
  key: number;
  name: string;
  cost: string;
  damage: string;
  effect: string;
};

type CreateResult = {
  ownedCardId?: number;
  error?: string;
};

function blankToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFC");
  return normalized || null;
}

function requiredString(formData: FormData, name: string): string {
  return blankToNull(formData.get(name)) ?? "";
}

function optionalInteger(formData: FormData, name: string): number | null {
  const raw = blankToNull(formData.get(name));
  return raw === null ? null : Number(raw);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function CreateCardForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cardKind, setCardKind] = useState("Pokémon");
  const [collectorNumber, setCollectorNumber] = useState("");
  const [pokemonType, setPokemonType] = useState("");
  const [attacks, setAttacks] = useState<DraftAttack[]>([]);
  const [nextAttackKey, setNextAttackKey] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewName = name.trim() || "New card";
  const normalizedAttacks = useMemo<CreateAttackInput[]>(
    () =>
      attacks
        .filter((attack) => attack.name.trim())
        .map((attack) => ({
          name: attack.name.trim(),
          cost: attack.cost.split(/\s+/u).filter(Boolean),
          damage: attack.damage.trim() || null,
          effect: attack.effect.trim() || null,
        })),
    [attacks],
  );

  function addAttack(): void {
    setAttacks((current) => [
      ...current,
      { key: nextAttackKey, name: "", cost: "", damage: "", effect: "" },
    ]);
    setNextAttackKey((value) => value + 1);
  }

  function updateAttack(
    key: number,
    field: keyof Omit<DraftAttack, "key">,
    value: string,
  ): void {
    setAttacks((current) =>
      current.map((attack) =>
        attack.key === key ? { ...attack, [field]: value } : attack,
      ),
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const gameName = requiredString(formData, "gameName");
      const groupKey = blankToNull(formData.get("componentGroupKey"));
      const groupType = blankToNull(formData.get("componentGroupType"));
      const componentKey = blankToNull(formData.get("componentKey"));
      const hasComponentGroup = Boolean(groupKey || groupType || componentKey);
      const payload: CreateCollectionEntryInput = {
        gameName,
        gameSlug: slugify(gameName),
        setName: requiredString(formData, "setName"),
        setCode: requiredString(formData, "setCode"),
        name: requiredString(formData, "name"),
        canonicalName: blankToNull(formData.get("canonicalName")),
        collectorNumber: blankToNull(formData.get("collectorNumber")),
        languageCode: requiredString(formData, "languageCode"),
        catalogProvider: blankToNull(formData.get("catalogProvider")),
        catalogSetId: blankToNull(formData.get("catalogSetId")),
        catalogCardId: blankToNull(formData.get("catalogCardId")),
        cardBackDesign: blankToNull(formData.get("cardBackDesign")),
        printingFinish: blankToNull(formData.get("printingFinish")),
        physicalForm: blankToNull(formData.get("physicalForm")),
        printedIdentifiers: parsePrintedIdentifiers(
          blankToNull(formData.get("printedIdentifiers")),
        ),
        componentGroup: hasComponentGroup
          ? {
              groupKey: groupKey ?? "",
              groupType: groupType ?? "",
              name: blankToNull(formData.get("componentGroupName")),
              expectedComponentCount: optionalInteger(
                formData,
                "expectedComponentCount",
              ),
              componentKey: componentKey ?? "",
            }
          : null,
        printingVariantKey: requiredString(formData, "printingVariantKey"),
        cardKind: requiredString(formData, "cardKind"),
        subtype: blankToNull(formData.get("subtype")),
        rarity: blankToNull(formData.get("rarity")),
        regulationMark: blankToNull(formData.get("regulationMark")),
        specialRuleBox: blankToNull(formData.get("specialRuleBox")),
        abilityRule: blankToNull(formData.get("abilityRule")),
        rulesText: blankToNull(formData.get("rulesText")),
        pokemonType: blankToNull(formData.get("pokemonType")),
        hp: optionalInteger(formData, "hp"),
        evolvesFrom: blankToNull(formData.get("evolvesFrom")),
        weakness: blankToNull(formData.get("weakness")),
        resistance: blankToNull(formData.get("resistance")),
        retreatCost: optionalInteger(formData, "retreatCost"),
        attacks: normalizedAttacks,
        quantity: Number(requiredString(formData, "quantity")),
        condition: blankToNull(formData.get("condition")),
        finishVariant: blankToNull(formData.get("finishVariant")),
        sealed: formData.get("sealed") === "on",
        notes: blankToNull(formData.get("notes")),
        photoBatch: blankToNull(formData.get("photoBatch")),
        gridPosition: blankToNull(formData.get("gridPosition")),
        frontPhoto: blankToNull(formData.get("frontPhoto")),
        backPhoto: blankToNull(formData.get("backPhoto")),
        externalReferenceUrl: blankToNull(formData.get("externalReferenceUrl")),
      };

      const response = await fetch(
        `/api/collection?profile=${encodeURIComponent(profile.slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as CreateResult;

      if (!response.ok || result.ownedCardId === undefined) {
        throw new Error(result.error ?? "The card could not be added.");
      }

      router.push(
        `/cards/${result.ownedCardId}?profile=${encodeURIComponent(profile.slug)}`,
      );
      router.refresh();
    } catch (error) {
      setSubmitting(false);
      setErrorMessage(
        error instanceof Error ? error.message : "The card could not be added.",
      );
    }
  }

  return (
    <main className="create-main">
      <Link
        className="back-link"
        href={`/?profile=${encodeURIComponent(profile.slug)}`}
      >
        <ArrowLeft size={17} aria-hidden="true" /> Collection
      </Link>
      <header className="create-heading">
        <p className="eyebrow">Manual entry</p>
        <h1>Add a card you own.</h1>
        <p>
          Record the published printing once, then describe the copy in your
          collection separately.
        </p>
      </header>

      <form
        className="create-layout"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <aside className="create-preview" aria-label="Card preview">
          <CardArtwork
            cardKind={cardKind || "Card"}
            collectorNumber={collectorNumber || null}
            imageUrl={null}
            name={previewName}
            pokemonType={pokemonType || null}
            size="detail"
          />
          <p>Preview updates as you fill in the card facts.</p>
        </aside>

        <div className="create-form-sections">
          <section className="form-section" aria-labelledby="identity-heading">
            <div className="form-section__heading">
              <span>1</span>
              <div>
                <p className="eyebrow">Published printing</p>
                <h2 id="identity-heading">Card identity</h2>
              </div>
            </div>
            <div className="form-grid form-grid--two-even">
              <label className="field field--wide">
                <span className="field__label">Card name *</span>
                <input
                  autoFocus
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field field--wide">
                <span className="field__label">English / canonical name</span>
                <input name="canonicalName" placeholder="e.g. Pikachu" />
                <small className="field__help">
                  Optional searchable alias; the printed card name remains
                  primary.
                </small>
              </label>
              <label className="field">
                <span className="field__label">Game / TCG *</span>
                <input
                  name="gameName"
                  required
                  defaultValue="Pokémon Trading Card Game"
                />
              </label>
              <label className="field">
                <span className="field__label">Card kind *</span>
                <input
                  list="card-kinds"
                  name="cardKind"
                  required
                  value={cardKind}
                  onChange={(event) => setCardKind(event.target.value)}
                />
                <datalist id="card-kinds">
                  <option value="Pokémon" />
                  <option value="Trainer" />
                  <option value="Energy" />
                </datalist>
              </label>
              <label className="field">
                <span className="field__label">Expansion / set *</span>
                <input name="setName" required />
              </label>
              <label className="field">
                <span className="field__label">Set ID *</span>
                <input name="setCode" required placeholder="e.g. ME01" />
              </label>
              <label className="field">
                <span className="field__label">Collector identifier</span>
                <input
                  name="collectorNumber"
                  placeholder="e.g. 043/102; leave blank when unnumbered"
                  value={collectorNumber}
                  onChange={(event) => setCollectorNumber(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Language *</span>
                <input
                  defaultValue="en"
                  list="language-codes"
                  name="languageCode"
                  pattern="[A-Za-z]{2}(-[A-Za-z]{2})?"
                  required
                />
                <datalist id="language-codes">
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                </datalist>
                <small className="field__help">
                  Use a normalized code such as en, ja, fr, or pt-br.
                </small>
              </label>
              <label className="field">
                <span className="field__label">Printing variant *</span>
                <input
                  defaultValue="standard"
                  list="printing-variants"
                  name="printingVariantKey"
                  placeholder="standard, unlimited, first-edition…"
                  required
                />
                <datalist id="printing-variants">
                  <option value="standard" />
                  <option value="unlimited" />
                  <option value="first-edition" />
                  <option value="shadowless" />
                  <option value="no-rarity" />
                </datalist>
              </label>
              <label className="field">
                <span className="field__label">Stage / subtype</span>
                <input name="subtype" placeholder="Basic, Stage 1, Item…" />
              </label>
              <label className="field">
                <span className="field__label">Rarity</span>
                <input name="rarity" placeholder="Common, Illustration Rare…" />
              </label>
              <label className="field">
                <span className="field__label">Regulation mark</span>
                <input name="regulationMark" />
              </label>
              <label className="field">
                <span className="field__label">Published finish</span>
                <input
                  list="printing-finishes"
                  name="printingFinish"
                  placeholder="regular, holo, reverse holo…"
                />
                <datalist id="printing-finishes">
                  <option value="regular non-holo" />
                  <option value="holo" />
                  <option value="reverse holo" />
                  <option value="stamped promotional foil" />
                </datalist>
              </label>
              <label className="field">
                <span className="field__label">Card-back design</span>
                <input
                  list="card-back-designs"
                  name="cardBackDesign"
                  placeholder="Leave blank when unknown"
                />
                <datalist id="card-back-designs">
                  <option value="international Pokémon" />
                  <option value="Pocket Monsters Card Game" />
                </datalist>
              </label>
              <label className="field">
                <span className="field__label">Physical form</span>
                <input
                  list="physical-forms"
                  name="physicalForm"
                  placeholder="standard, oversize…"
                />
                <datalist id="physical-forms">
                  <option value="standard" />
                  <option value="oversize" />
                </datalist>
              </label>
              <label className="field field--wide">
                <span className="field__label">
                  Additional printed identifiers
                </span>
                <textarea
                  name="printedIdentifiers"
                  placeholder={
                    "species/pokedex-number: No.004\npromo/release-identifier: XY01"
                  }
                />
                <small className="field__help">
                  One role: value pair per line. These remain distinct from the
                  collector identifier and catalog IDs.
                </small>
              </label>
            </div>
            <details className="form-section form-section--details">
              <summary>Multi-card component</summary>
              <div className="form-grid form-grid--three">
                <label className="field">
                  <span className="field__label">Group key</span>
                  <input name="componentGroupKey" placeholder="e.g. legend-1" />
                </label>
                <label className="field">
                  <span className="field__label">Group type</span>
                  <input name="componentGroupType" placeholder="multi-card" />
                </label>
                <label className="field">
                  <span className="field__label">Component key</span>
                  <input name="componentKey" placeholder="top, bottom, 1…" />
                </label>
                <label className="field">
                  <span className="field__label">Group name</span>
                  <input name="componentGroupName" />
                </label>
                <label className="field">
                  <span className="field__label">Expected components</span>
                  <input
                    min="1"
                    name="expectedComponentCount"
                    step="1"
                    type="number"
                  />
                </label>
              </div>
            </details>
          </section>

          <section
            className="form-section"
            aria-labelledby="game-details-heading"
          >
            <div className="form-section__heading">
              <span>2</span>
              <div>
                <p className="eyebrow">Optional extension</p>
                <h2 id="game-details-heading">Game-specific details</h2>
              </div>
            </div>
            <div className="form-grid form-grid--three">
              <label className="field">
                <span className="field__label">Pokémon type</span>
                <input
                  list="pokemon-types"
                  name="pokemonType"
                  value={pokemonType}
                  onChange={(event) => setPokemonType(event.target.value)}
                />
                <datalist id="pokemon-types">
                  {[
                    "Colorless",
                    "Darkness",
                    "Dragon",
                    "Fighting",
                    "Fire",
                    "Grass",
                    "Lightning",
                    "Metal",
                    "Psychic",
                    "Water",
                  ].map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span className="field__label">HP</span>
                <input min="1" name="hp" step="1" type="number" />
              </label>
              <label className="field">
                <span className="field__label">Evolves from</span>
                <input name="evolvesFrom" />
              </label>
              <label className="field">
                <span className="field__label">Weakness</span>
                <input name="weakness" placeholder="e.g. Fire ×2" />
              </label>
              <label className="field">
                <span className="field__label">Resistance</span>
                <input name="resistance" placeholder="e.g. Fighting −30" />
              </label>
              <label className="field">
                <span className="field__label">Retreat cost</span>
                <input min="0" name="retreatCost" step="1" type="number" />
              </label>
            </div>
            <div className="form-grid form-grid--one form-grid--spaced">
              <label className="field">
                <span className="field__label">Special / rule box</span>
                <input name="specialRuleBox" />
              </label>
              <label className="field">
                <span className="field__label">Ability / rule</span>
                <textarea name="abilityRule" />
              </label>
              <label className="field">
                <span className="field__label">
                  Trainer / other printed text
                </span>
                <textarea name="rulesText" />
              </label>
            </div>

            <div className="attack-editor">
              <div className="attack-editor__heading">
                <div>
                  <h3>Attacks</h3>
                  <p>Add as many structured attacks as the card has.</p>
                </div>
                <button
                  className="button button--small"
                  type="button"
                  onClick={addAttack}
                >
                  <Plus size={15} aria-hidden="true" /> <span>Add attack</span>
                </button>
              </div>
              {attacks.length ? (
                <div className="attack-editor__list">
                  {attacks.map((attack, index) => (
                    <fieldset className="attack-editor__item" key={attack.key}>
                      <legend>Attack {index + 1}</legend>
                      <button
                        className="attack-editor__remove"
                        type="button"
                        aria-label={`Remove attack ${index + 1}`}
                        onClick={() =>
                          setAttacks((current) =>
                            current.filter((item) => item.key !== attack.key),
                          )
                        }
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                      <div className="form-grid form-grid--three">
                        <label className="field">
                          <span className="field__label">Name *</span>
                          <input
                            required
                            value={attack.name}
                            onChange={(event) =>
                              updateAttack(
                                attack.key,
                                "name",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field__label">Energy cost</span>
                          <input
                            placeholder="e.g. P C C"
                            value={attack.cost}
                            onChange={(event) =>
                              updateAttack(
                                attack.key,
                                "cost",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field__label">Damage</span>
                          <input
                            placeholder="e.g. 30×"
                            value={attack.damage}
                            onChange={(event) =>
                              updateAttack(
                                attack.key,
                                "damage",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span className="field__label">Effect</span>
                        <textarea
                          value={attack.effect}
                          onChange={(event) =>
                            updateAttack(
                              attack.key,
                              "effect",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </fieldset>
                  ))}
                </div>
              ) : (
                <p className="attack-editor__empty">No attacks added.</p>
              )}
            </div>
          </section>

          <section className="form-section" aria-labelledby="owned-heading">
            <div className="form-section__heading">
              <span>3</span>
              <div>
                <p className="eyebrow">Your copy</p>
                <h2 id="owned-heading">Collection facts</h2>
              </div>
            </div>
            <div className="form-grid form-grid--three">
              <label className="field">
                <span className="field__label">Quantity *</span>
                <input
                  defaultValue="1"
                  min="1"
                  name="quantity"
                  required
                  step="1"
                  type="number"
                />
              </label>
              <label className="field">
                <span className="field__label">Condition</span>
                <input name="condition" placeholder="Unknown" />
              </label>
              <label className="field">
                <span className="field__label">Owned-lot finish note</span>
                <input
                  name="finishVariant"
                  placeholder="Legacy/free-text copy note"
                />
              </label>
            </div>
            <label className="checkbox-field">
              <input name="sealed" type="checkbox" />
              <span className="checkbox-field__box" aria-hidden="true">
                <Check size={14} />
              </span>
              <span>
                <strong>Factory sealed</strong>
                <small>
                  This owned copy is still in its original packaging.
                </small>
              </span>
            </label>
            <label className="field">
              <span className="field__label">Personal notes</span>
              <textarea name="notes" />
            </label>
            <div className="form-grid form-grid--two-even">
              <label className="field">
                <span className="field__label">Photo batch</span>
                <input name="photoBatch" placeholder="batch-2026-08-13" />
              </label>
              <label className="field">
                <span className="field__label">Grid position</span>
                <input name="gridPosition" placeholder="B3" />
              </label>
              <label className="field">
                <span className="field__label">Front photo</span>
                <input name="frontPhoto" placeholder="front-001.jpg" />
              </label>
              <label className="field">
                <span className="field__label">Back photo</span>
                <input name="backPhoto" placeholder="back-001.jpg" />
              </label>
            </div>
          </section>

          <details className="form-section form-section--details">
            <summary>External reference</summary>
            <div className="form-grid form-grid--one form-grid--spaced">
              <label className="field">
                <span className="field__label">External reference URL</span>
                <input
                  name="externalReferenceUrl"
                  placeholder="https://…"
                  type="url"
                />
              </label>
              <div className="form-grid form-grid--three">
                <label className="field">
                  <span className="field__label">Catalog provider</span>
                  <input name="catalogProvider" placeholder="e.g. tcgdex" />
                </label>
                <label className="field">
                  <span className="field__label">Catalog set ID</span>
                  <input name="catalogSetId" placeholder="e.g. PMCG1" />
                </label>
                <label className="field">
                  <span className="field__label">Catalog card ID</span>
                  <input name="catalogCardId" placeholder="e.g. PMCG1-035" />
                </label>
              </div>
              <p className="field__help">
                Catalog fields are optional, but when known all three must be
                supplied. Missing provider coverage leaves the safe placeholder.
              </p>
            </div>
          </details>

          {errorMessage ? (
            <p className="form-message form-message--error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="create-actions">
            <Link
              className="button"
              href={`/?profile=${encodeURIComponent(profile.slug)}`}
            >
              Cancel
            </Link>
            <button
              className="button button--primary"
              disabled={submitting}
              type="submit"
            >
              <Save size={17} aria-hidden="true" />
              {submitting ? "Adding card…" : "Add to collection"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

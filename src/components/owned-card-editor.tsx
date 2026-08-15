"use client";

import { Check, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { formatMoney } from "@/lib/pricing/money";
import {
  MARKET_CONDITIONS,
  type MarketCondition,
} from "@/lib/pricing/conditions";

import type {
  CollectionDetail,
  UpdateOwnedCardInput,
} from "@/lib/types/collection";

type OwnedCardEditorProps = {
  card: Pick<
    CollectionDetail,
    | "ownedCardId"
    | "profileSlug"
    | "name"
    | "quantity"
    | "condition"
    | "pricingConditionOverride"
    | "finishVariant"
    | "sealed"
    | "notes"
    | "marketEstimate"
  >;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function blankToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function OwnedCardEditor({ card }: OwnedCardEditorProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(card.quantity));
  const [condition, setCondition] = useState(card.condition ?? "");
  const [pricingConditionOverride, setPricingConditionOverride] = useState<
    MarketCondition | ""
  >(card.pricingConditionOverride ?? "");
  const [finishVariant, setFinishVariant] = useState(card.finishVariant ?? "");
  const [sealed, setSealed] = useState(card.sealed);
  const [notes, setNotes] = useState(card.notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manualAmount, setManualAmount] = useState(
    card.marketEstimate?.manual
      ? (card.marketEstimate.unitAmountMinor / 100).toFixed(2)
      : "",
  );
  const [manualNote, setManualNote] = useState(
    card.marketEstimate?.manual ? (card.marketEstimate.note ?? "") : "",
  );
  const [manualActive, setManualActive] = useState(
    card.marketEstimate?.manual ?? false,
  );
  const [valuationState, setValuationState] = useState<SaveState>("idle");
  const [valuationError, setValuationError] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSaveState("saving");
    setErrorMessage(null);

    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setSaveState("error");
      setErrorMessage("Quantity must be a whole number of at least 1.");
      return;
    }

    const payload: UpdateOwnedCardInput = {
      quantity: parsedQuantity,
      condition: blankToNull(condition),
      pricingConditionOverride: pricingConditionOverride || null,
      finishVariant: blankToNull(finishVariant),
      sealed,
      notes: blankToNull(notes),
    };

    try {
      const response = await fetch(
        `/api/collection/${card.ownedCardId}?profile=${encodeURIComponent(card.profileSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ?? "The collection entry could not be updated.",
        );
      }

      setSaveState("saved");
      router.refresh();
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (error) {
      setSaveState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The collection entry could not be updated.",
      );
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/collection/${card.ownedCardId}?profile=${encodeURIComponent(card.profileSlug)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(
          result.error ?? "The collection entry could not be removed.",
        );
      }

      router.push(`/?profile=${encodeURIComponent(card.profileSlug)}`);
      router.refresh();
    } catch (error) {
      setDeleting(false);
      setConfirmingDelete(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The collection entry could not be removed.",
      );
    }
  }

  async function handleValuationSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setValuationState("saving");
    setValuationError(null);
    try {
      const response = await fetch(
        `/api/collection/${card.ownedCardId}/valuation?profile=${encodeURIComponent(card.profileSlug)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: manualAmount,
            note: blankToNull(manualNote),
          }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ?? "The manual estimate could not be saved.",
        );
      }
      setManualActive(true);
      setValuationState("saved");
      router.refresh();
      window.setTimeout(() => setValuationState("idle"), 1800);
    } catch (error) {
      setValuationState("error");
      setValuationError(
        error instanceof Error
          ? error.message
          : "The manual estimate could not be saved.",
      );
    }
  }

  async function clearManualValuation(): Promise<void> {
    setValuationState("saving");
    setValuationError(null);
    try {
      const response = await fetch(
        `/api/collection/${card.ownedCardId}/valuation?profile=${encodeURIComponent(card.profileSlug)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ?? "The manual estimate could not be cleared.",
        );
      }
      setManualActive(false);
      setManualAmount("");
      setManualNote("");
      setValuationState("saved");
      router.refresh();
      window.setTimeout(() => setValuationState("idle"), 1800);
    } catch (error) {
      setValuationState("error");
      setValuationError(
        error instanceof Error
          ? error.message
          : "The manual estimate could not be cleared.",
      );
    }
  }

  return (
    <aside className="ownership-panel" aria-labelledby="ownership-heading">
      <div className="ownership-panel__heading">
        <div>
          <p className="eyebrow">Owned copy</p>
          <h2 id="ownership-heading">Your collection facts</h2>
        </div>
        <span className="ownership-panel__status">
          Separate from card facts
        </span>
      </div>

      <form
        className="ownership-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="form-grid form-grid--two">
          <label className="field">
            <span className="field__label">Quantity</span>
            <input
              min="1"
              required
              step="1"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Condition</span>
            <input
              list="card-conditions"
              placeholder="Unknown"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
            />
            <datalist id="card-conditions">
              <option value="Mint" />
              <option value="Near Mint" />
              <option value="Lightly Played" />
              <option value="Moderately Played" />
              <option value="Heavily Played" />
              <option value="Damaged" />
            </datalist>
          </label>
        </div>
        <label className="field">
          <span className="field__label">Automatic pricing condition</span>
          <select
            value={pricingConditionOverride}
            onChange={(event) =>
              setPricingConditionOverride(
                event.target.value as MarketCondition | "",
              )
            }
          >
            <option value="">Use recorded condition or profile default</option>
            {MARKET_CONDITIONS.map((marketCondition) => (
              <option key={marketCondition} value={marketCondition}>
                {marketCondition}
              </option>
            ))}
          </select>
          <small className="field__help">
            Optional valuation-only override. This does not change the card
            condition recorded above.
          </small>
        </label>
        <label className="field">
          <span className="field__label">Finish / variant</span>
          <input
            placeholder="Regular, holo, stamped promo…"
            value={finishVariant}
            onChange={(event) => setFinishVariant(event.target.value)}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={sealed}
            onChange={(event) => setSealed(event.target.checked)}
          />
          <span className="checkbox-field__box" aria-hidden="true">
            <Check size={14} />
          </span>
          <span>
            <strong>Factory sealed</strong>
            <small>The owned copy is still in its original packaging.</small>
          </span>
        </label>
        <label className="field">
          <span className="field__label">Personal notes</span>
          <textarea
            placeholder="Condition details, where it came from, or anything worth remembering…"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        {errorMessage ? (
          <p className="form-message form-message--error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {saveState === "saved" ? (
          <p className="form-message form-message--success" role="status">
            <Check size={15} aria-hidden="true" /> Saved to your collection.
          </p>
        ) : null}

        <div className="ownership-form__actions">
          <button
            className="button button--primary"
            disabled={saveState === "saving"}
            type="submit"
          >
            <Save size={17} aria-hidden="true" />
            {saveState === "saving" ? "Saving…" : "Save changes"}
          </button>
          <button
            className="button button--ghost ownership-form__remove"
            type="button"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={16} aria-hidden="true" /> Remove
          </button>
        </div>
      </form>

      <form
        className="manual-valuation-form"
        onSubmit={(event) => void handleValuationSubmit(event)}
      >
        <div className="manual-valuation-form__heading">
          <div>
            <p className="eyebrow">Per-card override</p>
            <h3>Manual estimate</h3>
          </div>
          {card.marketEstimate &&
          !card.marketEstimate.manual &&
          !manualActive ? (
            <span>
              Automatic:{" "}
              {formatMoney(
                card.marketEstimate.unitAmountMinor,
                card.marketEstimate.currency,
              )}
            </span>
          ) : null}
        </div>
        <label className="field">
          <span className="field__label">Estimated value (USD)</span>
          <input
            min="0"
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={manualAmount}
            onChange={(event) => setManualAmount(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Estimate note</span>
          <input
            maxLength={1000}
            placeholder="Comparable sale, appraisal date…"
            value={manualNote}
            onChange={(event) => setManualNote(event.target.value)}
          />
        </label>
        <p className="manual-valuation-form__help">
          This overrides the automatic price for this owned lot and remains
          clearly labeled as manual.
        </p>
        {valuationError ? (
          <p className="form-message form-message--error" role="alert">
            {valuationError}
          </p>
        ) : null}
        {valuationState === "saved" ? (
          <p className="form-message form-message--success" role="status">
            <Check size={15} aria-hidden="true" /> Valuation updated.
          </p>
        ) : null}
        <div className="manual-valuation-form__actions">
          <button
            className="button button--primary"
            disabled={valuationState === "saving"}
            type="submit"
          >
            <Save size={16} aria-hidden="true" />
            {valuationState === "saving" ? "Saving…" : "Save estimate"}
          </button>
          {manualActive ? (
            <button
              className="button button--ghost"
              disabled={valuationState === "saving"}
              type="button"
              onClick={() => void clearManualValuation()}
            >
              Clear override
            </button>
          ) : null}
        </div>
      </form>

      {confirmingDelete ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => setConfirmingDelete(false)}
        >
          <section
            aria-describedby="delete-description"
            aria-labelledby="delete-heading"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="confirm-dialog__close"
              type="button"
              aria-label="Close confirmation"
              onClick={() => setConfirmingDelete(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <span className="confirm-dialog__icon" aria-hidden="true">
              <Trash2 size={21} />
            </span>
            <h2 id="delete-heading">Remove {card.name}?</h2>
            <p id="delete-description">
              This removes the owned entry from your collection. The published
              card printing stays in the database.
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="button"
                type="button"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep card
              </button>
              <button
                className="button button--danger"
                disabled={deleting}
                type="button"
                onClick={() => void handleDelete()}
              >
                <Trash2 size={16} aria-hidden="true" />
                {deleting ? "Removing…" : "Remove entry"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

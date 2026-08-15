"use client";

import { Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import type { Profile } from "@/lib/types/profile";
import { MARKET_CONDITIONS } from "@/lib/pricing/conditions";

const STORAGE_KEY = "cardboardex.selectedProfile";

type ProfileSwitcherProps = {
  activeProfile: Profile;
  initialProfiles: Profile[];
  honorStoredSelection?: boolean;
};

type ProfileResult = Profile & { error?: string };

type DeleteProfileResult = {
  fallbackProfile: Profile;
  remainingProfiles: Profile[];
  error?: string;
};

type CollectionSyncResult = {
  profileName: string;
  profileSlug: string;
  filename: string;
  mode: "preview" | "apply";
  importedEntries: number;
  importedQuantity: number;
  collectionEntries: number;
  physicalCards: number;
  createdEntries: number;
  matchedEntries: number;
  missingEntries: number;
  backupPath: string | null;
  error?: string;
};

export function ProfileSwitcher({
  activeProfile,
  initialProfiles,
  honorStoredSelection = false,
}: ProfileSwitcherProps) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [createName, setCreateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectionFile, setCollectionFile] = useState<File | null>(null);
  const [collectionSync, setCollectionSync] =
    useState<CollectionSyncResult | null>(null);
  const [deleteConfirmationProfileSlug, setDeleteConfirmationProfileSlug] =
    useState<string | null>(null);
  const [previousProfileSlug, setPreviousProfileSlug] = useState(
    activeProfile.slug,
  );

  if (activeProfile.slug !== previousProfileSlug) {
    setPreviousProfileSlug(activeProfile.slug);
    setDeleteConfirmationProfileSlug(null);
    setCollectionFile(null);
    setCollectionSync(null);
  }

  const confirmingDelete = deleteConfirmationProfileSlug === activeProfile.slug;

  useEffect(() => {
    const storedSlug = window.localStorage.getItem(STORAGE_KEY);
    const storedExists = profiles.some(
      (profile) => profile.slug === storedSlug,
    );

    if (
      honorStoredSelection &&
      storedSlug &&
      storedExists &&
      storedSlug !== activeProfile.slug
    ) {
      router.replace(`/?profile=${encodeURIComponent(storedSlug)}`);
      return;
    }

    if (profiles.some((profile) => profile.slug === activeProfile.slug)) {
      window.localStorage.setItem(STORAGE_KEY, activeProfile.slug);
    }
  }, [activeProfile.slug, honorStoredSelection, profiles, router]);

  function switchProfile(slug: string): void {
    window.localStorage.setItem(STORAGE_KEY, slug);
    router.push(`/?profile=${encodeURIComponent(slug)}`);
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName }),
      });
      const result = (await response.json()) as ProfileResult;
      if (!response.ok)
        throw new Error(result.error ?? "Profile creation failed.");

      setProfiles((current) => [...current, result]);
      setCreateName("");
      switchProfile(result.slug);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Profile creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function renameProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const name =
      new FormData(event.currentTarget).get("name")?.toString() ?? "";
    const previousSlug = activeProfile.slug;

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(activeProfile.slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const result = (await response.json()) as ProfileResult;
      if (!response.ok)
        throw new Error(result.error ?? "Profile rename failed.");

      setProfiles((current) =>
        current.map((profile) =>
          profile.slug === previousSlug ? result : profile,
        ),
      );
      window.localStorage.setItem(STORAGE_KEY, result.slug);
      router.replace(`/?profile=${encodeURIComponent(result.slug)}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Profile rename failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateDefaultPricingCondition(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const defaultPricingCondition =
      new FormData(event.currentTarget)
        .get("defaultPricingCondition")
        ?.toString() ?? "";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(activeProfile.slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultPricingCondition }),
        },
      );
      const result = (await response.json()) as ProfileResult;
      if (!response.ok) {
        throw new Error(result.error ?? "Pricing preference update failed.");
      }

      setProfiles((current) =>
        current.map((profile) =>
          profile.slug === activeProfile.slug ? result : profile,
        ),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Pricing preference update failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const name =
      new FormData(event.currentTarget).get("name")?.toString() ?? "";

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(activeProfile.slug)}/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const result = (await response.json()) as ProfileResult;
      if (!response.ok)
        throw new Error(result.error ?? "Collection duplication failed.");

      setProfiles((current) => [...current, result]);
      switchProfile(result.slug);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Collection duplication failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(activeProfile.slug)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as DeleteProfileResult;
      if (!response.ok)
        throw new Error(result.error ?? "Collection deletion failed.");

      setProfiles(result.remainingProfiles);
      setDeleteConfirmationProfileSlug(null);
      window.localStorage.setItem(STORAGE_KEY, result.fallbackProfile.slug);
      router.push(
        `/?profile=${encodeURIComponent(result.fallbackProfile.slug)}`,
      );
    } catch (caught) {
      setDeleteConfirmationProfileSlug(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Collection deletion failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadCollectionCsv(mode: "preview" | "apply"): Promise<void> {
    if (!collectionFile) {
      setError("Choose a CSV file first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", collectionFile);
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(activeProfile.slug)}/import?mode=${mode}`,
        { method: "POST", body },
      );
      const result = (await response.json()) as CollectionSyncResult;
      if (!response.ok) {
        throw new Error(result.error ?? "Collection CSV import failed.");
      }

      setCollectionSync(result);
      if (mode === "apply") router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Collection CSV import failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-controls">
      <label className="profile-select">
        <span>Collection</span>
        <select
          aria-label="Collection profile"
          value={activeProfile.slug}
          onChange={(event) => switchProfile(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.slug} value={profile.slug}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>

      <details className="profile-manager">
        <summary aria-label="Manage collection profiles">
          <Settings2 size={16} aria-hidden="true" />
          <span>Manage</span>
        </summary>
        <div className="profile-manager__panel">
          <form onSubmit={(event) => void renameProfile(event)}>
            <label htmlFor="rename-profile">Rename this collection</label>
            <div>
              <input
                id="rename-profile"
                key={`${activeProfile.slug}:${activeProfile.name}`}
                maxLength={100}
                name="name"
                required
                defaultValue={activeProfile.name}
              />
              <button className="button button--small" disabled={busy}>
                Rename
              </button>
            </div>
          </form>
          <form
            className="profile-manager__pricing"
            onSubmit={(event) => void updateDefaultPricingCondition(event)}
          >
            <label htmlFor="default-pricing-condition">
              Pricing when condition is unknown
            </label>
            <small>
              This is a valuation assumption only. It does not change any
              card&apos;s recorded condition.
            </small>
            <div>
              <select
                id="default-pricing-condition"
                key={`${activeProfile.slug}:${activeProfile.defaultPricingCondition}`}
                name="defaultPricingCondition"
                defaultValue={activeProfile.defaultPricingCondition}
              >
                {MARKET_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
              <button className="button button--small" disabled={busy}>
                Save
              </button>
            </div>
          </form>
          <form
            className="profile-manager__import"
            onSubmit={(event) => {
              event.preventDefault();
              void uploadCollectionCsv("preview");
            }}
          >
            <label htmlFor="import-collection">
              Update this collection from CSV
            </label>
            <small>
              Preview first. Existing rows missing from the CSV are preserved.
            </small>
            <input
              accept=".csv,text/csv"
              id="import-collection"
              key={activeProfile.slug}
              name="file"
              required
              type="file"
              onChange={(event) => {
                setCollectionFile(event.target.files?.[0] ?? null);
                setCollectionSync(null);
                setError(null);
              }}
            />
            <button className="button button--small" disabled={busy}>
              {busy ? "Checking…" : "Preview CSV"}
            </button>
          </form>
          {collectionSync ? (
            <section className="profile-manager__import-preview">
              <strong>
                {collectionSync.mode === "preview"
                  ? "Import preview"
                  : "Import complete"}
              </strong>
              <span>
                {collectionSync.importedEntries} rows ·{" "}
                {collectionSync.importedQuantity} physical cards
              </span>
              <span>
                {collectionSync.createdEntries} new ·{" "}
                {collectionSync.matchedEntries} matched existing
              </span>
              <span>
                Result: {collectionSync.collectionEntries} printings ·{" "}
                {collectionSync.physicalCards} physical cards
              </span>
              {collectionSync.missingEntries > 0 ? (
                <span className="profile-manager__import-warning">
                  {collectionSync.missingEntries} existing imported rows are
                  absent from this CSV and will remain unchanged.
                </span>
              ) : null}
              {collectionSync.backupPath ? (
                <span>Backup: {collectionSync.backupPath}</span>
              ) : null}
              {collectionSync.mode === "preview" ? (
                <button
                  className="button button--primary button--small"
                  disabled={busy}
                  type="button"
                  onClick={() => void uploadCollectionCsv("apply")}
                >
                  {busy ? "Importing…" : `Import into ${activeProfile.name}`}
                </button>
              ) : null}
            </section>
          ) : null}
          <form onSubmit={(event) => void createProfile(event)}>
            <label htmlFor="create-profile">New collection</label>
            <div>
              <input
                id="create-profile"
                maxLength={100}
                placeholder="e.g. Ekah"
                required
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
              <button className="button button--small" disabled={busy}>
                Create
              </button>
            </div>
          </form>
          <form onSubmit={(event) => void duplicateProfile(event)}>
            <label htmlFor="duplicate-profile">Duplicate this collection</label>
            <div>
              <input
                id="duplicate-profile"
                key={`${activeProfile.slug}:${activeProfile.name}`}
                maxLength={100}
                name="name"
                required
                defaultValue={`${activeProfile.name} Copy`}
              />
              <button className="button button--small" disabled={busy}>
                Duplicate
              </button>
            </div>
          </form>
          <section className="profile-manager__danger">
            <p>Delete &ldquo;{activeProfile.name}&rdquo;?</p>
            <small>
              This permanently removes its owned cards and import records.
              Shared card printings and artwork stay intact.
            </small>
            {confirmingDelete ? (
              <div>
                <button
                  className="button button--small"
                  disabled={busy}
                  type="button"
                  onClick={() => setDeleteConfirmationProfileSlug(null)}
                >
                  Keep collection
                </button>
                <button
                  className="button button--danger button--small"
                  disabled={busy}
                  type="button"
                  onClick={() => void deleteProfile()}
                >
                  {busy ? "Deleting…" : "Delete collection"}
                </button>
              </div>
            ) : (
              <button
                className="button button--danger button--small"
                disabled={busy || profiles.length <= 1}
                type="button"
                onClick={() =>
                  setDeleteConfirmationProfileSlug(activeProfile.slug)
                }
              >
                Delete collection
              </button>
            )}
          </section>
          {error ? <p role="alert">{error}</p> : null}
          <small>Published card printings and artwork stay shared.</small>
        </div>
      </details>
    </div>
  );
}

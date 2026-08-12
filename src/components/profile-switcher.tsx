"use client";

import { Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import type { Profile } from "@/lib/types/profile";

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
  const [deleteConfirmationProfileSlug, setDeleteConfirmationProfileSlug] =
    useState<string | null>(null);
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
          profile.slug === result.slug ? result : profile,
        ),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Profile rename failed.",
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

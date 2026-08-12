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

    window.localStorage.setItem(STORAGE_KEY, activeProfile.slug);
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
          {error ? <p role="alert">{error}</p> : null}
          <small>Published card printings and artwork stay shared.</small>
        </div>
      </details>
    </div>
  );
}

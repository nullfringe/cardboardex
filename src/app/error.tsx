"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="state-page state-page--full">
      <TriangleAlert size={42} aria-hidden="true" />
      <p className="eyebrow">Something went wrong</p>
      <h1>Cardboardex could not load this view.</h1>
      <p>Check that the local database has been initialized and try again.</p>
      <button className="button button--primary" type="button" onClick={reset}>
        <RotateCcw size={18} aria-hidden="true" />
        Try again
      </button>
    </main>
  );
}

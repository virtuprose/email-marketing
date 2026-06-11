"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export function ErrorState({
  title = "Something did not load",
  description = "Refresh this view and try again. Your saved campaign and lead data is not changed.",
  reset
}: {
  title?: string;
  description?: string;
  reset?: () => void;
}) {
  return (
    <div className="error-state">
      <AlertTriangle size={34} aria-hidden="true" />
      <h1>{title}</h1>
      <p>{description}</p>
      {reset ? (
        <button className="button" type="button" onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" /> Try again
        </button>
      ) : null}
    </div>
  );
}

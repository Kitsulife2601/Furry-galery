/**
 * After a new deployment, a tab that is still open asks for the old build's
 * JS files, which no longer exist ("Failed to fetch dynamically imported
 * module"). Reloading picks up the new version. Guarded so a real outage
 * can't cause a reload loop.
 */
const KEY = "fg-stale-reload-at";

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  );
}

/** Reloads the page unless it already did so in the last 30 seconds. */
export function reloadForNewBuild(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once; the error screen shows if it fails again.
  }
  window.location.reload();
  return true;
}

let listening = false;

/** Vite fires `vite:preloadError` when a lazy chunk can't be loaded. */
export function listenForStaleBuild(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}

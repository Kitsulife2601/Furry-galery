import { useSyncExternalStore } from "react";

/** Small client-side helpers shared by the "Für dich" feed. */

export const FOLLOWING_KEY = ["following-handles"] as const;

/** Keys typed into a field or while a dialog/menu is open are not feed shortcuts. */
export function isFeedShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return false;
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable='true']")) return false;
  return !document.querySelector("[role='dialog'], [role='menu']");
}

/* Sound on/off is one choice for the whole feed and survives reloads. */
const MUTE_KEY = "fg-feed-muted";
const muteListeners = new Set<() => void>();
let mutedNow: boolean | null = null;

function readMuted(): boolean {
  if (mutedNow !== null) return mutedNow;
  try {
    mutedNow = window.localStorage.getItem(MUTE_KEY) !== "0";
  } catch {
    mutedNow = true;
  }
  return mutedNow;
}

export function setFeedMuted(next: boolean, persist = true) {
  mutedNow = next;
  if (persist) {
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked: the choice still holds until the page reloads.
    }
  }
  muteListeners.forEach((fn) => fn());
}

export function toggleFeedMuted() {
  setFeedMuted(!readMuted());
}

export function useFeedMuted(): boolean {
  return useSyncExternalStore(
    (fn) => {
      muteListeners.add(fn);
      return () => muteListeners.delete(fn);
    },
    readMuted,
    () => true,
  );
}

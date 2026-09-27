const KEY = "vela-adult-18";

export function readAdultConfirmed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdultConfirmed(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

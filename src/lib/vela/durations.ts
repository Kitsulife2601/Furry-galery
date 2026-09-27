/** Durations the team can pick for bans and scheduled profile deletions. */
export const BAN_DURATIONS = [
  { id: "1d", label: "1 Tag" },
  { id: "3d", label: "3 Tage" },
  { id: "7d", label: "7 Tage" },
  { id: "14d", label: "14 Tage" },
  { id: "1m", label: "1 Monat" },
  { id: "3m", label: "3 Monate" },
  { id: "6m", label: "6 Monate" },
  { id: "perm", label: "Dauerhaft" },
] as const;
export type BanDuration = (typeof BAN_DURATIONS)[number]["id"];
export const BAN_DURATION_IDS = BAN_DURATIONS.map((d) => d.id) as [BanDuration, ...BanDuration[]];

export const DELETE_DELAYS = [
  { id: "now", label: "Sofort" },
  { id: "1d", label: "In 1 Tag" },
  { id: "7d", label: "In 7 Tagen" },
  { id: "14d", label: "In 14 Tagen" },
  { id: "1m", label: "In 1 Monat" },
  { id: "3m", label: "In 3 Monaten" },
  { id: "6m", label: "In 6 Monaten" },
] as const;
export type DeleteDelay = (typeof DELETE_DELAYS)[number]["id"];
export const DELETE_DELAY_IDS = DELETE_DELAYS.map((d) => d.id) as [DeleteDelay, ...DeleteDelay[]];

/** "7d" / "3m" → a date that far from `from`; "perm" / "now" → null. */
export function addDuration(id: string, from = new Date()): Date | null {
  const match = /^(\d+)([dm])$/.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  const at = new Date(from);
  if (match[2] === "d") at.setDate(at.getDate() + n);
  else at.setMonth(at.getMonth() + n);
  return at;
}

export function formatDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

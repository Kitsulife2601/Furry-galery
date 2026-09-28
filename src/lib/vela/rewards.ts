/**
 * Rewards for being around: every day someone uses the site counts as an
 * "active day"; frames, profile effects and animated name styles unlock step
 * by step. The team has everything unlocked.
 */
import type { AvatarDecoration, ProfileEffect } from "./decorations";

export const NAME_STYLES = [
  { id: "schimmer", label: "Schimmer" },
  { id: "pastell", label: "Pastell" },
  { id: "neon", label: "Neon" },
  { id: "welle", label: "Welle" },
  { id: "glitzer", label: "Glitzer" },
  { id: "feuer", label: "Feuer" },
  { id: "regenbogen", label: "Regenbogen" },
  { id: "gold", label: "Gold" },
] as const;
export type NameStyle = (typeof NAME_STYLES)[number]["id"];

export function asNameStyle(value: unknown): NameStyle | null {
  return NAME_STYLES.some((s) => s.id === value) ? (value as NameStyle) : null;
}

export type RewardItem =
  | { kind: "decoration"; id: AvatarDecoration }
  | { kind: "effect"; id: ProfileEffect }
  | { kind: "name"; id: NameStyle };

export type RewardKind = RewardItem["kind"];

/** Active day → what unlocks on it. */
export const REWARD_TIERS: { day: number; items: RewardItem[] }[] = [
  {
    day: 1,
    items: [
      { kind: "decoration", id: "pfoten" },
      { kind: "name", id: "schimmer" },
    ],
  },
  {
    day: 2,
    items: [
      { kind: "decoration", id: "sakura" },
      { kind: "effect", id: "sakura" },
    ],
  },
  {
    day: 3,
    items: [
      { kind: "decoration", id: "katze" },
      { kind: "name", id: "pastell" },
    ],
  },
  {
    day: 5,
    items: [
      { kind: "decoration", id: "blasen" },
      { kind: "effect", id: "blasen" },
    ],
  },
  {
    day: 7,
    items: [
      { kind: "decoration", id: "neon" },
      { kind: "name", id: "neon" },
    ],
  },
  {
    day: 10,
    items: [
      { kind: "decoration", id: "frost" },
      { kind: "effect", id: "schnee" },
      { kind: "name", id: "welle" },
    ],
  },
  {
    day: 14,
    items: [
      { kind: "decoration", id: "rosen" },
      { kind: "name", id: "glitzer" },
    ],
  },
  {
    day: 21,
    items: [
      { kind: "decoration", id: "sterne" },
      { kind: "effect", id: "sterne" },
    ],
  },
  {
    day: 30,
    items: [
      { kind: "decoration", id: "flammen" },
      { kind: "effect", id: "glut" },
      { kind: "name", id: "feuer" },
    ],
  },
  {
    day: 45,
    items: [
      { kind: "decoration", id: "regenbogen" },
      { kind: "name", id: "regenbogen" },
    ],
  },
  {
    day: 60,
    items: [
      { kind: "decoration", id: "schmetterling" },
      { kind: "effect", id: "herzen" },
    ],
  },
  {
    day: 90,
    items: [
      { kind: "decoration", id: "finsternis" },
      { kind: "name", id: "gold" },
    ],
  },
];

/** The active day an item unlocks on (Infinity if it isn't a reward). */
export function unlockDay(kind: RewardKind, id: string): number {
  for (const tier of REWARD_TIERS) {
    if (tier.items.some((item) => item.kind === kind && item.id === id)) return tier.day;
  }
  return Number.POSITIVE_INFINITY;
}

export function isUnlocked(kind: RewardKind, id: string, activeDays: number, isTeam = false) {
  return isTeam || activeDays >= unlockDay(kind, id);
}

export function nextTier(activeDays: number) {
  return REWARD_TIERS.find((t) => t.day > activeDays) ?? null;
}

/** Tiers reached exactly on this active day (for the "new reward" notification). */
export function tierOn(day: number) {
  return REWARD_TIERS.find((t) => t.day === day) ?? null;
}

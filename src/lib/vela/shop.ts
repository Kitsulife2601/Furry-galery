/**
 * Shop: members earn "Pfoten" for every minute they spend on the site and buy
 * premium backgrounds, or reward items (frames, name styles, effects) before
 * their active-day unlock. Shared by server and client.
 */
import { isUnlocked, unlockDay, type RewardKind } from "./rewards";

export type ShopKind = "background" | RewardKind;

/** One Pfote per minute on the site, up to two hours a day. */
export const PAWS_PER_TICK = 1;
export const TICK_SECONDS = 60;
export const DAILY_PAW_CAP = 120;

/** Backgrounds that cost Pfoten; every other background is free. */
export const PREMIUM_BACKGROUNDS: Record<string, number> = {
  aurora: 250,
  sunset: 250,
  forest: 250,
  ocean: 250,
  paws: 300,
  sakura: 300,
  starry: 350,
  neon: 400,
};

/** Price in Pfoten, or null when the item is free / not for sale. */
export function shopPrice(kind: ShopKind, id: string): number | null {
  if (kind === "background") return PREMIUM_BACKGROUNDS[id] ?? null;
  const day = unlockDay(kind, id);
  return Number.isFinite(day) ? 100 + day * 20 : null;
}

export function ownedKey(kind: ShopKind, id: string): string {
  return `${kind}:${id}`;
}

/** May this member use the item (free, unlocked by active days, bought, or team)? */
export function canUseItem(
  kind: ShopKind,
  id: string,
  who: { activeDays: number; team: boolean; owned: readonly string[] },
): boolean {
  if (who.team || who.owned.includes(ownedKey(kind, id))) return true;
  if (kind === "background") return !(id in PREMIUM_BACKGROUNDS);
  return isUnlocked(kind, id, who.activeDays, false);
}

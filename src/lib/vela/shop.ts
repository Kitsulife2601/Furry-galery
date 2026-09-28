/**
 * Shop: members earn "Pfoten" for every minute they spend on the site and buy
 * premium backgrounds, or reward items (frames, name styles, effects) before
 * their active-day unlock. Shared by server and client.
 */
import { isUnlocked, unlockDay, type RewardKind } from "./rewards";
import { GEN_COLLECTIONS, genItem, isGeneratedId, type GenKind } from "./catalog";

export type ShopKind = "background" | "plate" | RewardKind;

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
  nebula: 400,
  rings: 400,
  galaxy: 400,
  twilight: 350,
};

/** Shop-only items (no active-day unlock), price in Pfoten. */
export const SHOP_ONLY: Record<string, number> = {
  "decoration:mondsichel": 450,
  "decoration:silberrosen": 450,
  "decoration:lichtfalter": 400,
  "decoration:perlen": 400,
  "decoration:schleier": 350,
  "decoration:delfine": 450,
  "effect:mondnacht": 600,
  "effect:rosenblaetter": 400,
  "effect:lichtfalter": 450,
  "effect:polarlicht": 500,
  "plate:mondwolf": 300,
  "plate:rosenblueten": 300,
  "plate:lichtfalter": 300,
  "plate:meeresblasen": 250,
  "plate:perlmutt": 250,
  "plate:tagtraum": 250,
  "decoration:blutmond": 450,
  "decoration:planet": 500,
  "decoration:kometen": 450,
  "decoration:sonneneruption": 450,
  "decoration:sternbild": 400,
  "decoration:nova": 500,
  "effect:sternwirbel": 500,
  "effect:planetenringe": 550,
  "effect:kosmossturm": 500,
  "plate:kosmos": 300,
};

/** Price in Pfoten, or null when the item is free / not for sale. */
export function shopPrice(kind: ShopKind, id: string): number | null {
  if (isGeneratedId(id)) return kind === "name" ? null : (genItem(kind as GenKind, id)?.price ?? null);
  if (kind === "background") return PREMIUM_BACKGROUNDS[id] ?? null;
  const only = SHOP_ONLY[ownedKey(kind, id)];
  if (only !== undefined) return only;
  if (kind === "plate") return null;
  const day = unlockDay(kind, id);
  return Number.isFinite(day) ? 100 + day * 20 : null;
}

export type BundleItem = { kind: ShopKind; id: string };

/** Themed bundles: everything together, a quarter cheaper. */
export const BUNDLES: { id: string; label: string; items: BundleItem[] }[] = [
  {
    id: "mondwolf",
    label: "Mondwolf-Paket",
    items: [
      { kind: "decoration", id: "mondsichel" },
      { kind: "effect", id: "mondnacht" },
      { kind: "plate", id: "mondwolf" },
      { kind: "background", id: "starry" },
    ],
  },
  {
    id: "silberrosen",
    label: "Silberrosen-Paket",
    items: [
      { kind: "decoration", id: "silberrosen" },
      { kind: "effect", id: "rosenblaetter" },
      { kind: "plate", id: "rosenblueten" },
    ],
  },
  {
    id: "lichtfalter",
    label: "Lichtfalter-Paket",
    items: [
      { kind: "decoration", id: "lichtfalter" },
      { kind: "effect", id: "lichtfalter" },
      { kind: "plate", id: "lichtfalter" },
    ],
  },
  {
    id: "meer",
    label: "Meeres-Paket",
    items: [
      { kind: "decoration", id: "delfine" },
      { kind: "decoration", id: "perlen" },
      { kind: "plate", id: "meeresblasen" },
      { kind: "background", id: "ocean" },
    ],
  },
  {
    id: "regenbogen",
    label: "Regenbogen-Paket",
    items: [
      { kind: "decoration", id: "schleier" },
      { kind: "effect", id: "polarlicht" },
      { kind: "plate", id: "tagtraum" },
      { kind: "plate", id: "perlmutt" },
    ],
  },
];

BUNDLES.push(
  {
    id: "kosmos",
    label: "Kosmos-Paket",
    items: [
      { kind: "decoration", id: "planet" },
      { kind: "effect", id: "sternwirbel" },
      { kind: "plate", id: "kosmos" },
      { kind: "background", id: "galaxy" },
    ],
  },
  {
    id: "nova",
    label: "Nova-Paket",
    items: [
      { kind: "decoration", id: "nova" },
      { kind: "decoration", id: "kometen" },
      { kind: "effect", id: "kosmossturm" },
      { kind: "background", id: "nebula" },
    ],
  },
  {
    id: "sonne",
    label: "Sonnen- & Mond-Paket",
    items: [
      { kind: "decoration", id: "sonneneruption" },
      { kind: "decoration", id: "blutmond" },
      { kind: "effect", id: "planetenringe" },
      { kind: "background", id: "rings" },
    ],
  },
);

/** Shop categories ("Kollektionen"): every item belongs to one; the rest are "Klassiker". */
export const COLLECTIONS: { id: string; label: string; items: string[] }[] = [
  {
    id: "kosmos",
    label: "Kosmos",
    items: [
      "decoration:blutmond",
      "decoration:planet",
      "decoration:kometen",
      "decoration:sonneneruption",
      "decoration:sternbild",
      "decoration:nova",
      "effect:sternwirbel",
      "effect:planetenringe",
      "effect:kosmossturm",
      "plate:kosmos",
      "background:nebula",
      "background:rings",
      "background:galaxy",
      "background:twilight",
      "background:starry",
    ],
  },
  {
    id: "mondwolf",
    label: "Mondwolf",
    items: ["decoration:mondsichel", "effect:mondnacht", "plate:mondwolf"],
  },
  {
    id: "silberrosen",
    label: "Silberrosen",
    items: [
      "decoration:silberrosen",
      "effect:rosenblaetter",
      "plate:rosenblueten",
      "decoration:rosen",
    ],
  },
  {
    id: "lichtfalter",
    label: "Lichtfalter",
    items: [
      "decoration:lichtfalter",
      "effect:lichtfalter",
      "plate:lichtfalter",
      "decoration:schmetterling",
    ],
  },
  {
    id: "meer",
    label: "Meer",
    items: [
      "decoration:delfine",
      "decoration:perlen",
      "decoration:blasen",
      "effect:blasen",
      "plate:meeresblasen",
      "background:ocean",
    ],
  },
  {
    id: "regenbogen",
    label: "Regenbogen",
    items: [
      "decoration:schleier",
      "decoration:regenbogen",
      "effect:polarlicht",
      "plate:tagtraum",
      "plate:perlmutt",
      "name:regenbogen",
      "background:aurora",
    ],
  },
];

export const CLASSIC_COLLECTION = "klassiker";

/** Every category for the shop's filter bar (hand-made collections, then generated ones). */
export const ALL_COLLECTIONS: { id: string; label: string }[] = [
  ...COLLECTIONS.map((c) => ({ id: c.id, label: c.label })),
  ...GEN_COLLECTIONS,
];

export function collectionOf(kind: ShopKind, id: string): string {
  if (isGeneratedId(id) && kind !== "name") {
    return genItem(kind as GenKind, id)?.palette.collection ?? CLASSIC_COLLECTION;
  }
  const key = ownedKey(kind, id);
  return COLLECTIONS.find((c) => c.items.includes(key))?.id ?? CLASSIC_COLLECTION;
}

/** A bundle belongs to the collection most of its items are in. */
export function bundleCollection(bundleId: string): string {
  const bundle = BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return CLASSIC_COLLECTION;
  const counts = new Map<string, number>();
  for (const it of bundle.items) {
    const c = collectionOf(it.kind, it.id);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export const BUNDLE_DISCOUNT = 0.25;

/** What's still missing from a bundle for this member, and what it costs now. */
export function bundleQuote(
  bundleId: string,
  who: { activeDays: number; team: boolean; owned: readonly string[] },
): { missing: BundleItem[]; full: number; price: number } | null {
  const bundle = BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return null;
  const missing = bundle.items.filter((it) => !canUseItem(it.kind, it.id, who));
  const full = missing.reduce((sum, it) => sum + (shopPrice(it.kind, it.id) ?? 0), 0);
  return { missing, full, price: Math.round(full * (1 - BUNDLE_DISCOUNT)) };
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
  if (isGeneratedId(id)) return false;
  if (kind === "background") return !(id in PREMIUM_BACKGROUNDS);
  if (kind === "plate") return false;
  return isUnlocked(kind, id, who.activeDays, false);
}

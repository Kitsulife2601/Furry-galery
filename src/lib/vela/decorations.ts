/**
 * Avatar decorations (animated rings/frames), profile effects and name plates.
 * The first ones unlock with active days (rewards.ts); the rest are shop-only.
 */
import { genItem } from "./catalog.ts";
export const AVATAR_DECORATIONS = [
  { id: "flammen", label: "Flammen" },
  { id: "neon", label: "Neon" },
  { id: "regenbogen", label: "Regenbogen" },
  { id: "sakura", label: "Sakura" },
  { id: "rosen", label: "Dunkle Rosen" },
  { id: "sterne", label: "Sternenstaub" },
  { id: "pfoten", label: "Pfoten" },
  { id: "katze", label: "Miau-Katze" },
  { id: "blasen", label: "Meeresblasen" },
  { id: "finsternis", label: "Sonnenfinsternis" },
  { id: "frost", label: "Frost" },
  { id: "schmetterling", label: "Halluzination" },
  { id: "mondsichel", label: "Mondsichel-Traum" },
  { id: "silberrosen", label: "Silberrosen" },
  { id: "lichtfalter", label: "Lichtfalter" },
  { id: "perlen", label: "Regenbogenperlen" },
  { id: "schleier", label: "Regenbogenschleier" },
  { id: "delfine", label: "Delfin-Tanz" },
  { id: "blutmond", label: "Blutmond" },
  { id: "planet", label: "Planet" },
  { id: "kometen", label: "Kometen" },
  { id: "sonneneruption", label: "Sonneneruption" },
  { id: "sternbild", label: "Sternbilder" },
  { id: "nova", label: "Nova" },
] as const;
/** Hand-drawn ids, or generated ones ("g-ring-glut", see catalog.ts). */
export type AvatarDecoration = (typeof AVATAR_DECORATIONS)[number]["id"] | `g-${string}`;

export const PROFILE_EFFECTS = [
  { id: "sakura", label: "Kirschblüten" },
  { id: "schnee", label: "Schnee" },
  { id: "sterne", label: "Funkeln" },
  { id: "glut", label: "Glut" },
  { id: "herzen", label: "Herzen" },
  { id: "blasen", label: "Blasen" },
  { id: "mondnacht", label: "Mondnacht" },
  { id: "rosenblaetter", label: "Rosenblätter" },
  { id: "lichtfalter", label: "Lichtfalter" },
  { id: "polarlicht", label: "Polarlicht" },
  { id: "sternwirbel", label: "Sternwirbel" },
  { id: "planetenringe", label: "Planetenringe" },
  { id: "kosmossturm", label: "Kosmischer Sturm" },
] as const;
export type ProfileEffect = (typeof PROFILE_EFFECTS)[number]["id"] | `g-${string}`;

/** Name plates: a decorated strip behind the name (profile and feed). Shop-only. */
export const NAME_PLATES = [
  { id: "mondwolf", label: "Mondwolf" },
  { id: "rosenblueten", label: "Rosenblüten" },
  { id: "lichtfalter", label: "Lichtfalter" },
  { id: "meeresblasen", label: "Meeresblasen" },
  { id: "perlmutt", label: "Perlmuttwellen" },
  { id: "tagtraum", label: "Regenbogen-Tagtraum" },
  { id: "kosmos", label: "Kosmischer Zwielichtfluss" },
] as const;
export type NamePlate = (typeof NAME_PLATES)[number]["id"] | `g-${string}`;

export function asNamePlate(value: unknown): NamePlate | null {
  if (typeof value === "string" && genItem("plate", value)) return value as NamePlate;
  return NAME_PLATES.some((d) => d.id === value) ? (value as NamePlate) : null;
}

export function asDecoration(value: unknown): AvatarDecoration | null {
  if (typeof value === "string" && genItem("decoration", value)) return value as AvatarDecoration;
  return AVATAR_DECORATIONS.some((d) => d.id === value) ? (value as AvatarDecoration) : null;
}

export function asProfileEffect(value: unknown): ProfileEffect | null {
  if (typeof value === "string" && genItem("effect", value)) return value as ProfileEffect;
  return PROFILE_EFFECTS.some((d) => d.id === value) ? (value as ProfileEffect) : null;
}

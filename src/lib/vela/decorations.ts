/** Avatar decorations (animated rings/frames) and profile effects — all free. */
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
] as const;
export type AvatarDecoration = (typeof AVATAR_DECORATIONS)[number]["id"];

export const PROFILE_EFFECTS = [
  { id: "sakura", label: "Kirschblüten" },
  { id: "schnee", label: "Schnee" },
  { id: "sterne", label: "Funkeln" },
  { id: "glut", label: "Glut" },
  { id: "herzen", label: "Herzen" },
  { id: "blasen", label: "Blasen" },
] as const;
export type ProfileEffect = (typeof PROFILE_EFFECTS)[number]["id"];

export function asDecoration(value: unknown): AvatarDecoration | null {
  return AVATAR_DECORATIONS.some((d) => d.id === value) ? (value as AvatarDecoration) : null;
}

export function asProfileEffect(value: unknown): ProfileEffect | null {
  return PROFILE_EFFECTS.some((d) => d.id === value) ? (value as ProfileEffect) : null;
}

export const BACKGROUNDS = [
  { id: "midnight", label: "Mitternacht", hint: "Warmes Schwarz" },
  { id: "ember", label: "Glut", hint: "Dunkles Rost" },
  { id: "harbor", label: "Hafen", hint: "Tiefes Teal" },
  { id: "studio", label: "Studio", hint: "Neutrales Grau" },
  { id: "fog", label: "Nebel", hint: "Waldgrün" },
  { id: "paper", label: "Papier", hint: "Helles Elfenbein" },
] as const;

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export function isBackgroundId(value: string): value is BackgroundId {
  return BACKGROUNDS.some((b) => b.id === value);
}

export const BACKGROUNDS = [
  { id: "midnight", label: "Mitternacht", hint: "Warmes Schwarz" },
  { id: "ember", label: "Glut", hint: "Dunkles Rost" },
  { id: "harbor", label: "Hafen", hint: "Tiefes Teal" },
  { id: "studio", label: "Studio", hint: "Neutrales Grau" },
  { id: "fog", label: "Nebel", hint: "Waldgrün" },
  { id: "paper", label: "Papier", hint: "Helles Elfenbein" },
  { id: "aurora", label: "Polarlicht", hint: "Grün schimmernd" },
  { id: "sunset", label: "Sonnenuntergang", hint: "Lila bis Orange" },
  { id: "starry", label: "Sternennacht", hint: "Blau mit Sternen" },
  { id: "paws", label: "Pfotenmuster", hint: "Braun mit Pfoten" },
  { id: "forest", label: "Waldlichtung", hint: "Grün mit Licht" },
  { id: "neon", label: "Neon", hint: "Pink und Cyan" },
  { id: "ocean", label: "Ozean", hint: "Hell bis tief" },
  { id: "sakura", label: "Kirschblüte", hint: "Zartes Rosa" },
  { id: "nebula", label: "Kosmischer Sturm", hint: "Blaue Nebelschweife" },
  { id: "rings", label: "Planetenringe", hint: "Planet mit Ring" },
  { id: "galaxy", label: "Galaxie", hint: "Blauer Sternwirbel" },
  { id: "twilight", label: "Kosmisches Zwielicht", hint: "Rosa Sternennebel" },
] as const;

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export function isBackgroundId(value: string): value is BackgroundId {
  return BACKGROUNDS.some((b) => b.id === value);
}

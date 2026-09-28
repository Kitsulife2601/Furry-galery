/**
 * Generated shop items: shape families × colour palettes. Ids look like
 * "g-ring-glut" and are stored in the same profile columns as the hand-made
 * items; everything about them (label, price, colours) derives from the id.
 */
export type GenKind = "decoration" | "plate" | "background" | "effect";

export type Palette = {
  id: string;
  label: string;
  /** Main, light and dark colour. */
  a: string;
  b: string;
  c: string;
  collection: string;
};

export const PALETTES: Palette[] = [
  { id: "glut", label: "Glut", a: "#ff6d00", b: "#ffe082", c: "#4a1600", collection: "feuer" },
  { id: "lava", label: "Lava", a: "#ff1744", b: "#ff9e80", c: "#3a0a0a", collection: "feuer" },
  { id: "eis", label: "Eis", a: "#4fc3f7", b: "#e0f7ff", c: "#062a3d", collection: "eis" },
  {
    id: "polarfrost",
    label: "Polarfrost",
    a: "#9fa8ff",
    b: "#ffffff",
    c: "#1b1e4a",
    collection: "eis",
  },
  { id: "wald", label: "Wald", a: "#66bb6a", b: "#dcedc8", c: "#0f2a12", collection: "wald" },
  { id: "moos", label: "Moos", a: "#aed581", b: "#f0f4c3", c: "#1f2a0c", collection: "wald" },
  {
    id: "zuckerwatte",
    label: "Zuckerwatte",
    a: "#ff9ecf",
    b: "#bfe6ff",
    c: "#3a1a33",
    collection: "suess",
  },
  { id: "bonbon", label: "Bonbon", a: "#ea80fc", b: "#ffd180", c: "#321038", collection: "suess" },
  { id: "gold", label: "Gold", a: "#ffc107", b: "#fff8e1", c: "#3a2800", collection: "gold" },
  { id: "bronze", label: "Bronze", a: "#d7a86e", b: "#ffe0b2", c: "#2e1a08", collection: "gold" },
  {
    id: "mitternacht",
    label: "Mitternacht",
    a: "#7986cb",
    b: "#c5cae9",
    c: "#0c1030",
    collection: "nacht",
  },
  {
    id: "schatten",
    label: "Schatten",
    a: "#b0b0b0",
    b: "#fafafa",
    c: "#121212",
    collection: "nacht",
  },
  {
    id: "amethyst",
    label: "Amethyst",
    a: "#ba68c8",
    b: "#f3e5f5",
    c: "#240a30",
    collection: "edelsteine",
  },
  {
    id: "smaragd",
    label: "Smaragd",
    a: "#26a69a",
    b: "#b2fef7",
    c: "#032a26",
    collection: "edelsteine",
  },
  {
    id: "rubin",
    label: "Rubin",
    a: "#e53950",
    b: "#ffcdd2",
    c: "#330008",
    collection: "edelsteine",
  },
  {
    id: "saphir",
    label: "Saphir",
    a: "#2f7df6",
    b: "#cfe3ff",
    c: "#04163a",
    collection: "edelsteine",
  },
];

export const GEN_COLLECTIONS = [
  { id: "feuer", label: "Feuer" },
  { id: "eis", label: "Eis" },
  { id: "wald", label: "Wald" },
  { id: "suess", label: "Süß" },
  { id: "gold", label: "Gold" },
  { id: "nacht", label: "Nacht" },
  { id: "edelsteine", label: "Edelsteine" },
];

export const FAMILIES: Record<GenKind, { id: string; label: string; price: number }[]> = {
  decoration: [
    { id: "ring", label: "Leuchtring", price: 300 },
    { id: "perlen", label: "Perlenkranz", price: 350 },
    { id: "orbit", label: "Sternenbahn", price: 400 },
    { id: "strahlen", label: "Strahlenkranz", price: 350 },
    { id: "blueten", label: "Blütenkranz", price: 400 },
    { id: "flammen", label: "Flammenkranz", price: 450 },
    { id: "herzen", label: "Herzkranz", price: 350 },
    { id: "kristalle", label: "Kristallkranz", price: 450 },
  ],
  plate: [
    { id: "verlauf", label: "Schimmerschild", price: 200 },
    { id: "sterne", label: "Sternenschild", price: 250 },
    { id: "pfoten", label: "Pfotenschild", price: 250 },
  ],
  background: [
    { id: "nebel", label: "Nebel", price: 300 },
    { id: "glanz", label: "Glanz", price: 300 },
  ],
  effect: [
    { id: "funken", label: "Funkenflug", price: 350 },
    { id: "regen", label: "Blütenregen", price: 350 },
  ],
};

export type GenItem = {
  kind: GenKind;
  id: string;
  label: string;
  price: number;
  family: string;
  palette: Palette;
};

export const GENERATED: GenItem[] = (Object.keys(FAMILIES) as GenKind[]).flatMap((kind) =>
  FAMILIES[kind].flatMap((f) =>
    PALETTES.map((p) => ({
      kind,
      id: `g-${f.id}-${p.id}`,
      label: `${f.label} ${p.label}`,
      price: f.price,
      family: f.id,
      palette: p,
    })),
  ),
);

const BY_KEY = new Map(GENERATED.map((g) => [`${g.kind}:${g.id}`, g]));

export function isGeneratedId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("g-");
}

export function genItem(kind: GenKind, id: string): GenItem | null {
  return BY_KEY.get(`${kind}:${id}`) ?? null;
}

/** CSS custom properties for a generated background (swatches and the app shell). */
export function genBackgroundVars(id: string, shell = false): Record<string, string> | undefined {
  const g = genItem("background", id);
  if (!g) return undefined;
  const { a, b, c } = g.palette;
  const art =
    g.family === "nebel"
      ? `radial-gradient(ellipse 70% 45% at 25% 35%, ${a}99, transparent 70%), radial-gradient(ellipse 55% 40% at 75% 70%, ${b}66, transparent 70%), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1.6px), radial-gradient(circle at 30% 80%, #fff 0.8px, transparent 1.4px), linear-gradient(160deg, ${c}, #07070b)`
      : `radial-gradient(ellipse at 20% 0%, ${b}aa, transparent 55%), linear-gradient(165deg, ${a}, ${c} 75%)`;
  const vars: Record<string, string> = {
    "--bg-art": art,
    "--shell-glow": `radial-gradient(ellipse at 50% -10%, ${a}33, transparent 55%)`,
  };
  if (shell) {
    Object.assign(vars, {
      "--color-bg": `color-mix(in oklab, ${c} 55%, #060608)`,
      "--color-bg-elevated": `color-mix(in oklab, ${c} 70%, #1a1a1f)`,
      "--color-bg-subtle": `color-mix(in oklab, ${c} 65%, #2a2a31)`,
      "--color-fg": "#f4f2f7",
      "--color-fg-muted": `color-mix(in oklab, ${b} 45%, #8a8a94)`,
      "--color-fg-subtle": `color-mix(in oklab, ${b} 25%, #6a6a74)`,
      "--color-accent": b,
      "--color-accent-fg": c,
    });
  }
  return vars;
}

const svgUrl = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}")`;

/** Inline style for a generated name plate (gradient + motif via --plate-motif). */
export function genPlateStyle(id: string): Record<string, string> | undefined {
  const g = genItem("plate", id);
  if (!g) return undefined;
  const { a, b, c } = g.palette;
  const motif =
    g.family === "sterne"
      ? `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 30'><g fill='${b}'><path d='M28 6 L29.5 12 L35 13.5 L29.5 15 L28 21 L26.5 15 L21 13.5 L26.5 12 Z'/><circle cx='12' cy='8' r='1.2'/><circle cx='18' cy='22' r='1'/><circle cx='37' cy='24' r='1.3'/></g></svg>`
      : g.family === "pfoten"
        ? `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 30'><g fill='${b}' opacity='.9'><ellipse cx='28' cy='18' rx='5' ry='4.2'/><ellipse cx='22.5' cy='11.5' rx='2' ry='2.5'/><ellipse cx='26' cy='8.5' rx='2' ry='2.5'/><ellipse cx='30' cy='8.5' rx='2' ry='2.5'/><ellipse cx='33.5' cy='11.5' rx='2' ry='2.5'/></g></svg>`
        : `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 30'><g fill='${b}'><circle cx='30' cy='10' r='1.4'/><circle cx='24' cy='20' r='1'/><circle cx='35' cy='22' r='.9'/></g></svg>`;
  return {
    background: `linear-gradient(90deg, ${c}, color-mix(in oklab, ${a} 70%, ${c}) 65%, ${a})`,
    "--plate-motif": svgUrl(motif),
  };
}

/** Generated items of one kind this member owns, plus the one currently in use. */
export function ownedGenerated(
  kind: GenKind,
  owned: readonly string[],
  current?: string | null,
): { id: `g-${string}`; label: string }[] {
  const ids = new Set(
    owned.filter((k) => k.startsWith(`${kind}:g-`)).map((k) => k.slice(kind.length + 1)),
  );
  if (current && isGeneratedId(current)) ids.add(current);
  return [...ids].flatMap((id) => {
    const g = genItem(kind, id);
    return g ? [{ id: id as `g-${string}`, label: g.label }] : [];
  });
}

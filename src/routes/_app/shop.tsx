import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  Package,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  buyShopBundle,
  buyShopItem,
  equipShopItem,
  getMyProfile,
  type PawStatus,
} from "@/lib/vela/server";
import { getShopPopular } from "@/lib/vela/shop-api";
import { bgStyle } from "@/lib/vela/bg-style";
import { BACKGROUNDS } from "@/lib/vela/backgrounds";
import { AVATAR_DECORATIONS, NAME_PLATES, PROFILE_EFFECTS } from "@/lib/vela/decorations";
import { NAME_STYLES } from "@/lib/vela/rewards";
import {
  ALL_COLLECTIONS,
  BUNDLES,
  BUNDLE_DISCOUNT,
  CLASSIC_COLLECTION,
  DAILY_PAW_CAP,
  bundleCollection,
  bundleQuote,
  canUseItem,
  collectionOf,
  howToGet,
  isShopOnly,
  ownedKey,
  parseItemKey,
  shopPrice,
  type ShopKind,
} from "@/lib/vela/shop";
import { PAWS_KEY, usePaws } from "@/lib/vela/use-paws";
import { memberErrorMessage } from "@/lib/vela/errors";
import type { Profile } from "@/lib/vela/types";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { LookPreview } from "@/components/look-preview";
import { withItem, type LookState } from "@/lib/vela/look";
import { GENERATED, genItem, isGeneratedId, type GenKind } from "@/lib/vela/catalog";
import { RitualBar } from "@/components/ritual-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/shop")({
  validateSearch: (search: Record<string, unknown>): { item?: string } => {
    const parsed = parseItemKey(search.item);
    return parsed ? { item: ownedKey(parsed.kind, parsed.id) } : {};
  },
  component: Shop,
});

type Item = { kind: ShopKind; id: string; label: string; price: number };
type Access = { activeDays: number; team: boolean; owned: readonly string[] };
type Status = "active" | "owned" | "buy";
type Selection = { type: "item"; key: string } | { type: "bundle"; id: string } | null;

const LABELS: Record<ShopKind, readonly { id: string; label: string }[]> = {
  background: BACKGROUNDS,
  decoration: AVATAR_DECORATIONS,
  effect: PROFILE_EFFECTS,
  name: NAME_STYLES,
  plate: NAME_PLATES,
};

function itemLabel(kind: ShopKind, id: string): string {
  if (isGeneratedId(id) && kind !== "name") return genItem(kind as GenKind, id)?.label ?? id;
  return LABELS[kind].find((x) => x.id === id)?.label ?? id;
}

const isNew = (item: Item) => isShopOnly(item.kind, item.id);

function forSale(kind: ShopKind, list: readonly { id: string; label: string }[]): Item[] {
  return list
    .flatMap((x) => {
      const price = shopPrice(kind, x.id);
      return price === null ? [] : [{ kind, id: x.id, label: x.label, price }];
    })
    .sort((a, b) => Number(isNew(b)) - Number(isNew(a)));
}

/** Filter tabs by kind, in shop order. */
const TYPES: { id: ShopKind | "alle"; label: string; hint: string }[] = [
  { id: "alle", label: "Überblick", hint: "Alles auf einen Blick" },
  { id: "decoration", label: "Rahmen", hint: "Um dein Bild" },
  { id: "effect", label: "Effekte", hint: "Auf dem Profil" },
  { id: "plate", label: "Schilder", hint: "Hinter dem Namen" },
  { id: "background", label: "Hintergründe", hint: "Fürs Profil" },
  { id: "name", label: "Namen", hint: "Schriftstil" },
];
const KIND_LABEL: Record<ShopKind, string> = {
  decoration: "Rahmen",
  effect: "Effekt",
  plate: "Namensschild",
  background: "Hintergrund",
  name: "Namens-Stil",
};

const SORTS = [
  { id: "empfohlen", label: "Empfohlen" },
  { id: "leistbar", label: "Leistbar zuerst" },
  { id: "preis-auf", label: "Preis aufsteigend" },
  { id: "preis-ab", label: "Preis absteigend" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

/** Every item for sale: hand-made ones (new first), then the generated catalogue. */
const ALL_ITEMS: Item[] = [
  ...forSale("decoration", AVATAR_DECORATIONS),
  ...forSale("effect", PROFILE_EFFECTS),
  ...forSale("plate", NAME_PLATES),
  ...forSale("background", BACKGROUNDS),
  ...forSale("name", NAME_STYLES),
  ...GENERATED.map((g) => ({ kind: g.kind, id: g.id, label: g.label, price: g.price })),
];
const BY_KEY = new Map(ALL_ITEMS.map((it) => [ownedKey(it.kind, it.id), it]));
const NEW_ITEMS = ALL_ITEMS.filter(isNew);
const COLLECTION_LABEL = new Map([
  ...ALL_COLLECTIONS.map((c) => [c.id, c.label] as const),
  [CLASSIC_COLLECTION, "Klassiker"] as const,
]);

const PAGE_SIZE = 16;
const SHELF_SIZE = 10;

function inUse(profile: Profile, kind: ShopKind, id: string): boolean {
  if (kind === "background") return profile.backgroundId === id;
  if (kind === "decoration") return profile.decoration === id;
  if (kind === "effect") return profile.effect === id;
  if (kind === "plate") return profile.namePlate === id;
  return profile.nameStyle === id;
}

function statusOf(profile: Profile, access: Access, kind: ShopKind, id: string): Status {
  if (inUse(profile, kind, id)) return "active";
  return canUseItem(kind, id, access) ? "owned" : "buy";
}

const lookOf = (profile: Profile): LookState => ({
  background: profile.backgroundId,
  decoration: profile.decoration,
  effect: profile.effect,
  nameStyle: profile.nameStyle,
  plate: profile.namePlate,
});

/** "Today" in Berlin as yyyy-mm-dd: picks the daily spotlight. */
function berlinDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Roughly how long until the missing Pfoten are earned (1 per minute, daily cap). */
function earnHint(missing: number, todayLeft: number): string {
  if (missing <= todayLeft) return `ca. ${missing} ${missing === 1 ? "Minute" : "Minuten"} online`;
  const days = Math.ceil((missing - todayLeft) / DAILY_PAW_CAP) + (todayLeft > 0 ? 1 : 0);
  return `ca. ${days} ${days === 1 ? "Tag" : "Tage"} fleißig online`;
}

const WISH_KEY = "vela-shop-wishlist";
const EQUIP_KEY = "vela-shop-equip-after-buy";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: the wishlist just isn't remembered.
  }
}

/** Wishlist ("Merkliste"), kept in this browser only. */
function useWishlist() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const stored = readStorage<unknown>(WISH_KEY, []);
    if (Array.isArray(stored)) setList(stored.filter((k): k is string => BY_KEY.has(String(k))));
  }, []);
  const toggle = useCallback((key: string) => {
    setList((old) => {
      const next = old.includes(key) ? old.filter((k) => k !== key) : [key, ...old].slice(0, 60);
      writeStorage(WISH_KEY, next);
      return next;
    });
  }, []);
  const remove = useCallback((key: string) => {
    setList((old) => {
      if (!old.includes(key)) return old;
      const next = old.filter((k) => k !== key);
      writeStorage(WISH_KEY, next);
      return next;
    });
  }, []);
  return [list, toggle, remove] as const;
}

/** Number that counts towards its new value (instant with reduced motion). */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 650);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

function Shop() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/shop" });
  const search = Route.useSearch();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const paws = usePaws();
  const popularQuery = useQuery({
    queryKey: ["shop-popular"],
    queryFn: () => getShopPopular(),
    staleTime: 5 * 60_000,
    enabled: Boolean(me.data),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [collection, setCollection] = useState("alle");
  const [type, setType] = useState<ShopKind | "alle">("alle");
  const [sort, setSort] = useState<Sort>("empfohlen");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [wishlist, toggleWish, unwish] = useWishlist();
  const [selected, setSelected] = useState<Selection>(() =>
    search.item && BY_KEY.has(search.item) ? { type: "item", key: search.item } : null,
  );

  const profile = me.data;
  const balance = paws.data?.paws ?? profile?.paws ?? 0;
  const shownBalance = useCountUp(balance);
  const today = paws.data?.today ?? 0;
  const access = useMemo<Access>(
    () => ({
      activeDays: profile?.activeDays ?? 0,
      team: profile?.isAdmin ?? false,
      owned: profile?.owned ?? [],
    }),
    [profile],
  );
  const popular = useMemo(
    () => new Set((popularQuery.data ?? []).map((p) => ownedKey(p.kind, p.id))),
    [popularQuery.data],
  );
  const wished = useMemo(() => new Set(wishlist), [wishlist]);

  const q = query.trim().toLowerCase();
  const pool = useMemo(
    () =>
      ALL_ITEMS.filter(
        (it) =>
          (collection === "alle" || collectionOf(it.kind, it.id) === collection) &&
          (!mine || canUseItem(it.kind, it.id, access)) &&
          (q.length === 0 ||
            it.label.toLowerCase().includes(q) ||
            KIND_LABEL[it.kind].toLowerCase().includes(q)),
      ),
    [collection, mine, access, q],
  );
  const overview = type === "alle" && q.length === 0;
  const items = useMemo(() => {
    const list = overview ? pool : pool.filter((it) => type === "alle" || it.kind === type);
    if (sort === "empfohlen") return list;
    const sorted = [...list];
    if (sort === "preis-auf") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "preis-ab") sorted.sort((a, b) => b.price - a.price);
    else {
      sorted.sort(
        (a, b) =>
          Number(b.price <= balance) - Number(a.price <= balance) ||
          (a.price <= balance ? b.price - a.price : a.price - b.price),
      );
    }
    return sorted;
  }, [pool, overview, type, sort, balance]);

  const spotlight = useMemo(() => {
    const candidates = NEW_ITEMS.filter(
      (it) => it.kind !== "background" && !canUseItem(it.kind, it.id, access),
    );
    const list = candidates.length > 0 ? candidates : NEW_ITEMS;
    return list[hash(berlinDay()) % list.length] ?? null;
  }, [access]);

  const refresh = useCallback(async () => {
    await Promise.all(
      ["me", "profile", "feed", "paws", "shop-popular"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }, [queryClient]);

  const setPaws = useCallback(
    (value: number) =>
      queryClient.setQueryData(PAWS_KEY, (old: PawStatus | undefined) =>
        old ? { ...old, paws: value } : old,
      ),
    [queryClient],
  );

  const equip = useCallback(
    async (kind: ShopKind, id: string, quiet = false): Promise<boolean> => {
      setBusy(ownedKey(kind, id));
      try {
        await equipShopItem({ data: { kind, id } });
        await refresh();
        if (!quiet) toast.success(`„${itemLabel(kind, id)}“ ist angelegt.`);
        return true;
      } catch (err) {
        toast.error(memberErrorMessage(err, "Anlegen hat nicht geklappt."));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  /** Buys; resolves to "bought" / "equipped" (bought and put on) / null on failure. */
  const buy = useCallback(
    async (item: Item, equipAfter: boolean): Promise<"bought" | "equipped" | null> => {
      const key = ownedKey(item.kind, item.id);
      setBusy(key);
      try {
        const result = await buyShopItem({ data: { kind: item.kind, id: item.id } });
        setPaws(result.paws);
      } catch (err) {
        toast.error(memberErrorMessage(err, "Kauf fehlgeschlagen."));
        setBusy(null);
        return null;
      }
      unwish(key);
      if (!equipAfter) {
        await refresh();
        setBusy(null);
        return "bought";
      }
      const ok = await equip(item.kind, item.id, true);
      if (!ok) await refresh();
      return ok ? "equipped" : "bought";
    },
    [equip, refresh, setPaws, unwish],
  );

  const buyBundle = useCallback(
    async (id: string): Promise<boolean> => {
      setBusy(`bundle:${id}`);
      try {
        const result = await buyShopBundle({ data: { id } });
        setPaws(result.paws);
        await refresh();
        return true;
      } catch (err) {
        toast.error(memberErrorMessage(err, "Kauf fehlgeschlagen."));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refresh, setPaws],
  );

  const open = useCallback((item: Item) => {
    setSelected({ type: "item", key: ownedKey(item.kind, item.id) });
  }, []);
  const quickEquip = useCallback((item: Item) => void equip(item.kind, item.id), [equip]);

  function closeSheet() {
    setSelected(null);
    if (search.item) void navigate({ search: {}, replace: true });
  }

  function goTo(p: number) {
    setPage(p);
    document.getElementById("shop-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showAll(kind: ShopKind) {
    setType(kind);
    setPage(0);
    window.setTimeout(() => {
      document.getElementById("shop-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-5 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const bundles = BUNDLES.filter(
    (b) => collection === "alle" || bundleCollection(b.id) === collection,
  );
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageItems = overview ? [] : items.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const counts = Object.fromEntries(
    TYPES.map((t) => [
      t.id,
      t.id === "alle" ? pool.length : pool.filter((it) => it.kind === t.id).length,
    ]),
  ) as Record<ShopKind | "alle", number>;
  const filtered = collection !== "alle" || mine;
  const inPool = (it: Item) => !filtered || pool.includes(it);
  const wishItems = wishlist.flatMap((k) => {
    const it = BY_KEY.get(k);
    return it && inPool(it) ? [it] : [];
  });
  const newItems = NEW_ITEMS.filter(inPool).sort(
    (a, b) => Number(canUseItem(a.kind, a.id, access)) - Number(canUseItem(b.kind, b.id, access)),
  );
  const popularItems = (popularQuery.data ?? []).flatMap((p) => {
    const it = BY_KEY.get(ownedKey(p.kind, p.id));
    return it && inPool(it) ? [it] : [];
  });
  const ownedCount = profile.owned.length;

  const card = (item: Item) => (
    <ShopCard
      item={item}
      profile={profile}
      status={statusOf(profile, access, item.kind, item.id)}
      balance={balance}
      activeDays={access.activeDays}
      wished={wished.has(ownedKey(item.kind, item.id))}
      popular={popular.has(ownedKey(item.kind, item.id))}
      busy={busy === ownedKey(item.kind, item.id)}
      disabled={busy !== null}
      onOpen={open}
      onEquip={quickEquip}
      onWish={toggleWish}
    />
  );

  const shelf = (key: string, title: ReactNode, hint: string, list: Item[], more?: ShopKind) =>
    list.length === 0 ? null : (
      <section key={key} aria-label={typeof title === "string" ? title : hint}>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-2xl">{title}</h2>
            <p className="text-xs text-fg-subtle">{hint}</p>
          </div>
          {more && list.length > SHELF_SIZE ? (
            <button
              type="button"
              onClick={() => showAll(more)}
              className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm text-accent hover:bg-bg-subtle"
            >
              Alle {list.length} <ChevronRight className="size-4" />
            </button>
          ) : null}
        </div>
        <ul className="shop-shelf -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-2">
          {list.slice(0, SHELF_SIZE).map((item) => (
            <li key={ownedKey(item.kind, item.id)} className="w-40 shrink-0 sm:w-44">
              {card(item)}
            </li>
          ))}
        </ul>
      </section>
    );

  const sheetItem = selected?.type === "item" ? BY_KEY.get(selected.key) : undefined;
  const sheetBundle =
    selected?.type === "bundle" ? BUNDLES.find((b) => b.id === selected.id) : undefined;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Profil schmücken</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl">Shop</h1>
        <p className="text-sm text-fg-muted">
          <span className="tabular-nums text-fg">{ownedCount}</span>{" "}
          {ownedCount === 1 ? "Teil gehört" : "Teile gehören"} dir
        </p>
      </div>

      <section className="relative mt-6 overflow-hidden rounded-3xl border border-border bg-bg-elevated/75 p-5">
        <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Dein Guthaben</p>
            <p className="mt-1 font-display text-5xl leading-none tabular-nums" aria-live="polite">
              <span aria-hidden="true" className="mr-1 text-3xl">
                🐾
              </span>
              {shownBalance}
              <span className="ml-2 font-sans text-sm text-fg-muted">Pfoten</span>
            </p>
          </div>
          <p className="flex items-center gap-1.5 rounded-full border border-border bg-bg/50 px-3 py-1.5 text-xs text-fg-muted">
            <Clock className="size-3.5" />
            Heute {today} / {DAILY_PAW_CAP}
          </p>
        </div>
        <div
          className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={DAILY_PAW_CAP}
          aria-valuenow={today}
          aria-label="Heute verdiente Pfoten"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${Math.min(1, today / DAILY_PAW_CAP) * 100}%` }}
          />
        </div>
        <p className="relative mt-3 max-w-xl text-xs leading-relaxed text-fg-subtle">
          1 Pfote pro Minute, bis zu {DAILY_PAW_CAP} am Tag. Die Tagespfote gibt es obendrauf —
          einmal täglich abholen lohnt sich.
        </p>
        <div className="relative mt-4">
          <RitualBar tone="page" />
        </div>
      </section>

      <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Suchen, z. B. Mond, Gold, Rahmen"
            aria-label="Artikel suchen"
            className="h-11 w-full rounded-2xl border border-border bg-bg-elevated/70 pr-4 pl-10 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => {
            setMine((v) => !v);
            setPage(0);
          }}
          className={cn(
            "flex h-11 items-center justify-center gap-1.5 rounded-2xl border px-4 text-sm",
            mine
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-fg-muted hover:text-fg",
          )}
        >
          {mine ? <Check className="size-4" /> : null}
          Nur meine
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block text-xs text-fg-muted">
          Kollektion
          <select
            value={collection}
            onChange={(e) => {
              setCollection(e.target.value);
              setPage(0);
            }}
            className="mt-1.5 h-11 w-full rounded-2xl border border-border bg-bg-elevated px-3 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="alle">Alle Kollektionen</option>
            {ALL_COLLECTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value={CLASSIC_COLLECTION}>Klassiker</option>
          </select>
        </label>
        <label className={cn("block text-xs text-fg-muted", overview && "opacity-50")}>
          Sortierung
          <select
            value={sort}
            disabled={overview}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(0);
            }}
            className="mt-1.5 h-11 w-full rounded-2xl border border-border bg-bg-elevated px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-6"
        role="group"
        aria-label="Art der Artikel"
      >
        {TYPES.map((t) => {
          const on = type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setType(t.id);
                setPage(0);
              }}
              className={cn(
                "min-h-11 rounded-2xl border px-3 py-2 text-left transition-colors",
                on
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-bg-elevated/50 hover:border-border-strong",
              )}
            >
              <span className="block truncate text-sm font-medium">{t.label}</span>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  on ? "text-accent-fg/75" : "text-fg-subtle",
                )}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>

      {overview ? (
        <div className="mt-8 flex flex-col gap-10">
          {spotlight && !filtered ? (
            <Spotlight
              item={spotlight}
              profile={profile}
              status={statusOf(profile, access, spotlight.kind, spotlight.id)}
              balance={balance}
              onOpen={open}
            />
          ) : null}

          {shelf(
            "wish",
            <>
              <Heart className="size-5 text-heart" /> Merkliste
            </>,
            "Deine gemerkten Teile",
            wishItems,
          )}
          {shelf(
            "new",
            <>
              <Sparkles className="size-5 text-accent" /> Neu
            </>,
            "Nur hier im Shop zu haben",
            newItems,
          )}
          {shelf(
            "popular",
            <>
              <TrendingUp className="size-5 text-accent" /> Beliebt
            </>,
            "Was die Community gerade kauft",
            popularItems,
          )}

          {bundles.length > 0 ? (
            <section aria-label="Pakete">
              <h2 className="flex items-center gap-2 font-display text-2xl">
                <Package className="size-5 text-accent" /> Pakete
              </h2>
              <p className="text-xs text-fg-subtle">
                Zusammen {Math.round(BUNDLE_DISCOUNT * 100)} % günstiger. Was du schon hast, zahlst
                du nicht noch mal.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bundles.map((bundle) => (
                  <li key={bundle.id}>
                    <BundleCard
                      bundleId={bundle.id}
                      profile={profile}
                      access={access}
                      balance={balance}
                      onOpen={() => setSelected({ type: "bundle", id: bundle.id })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {TYPES.filter((t) => t.id !== "alle").map((t) =>
            shelf(
              t.id,
              t.label,
              `${t.hint} · ${counts[t.id]}`,
              pool.filter((it) => it.kind === t.id),
              t.id as ShopKind,
            ),
          )}
          {pool.length === 0 ? (
            <EmptyState
              onReset={() => {
                setCollection("alle");
                setMine(false);
              }}
            />
          ) : null}
        </div>
      ) : (
        <section id="shop-grid" className="mt-8 scroll-mt-6" aria-label="Artikel">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl">
              {q.length > 0 ? "Treffer" : TYPES.find((t) => t.id === type)?.label}
            </h2>
            <p className="text-xs text-fg-subtle" aria-live="polite">
              {items.length} Artikel
              {pages > 1 ? ` · Seite ${current + 1} von ${pages}` : ""}
            </p>
          </div>
          {pageItems.length === 0 ? (
            <EmptyState
              onReset={() => {
                setQuery("");
                setCollection("alle");
                setMine(false);
                setType("alle");
              }}
            />
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {pageItems.map((item) => (
                <li key={ownedKey(item.kind, item.id)}>{card(item)}</li>
              ))}
            </ul>
          )}
          {pages > 1 ? <Pager pages={pages} current={current} goTo={goTo} /> : null}
        </section>
      )}

      <Dialog.Root
        open={Boolean(sheetItem || sheetBundle)}
        onOpenChange={(v) => {
          if (!v) closeSheet();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="shop-sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="shop-sheet fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
          >
            {sheetItem ? (
              <ItemSheet
                key={selected?.type === "item" ? selected.key : ""}
                item={sheetItem}
                profile={profile}
                status={statusOf(profile, access, sheetItem.kind, sheetItem.id)}
                balance={balance}
                todayLeft={Math.max(0, DAILY_PAW_CAP - today)}
                activeDays={access.activeDays}
                wished={wished.has(ownedKey(sheetItem.kind, sheetItem.id))}
                busy={busy !== null}
                onWish={toggleWish}
                onBuy={buy}
                onEquip={(it) => equip(it.kind, it.id)}
                onBundle={(id) => setSelected({ type: "bundle", id })}
                onClose={closeSheet}
              />
            ) : sheetBundle ? (
              <BundleSheet
                key={sheetBundle.id}
                bundleId={sheetBundle.id}
                profile={profile}
                access={access}
                balance={balance}
                busy={busy !== null}
                onBuy={buyBundle}
                onEquip={equip}
                onOpenItem={(key) => setSelected({ type: "item", key })}
                onClose={closeSheet}
              />
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
      <p className="text-sm text-fg-muted">Hier ist gerade nichts dabei.</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 h-11 rounded-xl border border-border px-4 text-sm hover:bg-bg-subtle"
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}

function Pager({
  pages,
  current,
  goTo,
}: {
  pages: number;
  current: number;
  goTo: (p: number) => void;
}) {
  return (
    <nav aria-label="Seiten" className="mt-6 flex items-center justify-center gap-1">
      <button
        type="button"
        aria-label="Vorherige Seite"
        disabled={current === 0}
        onClick={() => goTo(current - 1)}
        className="grid size-11 place-items-center rounded-xl border border-border disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </button>
      <div className="flex max-w-full gap-1 overflow-x-auto px-1">
        {Array.from({ length: pages }, (_, p) => p)
          .filter((p) => p === 0 || p === pages - 1 || Math.abs(p - current) <= 1)
          .flatMap((p, i, arr) => {
            const gap = i > 0 && p - arr[i - 1]! > 1;
            const btn = (
              <button
                key={p}
                type="button"
                aria-label={`Seite ${p + 1}`}
                aria-current={p === current ? "page" : undefined}
                onClick={() => goTo(p)}
                className={cn(
                  "grid h-11 min-w-11 place-items-center rounded-xl px-2 text-sm tabular-nums",
                  p === current ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle",
                )}
              >
                {p + 1}
              </button>
            );
            return gap
              ? [
                  <span
                    key={`gap${p}`}
                    className="grid h-11 place-items-center px-1 text-fg-subtle"
                  >
                    …
                  </span>,
                  btn,
                ]
              : [btn];
          })}
      </div>
      <button
        type="button"
        aria-label="Nächste Seite"
        disabled={current >= pages - 1}
        onClick={() => goTo(current + 1)}
        className="grid size-11 place-items-center rounded-xl border border-border disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

function PawPrice({ price, className }: { price: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      <span aria-hidden="true">🐾</span>
      {price}
      <span className="sr-only"> Pfoten</span>
    </span>
  );
}

function WishButton({
  itemKey,
  label,
  wished,
  onWish,
  className,
}: {
  itemKey: string;
  label: string;
  wished: boolean;
  onWish: (key: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={wished}
      aria-label={wished ? `${label} von der Merkliste nehmen` : `${label} merken`}
      onClick={() => {
        onWish(itemKey);
        toast(wished ? "Von der Merkliste genommen." : "Auf die Merkliste gesetzt.");
      }}
      className={cn("shop-heart grid size-11 place-items-center rounded-full", className)}
    >
      <span className="grid size-8 place-items-center rounded-full bg-bg/70 backdrop-blur-sm">
        <Heart
          className={cn("size-4", wished ? "fill-heart text-heart" : "text-fg-muted")}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

const ShopCard = memo(function ShopCard({
  item,
  profile,
  status,
  balance,
  activeDays,
  wished,
  popular,
  busy,
  disabled,
  onOpen,
  onEquip,
  onWish,
}: {
  item: Item;
  profile: Profile;
  status: Status;
  balance: number;
  activeDays: number;
  wished: boolean;
  popular: boolean;
  busy: boolean;
  disabled: boolean;
  onOpen: (item: Item) => void;
  onEquip: (item: Item) => void;
  onWish: (key: string) => void;
}) {
  const key = ownedKey(item.kind, item.id);
  const missing = Math.max(0, item.price - balance);
  const how = status === "buy" ? howToGet(item.kind, item.id, activeDays) : null;
  return (
    <article
      data-active={status === "active"}
      className={cn(
        "shop-card relative flex h-full flex-col overflow-hidden rounded-2xl border bg-bg-elevated/60",
        status === "active" ? "border-accent" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`${item.label} ansehen`}
        className="block text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <Preview item={item} profile={profile} />
        <div className="px-3 pt-2.5">
          <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">
            {KIND_LABEL[item.kind]}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-medium">{item.label}</p>
        </div>
      </button>
      <div className="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1">
        {status === "active" ? (
          <Badge tone="accent">
            <Check className="size-3" /> Angelegt
          </Badge>
        ) : status === "owned" ? (
          <Badge tone="muted">Gehört dir</Badge>
        ) : isNew(item) ? (
          <Badge tone="accent">Neu</Badge>
        ) : null}
        {popular && status === "buy" ? <Badge tone="muted">Beliebt</Badge> : null}
      </div>
      <WishButton
        itemKey={key}
        label={item.label}
        wished={wished}
        onWish={onWish}
        className="absolute top-0 right-0"
      />
      <div className="mt-auto flex flex-col gap-1 p-3 pt-2">
        {how?.day ? (
          <p className="text-[11px] text-fg-subtle">
            Gratis ab Tag {how.day}
            {how.daysLeft ? ` · noch ${how.daysLeft}` : ""}
          </p>
        ) : null}
        {status === "active" ? (
          <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent/15 text-xs text-accent">
            <Check className="size-3.5" /> Trägst du
          </span>
        ) : status === "owned" ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEquip(item)}
            className="h-11 w-full rounded-xl border border-border text-xs font-medium hover:bg-bg-subtle disabled:opacity-60"
          >
            {busy ? "…" : "Anlegen"}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onOpen(item)}
            aria-label={`${item.label} für ${item.price} Pfoten ansehen`}
            className={cn(
              "flex h-11 w-full flex-col items-center justify-center rounded-xl text-xs font-medium leading-tight",
              missing === 0
                ? "bg-accent text-accent-fg"
                : "border border-border text-fg-muted hover:bg-bg-subtle",
            )}
          >
            <PawPrice price={item.price} />
            {missing > 0 && balance > 0 ? (
              <span className="text-[10px] font-normal text-fg-subtle">noch {missing}</span>
            ) : null}
          </button>
        )}
      </div>
    </article>
  );
});

function Badge({ tone, children }: { tone: "accent" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm",
        tone === "accent" ? "bg-accent text-accent-fg" : "bg-bg/75 text-fg",
      )}
    >
      {children}
    </span>
  );
}

function Spotlight({
  item,
  profile,
  status,
  balance,
  onOpen,
}: {
  item: Item;
  profile: Profile;
  status: Status;
  balance: number;
  onOpen: (item: Item) => void;
}) {
  const look = withItem(lookOf(profile), item.kind, item.id);
  return (
    <section
      aria-label="Im Rampenlicht"
      className="overflow-hidden rounded-3xl border border-border bg-bg-elevated/60 sm:grid sm:grid-cols-[1.2fr_1fr]"
    >
      <LookPreview
        look={look}
        avatarUrl={profile.avatarUrl}
        name={profile.displayName}
        handle={profile.handle}
      />
      <div className="flex flex-col justify-center gap-2 p-5">
        <p className="flex items-center gap-1.5 text-[11px] tracking-[0.16em] text-accent uppercase">
          <Sparkles className="size-3.5" /> Im Rampenlicht · heute
        </p>
        <h2 className="font-display text-3xl leading-tight">{item.label}</h2>
        <p className="text-sm text-fg-muted">
          {KIND_LABEL[item.kind]} · {COLLECTION_LABEL.get(collectionOf(item.kind, item.id))}. So
          sähe es bei dir aus.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg"
          >
            {status === "buy" ? (
              <>
                Ansehen · <PawPrice price={item.price} />
              </>
            ) : (
              "Ansehen"
            )}
          </button>
          {status === "buy" && balance < item.price ? (
            <span className="text-xs text-fg-subtle">noch {item.price - balance} Pfoten</span>
          ) : status !== "buy" ? (
            <span className="text-xs text-accent">Gehört dir schon</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function BundleCard({
  bundleId,
  profile,
  access,
  balance,
  onOpen,
}: {
  bundleId: string;
  profile: Profile;
  access: Access;
  balance: number;
  onOpen: () => void;
}) {
  const bundle = BUNDLES.find((b) => b.id === bundleId)!;
  const quote = bundleQuote(bundle.id, access)!;
  const complete = quote.missing.length === 0;
  const deco = bundle.items.find((it) => it.kind === "decoration");
  const plate = bundle.items.find((it) => it.kind === "plate");
  const effect = bundle.items.find((it) => it.kind === "effect");
  const bg = bundle.items.find((it) => it.kind === "background");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="shop-card flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated/60 text-left"
    >
      <div
        className={cn(
          "relative flex h-36 w-full items-center gap-4 overflow-hidden px-5",
          bg ? "bg-swatch" : "bg-bg-subtle",
        )}
        data-bg={bg?.id}
        style={bgStyle(bg?.id)}
      >
        {effect ? (
          <ProfileEffectLayer
            effect={effect.id as NonNullable<Profile["effect"]>}
            className="inset-0"
          />
        ) : null}
        <DecoratedAvatar
          src={profile.avatarUrl}
          name={profile.displayName}
          decoration={(deco?.id ?? null) as Profile["decoration"]}
          className="relative z-10 size-16"
          letterClassName="text-xl"
        />
        <span className="relative z-10 min-w-0 text-sm font-medium">
          <NamePlate plate={(plate?.id ?? null) as Profile["namePlate"]}>
            {profile.displayName}
          </NamePlate>
        </span>
        {!complete ? (
          <span className="absolute top-2 right-2 rounded-full bg-heart px-2 py-0.5 text-[11px] font-medium text-white">
            −{Math.round(BUNDLE_DISCOUNT * 100)} %
          </span>
        ) : null}
      </div>
      <div className="flex w-full flex-1 flex-col gap-1.5 p-4">
        <p className="font-medium">{bundle.label}</p>
        <p className="text-xs leading-relaxed text-fg-subtle">
          {bundle.items.length} Teile ·{" "}
          {bundle.items.map((it) => itemLabel(it.kind, it.id)).join(" · ")}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm">
          {complete ? (
            <span className="flex items-center gap-1.5 text-accent">
              <Check className="size-4" /> Alles gehört dir
            </span>
          ) : (
            <>
              <span className="flex items-baseline gap-2 font-medium">
                <PawPrice price={quote.price} />
                {quote.full !== quote.price ? (
                  <span className="text-xs font-normal text-fg-subtle line-through">
                    {quote.full}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-fg-subtle">
                {balance >= quote.price ? "Ansehen" : `noch ${quote.price - balance}`}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function SheetClose() {
  return (
    <Dialog.Close
      aria-label="Schließen"
      className="absolute top-2 right-2 z-20 grid size-11 place-items-center rounded-full"
    >
      <span className="grid size-9 place-items-center rounded-full bg-bg/70 backdrop-blur-sm">
        <X className="size-4" />
      </span>
    </Dialog.Close>
  );
}

function Burst() {
  const bits = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const dist = 80 + (i % 3) * 22;
    return {
      x: `${Math.round(Math.cos(angle) * dist)}px`,
      y: `${Math.round(Math.sin(angle) * dist)}px`,
      r: `${(i * 47) % 360}deg`,
      d: `${(i % 4) * 40}ms`,
    };
  });
  return (
    <div className="shop-burst" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ "--x": b.x, "--y": b.y, "--r": b.r, "--d": b.d } as CSSProperties}>
          {i % 3 === 0 ? "✦" : "🐾"}
        </span>
      ))}
    </div>
  );
}

function ItemSheet({
  item,
  profile,
  status,
  balance,
  todayLeft,
  activeDays,
  wished,
  busy,
  onWish,
  onBuy,
  onEquip,
  onBundle,
  onClose,
}: {
  item: Item;
  profile: Profile;
  status: Status;
  balance: number;
  todayLeft: number;
  activeDays: number;
  wished: boolean;
  busy: boolean;
  onWish: (key: string) => void;
  onBuy: (item: Item, equipAfter: boolean) => Promise<"bought" | "equipped" | null>;
  onEquip: (item: Item) => Promise<boolean>;
  onBundle: (id: string) => void;
  onClose: () => void;
}) {
  const key = ownedKey(item.kind, item.id);
  const [compare, setCompare] = useState<"mit" | "ohne">("mit");
  const [equipAfter, setEquipAfter] = useState(true);
  const [done, setDone] = useState<"bought" | "equipped" | null>(null);
  useEffect(() => setEquipAfter(readStorage<boolean>(EQUIP_KEY, true) !== false), []);

  const base = lookOf(profile);
  const look = compare === "mit" ? withItem(base, item.kind, item.id) : base;
  const missing = Math.max(0, item.price - balance);
  const how = howToGet(item.kind, item.id, activeDays);
  const bundles = BUNDLES.filter((b) =>
    b.items.some((it) => it.kind === item.kind && it.id === item.id),
  );

  async function handleBuy() {
    writeStorage(EQUIP_KEY, equipAfter);
    const result = await onBuy(item, equipAfter);
    if (result) setDone(result);
  }

  return (
    <div className="relative">
      <SheetClose />
      <div className="relative">
        <div className={cn(done && "shop-pop")}>
          <LookPreview
            look={look}
            avatarUrl={profile.avatarUrl}
            name={profile.displayName}
            handle={profile.handle}
            className="rounded-t-3xl"
          />
        </div>
        {done ? <Burst /> : null}
        {status !== "active" ? (
          <div
            className="absolute top-2 left-3 z-20 flex rounded-full border border-border bg-bg/75 p-1 text-xs backdrop-blur-md"
            role="group"
            aria-label="Vergleich"
          >
            {(["ohne", "mit"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={compare === v}
                onClick={() => setCompare(v)}
                className={cn(
                  "h-9 rounded-full px-3",
                  compare === v ? "bg-accent text-accent-fg" : "text-fg-muted",
                )}
              >
                {v === "ohne" ? "Jetzt" : "Mit diesem Teil"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.14em] text-fg-subtle uppercase">
              {KIND_LABEL[item.kind]} · {COLLECTION_LABEL.get(collectionOf(item.kind, item.id))}
            </p>
            <Dialog.Title className="mt-1 font-display text-2xl leading-tight">
              {item.label}
            </Dialog.Title>
          </div>
          <WishButton
            itemKey={key}
            label={item.label}
            wished={wished}
            onWish={onWish}
            className="-mt-1 -mr-2 shrink-0"
          />
        </div>

        {done ? (
          <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4" role="status">
            <p className="flex items-center gap-2 font-medium">
              <Check className="size-4 text-accent" /> Gehört jetzt dir!
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {done === "equipped" || status === "active"
                ? "Ist schon angelegt — schau mal auf dein Profil."
                : "Willst du es gleich tragen?"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {status === "owned" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onEquip(item).then((ok) => ok && setDone("equipped"))}
                  className="h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60"
                >
                  Jetzt anlegen
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-xl border border-border px-4 text-sm hover:bg-bg-subtle"
              >
                Weiter stöbern
              </button>
            </div>
          </div>
        ) : status === "active" ? (
          <p className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent/15 text-sm text-accent">
            <Check className="size-4" /> Trägst du gerade
          </p>
        ) : status === "owned" ? (
          <div className="space-y-2">
            <p className="text-sm text-fg-muted">Gehört dir schon.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEquip(item)}
              className="h-12 w-full rounded-xl bg-accent text-sm font-medium text-accent-fg disabled:opacity-60"
            >
              {busy ? "…" : "Anlegen"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-fg-subtle">Preis</p>
                <p className="font-display text-3xl leading-none">
                  <PawPrice price={item.price} />
                </p>
              </div>
              <p className="text-right text-xs text-fg-muted">
                {missing === 0 ? (
                  <>
                    Danach hast du noch <span className="tabular-nums">{balance - item.price}</span>
                  </>
                ) : (
                  <>
                    Dir fehlen noch <span className="tabular-nums text-fg">{missing}</span>
                    <br />
                    <span className="text-fg-subtle">{earnHint(missing, todayLeft)}</span>
                  </>
                )}
              </p>
            </div>
            {missing > 0 ? (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-bg-subtle"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={item.price}
                aria-valuenow={balance}
                aria-label="Gespart für diesen Artikel"
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(1, balance / item.price) * 100}%` }}
                />
              </div>
            ) : null}
            {how.day ? (
              <p className="rounded-xl bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
                Oder gratis ab deinem {how.day}. aktiven Tag
                {how.daysLeft
                  ? ` — noch ${how.daysLeft} ${how.daysLeft === 1 ? "Tag" : "Tage"}`
                  : ""}
                .
              </p>
            ) : null}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={equipAfter}
                onChange={(e) => setEquipAfter(e.target.checked)}
                className="size-5 accent-[var(--color-accent)]"
              />
              Nach dem Kauf gleich anlegen
            </label>
            <button
              type="button"
              disabled={busy || missing > 0}
              onClick={() => void handleBuy()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                "Wird gekauft …"
              ) : missing > 0 ? (
                `Noch ${missing} Pfoten sammeln`
              ) : (
                <>
                  Für <PawPrice price={item.price} /> kaufen
                </>
              )}
            </button>
            {missing > 0 && !wished ? (
              <button
                type="button"
                onClick={() => onWish(key)}
                className="h-11 w-full rounded-xl border border-border text-sm hover:bg-bg-subtle"
              >
                Merken und später kaufen
              </button>
            ) : null}
          </div>
        )}

        {bundles.length > 0 && !done ? (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs text-fg-subtle">
              Auch im Paket, {Math.round(BUNDLE_DISCOUNT * 100)} % günstiger
            </p>
            {bundles.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onBundle(b.id)}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border px-3 text-left text-sm hover:bg-bg-subtle"
              >
                <span className="flex items-center gap-2">
                  <Package className="size-4 text-accent" /> {b.label}
                </span>
                <ChevronRight className="size-4 text-fg-subtle" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BundleSheet({
  bundleId,
  profile,
  access,
  balance,
  busy,
  onBuy,
  onEquip,
  onOpenItem,
  onClose,
}: {
  bundleId: string;
  profile: Profile;
  access: Access;
  balance: number;
  busy: boolean;
  onBuy: (id: string) => Promise<boolean>;
  onEquip: (kind: ShopKind, id: string, quiet?: boolean) => Promise<boolean>;
  onOpenItem: (key: string) => void;
  onClose: () => void;
}) {
  const bundle = BUNDLES.find((b) => b.id === bundleId)!;
  const quote = bundleQuote(bundle.id, access)!;
  const [done, setDone] = useState(false);
  const [wearing, setWearing] = useState(false);
  let look = lookOf(profile);
  // Two frames in one bundle: the preview shows the first one.
  for (const it of [...bundle.items].reverse()) look = withItem(look, it.kind, it.id);
  const missing = Math.max(0, quote.price - balance);

  async function wearAll() {
    setWearing(true);
    const seen = new Set<ShopKind>();
    for (const it of bundle.items) {
      if (seen.has(it.kind)) continue;
      seen.add(it.kind);
      if (!(await onEquip(it.kind, it.id, true))) break;
    }
    setWearing(false);
    toast.success(`${bundle.label} ist angelegt.`);
    onClose();
  }

  return (
    <div className="relative">
      <SheetClose />
      <div className="relative">
        <div className={cn(done && "shop-pop")}>
          <LookPreview
            look={look}
            avatarUrl={profile.avatarUrl}
            name={profile.displayName}
            handle={profile.handle}
            className="rounded-t-3xl"
          />
        </div>
        {done ? <Burst /> : null}
      </div>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Paket</p>
          <Dialog.Title className="mt-1 font-display text-2xl leading-tight">
            {bundle.label}
          </Dialog.Title>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {bundle.items.map((it) => {
            const key = ownedKey(it.kind, it.id);
            const have = canUseItem(it.kind, it.id, access);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onOpenItem(key)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-bg-subtle"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{itemLabel(it.kind, it.id)}</span>
                    <span className="text-[11px] text-fg-subtle">{KIND_LABEL[it.kind]}</span>
                  </span>
                  {have ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                      <Check className="size-3.5" /> Hast du
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-fg-muted">
                      <PawPrice price={shopPrice(it.kind, it.id) ?? 0} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {done || quote.missing.length === 0 ? (
          <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4" role="status">
            <p className="flex items-center gap-2 font-medium">
              <Check className="size-4 text-accent" />
              {done ? "Paket gehört jetzt dir!" : "Alles aus dem Paket gehört dir."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || wearing}
                onClick={() => void wearAll()}
                className="h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60"
              >
                {wearing ? "…" : "Alles anlegen"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-xl border border-border px-4 text-sm hover:bg-bg-subtle"
              >
                Weiter stöbern
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-fg-subtle">
                  {quote.missing.length} von {bundle.items.length} fehlen dir
                </p>
                <p className="flex items-baseline gap-2 font-display text-3xl leading-none">
                  <PawPrice price={quote.price} />
                  <span className="font-sans text-sm text-fg-subtle line-through">
                    {quote.full}
                  </span>
                </p>
              </div>
              <p className="text-right text-xs text-fg-muted">
                {missing === 0
                  ? `Du sparst ${quote.full - quote.price}`
                  : `Dir fehlen noch ${missing}`}
              </p>
            </div>
            <button
              type="button"
              disabled={busy || missing > 0}
              onClick={() => void onBuy(bundle.id).then((ok) => ok && setDone(true))}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                "Wird gekauft …"
              ) : missing > 0 ? (
                `Noch ${missing} Pfoten sammeln`
              ) : (
                <>
                  Paket für <PawPrice price={quote.price} /> kaufen
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const Preview = memo(function Preview({ item, profile }: { item: Item; profile: Profile }) {
  let content: ReactNode;
  if (item.kind === "background") {
    return <div className="bg-swatch h-28" data-bg={item.id} style={bgStyle(item.id)} />;
  }
  if (item.kind === "decoration") {
    content = (
      <DecoratedAvatar
        src={profile.avatarUrl}
        name={profile.displayName}
        decoration={item.id as Profile["decoration"]}
        className="size-14"
        letterClassName="text-lg"
      />
    );
  } else if (item.kind === "plate") {
    content = (
      <span className="max-w-full truncate text-sm font-medium">
        <NamePlate plate={item.id as Profile["namePlate"]}>{profile.displayName}</NamePlate>
      </span>
    );
  } else if (item.kind === "name") {
    content = (
      <StyledName
        text={profile.displayName}
        nameStyle={item.id as Profile["nameStyle"]}
        className="max-w-full truncate font-display text-lg"
      />
    );
  } else {
    content = (
      <>
        <ProfileEffectLayer
          effect={item.id as NonNullable<Profile["effect"]>}
          className="inset-0"
        />
        <DecoratedAvatar
          src={profile.avatarUrl}
          name={profile.displayName}
          decoration={null}
          className="size-12"
          letterClassName="text-base"
        />
      </>
    );
  }
  return (
    <div className="relative grid h-28 place-items-center overflow-hidden bg-bg-subtle px-2">
      {content}
    </div>
  );
});

import { useState, type ReactNode } from "react";
import { bgStyle } from "@/lib/vela/bg-style";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Clock, Package, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { buyShopBundle, buyShopItem, equipShopItem, getMyProfile } from "@/lib/vela/server";
import { BACKGROUNDS } from "@/lib/vela/backgrounds";
import { AVATAR_DECORATIONS, NAME_PLATES, PROFILE_EFFECTS } from "@/lib/vela/decorations";
import { NAME_STYLES, unlockDay } from "@/lib/vela/rewards";
import {
  BUNDLES,
  ALL_COLLECTIONS,
  BUNDLE_DISCOUNT,
  CLASSIC_COLLECTION,
  bundleCollection,
  collectionOf,
  DAILY_PAW_CAP,
  SHOP_ONLY,
  bundleQuote,
  canUseItem,
  ownedKey,
  shopPrice,
  type ShopKind,
} from "@/lib/vela/shop";
import { PAWS_KEY, usePaws } from "@/lib/vela/use-paws";
import { memberErrorMessage } from "@/lib/vela/errors";
import type { Profile } from "@/lib/vela/types";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { GENERATED, genItem, isGeneratedId, type GenKind } from "@/lib/vela/catalog";
import { RitualBar } from "@/components/ritual-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/shop")({ component: Shop });

type Item = { kind: ShopKind; id: string; label: string; price: number };

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

/** Shop-only items first ("Neu"), then the rest. */
const isNew = (item: Item) => ownedKey(item.kind, item.id) in SHOP_ONLY;

function forSale(kind: ShopKind, list: readonly { id: string; label: string }[]): Item[] {
  return list
    .flatMap((x) => {
      const price = shopPrice(kind, x.id);
      return price === null ? [] : [{ kind, id: x.id, label: x.label, price }];
    })
    .sort((a, b) => Number(isNew(b)) - Number(isNew(a)));
}

/** Filter chips by kind, in shop order. */
const TYPES: { id: ShopKind | "alle"; label: string; hint: string }[] = [
  { id: "alle", label: "Überblick", hint: "Nach Art sortiert" },
  { id: "decoration", label: "Rahmen", hint: "Um dein Bild" },
  { id: "effect", label: "Effekte", hint: "Auf dem Profil" },
  { id: "plate", label: "Schilder", hint: "Hinter dem Namen" },
  { id: "background", label: "Hintergründe", hint: "Fürs Profil" },
  { id: "name", label: "Namen", hint: "Schriftstil" },
];

/** Every item for sale: hand-made ones (new first), then the generated catalogue. */
const ALL_ITEMS: Item[] = [
  ...forSale("decoration", AVATAR_DECORATIONS),
  ...forSale("effect", PROFILE_EFFECTS),
  ...forSale("plate", NAME_PLATES),
  ...forSale("background", BACKGROUNDS),
  ...forSale("name", NAME_STYLES),
  ...GENERATED.map((g) => ({ kind: g.kind, id: g.id, label: g.label, price: g.price })),
];

const PAGE_SIZE = 12;
const SHELF_SIZE = 8;

function inUse(profile: Profile, item: Item): boolean {
  if (item.kind === "background") return profile.backgroundId === item.id;
  if (item.kind === "decoration") return profile.decoration === item.id;
  if (item.kind === "effect") return profile.effect === item.id;
  if (item.kind === "plate") return profile.namePlate === item.id;
  return profile.nameStyle === item.id;
}

function Shop() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const paws = usePaws();
  const [busy, setBusy] = useState<string | null>(null);
  const [collection, setCollection] = useState("alle");
  const [type, setType] = useState<ShopKind | "alle">("alle");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  function goTo(p: number) {
    setPage(p);
    document.getElementById("shop-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const bundles = BUNDLES.filter(
    (b) => collection === "alle" || bundleCollection(b.id) === collection,
  );
  const profile = me.data;

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const balance = paws.data?.paws ?? profile.paws ?? 0;
  const today = paws.data?.today ?? 0;
  const access = {
    activeDays: profile.activeDays ?? 0,
    team: profile.isAdmin,
    owned: profile.owned,
  };
  const q = query.trim().toLowerCase();
  const pool = ALL_ITEMS.filter(
    (it) =>
      (collection === "alle" || collectionOf(it.kind, it.id) === collection) &&
      (!mine || canUseItem(it.kind, it.id, access)) &&
      (q.length === 0 || it.label.toLowerCase().includes(q)),
  );
  const overview = type === "alle" && q.length === 0;
  const items = overview ? pool : pool.filter((it) => type === "alle" || it.kind === type);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageItems = items.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const counts = Object.fromEntries(
    TYPES.map((t) => [
      t.id,
      t.id === "alle" ? pool.length : pool.filter((it) => it.kind === t.id).length,
    ]),
  ) as Record<ShopKind | "alle", number>;

  async function refresh() {
    await Promise.all(
      ["me", "profile", "feed", "paws"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }

  async function buy(item: Item) {
    if (balance < item.price) {
      toast.error(`Dir fehlen noch ${item.price - balance} Pfoten.`);
      return;
    }
    if (!window.confirm(`„${item.label}“ für ${item.price} Pfoten kaufen?`)) return;
    setBusy(`${item.kind}:${item.id}`);
    try {
      const result = await buyShopItem({ data: { kind: item.kind, id: item.id } });
      queryClient.setQueryData(PAWS_KEY, (old: typeof paws.data) =>
        old ? { ...old, paws: result.paws } : old,
      );
      await equipShopItem({ data: { kind: item.kind, id: item.id } });
      await refresh();
      toast.success(`„${item.label}“ gehört jetzt dir und ist aktiv.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Kauf fehlgeschlagen."));
    } finally {
      setBusy(null);
    }
  }

  async function buyBundle(id: string, label: string, price: number) {
    if (balance < price) {
      toast.error(`Dir fehlen noch ${price - balance} Pfoten.`);
      return;
    }
    if (!window.confirm(`„${label}“ für ${price} Pfoten kaufen?`)) return;
    setBusy(`bundle:${id}`);
    try {
      const result = await buyShopBundle({ data: { id } });
      queryClient.setQueryData(PAWS_KEY, (old: typeof paws.data) =>
        old ? { ...old, paws: result.paws } : old,
      );
      await refresh();
      toast.success(`„${label}“ gekauft (${result.count} Teile). Anlegen: unten auf „Benutzen“.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Kauf fehlgeschlagen."));
    } finally {
      setBusy(null);
    }
  }

  async function equip(item: Item) {
    setBusy(`${item.kind}:${item.id}`);
    try {
      await equipShopItem({ data: { kind: item.kind, id: item.id } });
      await refresh();
      toast.success(`„${item.label}“ ist aktiv.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Hat nicht geklappt."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Profil schmücken</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl">Shop</h1>
        <p className="text-sm text-fg-muted">
          <span className="tabular-nums text-fg">{profile.owned.length}</span> Teile gehören dir
        </p>
      </div>

      <section className="relative mt-6 overflow-hidden rounded-3xl border border-border bg-bg-elevated/75 p-5">
        <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Dein Guthaben</p>
            <p className="mt-1 font-display text-5xl tabular-nums leading-none">
              {balance}
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
          1 Pfote pro Minute, bis zu {DAILY_PAW_CAP} am Tag. Die Tagespfote oben drauf gibt es nur
          einmal — dafür lohnt sich das Öffnen.
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
            placeholder="Artikel suchen"
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
            "h-11 rounded-2xl border px-4 text-sm",
            mine ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:text-fg",
          )}
        >
          Nur meine
        </button>
      </div>

      <label className="mt-3 block text-xs text-fg-muted">
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="Art">
        {TYPES.map((t) => {
          const on = type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setType(t.id);
                setPage(0);
              }}
              className={cn(
                "rounded-2xl border px-3 py-2.5 text-left transition-colors",
                on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg-elevated/50 hover:border-border-strong",
              )}
            >
              <span className="block text-sm font-medium">{t.label}</span>
              <span className={cn("text-[11px] tabular-nums", on ? "text-accent-fg/75" : "text-fg-subtle")}>
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>

      {overview && bundles.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-2xl">
                <Package className="size-5 text-accent" /> Pakete
              </h2>
              <p className="text-xs text-fg-subtle">
                Zusammen {Math.round(BUNDLE_DISCOUNT * 100)} % günstiger. Was du schon hast, zahlst du nicht noch mal.
              </p>
            </div>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((bundle) => {
              const quote = bundleQuote(bundle.id, access)!;
              const complete = quote.missing.length === 0;
              const deco = bundle.items.find((it) => it.kind === "decoration");
              const plate = bundle.items.find((it) => it.kind === "plate");
              const effect = bundle.items.find((it) => it.kind === "effect");
              const bg = bundle.items.find((it) => it.kind === "background");
              return (
                <li
                  key={bundle.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated/60"
                >
                  <div
                    className={cn(
                      "relative flex h-36 items-center gap-4 overflow-hidden px-5",
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
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <p className="text-[11px] tracking-[0.14em] text-fg-subtle uppercase">Paket</p>
                    <p className="font-medium">{bundle.label}</p>
                    <p className="text-xs leading-relaxed text-fg-subtle">
                      {bundle.items.map((it) => itemLabel(it.kind, it.id)).join(" · ")}
                    </p>
                    <div className="mt-auto pt-2">
                      {complete ? (
                        <span className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent/15 text-sm text-accent">
                          <Check className="size-4" /> Alles gehört dir
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void buyBundle(bundle.id, bundle.label, quote.price)}
                          className={cn(
                            "flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium tabular-nums",
                            balance >= quote.price
                              ? "bg-accent text-accent-fg"
                              : "border border-border text-fg-muted",
                          )}
                        >
                          {busy === `bundle:${bundle.id}` ? (
                            "…"
                          ) : (
                            <>
                              <ShoppingBag className="size-4" /> {quote.price}
                              <span className="text-xs line-through opacity-60">{quote.full}</span>
                              <span className="rounded-md bg-heart/15 px-1.5 py-0.5 text-[11px] text-heart">
                                −{Math.round(BUNDLE_DISCOUNT * 100)} %
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {overview ? (
        <div className="mt-10 flex flex-col gap-10">
          {TYPES.filter((t) => t.id !== "alle").map((t) => {
            const shelf = pool.filter((it) => it.kind === t.id);
            if (shelf.length === 0) return null;
            return (
              <section key={t.id}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl">{t.label}</h2>
                    <p className="text-xs text-fg-subtle">
                      {t.hint} · {shelf.length}
                    </p>
                  </div>
                  {shelf.length > SHELF_SIZE ? (
                    <button
                      type="button"
                      onClick={() => {
                        setType(t.id);
                        setPage(0);
                        window.setTimeout(() => {
                          document.getElementById("shop-grid")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }, 40);
                      }}
                      className="text-sm text-accent"
                    >
                      Alle {shelf.length}
                    </button>
                  ) : null}
                </div>
                <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
                  {shelf.slice(0, SHELF_SIZE).map((item) => (
                    <li key={`${item.kind}:${item.id}`} className="w-40 shrink-0">
                      <ShopCard
                        item={item}
                        profile={profile}
                        access={access}
                        balance={balance}
                        busy={busy}
                        onBuy={(it) => void buy(it)}
                        onEquip={(it) => void equip(it)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {pool.length === 0 ? (
            <p className="text-sm text-fg-muted">Nichts passt zu diesem Filter.</p>
          ) : null}
        </div>
      ) : (
        <section id="shop-grid" className="mt-8 scroll-mt-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl">
              {q.length > 0 ? "Treffer" : TYPES.find((t) => t.id === type)?.label}
            </h2>
            <p className="text-xs text-fg-subtle">
              {items.length} Artikel
              {pages > 1 ? ` · Seite ${current + 1} von ${pages}` : ""}
            </p>
          </div>
          {pageItems.length === 0 ? (
            <p className="mt-6 text-sm text-fg-muted">Hier gibt es nichts dazu.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {pageItems.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <ShopCard
                    item={item}
                    profile={profile}
                    access={access}
                    balance={balance}
                    busy={busy}
                    onBuy={(it) => void buy(it)}
                    onEquip={(it) => void equip(it)}
                  />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 ? (
            <nav aria-label="Seiten" className="mt-6 flex items-center justify-center gap-1">
              <button
                type="button"
                aria-label="Vorherige Seite"
                disabled={current === 0}
                onClick={() => goTo(current - 1)}
                className="grid size-10 place-items-center rounded-xl border border-border disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex max-w-full gap-1 overflow-x-auto px-1">
                {Array.from({ length: pages }, (_, p) => p)
                  .filter((p) => p === 0 || p === pages - 1 || Math.abs(p - current) <= 2)
                  .flatMap((p, i, arr) => {
                    const gap = i > 0 && p - arr[i - 1]! > 1;
                    const btn = (
                      <button
                        key={p}
                        type="button"
                        aria-current={p === current ? "page" : undefined}
                        onClick={() => goTo(p)}
                        className={cn(
                          "grid h-10 min-w-10 place-items-center rounded-xl px-2 text-sm tabular-nums",
                          p === current ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle",
                        )}
                      >
                        {p + 1}
                      </button>
                    );
                    return gap
                      ? [
                          <span key={`gap${p}`} className="grid h-10 place-items-center px-1 text-fg-subtle">
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
                className="grid size-10 place-items-center rounded-xl border border-border disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}

type Access = { activeDays: number; team: boolean; owned: readonly string[] };

function ShopCard({
  item,
  profile,
  access,
  balance,
  busy,
  onBuy,
  onEquip,
}: {
  item: Item;
  profile: Profile;
  access: Access;
  balance: number;
  busy: string | null;
  onBuy: (item: Item) => void;
  onEquip: (item: Item) => void;
}) {
  const key = `${item.kind}:${item.id}`;
  const usable = canUseItem(item.kind, item.id, access);
  const active = inUse(profile, item);
  const day =
    item.kind === "background" || item.kind === "plate" || isNew(item) || isGeneratedId(item.id)
      ? null
      : unlockDay(item.kind, item.id);
  const kindLabel = TYPES.find((t) => t.id === item.kind)?.label;
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border bg-bg-elevated/60",
        active ? "border-accent" : "border-border",
      )}
    >
      <Preview item={item} profile={profile} />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-[10px] tracking-[0.14em] text-fg-subtle uppercase">{kindLabel}</p>
        <p className="line-clamp-2 text-sm leading-snug font-medium">
          {item.label}
          {isNew(item) ? (
            <span className="ml-1.5 align-middle rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              Neu
            </span>
          ) : null}
        </p>
        {day !== null && !usable ? <p className="text-[11px] text-fg-subtle">Gratis ab Tag {day}</p> : null}
        <div className="mt-auto pt-2">
          {active ? (
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent/15 text-xs text-accent">
              <Check className="size-3.5" /> Aktiv
            </span>
          ) : usable ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => onEquip(item)}
              className="h-9 w-full rounded-xl border border-border text-xs hover:bg-bg-subtle"
            >
              {busy === key ? "…" : "Benutzen"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => onBuy(item)}
              className={cn(
                "flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-medium tabular-nums",
                balance >= item.price ? "bg-accent text-accent-fg" : "border border-border text-fg-muted",
              )}
            >
              {busy === key ? "…" : <>🐾 {item.price}</>}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Preview({
  item,
  profile,
  className,
}: {
  item: Item;
  profile: Profile;
  className?: string;
}) {
  let content: ReactNode;
  if (item.kind === "background") {
    return (
      <div className={cn("bg-swatch h-28", className)} data-bg={item.id} style={bgStyle(item.id)} />
    );
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
      <span className="text-sm font-medium">
        <NamePlate plate={item.id as Profile["namePlate"]}>{profile.displayName}</NamePlate>
      </span>
    );
  } else if (item.kind === "name") {
    content = (
      <StyledName
        text={profile.displayName}
        nameStyle={item.id as Profile["nameStyle"]}
        className="font-display text-lg"
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
    <div className={cn("relative grid h-28 place-items-center overflow-hidden bg-bg-subtle px-2", className)}>
      {content}
    </div>
  );
}

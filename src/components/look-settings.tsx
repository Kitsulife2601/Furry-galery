/**
 * Settings: avatar frame, profile effect, name style and name plate — rewards
 * that unlock the more days someone is active, or bought in the shop. One
 * picker with tabs and search; locked items say how to get them. Saved right away.
 */
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Gift, Lock, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { updateLook } from "@/lib/vela/server";
import {
  AVATAR_DECORATIONS,
  NAME_PLATES,
  PROFILE_EFFECTS,
  type AvatarDecoration,
  type NamePlate as NamePlateId,
  type ProfileEffect,
} from "@/lib/vela/decorations";
import { NamePlate } from "@/components/name-plate";
import {
  NAME_STYLES,
  REWARD_TIERS,
  nextTier,
  type NameStyle,
  type RewardItem,
} from "@/lib/vela/rewards";
import type { Profile } from "@/lib/vela/types";
import { canUseItem, howToGet, ownedKey, type ShopKind } from "@/lib/vela/shop";
import { ownedGenerated } from "@/lib/vela/catalog";
import { memberErrorMessage } from "@/lib/vela/errors";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { LookPreview } from "@/components/look-preview";
import { cn } from "@/lib/utils";

type Look = {
  decoration: AvatarDecoration | null;
  effect: ProfileEffect | null;
  nameStyle: NameStyle | null;
  plate: NamePlateId | null;
};

type Tab = "decoration" | "effect" | "name" | "plate";
const TABS: { id: Tab; label: string; field: keyof Look; none: string; more: string }[] = [
  {
    id: "decoration",
    label: "Rahmen",
    field: "decoration",
    none: "Kein Rahmen",
    more: "Mehr Rahmen",
  },
  { id: "effect", label: "Effekte", field: "effect", none: "Kein Effekt", more: "Mehr Effekte" },
  { id: "name", label: "Name", field: "nameStyle", none: "Normal", more: "Mehr Namens-Stile" },
  { id: "plate", label: "Schild", field: "plate", none: "Kein Schild", more: "Mehr Schilder" },
];

function itemLabel(item: RewardItem): string {
  const list =
    item.kind === "decoration"
      ? AVATAR_DECORATIONS
      : item.kind === "effect"
        ? PROFILE_EFFECTS
        : NAME_STYLES;
  const label = list.find((x) => x.id === item.id)?.label ?? item.id;
  return item.kind === "decoration"
    ? `Rahmen ${label}`
    : item.kind === "effect"
      ? `Effekt ${label}`
      : `Name ${label}`;
}

const lookOf = (p: Profile): Look => ({
  decoration: p.decoration,
  effect: p.effect,
  nameStyle: p.nameStyle,
  plate: p.namePlate,
});

export function LookSettings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [look, setLook] = useState<Look>(() => lookOf(profile));
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("decoration");
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const days = profile.activeDays ?? 0;
  const team = profile.isAdmin;
  const next = team ? null : nextTier(days);
  const prevDay = [...REWARD_TIERS].reverse().find((t) => t.day <= days)?.day ?? 0;
  const progress = next ? Math.min(1, (days - prevDay) / (next.day - prevDay)) : 1;

  // Follow changes made elsewhere (e.g. the shop) while nothing is being saved.
  const saved = lookOf(profile);
  const savedKey = `${saved.decoration}|${saved.effect}|${saved.nameStyle}|${saved.plate}`;
  useEffect(() => {
    if (!busy) setLook(lookOf(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const access = useMemo(
    () => ({ activeDays: days, team, owned: profile.owned }),
    [days, team, profile.owned],
  );

  const options = useMemo(() => {
    const current: Record<Tab, string | null> = {
      decoration: profile.decoration,
      effect: profile.effect,
      name: profile.nameStyle,
      plate: profile.namePlate,
    };
    const lists: Record<Tab, readonly { id: string; label: string }[]> = {
      decoration: [
        ...AVATAR_DECORATIONS,
        ...ownedGenerated("decoration", profile.owned, profile.decoration),
      ],
      effect: [...PROFILE_EFFECTS, ...ownedGenerated("effect", profile.owned, profile.effect)],
      name: NAME_STYLES,
      plate: [...NAME_PLATES, ...ownedGenerated("plate", profile.owned, profile.namePlate)],
    };
    return Object.fromEntries(
      TABS.map((t) => [
        t.id,
        lists[t.id]
          .map((x) => ({
            id: x.id,
            label: x.label,
            open: x.id === current[t.id] || canUseItem(t.id as ShopKind, x.id, access),
          }))
          // Usable first, then locked ones sorted by how soon they come.
          .sort((a, b) => {
            if (a.open !== b.open) return a.open ? -1 : 1;
            if (a.open) return 0;
            const da = howToGet(t.id, a.id, days).day ?? Infinity;
            const db = howToGet(t.id, b.id, days).day ?? Infinity;
            return da - db;
          }),
      ]),
    ) as Record<Tab, { id: string; label: string; open: boolean }[]>;
  }, [profile, access, days]);

  async function save(nextLook: Look) {
    const before = look;
    setLook(nextLook);
    setBusy(true);
    try {
      await updateLook({ data: nextLook });
      await Promise.all(
        ["me", "profile", "feed"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (err) {
      setLook(before);
      toast.error(memberErrorMessage(err, "Speichern fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  const active = TABS.find((t) => t.id === tab)!;
  const q = query.trim().toLowerCase();
  const list = options[tab].filter(
    (o) => (!onlyMine || o.open) && (q.length === 0 || o.label.toLowerCase().includes(q)),
  );
  const openCount = (t: Tab) => options[t].filter((o) => o.open).length;
  const value = look[active.field];
  const pick = (id: string | null) => void save({ ...look, [active.field]: id });

  return (
    <section className="mt-10 space-y-5" aria-labelledby="look-title">
      <div>
        <p id="look-title" className="text-sm font-medium">
          Avatar-Rahmen & Effekte
        </p>
        <p className="text-xs text-fg-subtle">
          Belohnungen fürs Dabeisein — jeder Tag, an dem du hier bist, zählt. Nicht warten?{" "}
          <Link to="/shop" className="text-accent underline-offset-2 hover:underline">
            Im Shop gibt es alles früher.
          </Link>
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="flex items-center gap-2 text-sm">
          <Gift className="size-4 text-accent" />
          {team ? (
            "Team: alles freigeschaltet."
          ) : (
            <>
              Aktiv an <strong className="tabular-nums">{days}</strong>{" "}
              {days === 1 ? "Tag" : "Tagen"}
            </>
          )}
        </p>
        {next ? (
          <>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-bg-subtle"
              role="progressbar"
              aria-valuemin={prevDay}
              aria-valuemax={next.day}
              aria-valuenow={days}
              aria-label="Fortschritt bis zur nächsten Belohnung"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-fg-muted">
              Tag {next.day} (noch {next.day - days} {next.day - days === 1 ? "Tag" : "Tage"}):{" "}
              {next.items.map(itemLabel).join(", ")}
            </p>
          </>
        ) : team ? null : (
          <p className="mt-2 text-xs text-fg-muted">Alle Belohnungen gesammelt. 🎉</p>
        )}
      </div>

      <div className="sticky top-2 z-10 overflow-hidden rounded-2xl border border-border shadow-lg">
        <LookPreview
          look={{ background: profile.backgroundId, ...look }}
          avatarUrl={profile.avatarUrl}
          name={profile.displayName}
          size="md"
        />
        {busy ? (
          <span className="absolute top-2 right-2 rounded-full bg-bg/75 px-2 py-0.5 text-[11px] text-fg-muted">
            Speichert …
          </span>
        ) : null}
      </div>

      <div
        className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-bg-elevated/60 p-1"
        role="tablist"
        aria-label="Was ändern?"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`look-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="look-panel"
            onClick={() => {
              setTab(t.id);
              setQuery("");
            }}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center rounded-xl px-1 text-sm transition-colors",
              tab === t.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle",
            )}
          >
            {t.label}
            <span
              className={cn(
                "text-[10px] tabular-nums",
                tab === t.id ? "text-accent-fg/75" : "text-fg-subtle",
              )}
            >
              {openCount(t.id)}/{options[t.id].length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${active.label} suchen`}
            aria-label={`${active.label} suchen`}
            className="h-11 w-full rounded-xl border border-border bg-bg-elevated/70 pr-3 pl-9 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine((v) => !v)}
          className={cn(
            "h-11 rounded-xl border px-3 text-sm",
            onlyMine ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted",
          )}
        >
          Nur freie
        </button>
      </div>

      <div id="look-panel" role="tabpanel" aria-labelledby={`look-tab-${tab}`}>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {q.length === 0 ? (
            <li>
              <Tile
                on={value === null}
                disabled={busy}
                onClick={() => pick(null)}
                label={active.none}
              >
                <Swatch tab={tab} id={null} profile={profile} />
              </Tile>
            </li>
          ) : null}
          {list.map((o) => {
            const how = o.open ? null : howToGet(tab, o.id, days);
            return (
              <li key={o.id}>
                {o.open ? (
                  <Tile
                    on={value === o.id}
                    disabled={busy}
                    onClick={() => pick(o.id)}
                    label={o.label}
                  >
                    <Swatch tab={tab} id={o.id} profile={profile} />
                  </Tile>
                ) : (
                  <Link
                    to="/shop"
                    search={{ item: ownedKey(tab, o.id) }}
                    aria-label={`${o.label}: ${lockText(how!)}`}
                    className="relative flex h-full min-h-28 w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-2 pt-4 pb-2 text-center text-xs text-fg-muted hover:border-border-strong"
                  >
                    <span className="opacity-70">
                      <Swatch tab={tab} id={o.id} profile={profile} />
                    </span>
                    <span className="line-clamp-2">{o.label}</span>
                    <span className="mt-auto flex items-center gap-1 text-[10px] text-fg-subtle">
                      {how!.day ? <Lock className="size-3" /> : <ShoppingBag className="size-3" />}
                      {lockText(how!)}
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        {list.length === 0 ? <p className="mt-3 text-sm text-fg-muted">Nichts gefunden.</p> : null}
        <Link
          to="/shop"
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"
        >
          <ShoppingBag className="size-4" /> {active.more} im Shop
        </Link>
      </div>
    </section>
  );
}

/** "Tag 30 · 🐾 700", "Tag 14", or "🐾 450" for shop-only items. */
function lockText(how: { day: number | null; daysLeft: number | null; price: number | null }) {
  const parts: string[] = [];
  if (how.day)
    parts.push(how.daysLeft ? `Tag ${how.day} (noch ${how.daysLeft})` : `Tag ${how.day}`);
  if (how.price !== null) parts.push(`🐾 ${how.price}`);
  return parts.join(" · ") || "Shop";
}

function Tile({
  on,
  disabled,
  onClick,
  label,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex h-full min-h-28 w-full flex-col items-center gap-2 rounded-xl border px-2 pt-4 pb-2 text-center text-xs transition-colors disabled:cursor-wait",
        on ? "border-accent bg-accent/10" : "border-border hover:bg-bg-subtle",
      )}
    >
      {on ? (
        <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
          <Check className="size-3" />
        </span>
      ) : null}
      {children}
      <span className="line-clamp-2">{label}</span>
    </button>
  );
}

/** Small preview of one option; memoized since the grid can hold many SVGs. */
const Swatch = memo(function Swatch({
  tab,
  id,
  profile,
}: {
  tab: Tab;
  id: string | null;
  profile: Profile;
}) {
  if (tab === "decoration") {
    return (
      <DecoratedAvatar
        src={profile.avatarUrl}
        name={profile.displayName}
        decoration={id as AvatarDecoration | null}
        className="size-11"
        letterClassName="text-sm"
      />
    );
  }
  if (tab === "effect") {
    return (
      <span className="relative grid h-11 w-full place-items-center overflow-hidden rounded-lg bg-bg-subtle">
        {id ? <ProfileEffectLayer effect={id as ProfileEffect} className="inset-0" /> : null}
        <span className="relative text-base" aria-hidden="true">
          {id ? "✨" : "—"}
        </span>
      </span>
    );
  }
  const short = profile.displayName.slice(0, 10);
  if (tab === "name") {
    return (
      <span className="grid h-11 max-w-full place-items-center overflow-hidden font-display text-base">
        <StyledName text={short || "Name"} nameStyle={id as NameStyle | null} />
      </span>
    );
  }
  return (
    <span className="grid h-11 max-w-full place-items-center overflow-hidden text-xs font-medium">
      <NamePlate plate={id as NamePlateId | null}>{short || "Name"}</NamePlate>
    </span>
  );
});

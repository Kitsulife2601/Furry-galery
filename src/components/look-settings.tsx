/**
 * Settings: avatar frame, profile effect and animated name — rewards that
 * unlock the more days someone is active on the site. Saved right away.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, Lock } from "lucide-react";
import { toast } from "sonner";
import { updateLook } from "@/lib/vela/server";
import {
  AVATAR_DECORATIONS,
  PROFILE_EFFECTS,
  type AvatarDecoration,
  type ProfileEffect,
} from "@/lib/vela/decorations";
import {
  NAME_STYLES,
  REWARD_TIERS,
  isUnlocked,
  nextTier,
  unlockDay,
  type NameStyle,
  type RewardItem,
  type RewardKind,
} from "@/lib/vela/rewards";
import type { Profile } from "@/lib/vela/types";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { cn } from "@/lib/utils";

type Look = {
  decoration: AvatarDecoration | null;
  effect: ProfileEffect | null;
  nameStyle: NameStyle | null;
};

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

export function LookSettings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [look, setLook] = useState<Look>({
    decoration: profile.decoration,
    effect: profile.effect,
    nameStyle: profile.nameStyle,
  });
  const [busy, setBusy] = useState(false);
  const days = profile.activeDays ?? 0;
  const team = profile.isAdmin;
  const next = team ? null : nextTier(days);
  const prevDay = [...REWARD_TIERS].reverse().find((t) => t.day <= days)?.day ?? 0;
  const progress = next ? Math.min(1, (days - prevDay) / (next.day - prevDay)) : 1;
  const open = (kind: RewardKind, id: string, current: string | null) =>
    id === current || isUnlocked(kind, id, days, team);

  async function save(next: Look) {
    const before = look;
    setLook(next);
    setBusy(true);
    try {
      await updateLook({ data: next });
      await Promise.all(
        ["me", "profile", "feed"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (err) {
      setLook(before);
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const tile = (on: boolean) =>
    cn(
      "relative flex h-full w-full flex-col items-center gap-3 rounded-xl border px-2 pt-4 pb-2 text-xs transition-colors",
      on ? "border-accent bg-accent/10" : "border-border hover:bg-bg-subtle",
    );

  return (
    <section className="mt-10 space-y-5" aria-labelledby="look-title">
      <div>
        <p id="look-title" className="text-sm font-medium">
          Avatar-Rahmen & Effekte
        </p>
        <p className="text-xs text-fg-subtle">
          Belohnungen fürs Dabeisein — jeder Tag, an dem du hier bist, zählt.
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

      <div className="relative grid h-40 place-items-center overflow-hidden rounded-xl bg-bg-subtle">
        {look.effect ? <ProfileEffectLayer effect={look.effect} className="inset-0" /> : null}
        <div className="flex flex-col items-center gap-3">
          <DecoratedAvatar
            src={profile.avatarUrl}
            name={profile.displayName}
            decoration={look.decoration}
            className="size-20"
            imgClassName="border-2 border-bg"
          />
          <StyledName
            text={profile.displayName}
            nameStyle={look.nameStyle}
            className="font-display text-xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-fg-muted">Rahmen</p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <li>
            <button
              type="button"
              aria-pressed={look.decoration === null}
              disabled={busy}
              onClick={() => void save({ ...look, decoration: null })}
              className={tile(look.decoration === null)}
            >
              <DecoratedAvatar
                src={profile.avatarUrl}
                name={profile.displayName}
                decoration={null}
                className="size-11"
                letterClassName="text-sm"
              />
              Kein Rahmen
            </button>
          </li>
          {AVATAR_DECORATIONS.map((d) => {
            const unlocked = open("decoration", d.id, profile.decoration);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={look.decoration === d.id}
                  disabled={busy || !unlocked}
                  onClick={() => void save({ ...look, decoration: d.id })}
                  className={cn(tile(look.decoration === d.id), !unlocked && "opacity-60")}
                >
                  <span className={cn(!unlocked && "grayscale")}>
                    <DecoratedAvatar
                      src={profile.avatarUrl}
                      name={profile.displayName}
                      decoration={d.id}
                      className="size-11"
                      letterClassName="text-sm"
                    />
                  </span>
                  {d.label}
                  {unlocked ? null : <LockBadge day={unlockDay("decoration", d.id)} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-fg-muted">Name</p>
        <ul className="flex flex-wrap gap-2">
          {[{ id: null, label: "Normal" } as const, ...NAME_STYLES].map((n) => {
            const unlocked = n.id === null || open("name", n.id, profile.nameStyle);
            return (
              <li key={n.id ?? "none"}>
                <button
                  type="button"
                  aria-pressed={look.nameStyle === n.id}
                  disabled={busy || !unlocked}
                  onClick={() => void save({ ...look, nameStyle: n.id })}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full border px-4 text-sm",
                    look.nameStyle === n.id ? "border-accent bg-accent/10" : "border-border",
                    !unlocked && "opacity-60",
                  )}
                >
                  {unlocked ? (
                    <StyledName text={n.label} nameStyle={n.id} />
                  ) : (
                    <>
                      <Lock className="size-3.5" /> {n.label} · Tag {unlockDay("name", n.id!)}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-fg-muted">Profil-Effekt</p>
        <ul className="flex flex-wrap gap-2">
          {[{ id: null, label: "Keiner" } as const, ...PROFILE_EFFECTS].map((e) => {
            const unlocked = e.id === null || open("effect", e.id, profile.effect);
            return (
              <li key={e.id ?? "none"}>
                <button
                  type="button"
                  aria-pressed={look.effect === e.id}
                  disabled={busy || !unlocked}
                  onClick={() => void save({ ...look, effect: e.id })}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                    look.effect === e.id
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border",
                    !unlocked && "opacity-60",
                  )}
                >
                  {unlocked ? null : <Lock className="size-3.5" />}
                  {e.label}
                  {unlocked ? null : ` · Tag ${unlockDay("effect", e.id!)}`}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function LockBadge({ day }: { day: number }) {
  return (
    <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-bg/80 px-1.5 py-0.5 text-[10px] text-fg-muted">
      <Lock className="size-3" /> Tag {day}
    </span>
  );
}

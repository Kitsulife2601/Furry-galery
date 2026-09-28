/** Settings: pick an avatar decoration and a profile effect (saved right away). */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateLook } from "@/lib/vela/server";
import {
  AVATAR_DECORATIONS,
  PROFILE_EFFECTS,
  type AvatarDecoration,
  type ProfileEffect,
} from "@/lib/vela/decorations";
import type { Profile } from "@/lib/vela/types";
import { DecoratedAvatar, ProfileEffectLayer } from "@/components/avatar-decoration";
import { cn } from "@/lib/utils";

export function LookSettings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [decoration, setDecoration] = useState<AvatarDecoration | null>(profile.decoration);
  const [effect, setEffect] = useState<ProfileEffect | null>(profile.effect);
  const [busy, setBusy] = useState(false);

  async function save(next: { decoration: AvatarDecoration | null; effect: ProfileEffect | null }) {
    const before = { decoration, effect };
    setDecoration(next.decoration);
    setEffect(next.effect);
    setBusy(true);
    try {
      await updateLook({ data: next });
      await Promise.all(
        ["me", "profile", "feed"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (err) {
      setDecoration(before.decoration);
      setEffect(before.effect);
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const tile = (on: boolean) =>
    cn(
      "flex flex-col items-center gap-3 rounded-xl border px-2 pt-4 pb-2 text-xs transition-colors disabled:opacity-60",
      on ? "border-accent bg-accent/10" : "border-border hover:bg-bg-subtle",
    );

  return (
    <section className="mt-10 space-y-4" aria-labelledby="look-title">
      <div>
        <p id="look-title" className="text-sm font-medium">
          Avatar-Rahmen & Effekte
        </p>
        <p className="text-xs text-fg-subtle">
          Wie bei Discord — sichtbar auf deinem Profil und im Feed.
        </p>
      </div>

      <div className="relative grid h-36 place-items-center overflow-hidden rounded-xl bg-bg-subtle">
        {effect ? <ProfileEffectLayer effect={effect} className="inset-0" /> : null}
        <DecoratedAvatar
          src={profile.avatarUrl}
          name={profile.displayName}
          decoration={decoration}
          className="size-20"
          imgClassName="border-2 border-bg"
        />
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <li>
          <button
            type="button"
            aria-pressed={decoration === null}
            disabled={busy}
            onClick={() => void save({ decoration: null, effect })}
            className={cn(tile(decoration === null), "h-full w-full")}
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
        {AVATAR_DECORATIONS.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              aria-pressed={decoration === d.id}
              disabled={busy}
              onClick={() => void save({ decoration: d.id, effect })}
              className={cn(tile(decoration === d.id), "h-full w-full")}
            >
              <DecoratedAvatar
                src={profile.avatarUrl}
                name={profile.displayName}
                decoration={d.id}
                className="size-11"
                letterClassName="text-sm"
              />
              {d.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <p className="text-xs font-medium text-fg-muted">Profil-Effekt</p>
        <ul className="flex flex-wrap gap-2">
          {[{ id: null, label: "Keiner" } as const, ...PROFILE_EFFECTS].map((e) => (
            <li key={e.id ?? "none"}>
              <button
                type="button"
                aria-pressed={effect === e.id}
                disabled={busy}
                onClick={() => void save({ decoration, effect: e.id })}
                className={cn(
                  "h-9 rounded-full border px-3 text-sm",
                  effect === e.id ? "border-accent bg-accent text-accent-fg" : "border-border",
                )}
              >
                {e.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

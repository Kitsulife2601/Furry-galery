import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { getDiscordSetup, unlinkDiscord } from "@/lib/vela/server";
import type { Profile } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";

/** Outcomes the Discord callback reports back via `?discord=`. */
const RESULTS: Record<string, { ok: boolean; text: string }> = {
  verified: { ok: true, text: "FSK 18 ist freigeschaltet." },
  missing_role: {
    ok: false,
    text: "Du bist im Discord, hast aber die Verifiziert-Rolle noch nicht. Lass dich dort vom Bot verifizieren und versuch es dann nochmal.",
  },
  not_member: { ok: false, text: "Du bist noch nicht auf unserem Discord-Server." },
  taken: { ok: false, text: "Dieses Discord-Konto ist schon mit einem anderen Profil verknüpft." },
  no_profile: { ok: false, text: "Leg zuerst dein Profil an." },
  signed_out: { ok: false, text: "Bitte zuerst anmelden." },
  unconfigured: { ok: false, text: "Die Discord-Verifizierung ist noch nicht eingerichtet." },
  error: { ok: false, text: "Die Verbindung mit Discord hat nicht geklappt. Bitte nochmal." },
};

export function Fsk18Settings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const setup = useQuery({ queryKey: ["discord-setup"], queryFn: () => getDiscordSetup() });
  const [busy, setBusy] = useState(false);
  const status = profile.fsk18;

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("discord");
    if (!result) return;
    const msg = RESULTS[result] ?? RESULTS.error;
    if (msg.ok) toast.success(msg.text);
    else toast.error(msg.text, { duration: 8000 });
    url.searchParams.delete("discord");
    window.history.replaceState(null, "", url.pathname + url.search + "#fsk18");
    // Back from Discord: show the result where it happened.
    requestAnimationFrame(() =>
      document.getElementById("fsk18")?.scrollIntoView({ block: "start" }),
    );
  }, []);

  async function unlink() {
    setBusy(true);
    try {
      await unlinkDiscord();
      await queryClient.invalidateQueries();
      toast.success("Discord getrennt.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trennen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  // Under 18: no FSK 18 at all, so no Discord check either.
  if (profile.age < 18) {
    return (
      <section id="fsk18" className="scroll-mt-20 rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2">
          <Lock className="size-5 text-fg-muted" />
          <h2 className="font-display text-xl">FSK 18</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          FSK-18-Inhalte gibt es erst ab 18. Bis dahin werden sie dir nirgends angezeigt.
        </p>
      </section>
    );
  }

  return (
    <section id="fsk18" className="scroll-mt-20 rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2">
        {status?.verified ? (
          <BadgeCheck className="size-5 text-accent" />
        ) : (
          <Lock className="size-5 text-fg-muted" />
        )}
        <h2 className="font-display text-xl">FSK 18</h2>
      </div>

      {status?.verified ? (
        <p className="mt-2 text-sm text-fg-muted">
          {status.manual
            ? "Vom Team freigeschaltet."
            : `Freigeschaltet über Discord${status.discordUsername ? ` (${status.discordUsername})` : ""}.`}{" "}
          Du siehst alle Bilder.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            FSK-18-Bilder sind unkenntlich, bis du dich verifiziert hast. So geht’s:
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>
              Tritt unserem Discord bei
              {setup.data?.inviteUrl ? (
                <>
                  {" "}
                  —{" "}
                  <a
                    href={setup.data.inviteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-fg underline underline-offset-4"
                  >
                    zum Server
                  </a>
                </>
              ) : null}
              .
            </li>
            <li>Lass dich dort vom Bot als 18+ verifizieren.</li>
            <li>Verbinde hier dein Discord-Konto.</li>
          </ol>
          {status?.discordUsername ? (
            <p className="mt-3 text-xs text-fg-subtle">
              Verbunden als {status.discordUsername}, aber noch ohne Verifiziert-Rolle.
            </p>
          ) : null}
        </>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {setup.data && !setup.data.configured ? (
          <p className="text-xs text-fg-subtle">
            Die Discord-Verifizierung ist noch nicht eingerichtet.
          </p>
        ) : status?.verified ? null : (
          <Button asChild className="w-full">
            {/* Full page navigation: the OAuth flow runs through server routes. */}
            <a href="/api/discord/start">
              {status?.discordUsername ? "Erneut prüfen" : "Mit Discord verifizieren"}
            </a>
          </Button>
        )}
        {status?.discordUsername ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void unlink()}
          >
            {busy ? "Trennt…" : "Discord trennen"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

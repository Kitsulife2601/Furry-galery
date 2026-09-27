import { useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import {
  adminDeletePost,
  dismissReports,
  listBanned,
  listReports,
  setBanned,
} from "@/lib/vela/server";
import { REPORT_REASONS } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/admin")({ component: Admin });

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

function Admin() {
  const { profile } = useAppSession();
  if (!profile?.isAdmin) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
        <p className="text-sm text-fg-muted">Diese Seite ist nur für Admins.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Admin</p>
      <h1 className="mt-1 font-display text-3xl">Moderation</h1>
      <Reports />
      <Bans />
    </div>
  );
}

function Reports() {
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => listReports() });
  const [busy, setBusy] = useState<number | null>(null);

  async function act(postId: number, action: () => Promise<unknown>, done: string) {
    setBusy(postId);
    try {
      await action();
      toast.success(done);
      await Promise.all(
        ["admin-reports", "admin-banned", "feed", "explore", "profile-posts"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl">Meldungen</h2>
      {reports.isPending ? (
        <Skeleton className="mt-4 h-32 w-full" />
      ) : (reports.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Keine offenen Meldungen. 🎉</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {(reports.data ?? []).map((r) => (
            <li
              key={r.postId}
              className="flex gap-4 rounded-2xl border border-border bg-bg-elevated p-3"
            >
              <img
                src={r.imageUrl}
                alt=""
                className="size-28 shrink-0 rounded-lg bg-bg object-cover"
              />
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <Link
                    to="/u/$handle"
                    params={{ handle: r.author.handle }}
                    className="font-medium"
                  >
                    @{r.author.handle}
                  </Link>{" "}
                  <span className="text-fg-muted">
                    · {r.count}× gemeldet{r.author.banned ? " · gesperrt" : ""}
                  </span>
                </p>
                <p className="mt-1 text-fg-muted">{r.reasons.map(reasonLabel).join(", ")}</p>
                {r.notes.length ? (
                  <p className="mt-1 text-xs text-fg-subtle">„{r.notes.join("“, „")}“</p>
                ) : null}
                {r.caption ? <p className="mt-1 truncate text-xs">{r.caption}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy === r.postId}
                    onClick={() =>
                      window.confirm("Bild endgültig löschen?") &&
                      void act(
                        r.postId,
                        () => adminDeletePost({ data: { postId: r.postId } }),
                        "Bild gelöscht.",
                      )
                    }
                  >
                    Bild löschen
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === r.postId}
                    onClick={() =>
                      void act(
                        r.postId,
                        () => dismissReports({ data: { postId: r.postId } }),
                        "Meldung verworfen.",
                      )
                    }
                  >
                    Verwerfen
                  </Button>
                  {r.author.banned ? null : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === r.postId}
                      onClick={() =>
                        window.confirm(`@${r.author.handle} sperren?`) &&
                        void act(
                          r.postId,
                          () => setBanned({ data: { handle: r.author.handle, banned: true } }),
                          `@${r.author.handle} gesperrt.`,
                        )
                      }
                    >
                      Profil sperren
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Bans() {
  const queryClient = useQueryClient();
  const banned = useQuery({ queryKey: ["admin-banned"], queryFn: () => listBanned() });
  const [handle, setHandle] = useState("");

  async function update(target: string, ban: boolean) {
    try {
      await setBanned({ data: { handle: target.replace(/^@/, ""), banned: ban } });
      toast.success(ban ? `@${target} gesperrt.` : `@${target} entsperrt.`);
      setHandle("");
      await Promise.all(
        ["admin-banned", "admin-reports", "feed", "explore", "creators"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (handle.trim() && window.confirm(`@${handle.trim()} sperren?`)) {
      void update(handle.trim(), true);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Gesperrte Profile</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Gesperrte Profile und ihre Bilder sind unsichtbar; sie können nichts mehr posten, liken oder
        kommentieren.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          placeholder="@handle"
          aria-label="Profil zum Sperren"
        />
        <Button type="submit" variant="danger" disabled={!handle.trim()}>
          Sperren
        </Button>
      </form>
      <ul className="mt-4 divide-y divide-border">
        {(banned.data ?? []).map((b) => (
          <li key={b.handle} className="flex items-center justify-between py-3 text-sm">
            <span>
              {b.displayName} <span className="text-fg-muted">@{b.handle}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => void update(b.handle, false)}>
              Entsperren
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

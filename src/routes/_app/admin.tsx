import { useEffect, useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { X } from "lucide-react";
import {
  adminDeletePost,
  dismissReports,
  listBanned,
  listFeedback,
  listFsk18Approvals,
  listReports,
  publishUpdate,
  searchProfiles,
  setBanned,
  setFeedbackDone,
  setFsk18Approval,
} from "@/lib/vela/server";
import { FEEDBACK_KINDS, REPORT_REASONS } from "@/lib/vela/types";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      <Fsk18Approvals />
      <FeedbackList />
      <PublishUpdate />
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
  const [reason, setReason] = useState("");

  async function update(target: string, ban: boolean, why?: string) {
    try {
      await setBanned({
        data: { handle: target.replace(/^@/, ""), banned: ban, reason: why || undefined },
      });
      setReason("");
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
      void update(handle.trim(), true, reason.trim());
    }
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Gesperrte Profile</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Gesperrte Profile und ihre Bilder sind unsichtbar; sie können nichts mehr posten, liken oder
        kommentieren.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-2">
        <div className="flex gap-2">
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="@handle"
            aria-label="Profil zum Sperren"
          />
          <Button type="submit" variant="danger" disabled={!handle.trim()}>
            Sperren
          </Button>
        </div>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Begründung (wird auf dem Profil angezeigt)"
          aria-label="Begründung"
        />
      </form>
      <ul className="mt-4 divide-y divide-border">
        {(banned.data ?? []).map((b) => (
          <li key={b.handle} className="flex items-center justify-between py-3 text-sm">
            <span className="min-w-0">
              {b.displayName} <span className="text-fg-muted">@{b.handle}</span>
              {b.reason ? (
                <span className="block truncate text-xs text-fg-subtle">{b.reason}</span>
              ) : null}
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

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

function Fsk18Approvals() {
  const queryClient = useQueryClient();
  const approvals = useQuery({ queryKey: ["admin-fsk18"], queryFn: () => listFsk18Approvals() });
  const [open, setOpen] = useState(false);

  async function change(handle: string, unlock: boolean) {
    try {
      const { displayName } = await setFsk18Approval({ data: { handle, unlock } });
      toast.success(
        unlock
          ? `FSK 18 für ${displayName} freigegeben.`
          : `Freigabe für ${displayName} zurückgenommen.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-fsk18"] });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
      return false;
    }
  }

  const list = approvals.data ?? [];
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">FSK 18 Freigaben</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          Profil freigeben
        </Button>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Freigegebene Profile sehen FSK-18-Bilder scharf — per Discord-Rolle oder von Hand durchs
        Team.
      </p>
      {approvals.isPending ? (
        <Skeleton className="mt-4 h-20 w-full" />
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Noch niemand freigegeben.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {list.map((a) => (
            <li key={a.handle} className="flex items-center gap-3 py-3 text-sm">
              <span className="size-9 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-xs">
                    {a.displayName.charAt(0)}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {a.displayName} <span className="text-fg-muted">@{a.handle}</span>
                </p>
                <p className="text-xs text-fg-subtle">
                  {a.source === "team" ? `Vom Team${a.by ? ` (${a.by})` : ""}` : "Über Discord"} ·{" "}
                  seit {dateFormat.format(new Date(a.since))}
                </p>
              </div>
              {a.source === "team" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    window.confirm(`Freigabe für @${a.handle} zurücknehmen?`) &&
                    void change(a.handle, false)
                  }
                >
                  Zurücknehmen
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <ApproveDialog
          onClose={() => setOpen(false)}
          onApprove={async (handle) => {
            if (await change(handle, true)) setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

/** Popup: find a profile and unlock FSK 18 for it. */
function ApproveDialog({
  onClose,
  onApprove,
}: {
  onClose: () => void;
  onApprove: (handle: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(input.trim()), 250);
    return () => window.clearTimeout(id);
  }, [input]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useQuery({
    queryKey: ["search", term],
    queryFn: () => searchProfiles({ data: { q: term } }),
    enabled: term.length > 0,
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="approve-title" className="font-display text-xl">
            FSK 18 freigeben
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-lg text-fg-muted"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Nur freigeben, wenn das Team die Volljährigkeit geprüft hat.
        </p>
        <Input
          autoFocus
          className="mt-4"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPicked(null);
          }}
          placeholder="Name oder @handle suchen"
          aria-label="Profil suchen"
        />
        <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto">
          {term && results.data?.length === 0 ? (
            <li className="px-1 py-2 text-sm text-fg-muted">Niemand gefunden.</li>
          ) : null}
          {(results.data ?? []).map((p) => (
            <li key={p.handle}>
              <button
                type="button"
                onClick={() => setPicked(p.handle)}
                aria-pressed={picked === p.handle}
                className={
                  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-2 text-left text-sm " +
                  (picked === p.handle ? "border-accent bg-bg-subtle" : "border-transparent")
                }
              >
                <span className="size-8 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-xs">
                      {p.displayName.charAt(0)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 truncate">
                  {p.displayName}{" "}
                  <span className="text-fg-muted">
                    @{p.handle} · {p.age}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          className="mt-4 w-full"
          disabled={!picked || busy}
          onClick={async () => {
            if (!picked) return;
            setBusy(true);
            await onApprove(picked);
            setBusy(false);
          }}
        >
          {picked ? `@${picked} freigeben` : "Profil auswählen"}
        </Button>
      </div>
    </div>
  );
}

function FeedbackList() {
  const queryClient = useQueryClient();
  const feedback = useQuery({ queryKey: ["admin-feedback"], queryFn: () => listFeedback() });
  const kindLabel = (id: string) => FEEDBACK_KINDS.find((k) => k.id === id)?.label ?? id;
  const list = feedback.data ?? [];
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Feedback &amp; Wünsche</h2>
      {feedback.isPending ? (
        <Skeleton className="mt-4 h-20 w-full" />
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Noch kein Feedback.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((f) => (
            <li
              key={f.id}
              className={
                "rounded-2xl border border-border bg-bg-elevated p-4 text-sm " +
                (f.done ? "opacity-50" : "")
              }
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-fg-muted">
                  {kindLabel(f.kind)} · @{f.author.handle} ·{" "}
                  {dateFormat.format(new Date(f.createdAt))}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await setFeedbackDone({ data: { id: f.id, done: !f.done } });
                    await queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
                  }}
                >
                  {f.done ? "Wieder öffnen" : "Erledigt"}
                </Button>
              </div>
              <p className="mt-2 whitespace-pre-line">{f.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PublishUpdate() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [toDiscord, setToDiscord] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm("Update an alle Mitglieder schicken?")) return;
    setBusy(true);
    try {
      const { discord } = await publishUpdate({ data: { title, body, toDiscord } });
      toast.success(
        discord ? "Update veröffentlicht und in Discord gepostet." : "Update veröffentlicht.",
      );
      setTitle("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["updates"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Update veröffentlichen</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Erscheint unter „Updates“, als System-Mitteilung bei allen und in Discord #updates.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="update-title">Titel</Label>
          <Input
            id="update-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="Neu: Kommentare und Kategorien"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="update-body">Text</Label>
          <Textarea
            id="update-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={3000}
            rows={5}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toDiscord}
            onChange={(e) => setToDiscord(e.target.checked)}
            className="size-4 accent-(--color-accent)"
          />
          Auch in Discord posten
        </label>
        <Button type="submit" disabled={busy || title.trim().length < 3 || body.trim().length < 3}>
          {busy ? "Wird veröffentlicht…" : "Veröffentlichen"}
        </Button>
      </form>
    </section>
  );
}

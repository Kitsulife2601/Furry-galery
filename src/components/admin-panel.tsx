/** The moderation tools — shown in the paw popup and on /admin. */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  addTeamMember,
  adminDeletePost,
  listTeamMembers,
  removeTeamMember,
  type TeamMember,
  dismissReports,
  listBanned,
  listFeedback,
  listFsk18Approvals,
  listProfileReports,
  listReports,
  resolveProfileReports,
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
import { SettingsPanel } from "@/components/settings-panel";
import { cn } from "@/lib/utils";

export function AdminSections() {
  return (
    <>
      <Reports />
      <ProfileReports />
      <Fsk18Approvals />
      <FeedbackList />
      <PublishUpdate />
      <Bans />
      <TeamMembers />
    </>
  );
}

type PawTab = "settings" | "moderation";

/**
 * Popup opened by the paw icon (top right): settings for everyone, plus
 * moderation for admins. Closes on Escape, backdrop click or navigation.
 */
export function PawDialog({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<PawTab>("settings");
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [openedAt] = useState(pathname);
  useEffect(() => {
    if (pathname !== openedAt) onClose();
  }, [pathname, openedAt, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let an inner popup (e.g. "FSK 18 freigeben") close first.
      if (e.key === "Escape" && document.querySelectorAll('[role="dialog"]').length <= 1) onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-bg/80 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paw-title"
    >
      <div
        className="relative flex h-dvh w-full max-w-2xl flex-col overflow-hidden border-border bg-bg-elevated sm:h-[88dvh] sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          {isAdmin ? (
            <div role="tablist" className="flex gap-1" id="paw-title" aria-label="Menü">
              {(
                [
                  ["settings", "Einstellungen"],
                  ["moderation", "Moderation"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "h-10 rounded-lg px-3 font-display text-lg",
                    tab === id ? "bg-bg-subtle text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <h2 id="paw-title" className="font-display text-2xl">
              Einstellungen
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-lg text-fg-muted hover:text-fg"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-10 [&>section:first-child]:mt-4">
          {isAdmin && tab === "moderation" ? <AdminSections /> : <SettingsPanel embedded />}
        </div>
      </div>
    </div>
  );
}

const TEAM_KIND_LABEL: Record<TeamMember["kind"], string> = {
  discord: "Discord-ID",
  user: "Nutzer-ID",
  handle: "Name",
};

/** Team list: add members by Discord user id, website user id or @name. */
function TeamMembers() {
  const queryClient = useQueryClient();
  const team = useQuery({ queryKey: ["admin-team"], queryFn: () => listTeamMembers() });
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!ref.trim()) return;
    setBusy(true);
    try {
      const added = await addTeamMember({ data: { ref } });
      toast.success(`Ins Team aufgenommen (${TEAM_KIND_LABEL[added.kind]} ${added.value}).`);
      setRef("");
      await queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: TeamMember) {
    const who = m.match ? `@${m.match.handle}` : m.value;
    if (!window.confirm(`${who} aus dem Team entfernen?`)) return;
    try {
      await removeTeamMember({ data: { kind: m.kind, value: m.value } });
      toast.success(`${who} ist nicht mehr im Team.`);
      await queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    }
  }

  const members = team.data?.members ?? [];
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Team</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Per Discord-Nutzer-ID, Nutzer-ID der Webseite oder @Name hinzufügen. Beim Anmelden wird
        automatisch abgeglichen, zu welchem Profil die ID gehört. Discord-Rollen (Owner, Fluff
        Admin) zählen weiterhin.
      </p>
      <form onSubmit={(e) => void add(e)} className="mt-4 flex gap-2">
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="z. B. 123456789012345678 oder @name"
          aria-label="Discord-ID, Nutzer-ID oder @Name"
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !ref.trim()}>
          {busy ? "…" : "Hinzufügen"}
        </Button>
      </form>
      {team.data?.owners.length ? (
        <p className="mt-3 text-xs text-fg-subtle">
          Immer im Team: {team.data.owners.map((h) => `@${h}`).join(", ")}
        </p>
      ) : null}
      {team.isPending ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : members.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Noch niemand hinzugefügt.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {members.map((m) => (
            <li key={`${m.kind}:${m.value}`} className="flex items-center gap-3 py-3 text-sm">
              <span className="size-9 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
                {m.match?.avatarUrl ? (
                  <img src={m.match.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-xs">
                    {(m.match?.displayName ?? "?").charAt(0)}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {m.match ? (
                    <Link
                      to="/u/$handle"
                      params={{ handle: m.match.handle }}
                      className="hover:underline"
                    >
                      {m.match.displayName} <span className="text-fg-muted">@{m.match.handle}</span>
                    </Link>
                  ) : (
                    <span className="text-fg-muted">Noch kein Profil gefunden</span>
                  )}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {TEAM_KIND_LABEL[m.kind]} {m.value}
                  {m.addedBy ? ` · von @${m.addedBy}` : ""}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void remove(m)}>
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileReports() {
  const queryClient = useQueryClient();
  const reports = useQuery({
    queryKey: ["admin-profile-reports"],
    queryFn: () => listProfileReports(),
  });

  async function resolve(handle: string) {
    try {
      await resolveProfileReports({ data: { handle } });
      toast.success("Erledigt.");
      await queryClient.invalidateQueries({ queryKey: ["admin-profile-reports"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    }
  }

  const list = reports.data ?? [];
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Gemeldete Profile</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Sperren oder löschen: Profil öffnen und oben rechts auf ⋯.
      </p>
      {reports.isPending ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Keine offenen Meldungen.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {list.map((r) => (
            <li key={r.handle} className="flex items-center gap-3 py-3 text-sm">
              <span className="size-9 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-xs">
                    {r.displayName.charAt(0)}
                  </span>
                )}
              </span>
              <Link to="/u/$handle" params={{ handle: r.handle }} className="min-w-0 flex-1">
                <span className="block truncate">
                  {r.displayName} <span className="text-fg-muted">@{r.handle}</span>
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {r.count}× · {r.reasons.join(", ")}
                  {r.notes.length ? ` · „${r.notes[0]}“` : ""}
                </span>
              </Link>
              <Button size="sm" variant="secondary" onClick={() => void resolve(r.handle)}>
                Erledigt
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

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

  async function unban(target: string) {
    try {
      await setBanned({ data: { handle: target, banned: false } });
      toast.success(`@${target} entsperrt.`);
      await Promise.all(
        ["admin-banned", "profile", "feed", "explore", "creators"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Das hat nicht geklappt.");
    }
  }

  const list = banned.data ?? [];
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl">Gesperrte Profile</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Sperren und Löschen geht direkt auf dem Profil über ⋯. Gesperrte Profile und ihre Bilder
        sind unsichtbar; sie können nichts mehr posten, liken oder kommentieren.
      </p>
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Niemand gesperrt.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {list.map((b) => (
            <li key={b.handle} className="flex items-center justify-between gap-3 py-3 text-sm">
              <Link to="/u/$handle" params={{ handle: b.handle }} className="min-w-0">
                {b.displayName} <span className="text-fg-muted">@{b.handle}</span>
                <span className="block truncate text-xs text-fg-subtle">
                  {b.until ? `bis ${dateFormat.format(new Date(b.until))}` : "dauerhaft"}
                  {b.reason ? ` · ${b.reason}` : ""}
                </span>
              </Link>
              <Button size="sm" variant="secondary" onClick={() => void unban(b.handle)}>
                Entsperren
              </Button>
            </li>
          ))}
        </ul>
      )}
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

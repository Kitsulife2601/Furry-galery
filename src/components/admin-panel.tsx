/** The moderation tools — shown in the paw popup and on /admin. */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  CheckCheck,
  Flag,
  LayoutDashboard,
  Megaphone,
  MessageSquareHeart,
  Search,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  addTeamMember,
  adminDeletePost,
  listTeamMembers,
  removeTeamMember,
  type TeamMember,
  dismissReports,
  listBanned,
  listFeedback,
  listRatings,
  listFsk18Approvals,
  listProfileReports,
  listReports,
  listUpdates,
  resolveProfileReports,
  publishUpdate,
  searchProfiles,
  setBanned,
  setFeedbackDone,
  setFsk18Approval,
} from "@/lib/vela/server";
import { adminOverview, setFeedbackDoneMany, type AdminOverview } from "@/lib/vela/admin-api";
import { BAN_DURATIONS, type BanDuration } from "@/lib/vela/durations";
import { FEEDBACK_KINDS, REPORT_REASONS } from "@/lib/vela/types";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPanel } from "@/components/settings-panel";
import { UpdateBody } from "@/components/update-body";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared helpers

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

/** "vor 3 Stunden", "gestern", … — falls back to the date after a month. */
function ago(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const sec = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), "day");
  return dateFormat.format(new Date(iso));
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : "Das hat nicht geklappt.";
}

const matches = (q: string, ...fields: (string | null | undefined)[]) => {
  const needle = q.trim().replace(/^@/, "").toLowerCase();
  if (!needle) return true;
  return fields.some((f) => f?.toLowerCase().includes(needle));
};

/** Re-fetch the given admin lists plus the dashboard counts. */
function useRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    (keys: string[]) =>
      Promise.all(
        [...keys, "admin-overview"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    [queryClient],
  );
}

/** Small buttons stay 44px tall on touch screens. */
const touch = "max-sm:h-11 max-sm:px-4";

function Avatar({
  url,
  name,
  size = "md",
}: {
  url: string | null;
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "shrink-0 overflow-hidden rounded-full bg-bg-subtle",
        size === "sm" ? "size-8" : "size-10",
      )}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-xs font-medium text-fg-muted">
          {name.charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}

function SectionHead({
  title,
  hint,
  action,
  count,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-xl">
          {title}
          {count ? (
            <span className="rounded-full bg-bg-subtle px-2 py-0.5 font-sans text-xs text-fg-muted tabular-nums">
              {count}
            </span>
          ) : null}
        </h2>
        {hint ? <p className="mt-1 text-sm text-fg-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors max-sm:h-11",
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border text-fg-muted hover:border-fg-subtle hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal + confirmation (instead of window.confirm)

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  useEffect(() => {
    if (!mounted) return;
    const box = boxRef.current;
    if (!box || box.contains(document.activeElement)) return;
    box.querySelector<HTMLElement>("[data-autofocus], input, textarea, button")?.focus();
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="admin-modal fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={boxRef}
        className={cn(
          "admin-modal-box max-h-[90dvh] w-full overflow-y-auto rounded-2xl border border-border bg-bg-elevated p-5 text-fg shadow-2xl",
          wide ? "max-w-lg" : "max-w-sm",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="pt-2 font-display text-xl leading-snug">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-fg-muted hover:text-fg"
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOptions = {
  title: string;
  text?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
};

/** `const [confirm, dialog] = useConfirm()` — `await confirm({...})` resolves true/false. */
function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(
    null,
  );
  const ask = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve });
      }),
    [],
  );
  const finish = useCallback(
    (ok: boolean) => {
      state?.resolve(ok);
      setState(null);
    },
    [state],
  );
  const cancel = useCallback(() => finish(false), [finish]);
  const dialog = state ? (
    <Modal title={state.title} onClose={cancel}>
      {state.text ? <div className="mt-2 text-sm text-fg-muted">{state.text}</div> : null}
      <div className="mt-5 flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={cancel}>
          Abbrechen
        </Button>
        <Button
          type="button"
          data-autofocus
          variant={state.danger ? "danger" : "primary"}
          className="flex-1"
          onClick={() => finish(true)}
        >
          {state.confirmLabel}
        </Button>
      </div>
    </Modal>
  ) : null;
  return [ask, dialog] as const;
}

/** Ban a profile with a duration from the list and an optional reason. */
function BanDialog({
  handle,
  onClose,
  onBanned,
}: {
  handle: string;
  onClose: () => void;
  onBanned?: () => void;
}) {
  const refresh = useRefresh();
  const [duration, setDuration] = useState<BanDuration>("7d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await setBanned({
        data: { handle, banned: true, duration, reason: reason.trim() || undefined },
      });
      const label = BAN_DURATIONS.find((d) => d.id === duration)?.label ?? "";
      toast.success(
        duration === "perm"
          ? `@${handle} dauerhaft gesperrt.`
          : `@${handle} für ${label} gesperrt.`,
      );
      await refresh([
        "admin-reports",
        "admin-profile-reports",
        "admin-banned",
        "feed",
        "explore",
        "profile",
        "profile-posts",
        "creators",
      ]);
      onBanned?.();
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`@${handle} sperren`} onClose={onClose} wide>
      <form onSubmit={(e) => void submit(e)}>
        <p className="mt-1 text-sm text-fg-muted">
          Gesperrte Profile und ihre Bilder sind unsichtbar; sie können nichts posten, liken oder
          kommentieren.
        </p>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Dauer</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BAN_DURATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={duration === d.id}
                onClick={() => setDuration(d.id)}
                className={cn(
                  "h-11 rounded-lg border px-2 text-sm transition-colors",
                  duration === d.id
                    ? d.id === "perm"
                      ? "border-heart bg-heart/15 text-fg"
                      : "border-accent bg-accent text-accent-fg"
                    : "border-border text-fg-muted hover:text-fg",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 space-y-2">
          <Label htmlFor="ban-reason">Grund (sieht die Person)</Label>
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="z. B. Wiederholt unmarkierte FSK-18-Bilder"
            className="min-h-0"
          />
        </div>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={busy}>
            {busy ? "Sperrt…" : "Sperren"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sections + tabs

type AdminTab = "overview" | "reports" | "fsk18" | "feedback" | "updates" | "bans" | "team";

const TABS: { id: AdminTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
  { id: "reports", label: "Meldungen", icon: Flag },
  { id: "fsk18", label: "FSK 18", icon: ShieldCheck },
  { id: "feedback", label: "Feedback", icon: MessageSquareHeart },
  { id: "updates", label: "Updates", icon: Megaphone },
  { id: "bans", label: "Sperren", icon: Ban },
  { id: "team", label: "Team", icon: Users },
];

const TAB_KEY = "fg-admin-tab";

function readTab(): AdminTab {
  try {
    const saved = window.localStorage.getItem(TAB_KEY);
    if (TABS.some((t) => t.id === saved)) return saved as AdminTab;
  } catch {
    // Storage blocked: start on the overview.
  }
  return "overview";
}

function badgeFor(tab: AdminTab, o: AdminOverview | undefined): number {
  if (!o) return 0;
  if (tab === "reports") return o.openReports + o.openProfileReports;
  if (tab === "feedback") return o.openFeedback;
  return 0;
}

/** The whole moderation panel: dashboard + tabbed sections. */
export function AdminSections({ stickyTabs = false }: { stickyTabs?: boolean }) {
  const [tab, setTabState] = useState<AdminTab>("overview");
  useEffect(() => setTabState(readTab()), []);
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminOverview() });
  const panelId = useId();
  const tabRefs = useRef<Partial<Record<AdminTab, HTMLButtonElement | null>>>({});

  const setTab = useCallback((next: AdminTab) => {
    setTabState(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tab]);

  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next]!.id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className="admin-panel">
      <div
        className={cn(
          "-mx-5 border-b border-border bg-bg-elevated/95 px-5 backdrop-blur",
          stickyTabs && "sticky top-0 z-10",
        )}
      >
        <div
          role="tablist"
          aria-label="Moderation"
          onKeyDown={onTabKey}
          className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const badge = badgeFor(t.id, overview.data);
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${panelId}-${t.id}`}
                aria-selected={selected}
                aria-controls={`${panelId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                  selected
                    ? "bg-bg-subtle font-medium text-fg"
                    : "text-fg-muted hover:bg-bg-subtle/60 hover:text-fg",
                )}
              >
                <t.icon className="size-4" aria-hidden />
                {t.label}
                {badge ? (
                  <span
                    className="min-w-5 rounded-full bg-heart px-1.5 text-center text-[11px] leading-5 font-semibold text-fg tabular-nums"
                    aria-label={`${badge} offen`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${panelId}-panel`}
        aria-labelledby={`${panelId}-${tab}`}
        className="pt-6"
      >
        {tab === "overview" ? (
          <Overview data={overview.data} pending={overview.isPending} onGo={setTab} />
        ) : null}
        {tab === "reports" ? (
          <>
            <Reports />
            <ProfileReports />
          </>
        ) : null}
        {tab === "fsk18" ? <Fsk18Approvals /> : null}
        {tab === "feedback" ? (
          <>
            <FeedbackList />
            <Ratings />
          </>
        ) : null}
        {tab === "updates" ? <PublishUpdate /> : null}
        {tab === "bans" ? <Bans /> : null}
        {tab === "team" ? <TeamMembers /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview

function Trend({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev;
  if (diff === 0) return <span className="text-xs text-fg-subtle">wie letzte Woche</span>;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
      <Icon className="size-3.5" aria-hidden />
      {diff > 0 ? "+" : "−"}
      {Math.abs(diff)} ggü. Vorwoche
    </span>
  );
}

function Overview({
  data,
  pending,
  onGo,
}: {
  data: AdminOverview | undefined;
  pending: boolean;
  onGo: (tab: AdminTab) => void;
}) {
  if (pending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!data) return <Empty>Übersicht konnte nicht geladen werden.</Empty>;
  const tiles: {
    label: string;
    value: number;
    tab: AdminTab;
    icon: LucideIcon;
    urgent: boolean;
  }[] = [
    {
      label: "Offene Meldungen",
      value: data.openReports,
      tab: "reports",
      icon: Flag,
      urgent: data.openReports > 0,
    },
    {
      label: "Gemeldete Profile",
      value: data.openProfileReports,
      tab: "reports",
      icon: UserRound,
      urgent: data.openProfileReports > 0,
    },
    {
      label: "Feedback offen",
      value: data.openFeedback,
      tab: "feedback",
      icon: MessageSquareHeart,
      urgent: false,
    },
    {
      label: "FSK-18-Freigaben",
      value: data.fsk18Approvals,
      tab: "fsk18",
      icon: ShieldCheck,
      urgent: false,
    },
  ];
  const allClear = data.openReports === 0 && data.openProfileReports === 0;
  return (
    <section>
      <p
        className={cn(
          "rounded-2xl border px-4 py-3 text-sm",
          allClear
            ? "border-border bg-bg-subtle/50 text-fg-muted"
            : "border-heart/40 bg-heart/10 text-fg",
        )}
      >
        {allClear
          ? "Alles ruhig — keine offenen Meldungen. 🐾"
          : `${data.openReports + data.openProfileReports} Meldung${data.openReports + data.openProfileReports === 1 ? "" : "en"} warten auf euch.`}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <button
              type="button"
              onClick={() => onGo(t.tab)}
              className={cn(
                "flex h-full w-full flex-col items-start gap-2 rounded-2xl border bg-bg-elevated p-4 text-left transition-colors hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none",
                t.urgent ? "border-heart/50" : "border-border",
              )}
            >
              <t.icon
                className={cn("size-4", t.urgent ? "text-heart" : "text-fg-subtle")}
                aria-hidden
              />
              <span className="font-display text-3xl leading-none tabular-nums">{t.value}</span>
              <span className="text-xs text-fg-muted">{t.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-xs tracking-[0.18em] text-fg-subtle uppercase">Diese Woche</h3>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border p-4">
          <dt className="text-xs text-fg-muted">Neue Mitglieder</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums">{data.newMembers}</dd>
          <dd>
            <Trend now={data.newMembers} prev={data.newMembersPrev} />
          </dd>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <dt className="text-xs text-fg-muted">Neue Beiträge</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums">{data.newPosts}</dd>
          <dd>
            <Trend now={data.newPosts} prev={data.newPostsPrev} />
          </dd>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <dt className="text-xs text-fg-muted">Heute aktiv</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums">{data.activeToday}</dd>
          <dd className="text-xs text-fg-subtle">
            {data.banned} gesperrt ·{" "}
            <button
              type="button"
              onClick={() => onGo("bans")}
              className="underline underline-offset-2 hover:text-fg"
            >
              ansehen
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Post reports

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const URGENT_REASONS = new Set(["minor", "illegal", "nonconsensual"]);

function Reports() {
  const refresh = useRefresh();
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => listReports() });
  const [busy, setBusy] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [banFor, setBanFor] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ url: string; handle: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function act(postId: number, action: () => Promise<unknown>, done: string) {
    setBusy(postId);
    try {
      await action();
      toast.success(done);
      await refresh(["admin-reports", "admin-banned", "feed", "explore", "profile-posts"]);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const all = useMemo(() => reports.data ?? [], [reports.data]);
  const reasonsInUse = useMemo(() => [...new Set(all.flatMap((r) => r.reasons))], [all]);
  const list = all.filter(
    (r) =>
      (!reason || r.reasons.includes(reason)) &&
      matches(q, r.author.handle, r.author.displayName, r.caption, ...r.notes),
  );

  return (
    <section>
      <SectionHead
        title="Gemeldete Beiträge"
        count={all.length}
        hint="Die meistgemeldeten zuerst. Dringende Gründe sind rot markiert."
      />
      {all.length > 2 ? (
        <div className="mt-4 space-y-3">
          <SearchField value={q} onChange={setQ} placeholder="Nach @name, Text oder Notiz suchen" />
          {reasonsInUse.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Chip active={!reason} onClick={() => setReason(null)}>
                Alle
              </Chip>
              {reasonsInUse.map((id) => (
                <Chip
                  key={id}
                  active={reason === id}
                  onClick={() => setReason(reason === id ? null : id)}
                >
                  {reasonLabel(id)}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {reports.isPending ? (
        <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
      ) : all.length === 0 ? (
        <Empty>Keine offenen Meldungen. 🎉</Empty>
      ) : list.length === 0 ? (
        <Empty>Keine Meldung passt zur Suche.</Empty>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((r) => {
            const urgent = r.reasons.some((id) => URGENT_REASONS.has(id));
            return (
              <li
                key={r.postId}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border bg-bg-elevated p-3 sm:flex-row sm:gap-4",
                  urgent ? "border-heart/50" : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => setZoom({ url: r.imageUrl, handle: r.author.handle })}
                  className="group relative shrink-0 overflow-hidden rounded-xl bg-bg sm:size-28"
                  aria-label="Bild groß ansehen"
                >
                  <img
                    src={r.imageUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105 sm:aspect-auto sm:h-full motion-reduce:transition-none"
                  />
                </button>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      to="/u/$handle"
                      params={{ handle: r.author.handle }}
                      className="font-medium hover:underline"
                    >
                      @{r.author.handle}
                    </Link>
                    <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs tabular-nums">
                      {r.count}× gemeldet
                    </span>
                    {r.author.banned ? (
                      <span className="rounded-full bg-heart/15 px-2 py-0.5 text-xs">gesperrt</span>
                    ) : null}
                    <span className="text-xs text-fg-subtle">{ago(r.lastReportedAt)}</span>
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {r.reasons.map((id) => (
                      <li
                        key={id}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs",
                          URGENT_REASONS.has(id)
                            ? "bg-heart/15 text-fg"
                            : "bg-bg-subtle text-fg-muted",
                        )}
                      >
                        {reasonLabel(id)}
                      </li>
                    ))}
                  </ul>
                  {r.notes.length ? (
                    <ul className="mt-2 space-y-1 border-l-2 border-border pl-3 text-xs text-fg-muted">
                      {r.notes.slice(0, 3).map((n, i) => (
                        <li key={i} className="break-words">
                          „{n}“
                        </li>
                      ))}
                      {r.notes.length > 3 ? <li>+ {r.notes.length - 3} weitere</li> : null}
                    </ul>
                  ) : null}
                  {r.caption ? (
                    <p className="mt-2 line-clamp-2 text-xs break-words text-fg-subtle">
                      {r.caption}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      className={touch}
                      disabled={busy === r.postId}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Beitrag endgültig löschen?",
                          text: `Der Beitrag von @${r.author.handle} wird für alle entfernt. Das lässt sich nicht rückgängig machen.`,
                          confirmLabel: "Löschen",
                          danger: true,
                        });
                        if (ok)
                          void act(
                            r.postId,
                            () => adminDeletePost({ data: { postId: r.postId } }),
                            "Beitrag gelöscht.",
                          );
                      }}
                    >
                      Löschen
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className={touch}
                      disabled={busy === r.postId}
                      onClick={() =>
                        void act(
                          r.postId,
                          () => dismissReports({ data: { postId: r.postId } }),
                          "Meldung verworfen — Beitrag bleibt.",
                        )
                      }
                    >
                      Verwerfen
                    </Button>
                    {r.author.banned ? null : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className={touch}
                        disabled={busy === r.postId}
                        onClick={() => setBanFor(r.author.handle)}
                      >
                        Profil sperren
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
      {banFor ? <BanDialog handle={banFor} onClose={() => setBanFor(null)} /> : null}
      {zoom ? (
        <Modal title={`Beitrag von @${zoom.handle}`} onClose={() => setZoom(null)} wide>
          <img
            src={zoom.url}
            alt=""
            className="mt-3 max-h-[70dvh] w-full rounded-xl bg-bg object-contain"
          />
        </Modal>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile reports

function ProfileReports() {
  const refresh = useRefresh();
  const reports = useQuery({
    queryKey: ["admin-profile-reports"],
    queryFn: () => listProfileReports(),
  });
  const [q, setQ] = useState("");
  const [banFor, setBanFor] = useState<string | null>(null);

  async function resolve(handle: string) {
    try {
      await resolveProfileReports({ data: { handle } });
      toast.success(`Meldungen zu @${handle} erledigt.`);
      await refresh(["admin-profile-reports"]);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const all = reports.data ?? [];
  const list = all.filter((r) => matches(q, r.handle, r.displayName, ...r.notes));
  return (
    <section className="mt-12">
      <SectionHead
        title="Gemeldete Profile"
        count={all.length}
        hint="Löschen geht auf dem Profil über ⋯ oben rechts."
      />
      {all.length > 3 ? (
        <div className="mt-4">
          <SearchField value={q} onChange={setQ} placeholder="Profil suchen" />
        </div>
      ) : null}
      {reports.isPending ? (
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
      ) : all.length === 0 ? (
        <Empty>Keine gemeldeten Profile.</Empty>
      ) : list.length === 0 ? (
        <Empty>Kein Profil passt zur Suche.</Empty>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {list.map((r) => (
            <li key={r.handle} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <Avatar url={r.avatarUrl} name={r.displayName} />
              <Link
                to="/u/$handle"
                params={{ handle: r.handle }}
                className="min-w-0 flex-1 basis-40 hover:underline"
              >
                <span className="block truncate">
                  {r.displayName} <span className="text-fg-muted">@{r.handle}</span>
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {r.count}× · {r.reasons.join(", ")} · {ago(r.lastAt)}
                </span>
                {r.notes.length ? (
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    „{r.notes[0]}“
                  </span>
                ) : null}
              </Link>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className={touch}
                  onClick={() => setBanFor(r.handle)}
                >
                  Sperren
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className={touch}
                  onClick={() => void resolve(r.handle)}
                >
                  Erledigt
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {banFor ? (
        <BanDialog
          handle={banFor}
          onClose={() => setBanFor(null)}
          onBanned={() => void resolve(banFor)}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bans

function Bans() {
  const refresh = useRefresh();
  const banned = useQuery({ queryKey: ["admin-banned"], queryFn: () => listBanned() });
  const [q, setQ] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  async function unban(target: string) {
    const ok = await confirm({
      title: `@${target} entsperren?`,
      text: "Das Profil und seine Bilder sind danach wieder sichtbar.",
      confirmLabel: "Entsperren",
    });
    if (!ok) return;
    try {
      await setBanned({ data: { handle: target, banned: false } });
      toast.success(`@${target} entsperrt.`);
      await refresh(["admin-banned", "profile", "feed", "explore", "creators"]);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const all = banned.data ?? [];
  const list = all.filter((b) => matches(q, b.handle, b.displayName, b.reason));
  return (
    <section>
      <SectionHead
        title="Gesperrte Profile"
        count={all.length}
        hint="Sperren geht bei Meldungen oder direkt auf dem Profil über ⋯. Gesperrte Profile und ihre Bilder sind unsichtbar; sie können nichts mehr posten, liken oder kommentieren."
      />
      {all.length > 3 ? (
        <div className="mt-4">
          <SearchField value={q} onChange={setQ} placeholder="Gesperrte suchen" />
        </div>
      ) : null}
      {banned.isPending ? (
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
      ) : all.length === 0 ? (
        <Empty>Niemand gesperrt.</Empty>
      ) : list.length === 0 ? (
        <Empty>Niemand passt zur Suche.</Empty>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {list.map((b) => (
            <li key={b.handle} className="flex items-center justify-between gap-3 p-3 text-sm">
              <Link
                to="/u/$handle"
                params={{ handle: b.handle }}
                className="min-w-0 hover:underline"
              >
                <span className="block truncate">
                  {b.displayName} <span className="text-fg-muted">@{b.handle}</span>
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {b.until ? `bis ${dateFormat.format(new Date(b.until))}` : "dauerhaft"}
                  {" · seit "}
                  {dateFormat.format(new Date(b.bannedAt))}
                  {b.reason ? ` · ${b.reason}` : ""}
                </span>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                className={touch}
                onClick={() => void unban(b.handle)}
              >
                Entsperren
              </Button>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}

// ---------------------------------------------------------------------------
// FSK 18 approvals

function Fsk18Approvals() {
  const refresh = useRefresh();
  const approvals = useQuery({ queryKey: ["admin-fsk18"], queryFn: () => listFsk18Approvals() });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "team" | "discord">("all");
  const [confirm, confirmDialog] = useConfirm();

  async function change(handle: string, unlock: boolean) {
    try {
      const { displayName } = await setFsk18Approval({ data: { handle, unlock } });
      toast.success(
        unlock
          ? `FSK 18 für ${displayName} freigegeben.`
          : `Freigabe für ${displayName} zurückgenommen.`,
      );
      await refresh(["admin-fsk18"]);
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    }
  }

  const all = approvals.data ?? [];
  const list = all.filter(
    (a) => (source === "all" || a.source === source) && matches(q, a.handle, a.displayName),
  );
  const teamCount = all.filter((a) => a.source === "team").length;
  return (
    <section>
      <SectionHead
        title="FSK 18 Freigaben"
        count={all.length}
        hint="Freigegebene Profile sehen FSK-18-Bilder scharf — per Discord-Rolle oder von Hand durchs Team."
        action={
          <Button size="sm" className={touch} onClick={() => setOpen(true)}>
            Profil freigeben
          </Button>
        }
      />
      {all.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField value={q} onChange={setQ} placeholder="Freigegebene suchen" />
          <div className="flex gap-2">
            <Chip active={source === "all"} onClick={() => setSource("all")}>
              Alle
            </Chip>
            <Chip active={source === "team"} onClick={() => setSource("team")}>
              Team <span className="tabular-nums opacity-70">{teamCount}</span>
            </Chip>
            <Chip active={source === "discord"} onClick={() => setSource("discord")}>
              Discord <span className="tabular-nums opacity-70">{all.length - teamCount}</span>
            </Chip>
          </div>
        </div>
      ) : null}
      {approvals.isPending ? (
        <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
      ) : all.length === 0 ? (
        <Empty>Noch niemand freigegeben.</Empty>
      ) : list.length === 0 ? (
        <Empty>Niemand passt zum Filter.</Empty>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {list.map((a) => (
            <li key={a.handle} className="flex items-center gap-3 p-3 text-sm">
              <Avatar url={a.avatarUrl} name={a.displayName} />
              <div className="min-w-0 flex-1">
                <Link
                  to="/u/$handle"
                  params={{ handle: a.handle }}
                  className="block truncate hover:underline"
                >
                  {a.displayName} <span className="text-fg-muted">@{a.handle}</span>
                </Link>
                <p className="truncate text-xs text-fg-subtle">
                  {a.source === "team" ? `Vom Team${a.by ? ` (${a.by})` : ""}` : "Über Discord"} ·{" "}
                  seit {dateFormat.format(new Date(a.since))}
                </p>
              </div>
              {a.source === "team" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={touch}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Freigabe für @${a.handle} zurücknehmen?`,
                      text: "FSK-18-Bilder sind für dieses Profil danach wieder unscharf. Eine Discord-Verifizierung bleibt davon unberührt.",
                      confirmLabel: "Zurücknehmen",
                      danger: true,
                    });
                    if (ok) void change(a.handle, false);
                  }}
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
      {confirmDialog}
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

  const results = useQuery({
    queryKey: ["search", term],
    queryFn: () => searchProfiles({ data: { q: term } }),
    enabled: term.replace(/^@/, "").length > 0,
  });
  const list = results.data ?? [];
  const pickedProfile = list.find((p) => p.handle === picked);

  return (
    <Modal title="FSK 18 freigeben" onClose={onClose}>
      <p className="mt-1 text-sm text-fg-muted">
        Nur freigeben, wenn das Team die Volljährigkeit geprüft hat.
      </p>
      <Input
        className="mt-4"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setPicked(null);
        }}
        placeholder="Name oder @handle suchen"
        aria-label="Profil suchen"
      />
      <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto" aria-live="polite">
        {term && results.isFetching && list.length === 0 ? (
          <li className="px-1 py-2 text-sm text-fg-muted">Suche…</li>
        ) : null}
        {term && results.data?.length === 0 ? (
          <li className="px-1 py-2 text-sm text-fg-muted">Niemand gefunden.</li>
        ) : null}
        {list.map((p) => {
          const minor = p.age < 18;
          return (
            <li key={p.handle}>
              <button
                type="button"
                onClick={() => setPicked(p.handle)}
                aria-pressed={picked === p.handle}
                disabled={minor}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-2 py-1 text-left text-sm disabled:opacity-50",
                  picked === p.handle
                    ? "border-accent bg-bg-subtle"
                    : "border-transparent hover:bg-bg-subtle/60",
                )}
              >
                <Avatar url={p.avatarUrl} name={p.displayName} size="sm" />
                <span className="min-w-0 truncate">
                  {p.displayName}{" "}
                  <span className="text-fg-muted">
                    @{p.handle} · {p.age}
                    {minor ? " · unter 18" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        className="mt-4 w-full"
        disabled={!picked || busy || (pickedProfile ? pickedProfile.age < 18 : false)}
        onClick={async () => {
          if (!picked) return;
          setBusy(true);
          await onApprove(picked);
          setBusy(false);
        }}
      >
        {busy ? "Gibt frei…" : picked ? `@${picked} freigeben` : "Profil auswählen"}
      </Button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ratings + feedback

/** Star ratings from the pop-up: average, distribution, latest comments. */
function Ratings() {
  const ratings = useQuery({ queryKey: ["admin-ratings"], queryFn: () => listRatings() });
  const data = ratings.data;
  const max = Math.max(1, ...(data?.distribution ?? [0]));
  const comments = (data?.recent ?? []).filter((r) => r.comment);
  return (
    <section className="mt-12">
      <SectionHead title="Bewertungen" count={data?.count} />
      {ratings.isPending ? (
        <Skeleton className="mt-4 h-24 w-full rounded-2xl" />
      ) : !data || data.count === 0 ? (
        <Empty>Noch keine Bewertungen. Das Popup erscheint Mitgliedern nach einer Woche.</Empty>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-bg-elevated p-4">
            <div>
              <p className="font-display text-4xl tabular-nums">
                {data.average.toLocaleString("de", { maximumFractionDigits: 1 })}
              </p>
              <p
                className="flex text-amber-400"
                aria-label={`${data.average.toFixed(1)} von 5 Sternen`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    aria-hidden
                    className={cn(
                      "size-4",
                      n <= Math.round(data.average) ? "fill-current" : "text-fg-subtle",
                    )}
                  />
                ))}
              </p>
              <p className="mt-1 text-xs text-fg-muted">{data.count} Bewertungen</p>
            </div>
            <ol className="min-w-40 flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = data.distribution[n - 1] ?? 0;
                return (
                  <li
                    key={n}
                    className="flex items-center gap-2 text-xs"
                    title={`${count} × ${n} Sterne`}
                  >
                    <span className="w-6 text-fg-muted tabular-nums">{n}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                      <span
                        className="block h-full rounded-full bg-amber-400"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-fg-muted tabular-nums">{count}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          {comments.length ? (
            <ul className="mt-4 space-y-2">
              {comments.map((r, i) => (
                <li key={i} className="rounded-xl border border-border p-3 text-sm">
                  <p className="text-xs text-fg-muted">
                    <span className="text-amber-400">{"★".repeat(r.stars)}</span> · @
                    {r.author.handle} · {dateFormat.format(new Date(r.updatedAt))}
                  </p>
                  <p className="mt-1 break-words whitespace-pre-line">{r.comment}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

type FeedbackStatus = "open" | "done" | "all";

function FeedbackList() {
  const refresh = useRefresh();
  const feedback = useQuery({ queryKey: ["admin-feedback"], queryFn: () => listFeedback() });
  const [status, setStatus] = useState<FeedbackStatus>("open");
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const kindLabel = (id: string) => FEEDBACK_KINDS.find((k) => k.id === id)?.label ?? id;

  const all = feedback.data ?? [];
  const list = all.filter(
    (f) =>
      (status === "all" || (status === "done") === f.done) &&
      (!kind || f.kind === kind) &&
      matches(q, f.body, f.author.handle, f.author.displayName),
  );
  const openCount = all.filter((f) => !f.done).length;
  const visibleIds = list.map((f) => f.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  async function toggle(id: number, done: boolean) {
    try {
      await setFeedbackDone({ data: { id, done } });
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      await refresh(["admin-feedback"]);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function bulk(done: boolean) {
    if (selectedVisible.length === 0) return;
    setBusy(true);
    try {
      const { count } = await setFeedbackDoneMany({ data: { ids: selectedVisible, done } });
      toast.success(done ? `${count} als erledigt markiert.` : `${count} wieder geöffnet.`);
      setSelected(new Set());
      await refresh(["admin-feedback"]);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHead
        title="Feedback & Wünsche"
        count={openCount}
        hint="Wer Feedback schickt, sieht auf der Feedback-Seite, wann ihr es erledigt habt."
      />
      <div className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField value={q} onChange={setQ} placeholder="Feedback durchsuchen" />
          <div
            className="flex gap-1 rounded-full border border-border p-1"
            role="group"
            aria-label="Status"
          >
            {(
              [
                ["open", "Offen"],
                ["done", "Erledigt"],
                ["all", "Alle"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={status === id}
                onClick={() => setStatus(id)}
                className={cn(
                  "h-9 flex-1 rounded-full px-3 text-sm max-sm:h-10",
                  status === id
                    ? "bg-bg-subtle font-medium text-fg"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={!kind} onClick={() => setKind(null)}>
            Alle Arten
          </Chip>
          {FEEDBACK_KINDS.map((k) => (
            <Chip
              key={k.id}
              active={kind === k.id}
              onClick={() => setKind(kind === k.id ? null : k.id)}
            >
              {k.label}
            </Chip>
          ))}
        </div>
      </div>

      {list.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg-subtle/50 px-2 py-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set([...selected, ...visibleIds]))
              }
              className="size-4 accent-(--color-accent)"
            />
            {selectedVisible.length ? `${selectedVisible.length} ausgewählt` : "Alle auswählen"}
          </label>
          {selectedVisible.length ? (
            <div className="flex gap-2">
              {status !== "open" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className={touch}
                  disabled={busy}
                  onClick={() => void bulk(false)}
                >
                  Wieder öffnen
                </Button>
              ) : null}
              {status !== "done" ? (
                <Button size="sm" className={touch} disabled={busy} onClick={() => void bulk(true)}>
                  <CheckCheck className="size-4" aria-hidden /> Erledigt
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {feedback.isPending ? (
        <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
      ) : all.length === 0 ? (
        <Empty>Noch kein Feedback.</Empty>
      ) : list.length === 0 ? (
        <Empty>
          {status === "open" && !kind && !q ? "Alles erledigt. 💛" : "Nichts passt zum Filter."}
        </Empty>
      ) : (
        <ul className="mt-3 space-y-3">
          {list.map((f) => (
            <li
              key={f.id}
              className={cn(
                "flex gap-2 rounded-2xl border border-border bg-bg-elevated p-3 text-sm",
                f.done && "opacity-60",
              )}
            >
              <label
                className="grid size-11 shrink-0 cursor-pointer place-items-center"
                aria-label="Auswählen"
              >
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                  className="size-4 accent-(--color-accent)"
                />
              </label>
              <div className="min-w-0 flex-1 py-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-fg-muted">
                    <span className="font-medium text-fg">{kindLabel(f.kind)}</span> ·{" "}
                    <Link
                      to="/u/$handle"
                      params={{ handle: f.author.handle }}
                      className="hover:underline"
                    >
                      @{f.author.handle}
                    </Link>{" "}
                    · <time dateTime={f.createdAt}>{ago(f.createdAt)}</time>
                  </p>
                </div>
                <p className="mt-2 break-words whitespace-pre-line">{f.body}</p>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    className={touch}
                    onClick={() => void toggle(f.id, !f.done)}
                  >
                    {f.done ? (
                      "Wieder öffnen"
                    ) : (
                      <>
                        <CheckCheck className="size-4" aria-hidden /> Erledigt
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Publish update

function PublishUpdate() {
  const queryClient = useQueryClient();
  const recent = useQuery({ queryKey: ["updates"], queryFn: () => listUpdates() });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [toDiscord, setToDiscord] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const ready = title.trim().length >= 3 && body.trim().length >= 3;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await confirm({
      title: "Update veröffentlichen?",
      text: (
        <>
          „{title.trim()}“ erscheint unter Updates und als Mitteilung bei allen Mitgliedern
          {toDiscord ? " — und in Discord #updates" : ""}. Löschen geht danach nicht mehr hier.
        </>
      ),
      confirmLabel: "Veröffentlichen",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { discord } = await publishUpdate({ data: { title, body, toDiscord } });
      if (toDiscord && !discord) {
        toast.warning("Update veröffentlicht — aber der Discord-Post hat nicht geklappt.");
      } else {
        toast.success(
          discord ? "Update veröffentlicht und in Discord gepostet." : "Update veröffentlicht.",
        );
      }
      setTitle("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["updates"] });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHead
        title="Update veröffentlichen"
        hint="Erscheint unter „Updates“, als System-Mitteilung bei allen und in Discord #updates. Zeilen mit „-“ werden zur Liste."
      />
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
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
              rows={6}
              required
              placeholder={"Was ist neu?\n- Erster Punkt\n- Zweiter Punkt"}
            />
            <p className="text-right text-xs text-fg-subtle tabular-nums">{body.length}/3000</p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={toDiscord}
              onChange={(e) => setToDiscord(e.target.checked)}
              className="size-4 accent-(--color-accent)"
            />
            Auch in Discord #updates posten
          </label>
          <Button type="submit" className="w-full sm:w-auto" disabled={busy || !ready}>
            <Megaphone className="size-4" aria-hidden />
            {busy ? "Wird veröffentlicht…" : "Veröffentlichen"}
          </Button>
        </form>
        <div>
          <p className="text-xs tracking-[0.18em] text-fg-subtle uppercase">Vorschau</p>
          <div className="mt-2 rounded-2xl border border-border bg-bg p-4">
            {ready ? (
              <>
                <p className="text-[11px] text-fg-subtle">Heute</p>
                <p className="mt-0.5 font-display text-lg break-words">{title}</p>
                <UpdateBody body={body} className="mt-2" />
              </>
            ) : (
              <p className="text-sm text-fg-subtle">So sieht dein Update für alle aus.</p>
            )}
          </div>
        </div>
      </div>

      <h3 className="mt-10 text-xs tracking-[0.18em] text-fg-subtle uppercase">
        Zuletzt veröffentlicht
      </h3>
      {recent.isPending ? (
        <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
      ) : (recent.data ?? []).length === 0 ? (
        <Empty>Noch keine Updates.</Empty>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
          {(recent.data ?? []).slice(0, 4).map((u) => (
            <li key={u.id} className="flex items-baseline justify-between gap-3 p-3 text-sm">
              <span className="min-w-0 truncate">{u.title}</span>
              <time className="shrink-0 text-xs text-fg-subtle" dateTime={u.createdAt}>
                {dateFormat.format(new Date(u.createdAt))}
              </time>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/updates"
        className="mt-3 inline-block text-sm text-fg-muted underline underline-offset-4 hover:text-fg"
      >
        Alle Updates ansehen
      </Link>
      {confirmDialog}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Team

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
  const [confirm, confirmDialog] = useConfirm();

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
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: TeamMember) {
    const who = m.match ? `@${m.match.handle}` : m.value;
    const ok = await confirm({
      title: `${who} aus dem Team entfernen?`,
      text: "Die Person verliert den Zugriff auf die Moderation (außer über eine Discord-Team-Rolle).",
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    try {
      await removeTeamMember({ data: { kind: m.kind, value: m.value } });
      toast.success(`${who} ist nicht mehr im Team.`);
      await queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const members = team.data?.members ?? [];
  return (
    <section>
      <SectionHead
        title="Team"
        count={members.length}
        hint="Per Discord-Nutzer-ID, Nutzer-ID der Webseite oder @Name hinzufügen. Beim Anmelden wird automatisch abgeglichen, zu welchem Profil die ID gehört. Discord-Rollen (Owner, Fluff Admin) zählen weiterhin."
      />
      <form onSubmit={(e) => void add(e)} className="mt-4 flex gap-2">
        <Input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="z. B. 123456789012345678 oder @name"
          aria-label="Discord-ID, Nutzer-ID oder @Name"
          className="min-w-0 flex-1"
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
        <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
      ) : members.length === 0 ? (
        <Empty>Noch niemand hinzugefügt.</Empty>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {members.map((m) => (
            <li key={`${m.kind}:${m.value}`} className="flex items-center gap-3 p-3 text-sm">
              <Avatar url={m.match?.avatarUrl ?? null} name={m.match?.displayName ?? "?"} />
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
              <Button
                size="sm"
                variant="secondary"
                className={touch}
                onClick={() => void remove(m)}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Paw dialog

type PawTab = "settings" | "moderation";

/**
 * Popup opened by the paw icon (top right): settings for everyone, plus
 * moderation for admins. Closes on Escape, backdrop click or navigation.
 */
export function PawDialog({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<PawTab>("settings");
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const [openedAt] = useState(pathname);
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => adminOverview(),
    enabled: isAdmin,
  });
  const openWork = overview.data ? overview.data.openReports + overview.data.openProfileReports : 0;
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
                    "relative h-10 rounded-lg px-3 font-display text-lg",
                    tab === id ? "bg-bg-subtle text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {label}
                  {id === "moderation" && openWork > 0 ? (
                    <span
                      className="absolute top-1.5 right-1 size-2 rounded-full bg-heart"
                      aria-label={`${openWork} offene Meldungen`}
                    />
                  ) : null}
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
          {isAdmin && tab === "moderation" ? (
            <AdminSections stickyTabs />
          ) : (
            <SettingsPanel embedded />
          )}
        </div>
      </div>
    </div>
  );
}

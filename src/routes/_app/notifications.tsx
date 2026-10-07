import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellOff,
  Check,
  ChevronDown,
  EyeOff,
  Heart,
  Megaphone,
  MessageCircle,
  Play,
  RotateCw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PostViewerLoader } from "@/components/post-viewer-loader";
import { markNotificationsRead, toggleFollow } from "@/lib/vela/server";
import {
  deleteNotificationBatch,
  listNotificationFeed,
  type NotificationFeedItem,
} from "@/lib/vela/notifications-api";
import { memberErrorMessage } from "@/lib/vela/errors";
import {
  NOTIFICATION_FILTERS,
  groupedNotificationText,
  notificationText,
  othersLabel,
  type NotificationFilterId,
} from "@/lib/vela/notification-text";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  // ?post=<id> opens that post right away (used by the pop-ups).
  validateSearch: z.object({ post: z.coerce.number().int().positive().optional() }),
  component: Notifications,
});

type Kind = NotificationFeedItem["kind"];
type Actor = NonNullable<NotificationFeedItem["actor"]>;

// ---------------------------------------------------------------------------
// Time helpers

const relative = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
const fullDate = new Intl.DateTimeFormat("de", { dateStyle: "long", timeStyle: "short" });

function timeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = (then - now) / 1000;
  if (Math.abs(seconds) < 45) return "gerade eben";
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return relative.format(Math.round(value), "year");
}

/** Re-renders every 30 s so "vor 2 Minuten" stays true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const SECTIONS = ["Heute", "Gestern", "Diese Woche", "Früher"] as const;
type Section = (typeof SECTIONS)[number];

function sectionOf(iso: string, now: number): Section {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  const day = 86_400_000;
  if (t >= start.getTime()) return "Heute";
  if (t >= start.getTime() - day) return "Gestern";
  if (t >= start.getTime() - 6 * day) return "Diese Woche";
  return "Früher";
}

// ---------------------------------------------------------------------------
// Grouping: likes on the same post, and follows, fold into one row per section.

type Group = {
  key: string;
  kind: Kind;
  items: NotificationFeedItem[];
  latest: NotificationFeedItem;
  /** Distinct people, newest first. */
  actors: Actor[];
  unread: boolean;
};

function groupKey(n: NotificationFeedItem): string {
  if ((n.kind === "like" || n.kind === "comment_like") && n.postId) {
    return `${n.kind}:${n.postId}`;
  }
  if (n.kind === "follow") return "follow";
  return `single:${n.id}`;
}

function buildSections(list: NotificationFeedItem[], now: number) {
  const out: { section: Section; groups: Group[] }[] = [];
  for (const n of list) {
    const section = sectionOf(n.createdAt, now);
    let bucket = out.find((s) => s.section === section);
    if (!bucket) {
      bucket = { section, groups: [] };
      out.push(bucket);
    }
    const key = groupKey(n);
    let group = bucket.groups.find((g) => g.key === key);
    if (!group) {
      group = { key, kind: n.kind, items: [], latest: n, actors: [], unread: false };
      bucket.groups.push(group);
    }
    group.items.push(n);
    if (!n.read) group.unread = true;
    // Follow → unfollow → follow again shouldn't list someone twice.
    if (n.actor && !group.actors.some((a) => a.handle === n.actor!.handle)) {
      group.actors.push(n.actor);
    }
  }
  out.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section));
  return out;
}

// ---------------------------------------------------------------------------
// Page

const ICONS: Record<Kind, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: Megaphone,
  reply: MessageCircle,
  comment_like: Heart,
};

const UNDO_MS = 5000;

type PendingDelete = { ids: number[]; upToId?: number; timer: number };

function Notifications() {
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useNow();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotificationFeed(),
    refetchOnWindowFocus: true,
  });
  const [filter, setFilter] = useState<NotificationFilterId>("all");
  const [openPost, setOpenPost] = useState<number | null>(search.post ?? null);

  // ?post= from a pop-up: open it, then clean the address.
  useEffect(() => {
    if (search.post === undefined) return;
    setOpenPost(search.post);
    void navigate({ search: {}, replace: true });
  }, [search.post, navigate]);

  // Opening the page marks everything as read (the list keeps showing what was
  // new until the next refresh). Keyed by the newest unread id, so something
  // arriving while the page is open gets marked too.
  const newestUnread = (query.data ?? []).reduce((m, n) => (n.read ? m : Math.max(m, n.id)), 0);
  useEffect(() => {
    if (!newestUnread) return;
    void markNotificationsRead()
      .then(() => queryClient.invalidateQueries({ queryKey: ["notif-count"] }))
      .catch(() => undefined);
  }, [newestUnread, queryClient]);

  // --- Delete with "Rückgängig" -------------------------------------------
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set());
  const [hiddenUpTo, setHiddenUpTo] = useState(0);
  const pending = useRef(new Map<number, PendingDelete>());
  const nextPendingId = useRef(1);

  const commit = useCallback(
    async (p: Omit<PendingDelete, "timer">) => {
      try {
        await deleteNotificationBatch({
          data: { ids: p.ids.length ? p.ids : undefined, upToId: p.upToId },
        });
      } catch (err) {
        toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["notifications"] }),
          queryClient.invalidateQueries({ queryKey: ["notif-count"] }),
        ]);
      }
    },
    [queryClient],
  );

  // Leaving the page: whatever is still waiting gets deleted now.
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const p of map.values()) {
        window.clearTimeout(p.timer);
        void commit(p);
      }
      map.clear();
    };
  }, [commit]);

  function scheduleDelete(opts: { ids?: number[]; upToId?: number }) {
    const ids = opts.ids ?? [];
    const key = nextPendingId.current++;
    if (opts.upToId) setHiddenUpTo((v) => Math.max(v, opts.upToId!));
    if (ids.length) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    }
    const timer = window.setTimeout(() => {
      const p = pending.current.get(key);
      pending.current.delete(key);
      if (p) void commit(p);
    }, UNDO_MS);
    pending.current.set(key, { ids, upToId: opts.upToId, timer });

    const undo = () => {
      const p = pending.current.get(key);
      if (!p) return;
      window.clearTimeout(p.timer);
      pending.current.delete(key);
      if (p.upToId) setHiddenUpTo(0);
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of p.ids) next.delete(id);
        return next;
      });
    };
    const label = opts.upToId
      ? "Alle Mitteilungen gelöscht"
      : ids.length > 1
        ? `${ids.length} Mitteilungen gelöscht`
        : "Mitteilung gelöscht";
    toast(label, { duration: UNDO_MS, action: { label: "Rückgängig", onClick: undo } });
  }

  // --- Follow back ----------------------------------------------------------
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  async function followBack(handle: string) {
    setFollowBusy(handle);
    try {
      const result = await toggleFollow({ data: { handle } });
      queryClient.setQueryData<NotificationFeedItem[]>(["notifications"], (list) =>
        (list ?? []).map((n) =>
          n.actor?.handle === handle ? { ...n, followingActor: result.following } : n,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ["profile", handle] });
      if (result.following) toast.success(`Du folgst jetzt @${handle}.`);
    } catch (err) {
      toast.error(memberErrorMessage(err, "Folgen hat nicht geklappt."));
    } finally {
      setFollowBusy(null);
    }
  }

  // --- Derived lists --------------------------------------------------------
  const visible = useMemo(
    () => (query.data ?? []).filter((n) => n.id > hiddenUpTo && !hiddenIds.has(n.id)),
    [query.data, hiddenIds, hiddenUpTo],
  );
  const counts = useMemo(() => {
    const c = {} as Record<NotificationFilterId, number>;
    for (const f of NOTIFICATION_FILTERS) {
      const kinds = f.kinds as readonly Kind[] | null;
      c[f.id] = kinds ? visible.filter((n) => kinds.includes(n.kind)).length : visible.length;
    }
    return c;
  }, [visible]);
  const activeFilter = NOTIFICATION_FILTERS.find((f) => f.id === filter)!;
  const filtered = useMemo(() => {
    const kinds = activeFilter.kinds as readonly Kind[] | null;
    return kinds ? visible.filter((n) => kinds.includes(n.kind)) : visible;
  }, [visible, activeFilter]);
  const sections = useMemo(() => buildSections(filtered, now), [filtered, now]);
  const maxId = visible.reduce((m, n) => Math.max(m, n.id), 0);
  const unreadCount = visible.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 pb-28 sm:px-5">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Für dich</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <h1 className="font-display text-3xl">
          Mitteilungen
          {unreadCount > 0 ? (
            <span className="ml-2 align-middle text-sm font-normal text-fg-muted">
              {unreadCount} neu
            </span>
          ) : null}
        </h1>
        <div className="-mr-2 flex items-center">
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Aktualisieren"
            title="Aktualisieren"
            className="grid size-11 place-items-center rounded-lg text-fg-muted hover:text-fg disabled:opacity-60"
          >
            <RotateCw
              className={cn("size-4", query.isFetching && "animate-spin motion-reduce:animate-none")}
            />
          </button>
          {filtered.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                filter === "all"
                  ? scheduleDelete({ upToId: maxId })
                  : scheduleDelete({ ids: filtered.map((n) => n.id) })
              }
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-muted hover:text-heart"
            >
              <Trash2 className="size-4" />
              {filter === "all" ? "Alle löschen" : `${activeFilter.label} löschen`}
            </button>
          ) : null}
        </div>
      </div>

      {visible.length > 0 ? (
        <div
          role="group"
          aria-label="Mitteilungen filtern"
          className="notif-chips -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
        >
          {NOTIFICATION_FILTERS.map((f) => {
            const active = f.id === filter;
            const count = counts[f.id];
            if (f.id !== "all" && count === 0 && !active) return null;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
                  active
                    ? "border-transparent bg-fg text-bg"
                    : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {f.label}
                <span className={cn("text-xs tabular-nums", active ? "opacity-70" : "opacity-60")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {query.isPending ? (
        <LoadingRows />
      ) : query.isError && !query.data ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-fg-muted">Mitteilungen konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm hover:border-border-strong"
          >
            Nochmal versuchen
          </button>
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          filtered={filter !== "all" && visible.length > 0}
          onShowAll={() => setFilter("all")}
        />
      ) : (
        <div className="mt-4">
          {sections.map(({ section, groups }) => (
            <section key={section} aria-label={section} className="mt-4 first:mt-0">
              <h2 className="py-2 text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
                {section}
              </h2>
              <ul className="flex flex-col gap-1">
                {groups.map((g) => (
                  <NotificationRow
                    key={g.key}
                    group={g}
                    now={now}
                    followBusy={followBusy}
                    onFollowBack={(h) => void followBack(h)}
                    onOpenPost={setOpenPost}
                    onDelete={() => scheduleDelete({ ids: g.items.map((n) => n.id) })}
                  />
                ))}
              </ul>
            </section>
          ))}
          <p className="mt-8 text-center text-xs text-fg-subtle">
            <span className="hidden sm:inline">Mit dem ✕ löschst du eine Mitteilung.</span>
            <span className="sm:hidden">Nach links wischen zum Löschen.</span>
          </p>
        </div>
      )}
      {openPost !== null ? (
        <PostViewerLoader postId={openPost} onClose={() => setOpenPost(null)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row

function NotificationRow({
  group,
  now,
  followBusy,
  onFollowBack,
  onOpenPost,
  onDelete,
}: {
  group: Group;
  now: number;
  followBusy: string | null;
  onFollowBack: (handle: string) => void;
  onOpenPost: (id: number) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const n = group.latest;
  const Icon = ICONS[group.kind];
  const many = group.actors.length > 1;
  const isLike = group.kind === "like" || group.kind === "comment_like";
  const first = group.actors[0];
  const swipe = useSwipeToDelete(onDelete);

  const sentence = many
    ? groupedNotificationText(group.kind, { video: n.postIsVideo })
    : notificationText(n, { video: n.postIsVideo });

  return (
    <li className="notif-row relative overflow-hidden rounded-2xl">
      {/* Revealed behind the row while swiping. */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end rounded-2xl bg-heart/90 pr-6 text-white"
        style={{ opacity: swipe.offset < 0 ? Math.min(1, -swipe.offset / 90) : 0 }}
      >
        <Trash2 className="size-5" />
      </div>
      <div
        {...swipe.handlers}
        style={{ transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined }}
        className={cn(
          "notif-row-inner relative flex gap-3 rounded-2xl px-3 py-3",
          group.unread ? "bg-accent/[0.07]" : "bg-bg",
          swipe.dragging ? "" : "notif-row-snap",
        )}
      >
        <div className="relative size-11 shrink-0">
          {group.kind === "system" ? (
            <img src="/icon.png" alt="" className="size-11 rounded-full bg-bg-subtle" />
          ) : many ? (
            <AvatarStack actors={group.actors} />
          ) : first ? (
            <Link
              to="/u/$handle"
              params={{ handle: first.handle }}
              tabIndex={-1}
              aria-hidden
              className="block size-11 overflow-hidden rounded-full bg-bg-subtle"
            >
              <Avatar actor={first} />
            </Link>
          ) : null}
          <span
            className={cn(
              "absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-bg",
              isLike ? "bg-heart text-white" : "bg-accent text-accent-fg",
            )}
          >
            <Icon className="size-2.5" strokeWidth={2.5} fill={isLike ? "currentColor" : "none"} />
          </span>
        </div>

        <div className="min-w-0 flex-1 text-sm">
          <p className="leading-snug break-words">
            {group.kind === "system" || !first ? (
              <span className="font-semibold">System</span>
            ) : (
              <>
                <ActorLink actor={first} />
                {group.actors.length === 2 ? (
                  <>
                    {" und "}
                    <ActorLink actor={group.actors[1]} />
                  </>
                ) : group.actors.length > 2 ? (
                  <>
                    {" und "}
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      aria-expanded={expanded}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {othersLabel(group.kind, group.actors.length - 1)}
                    </button>
                  </>
                ) : null}
              </>
            )}{" "}
            <span className={group.unread ? "text-fg" : "text-fg-muted"}>{sentence}</span>
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-fg-subtle">
            <time dateTime={n.createdAt} title={formatFull(n.createdAt)}>
              {timeAgo(n.createdAt, now)}
            </time>
            {group.unread ? (
              <span className="inline-flex items-center gap-1 text-heart">
                <span className="size-1.5 rounded-full bg-heart" />
                Neu
              </span>
            ) : null}
            {many ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="-my-3 inline-flex min-h-11 items-center gap-0.5 px-1 hover:text-fg"
              >
                {expanded ? "Weniger" : "Alle zeigen"}
                <ChevronDown
                  className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                />
              </button>
            ) : null}
          </p>

          {group.kind === "follow" && !many && first ? (
            <FollowBackButton
              actor={first}
              following={n.followingActor}
              busy={followBusy === first.handle}
              onClick={() => onFollowBack(first.handle)}
              className="mt-2"
            />
          ) : null}

          {expanded && many ? (
            <ul className="mt-2 flex flex-col gap-1 border-l border-border pl-3">
              {group.actors.map((a) => {
                const item = group.items.find((i) => i.actor?.handle === a.handle);
                return (
                  <li key={a.handle} className="flex items-center gap-2.5">
                    <Link
                      to="/u/$handle"
                      params={{ handle: a.handle }}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5"
                    >
                      <span className="size-8 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
                        <Avatar actor={a} />
                      </span>
                      <span className="min-w-0 truncate font-medium">{a.displayName}</span>
                      {item ? (
                        <span className="shrink-0 text-xs text-fg-subtle">
                          {timeAgo(item.createdAt, now)}
                        </span>
                      ) : null}
                    </Link>
                    {group.kind === "follow" && item ? (
                      <FollowBackButton
                        actor={a}
                        following={item.followingActor}
                        busy={followBusy === a.handle}
                        onClick={() => onFollowBack(a.handle)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {n.postId ? (
          <button
            type="button"
            onClick={() => onOpenPost(n.postId!)}
            aria-label={n.postIsVideo ? "Video öffnen" : "Beitrag öffnen"}
            className="relative size-12 shrink-0 self-start overflow-hidden rounded-lg bg-bg-subtle ring-1 ring-border transition hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-ring"
          >
            {n.postImageUrl ? (
              <img
                src={n.postImageUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-fg-subtle">
                {n.postHidden ? <EyeOff className="size-4" /> : null}
              </span>
            )}
            {n.postIsVideo ? (
              <span className="absolute inset-0 grid place-items-center bg-black/25 text-on-media">
                <Play className="size-4" fill="currentColor" />
              </span>
            ) : null}
            {n.postHidden ? (
              <span className="absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold text-on-media">
                18+
              </span>
            ) : null}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDelete}
          aria-label={many ? "Diese Mitteilungen löschen" : "Mitteilung löschen"}
          title="Löschen"
          className="-my-1 -mr-2 grid size-11 shrink-0 place-items-center self-start rounded-lg text-fg-subtle hover:bg-bg-subtle hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
    </li>
  );
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fullDate.format(d);
}

function ActorLink({ actor }: { actor: Actor }) {
  return (
    <Link
      to="/u/$handle"
      params={{ handle: actor.handle }}
      className="font-semibold underline-offset-2 hover:underline"
    >
      {actor.displayName}
    </Link>
  );
}

function Avatar({ actor }: { actor: Actor }) {
  return actor.avatarUrl ? (
    <img src={actor.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <span className="grid h-full w-full place-items-center text-sm text-fg-muted">
      {actor.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

function AvatarStack({ actors }: { actors: Actor[] }) {
  const [a, b] = actors;
  return (
    <span className="relative block size-11" aria-hidden>
      <span className="absolute top-0 left-0 size-8 overflow-hidden rounded-full bg-bg-subtle">
        <Avatar actor={a} />
      </span>
      <span className="absolute right-0 bottom-0 size-8 overflow-hidden rounded-full border-2 border-bg bg-bg-subtle">
        <Avatar actor={b} />
      </span>
    </span>
  );
}

function FollowBackButton({
  actor,
  following,
  busy,
  onClick,
  className,
}: {
  actor: Actor;
  following: boolean;
  busy: boolean;
  onClick: () => void;
  className?: string;
}) {
  if (following) {
    return (
      <span
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs text-fg-muted",
          className,
        )}
      >
        <Check className="size-3.5" />
        Folgst du
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`${actor.displayName} zurückfolgen`}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-60",
        className,
      )}
    >
      <UserPlus className="size-3.5" />
      {busy ? "Moment…" : "Zurückfolgen"}
    </button>
  );
}

function LoadingRows() {
  return (
    <div className="mt-6 flex flex-col gap-4" aria-label="Lädt…">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="size-12 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered, onShowAll }: { filtered: boolean; onShowAll: () => void }) {
  return (
    <div className="mt-12 flex flex-col items-center px-6 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-bg-subtle text-fg-muted ring-1 ring-border">
        <BellOff className="size-6" />
      </span>
      <p className="mt-4 font-display text-xl">
        {filtered ? "Hier ist nichts dabei" : "Alles ruhig hier"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">
        {filtered
          ? "In dieser Kategorie gibt es gerade keine Mitteilungen."
          : "Wenn jemand dein Bild liked, kommentiert oder dir folgt, siehst du es hier."}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-5 inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm hover:border-border-strong"
        >
          Alle anzeigen
        </button>
      ) : (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/upload"
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            Etwas hochladen
          </Link>
          <Link
            to="/explore"
            className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm hover:border-border-strong"
          >
            Galerie entdecken
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swipe left to delete (touch only; the ✕ button stays for everyone else).

const SWIPE_THRESHOLD = 90;

function useSwipeToDelete(onDelete: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; locked: "x" | "y" | null } | null>(
    null,
  );

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
    },
    onPointerMove(e: React.PointerEvent) {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        s.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (s.locked === "x") setDragging(true);
      }
      if (s.locked !== "x") return;
      setOffset(Math.min(0, dx));
    },
    onPointerUp(e: React.PointerEvent) {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId || s.locked !== "x") return;
      setDragging(false);
      if (offset <= -SWIPE_THRESHOLD) {
        setOffset(-window.innerWidth);
        window.setTimeout(onDelete, 160);
      } else {
        setOffset(0);
      }
    },
    onPointerCancel() {
      start.current = null;
      setDragging(false);
      setOffset(0);
    },
    // A finished swipe shouldn't also count as a tap on a link/button inside.
    onClickCapture(e: React.MouseEvent) {
      if (offset !== 0) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
  return { offset, dragging, handlers };
}

/**
 * Pop-up for new notifications, wherever you are on the site. Watches the
 * unread count (shared with the nav badge) and shows what arrived since the
 * page was opened. Tapping opens the post (likes, comments), the profile
 * (follows) or the notifications page (System).
 */
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Heart, Megaphone, MessageCircle, Play, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { unreadNotificationCount } from "@/lib/vela/server";
import { listNotificationFeed, type NotificationFeedItem } from "@/lib/vela/notifications-api";
import { notificationText } from "@/lib/vela/notification-text";
import { cn } from "@/lib/utils";

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: Megaphone,
  reply: MessageCircle,
  comment_like: Heart,
} as const;

/** More than this many at once → one summary pop-up instead. */
const MAX_SINGLE = 3;

export function NotificationPopups({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const count = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => unreadNotificationCount(),
    enabled,
    refetchInterval: 20_000,
  });
  // Highest id already known; null until the first look (old ones never pop up).
  const seen = useRef<number | null>(null);

  // Another account signed in on this tab: start fresh.
  useEffect(() => {
    if (!enabled) seen.current = null;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || count.data === undefined) return;
    let cancelled = false;
    void listNotificationFeed()
      .then((list) => {
        if (cancelled) return;
        const top = list.reduce((m, n) => Math.max(m, n.id), 0);
        if (seen.current === null) {
          seen.current = top;
          return;
        }
        const known = seen.current;
        const fresh = list.filter((n) => n.id > known && !n.read);
        seen.current = Math.max(known, top);
        if (fresh.length === 0) return;
        // Keep the notifications page (if cached/open) in sync.
        queryClient.setQueryData(["notifications"], list);
        // No pop-ups while the notifications page is open anyway.
        if (pathRef.current === "/notifications") return;
        if (fresh.length > MAX_SINGLE) showSummary(fresh.length);
        else for (const n of [...fresh].reverse()) show(n);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Re-check whenever the unread count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, count.data]);

  function open(n: NotificationFeedItem) {
    if (n.postId) {
      void navigate({ to: "/notifications", search: { post: n.postId } });
    } else if (n.kind === "follow" && n.actor) {
      void navigate({ to: "/u/$handle", params: { handle: n.actor.handle } });
    } else {
      void navigate({ to: "/notifications" });
    }
  }

  function showSummary(total: number) {
    toast.custom(
      (id) => (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(id);
            void navigate({ to: "/notifications" });
          }}
          className="notif-popup flex w-[min(92vw,360px)] items-center gap-3 rounded-2xl border border-border bg-bg-elevated/95 p-3 text-left text-fg shadow-2xl backdrop-blur-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
            <Bell className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm leading-snug">
            <span className="block font-semibold">{total} neue Mitteilungen</span>
            <span className="text-fg-muted">Tippen zum Ansehen</span>
          </span>
        </button>
      ),
      { duration: 6000 },
    );
  }

  function show(n: NotificationFeedItem) {
    const Icon = ICONS[n.kind];
    const isLike = n.kind === "like" || n.kind === "comment_like";
    toast.custom(
      (id) => (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(id);
            open(n);
          }}
          className="notif-popup flex w-[min(92vw,360px)] items-center gap-3 rounded-2xl border border-border bg-bg-elevated/95 p-3 text-left text-fg shadow-2xl backdrop-blur-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="relative size-10 shrink-0">
            <span className="block size-10 overflow-hidden rounded-full bg-bg-subtle">
              {n.kind === "system" || !n.actor ? (
                <img src="/icon.png" alt="" className="h-full w-full" />
              ) : n.actor.avatarUrl ? (
                <img src={n.actor.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-sm">
                  {n.actor.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span
              className={cn(
                "absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full border-2 border-bg-elevated",
                isLike ? "bg-heart text-white" : "bg-accent text-accent-fg",
              )}
            >
              <Icon className="size-2.5" strokeWidth={2.5} fill={isLike ? "currentColor" : "none"} />
            </span>
          </span>
          <span className="min-w-0 flex-1 text-sm leading-snug">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-semibold">
                {n.kind === "system" || !n.actor ? "System" : n.actor.displayName}
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">gerade eben</span>
            </span>
            <span className="line-clamp-2 text-fg-muted">
              {notificationText(n, { video: n.postIsVideo })}
            </span>
          </span>
          {n.postImageUrl ? (
            <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-bg-subtle">
              <img src={n.postImageUrl} alt="" className="h-full w-full object-cover" />
              {n.postIsVideo ? (
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-on-media">
                  <Play className="size-3.5" fill="currentColor" />
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      ),
      { duration: 6000 },
    );
  }

  return null;
}

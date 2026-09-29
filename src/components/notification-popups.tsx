/**
 * Pop-up for new notifications, wherever you are on the site. Watches the
 * unread count (shared with the nav badge) and shows what arrived since the
 * page was opened; tapping it opens the notifications page.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listNotifications,
  unreadNotificationCount,
  type NotificationItem,
} from "@/lib/vela/server";
import { notificationText } from "@/lib/vela/notification-text";

export function NotificationPopups({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const count = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => unreadNotificationCount(),
    enabled,
    refetchInterval: 20_000,
  });
  // Highest id already known; null until the first look (old ones never pop up).
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || count.data === undefined) return;
    let cancelled = false;
    void listNotifications()
      .then((list) => {
        if (cancelled) return;
        const top = list.reduce((m, n) => Math.max(m, n.id), 0);
        if (seen.current === null) {
          seen.current = top;
          return;
        }
        const fresh = list.filter((n) => n.id > seen.current! && !n.read).slice(0, 3);
        seen.current = Math.max(seen.current, top);
        // No pop-ups while the notifications page is open anyway.
        if (pathname === "/notifications") return;
        for (const n of fresh.reverse()) show(n);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Re-check whenever the unread count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, count.data]);

  function show(n: NotificationItem) {
    toast.custom(
      (id) => (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(id);
            void navigate({ to: "/notifications" });
          }}
          className="flex w-[min(92vw,360px)] items-center gap-3 rounded-2xl border border-border bg-bg-elevated/95 p-3 text-left text-fg shadow-2xl backdrop-blur-md"
        >
          <span className="size-10 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
            {n.actor?.avatarUrl ? (
              <img src={n.actor.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : n.actor ? (
              <span className="grid h-full w-full place-items-center text-sm">
                {n.actor.displayName.charAt(0)}
              </span>
            ) : (
              <img src="/icon.png" alt="" className="h-full w-full" />
            )}
          </span>
          <span className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold">{n.actor ? n.actor.displayName : "System"}</span>{" "}
            <span className="line-clamp-2 text-fg-muted">{notificationText(n)}</span>
          </span>
          {n.postImageUrl ? (
            <img src={n.postImageUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          ) : null}
        </button>
      ),
      { duration: 6000 },
    );
  }

  return null;
}

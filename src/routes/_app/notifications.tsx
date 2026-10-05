import { useEffect, useState } from "react";
import { PostViewerLoader } from "@/components/post-viewer-loader";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, ShieldAlert, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteNotifications,
  listNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/lib/vela/server";
import { memberErrorMessage } from "@/lib/vela/errors";
import { notificationText } from "@/lib/vela/notification-text";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({ component: Notifications });

const relative = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
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

const text = notificationText;

const ICONS = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: ShieldAlert,
  reply: MessageCircle,
  comment_like: Heart,
};

function Notifications() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications() });

  // Opening the page marks everything as read.
  const hasUnread = (query.data ?? []).some((n) => !n.read);
  useEffect(() => {
    if (!hasUnread) return;
    void markNotificationsRead().then(() =>
      queryClient.invalidateQueries({ queryKey: ["notif-count"] }),
    );
  }, [hasUnread, queryClient]);

  const [busy, setBusy] = useState(false);
  const [openPost, setOpenPost] = useState<number | null>(null);
  async function remove(id?: number) {
    if (id === undefined && !window.confirm("Alle Mitteilungen löschen?")) return;
    setBusy(true);
    // Drop them from the list right away; the server call follows.
    queryClient.setQueryData<NotificationItem[]>(["notifications"], (list) =>
      id === undefined ? [] : (list ?? []).filter((n) => n.id !== id),
    );
    try {
      await deleteNotifications({ data: id === undefined ? {} : { id } });
    } catch (err) {
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
    } finally {
      setBusy(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notif-count"] }),
      ]);
    }
  }
  const hasAny = (query.data ?? []).length > 0;

  return (
    <div className="mx-auto max-w-xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Für dich</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl">Mitteilungen</h1>
        {hasAny ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted hover:text-heart"
          >
            <Trash2 className="size-4" />
            Alle löschen
          </button>
        ) : null}
      </div>

      {query.isPending ? (
        <Skeleton className="mt-6 h-40 w-full" />
      ) : (query.data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-fg-muted">Noch nichts Neues.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {(query.data ?? []).map((n) => {
            const Icon = ICONS[n.kind];
            return (
              <li key={n.id} className={cn("flex gap-3 py-3", !n.read && "font-medium")}>
                <div className="relative size-11 shrink-0">
                  {n.actor ? (
                    <Link
                      to="/u/$handle"
                      params={{ handle: n.actor.handle }}
                      className="block size-11 overflow-hidden rounded-full bg-bg-subtle"
                    >
                      {n.actor.avatarUrl ? (
                        <img
                          src={n.actor.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-sm">
                          {n.actor.displayName.charAt(0)}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <img src="/icon.png" alt="" className="size-11 rounded-full" />
                  )}
                  <span
                    className={cn(
                      "absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-bg",
                      n.kind === "like" || n.kind === "comment_like"
                        ? "bg-heart text-white"
                        : "bg-accent text-accent-fg",
                    )}
                  >
                    <Icon className="size-2.5" strokeWidth={2.5} />
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="leading-snug break-words">
                    {n.actor ? (
                      <Link
                        to="/u/$handle"
                        params={{ handle: n.actor.handle }}
                        className="font-semibold"
                      >
                        {n.actor.displayName}
                      </Link>
                    ) : (
                      <span className="font-semibold">System</span>
                    )}{" "}
                    <span className={n.read ? "text-fg-muted" : ""}>{text(n)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{timeAgo(n.createdAt)}</p>
                </div>
                {n.postImageUrl && n.postId ? (
                  <button
                    type="button"
                    onClick={() => setOpenPost(n.postId)}
                    aria-label="Beitrag öffnen"
                    className="size-11 shrink-0 overflow-hidden rounded-md"
                  >
                    <img src={n.postImageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ) : null}
                {!n.read ? (
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-heart" aria-label="Neu" />
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(n.id)}
                  aria-label="Mitteilung löschen"
                  title="Löschen"
                  className="-my-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-fg-subtle hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {openPost !== null ? (
        <PostViewerLoader postId={openPost} onClose={() => setOpenPost(null)} />
      ) : null}
    </div>
  );
}

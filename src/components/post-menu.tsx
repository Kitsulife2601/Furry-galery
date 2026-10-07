/** The ⋯ menu on a post: tell the feed what you want to see, download, report. */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, EyeOff, Flag, Link2, MoreHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { setPostInterest } from "@/lib/vela/server";
import { copyPostLink } from "@/lib/vela/share-post";
import { useEscapeLayer } from "@/lib/vela/use-overlay";
import type { PostCard } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

async function downloadPost(post: PostCard) {
  const url = post.videoUrl ?? post.imageUrl;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.replace("quicktime", "mov").replace("jpeg", "jpg");
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `furry-gallery-${post.author.handle}-${post.id}${ext ? `.${ext}` : ""}`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function hideFromFeed(queryClient: ReturnType<typeof useQueryClient>, id: number) {
  // Both the first feed page and the pages loaded later.
  for (const key of [["feed"], ["feed-more"]]) {
    queryClient.setQueriesData<PostCard[]>({ queryKey: key }, (old) =>
      Array.isArray(old) ? old.filter((p) => p.id !== id) : old,
    );
  }
}

export function PostMenu({
  post,
  onReport,
  onHidden,
  direction = "down",
  className,
}: {
  post: PostCard;
  /** Shown as "Melden" for other people's posts. */
  onReport?: () => void;
  /** Called after "Nicht interessiert" (e.g. to close a viewer). */
  onHidden?: () => void;
  direction?: "down" | "up";
  className?: string;
}) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwn = Boolean(userId) && userId === post.userId;

  useEscapeLayer(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, open);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  /** ↑/↓ moves between the items, Tab leaves the menu. */
  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === "ArrowDown" ? at + 1 : at - 1;
      items[(next + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  function requireProfile(): boolean {
    if (profile) return true;
    toast.error("Anmelden und Profil anlegen, damit „Für dich“ lernt, was dir gefällt.");
    void navigate({ to: userId ? "/profile" : "/login" });
    return false;
  }

  async function interest(value: 1 | -1) {
    setOpen(false);
    if (!requireProfile()) return;
    try {
      await setPostInterest({ data: { postId: post.id, value } });
      if (value < 0) {
        hideFromFeed(queryClient, post.id);
        onHidden?.();
        toast("Du siehst weniger davon.", {
          action: {
            label: "Rückgängig",
            onClick: () =>
              void setPostInterest({ data: { postId: post.id, value: 0 } }).then(() =>
                queryClient.invalidateQueries({ queryKey: ["feed"] }),
              ),
          },
        });
      } else {
        toast.success("Alles klar — du siehst mehr davon.");
      }
    } catch (err) {
      toast.error(memberErrorMessage(err, "Das hat nicht geklappt."));
    }
  }

  const item =
    "flex h-11 w-full items-center gap-3 px-4 text-left text-sm text-fg outline-none hover:bg-bg-subtle focus-visible:bg-bg-subtle";

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Mehr"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Mehr"
        className={className}
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Beitrag"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onMenuKey}
          className={cn(
            "post-menu-pop absolute right-0 z-30 w-56 overflow-hidden rounded-xl border border-border bg-bg-elevated py-1 shadow-xl",
            direction === "down" ? "top-12" : "bottom-12",
          )}
        >
          {isOwn ? null : (
            <>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => void interest(1)}
              >
                <Sparkles className="size-4" /> Interessiert
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => void interest(-1)}
              >
                <EyeOff className="size-4" /> Nicht interessiert
              </button>
            </>
          )}
          {post.locked ? null : (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                void downloadPost(post);
              }}
            >
              <Download className="size-4" /> Herunterladen
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              void copyPostLink(post);
            }}
          >
            <Link2 className="size-4" /> Link kopieren
          </button>
          {!isOwn && onReport ? (
            <button
              type="button"
              role="menuitem"
              className={cn(item, "text-heart")}
              onClick={() => {
                setOpen(false);
                onReport();
              }}
            >
              <Flag className="size-4" /> Melden
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

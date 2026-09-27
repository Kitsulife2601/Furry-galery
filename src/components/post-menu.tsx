/** The ⋯ menu on a post: tell the feed what you want to see, download, report. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, EyeOff, Flag, MoreHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { setPostInterest } from "@/lib/vela/server";
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
  queryClient.setQueryData<PostCard[]>(["feed"], (old) => old?.filter((p) => p.id !== id));
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
  const isOwn = Boolean(userId) && userId === post.userId;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

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
    "flex h-11 w-full items-center gap-3 px-4 text-left text-sm text-fg hover:bg-bg-subtle";

  return (
    <div ref={ref} className="relative">
      <button
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
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-0 z-30 w-56 overflow-hidden rounded-xl border border-border bg-bg-elevated py-1 shadow-xl",
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

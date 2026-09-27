import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { toggleLike } from "@/lib/vela/server";
import { relationshipLabel, type PostCard } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

export function PostViewer({
  post,
  onClose,
  onChange,
}: {
  post: PostCard;
  onClose: () => void;
  onChange: (next: PostCard) => void;
}) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();

  async function like() {
    if (!profile) {
      toast.error("Anmelden und Profil anlegen, um zu liken.");
      void navigate({ to: userId ? "/profile" : "/login" });
      return;
    }
    try {
      const result = await toggleLike({ data: { postId: post.id } });
      onChange({ ...post, liked: result.liked, likeCount: result.likeCount });
    } catch (err) {
      toast.error(memberErrorMessage(err, "Like fehlgeschlagen."));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute top-4 right-4 grid size-11 place-items-center rounded-lg text-fg"
        onClick={onClose}
        aria-label="Schließen"
      >
        <X className="size-5" />
      </button>
      <div
        className="relative max-h-[90dvh] w-full max-w-md overflow-hidden rounded-2xl bg-bg-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={post.imageUrl}
          alt={post.caption || ""}
          className="max-h-[70dvh] w-full bg-bg object-contain"
        />
        <div className="flex items-start justify-between gap-3 p-4">
          <div>
            <Link
              to="/u/$handle"
              params={{ handle: post.author.handle }}
              className="font-medium"
              onClick={onClose}
            >
              @{post.author.handle}
            </Link>
            <p className="text-xs text-fg-muted">
              {post.author.age} · {relationshipLabel(post.author.relationshipStatus)}
            </p>
            {post.caption ? (
              <p className="mt-2 text-sm leading-snug">{post.caption}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void like()}
            className="flex min-h-11 min-w-11 flex-col items-center gap-1"
            aria-label="Like"
          >
            <Heart
              className={cn("size-6", post.liked && "fill-heart text-heart")}
            />
            <span className="text-xs tabular-nums">{post.likeCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

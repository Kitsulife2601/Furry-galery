import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { toggleLike } from "@/lib/vela/server";
import { relationshipLabel, type PostCard } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

export function FeedCard({
  post,
  onChange,
}: {
  post: PostCard;
  onChange: (next: PostCard) => void;
}) {
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(false);
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();

  async function like(forceOn = false) {
    if (!profile) {
      toast.error("Anmelden und Profil anlegen, um zu liken.");
      void navigate({ to: userId ? "/profile" : "/login" });
      return;
    }
    if (forceOn && post.liked) return;
    try {
      const result = await toggleLike({ data: { postId: post.id } });
      onChange({ ...post, liked: result.liked, likeCount: result.likeCount });
      if (result.liked) {
        setBurst(true);
        window.setTimeout(() => setBurst(false), 500);
      }
    } catch (err) {
      toast.error(memberErrorMessage(err, "Like fehlgeschlagen."));
    }
  }

  function onImageClick() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      void like(true);
    }
    lastTap.current = now;
  }

  return (
    <article className="feed-slide relative flex items-center justify-center bg-bg">
      <div className="relative h-full w-full max-w-lg overflow-hidden bg-bg-elevated md:max-h-[min(100dvh,920px)]">
        <button
          type="button"
          className="absolute inset-0 h-full w-full"
          onClick={onImageClick}
          aria-label="Doppeltippen zum Liken"
        >
          <img
            src={post.imageUrl}
            alt={post.caption || `Bild von ${post.author.displayName}`}
            className="h-full w-full object-cover"
          />
        </button>
        {burst ? (
          <Heart className="pointer-events-none absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 fill-on-media text-on-media drop-shadow-lg" />
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-bg/90 via-bg/40 to-transparent" />

        <div className="absolute right-4 bottom-24 z-10 flex flex-col items-center gap-4 text-on-media md:bottom-10">
          <Link
            to="/u/$handle"
            params={{ handle: post.author.handle }}
            className="size-12 overflow-hidden rounded-full border border-on-media/40"
            aria-label={`${post.author.displayName} öffnen`}
          >
            {post.author.avatarUrl ? (
              <img
                src={post.author.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center bg-bg-subtle text-sm">
                {post.author.displayName.charAt(0)}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => void like()}
            className="flex min-h-11 min-w-11 flex-col items-center gap-1"
            aria-label="Like"
          >
            <Heart
              className={cn("size-8", post.liked && "fill-heart text-heart")}
              strokeWidth={1.7}
            />
            <span className="text-xs tabular-nums">{post.likeCount}</span>
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-20 z-10 px-5 pb-2 text-on-media md:bottom-8">
          <Link
            to="/u/$handle"
            params={{ handle: post.author.handle }}
            className="font-medium"
          >
            @{post.author.handle}
          </Link>
          <p className="mt-0.5 text-xs text-on-media/70">
            {post.author.age} · {relationshipLabel(post.author.relationshipStatus)}
          </p>
          {post.caption ? (
            <p className="mt-2 max-w-[80%] text-sm leading-snug">{post.caption}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

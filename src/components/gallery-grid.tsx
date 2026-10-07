import { useState, type ReactNode } from "react";
import { Heart, ImageOff, Play } from "lucide-react";
import type { PostCard } from "@/lib/vela/types";
import { PostViewer } from "@/components/post-viewer";
import { Fsk18Badge, PostImage } from "@/components/fsk18";
import { Skeleton } from "@/components/ui/skeleton";

function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k`;
  return `${Math.round(n / 1000)}k`;
}

function tileLabel(post: PostCard): string {
  const kind = post.videoUrl ? "Video" : "Bild";
  if (post.locked) return `FSK-18-${kind} von @${post.author.handle} (gesperrt)`;
  const likes = post.likeCount === 1 ? "1 Like" : `${post.likeCount} Likes`;
  return `${kind} von @${post.author.handle} öffnen · ${likes}`;
}

export function GalleryGrid({
  posts,
  emptyLabel,
  empty,
}: {
  posts: PostCard[];
  emptyLabel: string;
  /** Richer empty state (replaces `emptyLabel`). */
  empty?: ReactNode;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  // Read the open post from the live list, so likes and deletes show up at once.
  const active = posts.find((p) => p.id === activeId) ?? null;

  if (posts.length === 0) {
    return (
      empty ?? (
        <div className="flex flex-col items-center px-5 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-bg-subtle text-fg-subtle">
            <ImageOff className="size-5" strokeWidth={1.7} aria-hidden />
          </span>
          <p className="mt-3 text-sm text-fg-muted">{emptyLabel}</p>
        </div>
      )
    );
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-1 px-1 pb-3 md:gap-1.5 md:px-5">
        {posts.map((post, index) => (
          <li
            key={post.id}
            className="gallery-cell overflow-hidden rounded-md bg-bg-subtle md:rounded-lg"
            // Only the first screen staggers in; later pages ("Mehr laden") appear calmly.
            style={{ animationDelay: `${Math.min(index % 30, 14) * 36}ms` }}
          >
            <button
              type="button"
              className="gallery-tile group relative block aspect-3/4 w-full overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              onClick={() => setActiveId(post.id)}
              aria-label={tileLabel(post)}
            >
              <PostImage post={post} className="h-full w-full" alt="" />
              {post.nsfw ? <Fsk18Badge locked={post.locked} /> : null}
              {post.videoUrl ? (
                <span className="pointer-events-none absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/45 backdrop-blur-sm">
                  <Play className="size-3 translate-x-px fill-on-media text-on-media" aria-hidden />
                </span>
              ) : null}
              {post.likeCount > 0 || post.liked ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-linear-to-t from-black/55 via-black/15 to-transparent px-1.5 pt-6 pb-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-on-media tabular-nums drop-shadow">
                    <Heart
                      aria-hidden
                      className={
                        post.liked ? "size-3 fill-heart text-heart" : "size-3 fill-on-media/90"
                      }
                    />
                    {compactCount(post.likeCount)}
                  </span>
                </span>
              ) : null}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-fg/0 transition-colors duration-300 group-hover:bg-black/10"
              />
            </button>
          </li>
        ))}
      </ul>
      {active ? <PostViewer post={active} onClose={() => setActiveId(null)} /> : null}
    </>
  );
}

/** Placeholder grid in the same shape as `GalleryGrid`. */
export function GalleryGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-3 gap-1 px-1 pb-3 md:gap-1.5 md:px-5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <Skeleton className="aspect-3/4 rounded-md md:rounded-lg" />
        </li>
      ))}
    </ul>
  );
}

import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { PostCard } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

/**
 * Post image that respects FSK18 locking. A locked post only carries a ~16px
 * preview from the server; blowing it up blurred makes it unrecognisable.
 */
export function PostImage({
  post,
  className,
  alt,
}: {
  post: PostCard;
  className?: string;
  alt?: string;
}) {
  if (post.locked) {
    return (
      <span className={cn("block overflow-hidden bg-bg-subtle", className)}>
        {post.imageUrl ? (
          <img
            src={post.imageUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-125 object-cover blur-2xl"
          />
        ) : null}
      </span>
    );
  }
  return (
    <img
      src={post.imageUrl}
      alt={alt ?? post.caption ?? ""}
      loading="lazy"
      decoding="async"
      className={cn("object-cover", className)}
    />
  );
}

/** Small corner badge for grid tiles. */
export function Fsk18Badge({ locked }: { locked: boolean }) {
  return (
    <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-bg/80 px-1.5 py-0.5 text-[10px] font-semibold text-fg">
      {locked ? <Lock className="size-3" /> : null}
      18+
    </span>
  );
}

/** Centered notice over a locked image, with the way to unlock it. */
export function Fsk18Notice({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6 text-center text-on-media">
      <div className="max-w-xs">
        <Lock className="mx-auto size-8" strokeWidth={1.7} />
        <p className="mt-3 font-display text-2xl">FSK 18</p>
        <p className="mt-2 text-sm text-on-media/80">
          Nur für Mitglieder, die sich in unserem Discord verifiziert haben.
        </p>
        <Link
          to="/settings"
          hash="fsk18"
          onClick={onNavigate}
          className="pointer-events-auto mt-5 inline-flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Freischalten
        </Link>
      </div>
    </div>
  );
}

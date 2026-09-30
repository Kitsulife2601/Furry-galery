import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { patchPostInCaches } from "@/lib/vela/post-cache";
import { recordView, toggleLike } from "@/lib/vela/server";
import { relationshipLabel, type PostCard } from "@/lib/vela/types";
import { ReportDialog } from "@/components/report-dialog";
import { Fsk18Badge, Fsk18Notice, PostImage } from "@/components/fsk18";
import { FittedImage } from "@/components/fitted-image";
import { FeedVideo } from "@/components/post-video";
import { PostViewer } from "@/components/post-viewer";
import { PostMenu } from "@/components/post-menu";
import { Caption } from "@/components/caption";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { DecoratedAvatar } from "@/components/avatar-decoration";
import { cn } from "@/lib/utils";

export function FeedCard({ post, spotlight = false }: { post: PostCard; spotlight?: boolean }) {
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const slideRef = useRef<HTMLElement>(null);

  // Count a view once the slide has been mostly on screen for 1.5 s; the
  // "Für dich" ranking learns from it. Only for members, only once.
  useEffect(() => {
    const el = slideRef.current;
    if (!el || !profile || post.locked || typeof IntersectionObserver === "undefined") return;
    let timer: number | undefined;
    let done = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer);
        if (done || !entry?.isIntersecting) return;
        timer = window.setTimeout(() => {
          done = true;
          observer.disconnect();
          void recordView({ data: { postId: post.id } }).catch(() => undefined);
        }, 1500);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [post.id, post.locked, profile]);

  function requireProfile(action: string): boolean {
    if (profile) return true;
    toast.error(`Anmelden und Profil anlegen, um zu ${action}.`);
    void navigate({ to: userId ? "/profile" : "/login" });
    return false;
  }

  async function like(forceOn = false) {
    if (!requireProfile("liken")) return;
    if (forceOn && post.liked) return;
    try {
      const result = await toggleLike({ data: { postId: post.id } });
      patchPostInCaches(queryClient, { ...post, liked: result.liked, likeCount: result.likeCount });
      if (result.liked) {
        setBurst(true);
        window.setTimeout(() => setBurst(false), 780);
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
    <article ref={slideRef} className="feed-slide relative flex items-center justify-center bg-bg">
      <div className="feed-frame relative h-full w-full max-w-lg overflow-hidden bg-bg-elevated md:max-h-[min(100dvh,920px)]">
        {post.locked ? (
          <>
            <PostImage post={post} className="absolute inset-0 h-full w-full" />
            <Fsk18Notice />
          </>
        ) : (
          <button
            type="button"
            className="absolute inset-0 h-full w-full"
            onClick={onImageClick}
            aria-label="Doppeltippen zum Liken"
          >
            {post.videoUrl ? (
              <FeedVideo
                src={post.videoUrl}
                poster={post.imageUrl}
                label={post.caption || `Video von ${post.author.displayName}`}
                className="h-full w-full"
              />
            ) : (
              <FittedImage
                src={post.imageUrl}
                alt={post.caption || `Bild von ${post.author.displayName}`}
                className="h-full w-full"
                alive
              />
            )}
          </button>
        )}
        {post.nsfw ? <Fsk18Badge locked={post.locked} /> : null}
        {spotlight ? (
          <p className="pointer-events-none absolute top-28 left-4 z-10 rounded-full bg-bg/60 px-2.5 py-1 text-[11px] tracking-wide text-on-media backdrop-blur-md">
            Heute im Licht
          </p>
        ) : null}
        {burst ? (
          <>
            <span className="heart-burst-ring pointer-events-none absolute top-1/2 left-1/2 size-28 rounded-full border border-on-media/70" />
            <Heart className="heart-burst pointer-events-none absolute top-1/2 left-1/2 size-20 fill-on-media text-on-media drop-shadow-[0_10px_24px_rgb(0_0_0/0.35)]" />
          </>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-bg/90 via-bg/40 to-transparent" />

        <div className="absolute right-4 bottom-24 z-10 flex flex-col items-center gap-4 text-on-media md:bottom-10">
          <Link
            to="/u/$handle"
            params={{ handle: post.author.handle }}
            className="size-12"
            aria-label={`${post.author.displayName} öffnen`}
          >
            <DecoratedAvatar
              src={post.author.avatarUrl}
              name={post.author.displayName}
              decoration={post.author.decoration}
              className="size-12"
              imgClassName="border border-on-media/40"
              letterClassName="text-sm"
            />
          </Link>
          <button
            type="button"
            onClick={() => void like()}
            disabled={post.locked}
            className="flex min-h-11 min-w-11 flex-col items-center gap-1 disabled:opacity-40"
            aria-label="Like"
          >
            <Heart
              className={cn(
                "nav-icon size-8",
                post.liked && "fill-heart text-heart",
                burst && "like-pop",
              )}
              strokeWidth={1.7}
            />
            <span className="text-xs tabular-nums">{post.likeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewing(true)}
            disabled={post.locked}
            className="flex min-h-11 min-w-11 flex-col items-center gap-1 disabled:opacity-40"
            aria-label="Kommentare"
          >
            <MessageCircle className="size-7" strokeWidth={1.7} />
            <span className="text-xs tabular-nums">{post.commentCount}</span>
          </button>
          <PostMenu
            post={post}
            direction="up"
            onReport={() => {
              if (requireProfile("melden")) setReporting(true);
            }}
            className="grid min-h-11 min-w-11 place-items-center"
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 px-5 pr-20 pb-2 text-on-media md:bottom-8">
          <Link
            to="/u/$handle"
            params={{ handle: post.author.handle }}
            className="pointer-events-auto font-medium"
          >
            <NamePlate plate={post.author.namePlate}>
              <StyledName text={`@${post.author.handle}`} nameStyle={post.author.nameStyle} />
            </NamePlate>
          </Link>
          <p className="mt-0.5 text-xs text-on-media/70">
            {post.author.age} · {relationshipLabel(post.author.relationshipStatus)}
          </p>
          {post.caption ? <Caption text={post.caption} className="mt-2" /> : null}
        </div>
      </div>
      {reporting ? <ReportDialog postId={post.id} onClose={() => setReporting(false)} /> : null}
      {viewing ? <PostViewer post={post} onClose={() => setViewing(false)} /> : null}
    </article>
  );
}

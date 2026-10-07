import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Heart, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { patchPostInCaches } from "@/lib/vela/post-cache";
import { recordView, toggleFollow, toggleLike } from "@/lib/vela/server";
import { listFollowingHandles } from "@/lib/vela/feed-api";
import { FOLLOWING_KEY, isFeedShortcut } from "@/lib/vela/feed-prefs";
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

/** Show "mehr" only when the caption is likely to be cut off. */
function isLongCaption(text: string) {
  return text.length > 110 || text.split("\n").length > 3;
}

export function FeedCard({
  post,
  spotlight = false,
  eager = false,
  active = false,
}: {
  post: PostCard;
  spotlight?: boolean;
  /** First slides: load the image right away. */
  eager?: boolean;
  /** The slide on screen: gets the keyboard shortcuts (L, Leertaste). */
  active?: boolean;
}) {
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pauseSignal, setPauseSignal] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const slideRef = useRef<HTMLElement>(null);

  const isOwn = Boolean(userId) && userId === post.userId;
  const following = useQuery({
    queryKey: FOLLOWING_KEY,
    queryFn: () => listFollowingHandles(),
    enabled: Boolean(profile),
    staleTime: 5 * 60_000,
  });
  // Guests see the button too (it leads to sign-up); members once we know.
  const showFollow =
    !isOwn &&
    (justFollowed ||
      (profile ? following.isSuccess && !following.data.includes(post.author.handle) : true));

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

  const burstTimer = useRef<number | undefined>(undefined);
  const liking = useRef(false);
  async function like(forceOn = false) {
    if (post.locked || !requireProfile("liken")) return;
    if (forceOn && post.liked) {
      // Double tap on an already liked post: just the heart, no unlike.
      showBurst();
      return;
    }
    if (liking.current) return;
    liking.current = true;
    try {
      const result = await toggleLike({ data: { postId: post.id } });
      patchPostInCaches(queryClient, { ...post, liked: result.liked, likeCount: result.likeCount });
      if (result.liked) showBurst();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Like fehlgeschlagen."));
    } finally {
      liking.current = false;
    }
  }

  function showBurst() {
    window.clearTimeout(burstTimer.current);
    setBurst(true);
    burstTimer.current = window.setTimeout(() => setBurst(false), 780);
  }

  async function follow() {
    if (!requireProfile("folgen") || followBusy) return;
    setFollowBusy(true);
    try {
      const result = await toggleFollow({ data: { handle: post.author.handle } });
      queryClient.setQueryData<string[]>(FOLLOWING_KEY, (old = []) =>
        result.following
          ? [...new Set([...old, post.author.handle])]
          : old.filter((h) => h !== post.author.handle),
      );
      if (result.following) {
        setJustFollowed(true);
        toast.success(`Du folgst jetzt @${post.author.handle}.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["profile", post.author.handle] });
    } catch (err) {
      toast.error(memberErrorMessage(err, "Folgen fehlgeschlagen."));
    } finally {
      setFollowBusy(false);
    }
  }

  // The "Gefolgt" check fades out after a moment.
  useEffect(() => {
    if (!justFollowed) return;
    const t = window.setTimeout(() => setJustFollowed(false), 1600);
    return () => window.clearTimeout(t);
  }, [justFollowed]);

  // Keyboard on the slide that is on screen: L likes, Leertaste pauses a video.
  const likeRef = useRef(like);
  likeRef.current = like;
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (!isFeedShortcut(e)) return;
      const key = e.key.toLowerCase();
      if (key === "l") {
        e.preventDefault();
        void likeRef.current();
      } else if (key === " " && post.videoUrl && !post.locked) {
        // Space on a focused button keeps its normal meaning.
        if ((e.target as HTMLElement | null)?.closest("button, a, [role='button']")) return;
        e.preventDefault();
        setPauseSignal((n) => n + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, post.videoUrl, post.locked]);

  // One tap opens the post big (with comments), a double tap likes it.
  const tapTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(tapTimer.current);
      window.clearTimeout(burstTimer.current);
    },
    [],
  );
  function onImageClick() {
    const now = Date.now();
    window.clearTimeout(tapTimer.current);
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      void like(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => setViewing(true), 290);
  }

  const kind = post.videoUrl ? "Video" : "Bild";

  return (
    <article
      ref={slideRef}
      className="feed-slide relative flex items-center justify-center"
      aria-label={`${kind} von ${post.author.displayName}`}
    >
      <div className="feed-stage relative flex h-full w-full max-w-lg items-end justify-center md:h-auto md:w-auto md:max-w-none md:gap-4">
        <div className="feed-frame relative h-full w-full overflow-hidden bg-bg-elevated">
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
              aria-label="Antippen zum Öffnen, doppelt tippen zum Liken"
            >
              {post.videoUrl ? (
                <FeedVideo
                  src={post.videoUrl}
                  poster={post.imageUrl}
                  label={post.caption || `Video von ${post.author.displayName}`}
                  className="h-full w-full"
                  hold={viewing || reporting}
                  pauseSignal={pauseSignal}
                />
              ) : (
                <FittedImage
                  src={post.imageUrl}
                  alt={post.caption || `Bild von ${post.author.displayName}`}
                  className="h-full w-full"
                  eager={eager}
                  alive
                />
              )}
            </button>
          )}
          {post.nsfw ? <Fsk18Badge locked={post.locked} /> : null}
          {spotlight ? (
            <p className="spotlight-chip pointer-events-none absolute top-28 left-4 z-10 flex items-center gap-1.5 rounded-full bg-bg/60 px-2.5 py-1 text-[11px] tracking-wide text-on-media backdrop-blur-md md:top-5">
              <span aria-hidden="true">✦</span> Heute im Licht
            </p>
          ) : null}
          {burst ? (
            <>
              <span className="heart-burst-ring pointer-events-none absolute top-1/2 left-1/2 size-28 rounded-full border border-on-media/70" />
              <Heart className="heart-burst pointer-events-none absolute top-1/2 left-1/2 size-20 fill-on-media text-on-media drop-shadow-[0_10px_24px_rgb(0_0_0/0.35)]" />
            </>
          ) : null}

          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-bg/90 via-bg/45 to-transparent transition-[height] duration-300",
              expanded ? "h-3/4" : "h-2/5",
            )}
          />

          {/* Author + caption */}
          <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 px-4 pr-20 pb-2 text-on-media md:bottom-0 md:px-5 md:pr-5 md:pb-5">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                to="/u/$handle"
                params={{ handle: post.author.handle }}
                className="pointer-events-auto min-w-0 truncate font-medium"
              >
                <NamePlate plate={post.author.namePlate}>
                  <StyledName text={`@${post.author.handle}`} nameStyle={post.author.nameStyle} />
                </NamePlate>
              </Link>
              {showFollow ? (
                <button
                  type="button"
                  onClick={() => void follow()}
                  disabled={followBusy || justFollowed}
                  className="pointer-events-auto -my-2 inline-flex min-h-11 shrink-0 items-center"
                  aria-label={
                    justFollowed
                      ? `Du folgst @${post.author.handle}`
                      : `@${post.author.handle} folgen`
                  }
                >
                  <span
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium backdrop-blur-md transition-colors",
                      justFollowed
                        ? "border-on-media/30 bg-bg/40 text-on-media"
                        : "border-on-media/50 bg-bg/30 text-on-media hover:bg-on-media hover:text-bg",
                    )}
                  >
                    {justFollowed ? (
                      <>
                        <Check className="size-3.5" /> Gefolgt
                      </>
                    ) : (
                      <>
                        <Plus className="size-3.5" /> Folgen
                      </>
                    )}
                  </span>
                </button>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-on-media/70">
              {post.author.displayName} · {post.author.age} ·{" "}
              {relationshipLabel(post.author.relationshipStatus)}
            </p>
            {post.caption ? (
              <div
                className={cn(
                  "mt-2",
                  expanded &&
                    "pointer-events-auto max-h-[40dvh] overflow-y-auto overscroll-contain",
                )}
              >
                <Caption text={post.caption} className={expanded ? "" : "line-clamp-3"} />
                {isLongCaption(post.caption) ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="pointer-events-auto -my-2 min-h-11 text-xs font-medium text-on-media/80 hover:text-on-media"
                    aria-expanded={expanded}
                  >
                    {expanded ? "weniger" : "mehr"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Actions: over the image on phones, beside the card on bigger screens. */}
        <div className="feed-rail absolute right-3 bottom-24 z-10 flex flex-col items-center gap-3 text-on-media md:static md:pb-4">
          <Link
            to="/u/$handle"
            params={{ handle: post.author.handle }}
            className="relative mb-1 size-12"
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
            className="feed-rail-btn flex min-h-11 min-w-11 flex-col items-center gap-1 disabled:opacity-40"
            aria-label={post.liked ? "Like entfernen" : "Liken"}
            aria-pressed={post.liked}
            title="Liken (L)"
          >
            <span className="feed-rail-icon grid place-items-center">
              <Heart
                className={cn(
                  "nav-icon size-8 md:size-6",
                  post.liked && "fill-heart text-heart",
                  burst && "like-pop",
                )}
                strokeWidth={1.7}
              />
            </span>
            <span className="text-xs tabular-nums">{post.likeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewing(true)}
            disabled={post.locked}
            className="feed-rail-btn flex min-h-11 min-w-11 flex-col items-center gap-1 disabled:opacity-40"
            aria-label={`Kommentare (${post.commentCount})`}
          >
            <span className="feed-rail-icon grid place-items-center">
              <MessageCircle className="size-7 md:size-6" strokeWidth={1.7} />
            </span>
            <span className="text-xs tabular-nums">{post.commentCount}</span>
          </button>
          <span className="feed-rail-icon grid place-items-center">
            <PostMenu
              post={post}
              direction="up"
              onReport={() => {
                if (requireProfile("melden")) setReporting(true);
              }}
              className="grid min-h-11 min-w-11 place-items-center"
            />
          </span>
        </div>
      </div>
      {reporting ? (
        <ReportDialog
          postId={post.id}
          isVideo={Boolean(post.videoUrl)}
          onClose={() => setReporting(false)}
        />
      ) : null}
      {viewing ? <PostViewer post={post} onClose={() => setViewing(false)} /> : null}
    </article>
  );
}

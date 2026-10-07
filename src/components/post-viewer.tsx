import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  Maximize2,
  MessageCircle,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { patchPostInCaches, removePostFromCaches } from "@/lib/vela/post-cache";
import { fullDateTime, relativeTime } from "@/lib/vela/relative-time";
import { deletePost, toggleLike } from "@/lib/vela/server";
import { sharePost } from "@/lib/vela/share-post";
import { relationshipLabel, type PostCard } from "@/lib/vela/types";
import { useEscapeLayer, useModalBehaviour } from "@/lib/vela/use-overlay";
import { ReportDialog } from "@/components/report-dialog";
import { Fsk18Badge, Fsk18Notice, PostImage } from "@/components/fsk18";
import { Comments } from "@/components/comments";
import { PostMenu } from "@/components/post-menu";
import { Caption } from "@/components/caption";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { DecoratedAvatar } from "@/components/avatar-decoration";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "VIDEO" ||
      el.isContentEditable),
  );
}

export function PostViewer({
  post,
  onClose,
  onPrev,
  onNext,
}: {
  post: PostCard;
  onClose: () => void;
  /** Opened from a grid: ← / previous post. Omit when there is none. */
  onPrev?: () => void;
  /** Opened from a grid: → / next post. Omit when there is none. */
  onNext?: () => void;
}) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [burst, setBurst] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const likeBusy = useRef(false);
  const clickTimer = useRef<number | null>(null);
  const isOwn = Boolean(userId) && userId === post.userId;
  const noun = post.videoUrl ? "Video" : "Bild";

  useModalBehaviour();
  const isTop = useEscapeLayer(onClose);

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, []);

  // Stepping through a grid: start each post at the top.
  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
    asideRef.current?.scrollTo({ top: 0 });
    setZoomed(false);
  }, [post.id]);

  useEffect(() => {
    if (!onPrev && !onNext) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || !isTop()) return;
      if (isTyping(e.target)) return;
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext, isTop]);

  useEffect(
    () => () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
    },
    [],
  );

  function requireProfile(action: string): boolean {
    if (profile) return true;
    toast.error(`Anmelden und Profil anlegen, um zu ${action}.`);
    onClose();
    void navigate({ to: userId ? "/profile" : "/login" });
    return false;
  }

  async function like(force?: boolean) {
    if (post.locked || likeBusy.current) return;
    if (!requireProfile("liken")) return;
    // Double-tap only ever likes, it never takes a like back.
    if (force && post.liked) return;
    likeBusy.current = true;
    const before = post;
    patchPostInCaches(queryClient, {
      ...post,
      liked: !post.liked,
      likeCount: Math.max(0, post.likeCount + (post.liked ? -1 : 1)),
    });
    try {
      const result = await toggleLike({ data: { postId: post.id } });
      patchPostInCaches(queryClient, {
        ...before,
        liked: result.liked,
        likeCount: result.likeCount,
      });
    } catch (err) {
      patchPostInCaches(queryClient, before);
      toast.error(memberErrorMessage(err, "Like fehlgeschlagen."));
    } finally {
      likeBusy.current = false;
    }
  }

  /** One click/tap zooms, a double one likes (with a little heart). */
  function onMediaClick() {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      setBurst((b) => b + 1);
      void like(true);
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      setZoomed(true);
    }, 260);
  }

  async function remove() {
    if (!window.confirm(`Dieses ${noun} endgültig löschen?`)) return;
    setDeleting(true);
    try {
      await deletePost({ data: { id: post.id } });
      removePostFromCaches(queryClient, post.id);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Gelöscht.");
      onClose();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
      setDeleting(false);
    }
  }

  function report() {
    if (requireProfile("melden")) setReporting(true);
  }

  /** Keep Tab inside the viewer. */
  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !sheetRef.current) return;
    const items = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === sheetRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const iconButton =
    "grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg disabled:opacity-40";

  const header = (
    <header className="flex items-center gap-3 py-2 pr-2 pl-4">
      <Link
        to="/u/$handle"
        params={{ handle: post.author.handle }}
        onClick={onClose}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1"
      >
        <DecoratedAvatar
          src={post.author.avatarUrl}
          name={post.author.displayName}
          decoration={post.author.decoration}
          className="size-10"
          letterClassName="text-base"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            <NamePlate plate={post.author.namePlate}>
              <StyledName text={`@${post.author.handle}`} nameStyle={post.author.nameStyle} />
            </NamePlate>
          </span>
          <span className="block truncate text-xs text-fg-muted">
            {post.author.age} · {relationshipLabel(post.author.relationshipStatus)}
          </span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center">
        {post.locked ? null : (
          <PostMenu post={post} onHidden={onClose} onReport={report} className={iconButton} />
        )}
        {isOwn && !post.locked ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleting}
            className={cn(iconButton, "hover:text-heart")}
            aria-label={`${noun} löschen`}
            title="Löschen"
          >
            <Trash2 className="size-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className={cn(iconButton, "ml-1 text-fg")}
          aria-label="Schließen"
          title="Schließen (Esc)"
        >
          <X className="size-5" />
        </button>
      </div>
    </header>
  );

  const navButton =
    "viewer-nav absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-bg-elevated/80 text-fg shadow-lg backdrop-blur md:grid";

  return (
    <>
      <div
        className="viewer-backdrop fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4 md:px-20 md:py-8"
        onClick={onClose}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-label={`${noun} von @${post.author.handle}`}
      >
        {onPrev ? (
          <button
            type="button"
            className={cn(navButton, "left-4")}
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            aria-label="Vorheriger Beitrag"
            title="Vorheriger (←)"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : null}
        {onNext ? (
          <button
            type="button"
            className={cn(navButton, "right-4")}
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            aria-label="Nächster Beitrag"
            title="Nächster (→)"
          >
            <ChevronRight className="size-6" />
          </button>
        ) : null}
        <div
          ref={sheetRef}
          tabIndex={-1}
          className="viewer-sheet relative flex h-dvh w-full flex-col overflow-y-auto overscroll-contain bg-bg-elevated outline-none sm:h-auto sm:max-h-[92dvh] sm:max-w-lg sm:rounded-3xl md:h-[min(88dvh,880px)] md:max-h-none md:max-w-6xl md:flex-row md:overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-20 border-b border-border bg-bg-elevated/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
            {header}
          </div>

          <div className="viewer-media relative flex shrink-0 items-center justify-center overflow-hidden bg-bg md:min-w-0 md:flex-1 md:shrink">
            {post.locked ? (
              <div className="relative aspect-3/4 max-h-[70dvh] w-full md:h-full md:max-h-none">
                <PostImage post={post} className="h-full w-full" />
                <Fsk18Notice onNavigate={onClose} />
              </div>
            ) : post.videoUrl ? (
              <video
                key={post.id}
                src={post.videoUrl}
                poster={post.imageUrl}
                controls
                autoPlay
                loop
                playsInline
                className="relative max-h-[70dvh] w-full object-contain md:h-full md:max-h-none"
              />
            ) : (
              <>
                <img
                  src={post.imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="viewer-ambient pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={onMediaClick}
                  className="relative block h-full w-full cursor-zoom-in"
                  aria-label={`${noun} vergrößern (doppelt tippen zum Liken)`}
                >
                  <img
                    key={post.id}
                    src={post.imageUrl}
                    alt={post.caption || `${noun} von @${post.author.handle}`}
                    draggable={false}
                    className="viewer-image mx-auto max-h-[70dvh] w-full object-contain select-none md:h-full md:max-h-none"
                  />
                </button>
                {burst ? (
                  <Heart
                    key={burst}
                    className="viewer-heart-burst pointer-events-none absolute top-1/2 left-1/2 size-24 fill-heart text-heart"
                    aria-hidden="true"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setZoomed(true)}
                  className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-bg/70 text-fg backdrop-blur hover:bg-bg/90"
                  aria-label="Vollbild"
                  title="Vollbild"
                >
                  <Maximize2 className="size-4" />
                </button>
              </>
            )}
            {post.nsfw && !post.locked ? <Fsk18Badge locked={false} /> : null}
          </div>

          <aside
            ref={asideRef}
            className="flex min-w-0 flex-1 flex-col md:w-[400px] md:flex-none md:overflow-y-auto md:overscroll-contain md:border-l md:border-border"
          >
            <div className="sticky top-0 z-20 hidden border-b border-border bg-bg-elevated/95 backdrop-blur md:block">
              {header}
            </div>
            <div className="px-4 pt-3 pb-2">
              {post.caption ? <Caption text={post.caption} onNavigate={onClose} /> : null}
              {post.createdAt ? (
                <time
                  dateTime={post.createdAt}
                  title={fullDateTime(post.createdAt)}
                  className={cn("block text-xs text-fg-subtle", post.caption && "mt-2")}
                >
                  {relativeTime(post.createdAt)}
                </time>
              ) : null}
              <div className="mt-2 -ml-2.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void like()}
                  disabled={post.locked}
                  aria-pressed={post.liked}
                  aria-label={post.liked ? "Like entfernen" : "Liken"}
                  className="flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-2.5 text-sm hover:bg-bg-subtle disabled:opacity-40"
                >
                  <Heart
                    className={cn(
                      "size-6 transition-transform",
                      post.liked && "viewer-heart-on fill-heart text-heart",
                    )}
                  />
                  <span className="tabular-nums">{post.likeCount}</span>
                </button>
                {post.locked ? null : (
                  <button
                    type="button"
                    onClick={() => composerRef.current?.focus()}
                    aria-label="Kommentieren"
                    className="flex min-h-11 min-w-11 items-center gap-1.5 rounded-full px-2.5 text-sm hover:bg-bg-subtle"
                  >
                    <MessageCircle className="size-6" />
                    <span className="tabular-nums">{post.commentCount}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void sharePost(post)}
                  aria-label="Teilen"
                  title="Teilen"
                  className="grid size-11 place-items-center rounded-full hover:bg-bg-subtle"
                >
                  <Share2 className="size-5" />
                </button>
                {isOwn || post.locked ? null : (
                  <button
                    type="button"
                    onClick={report}
                    className="ml-auto grid size-11 place-items-center rounded-full text-fg-subtle hover:bg-bg-subtle hover:text-heart"
                    aria-label={`${noun} melden`}
                    title="Melden"
                  >
                    <Flag className="size-5" />
                  </button>
                )}
              </div>
            </div>
            {post.locked ? (
              <p className="mx-4 mt-2 rounded-xl bg-bg-subtle px-4 py-3 text-xs text-fg-muted">
                Kommentare siehst du, sobald FSK 18 für dich freigeschaltet ist.
              </p>
            ) : null}
            <Comments
              key={post.id}
              post={post}
              onNavigate={onClose}
              inputRef={composerRef}
              className="flex-1 border-t border-border"
            />
          </aside>
        </div>
      </div>
      {zoomed && !post.locked && !post.videoUrl ? (
        <ImageLightbox
          src={post.imageUrl}
          alt={post.caption || `${noun} von @${post.author.handle}`}
          onClose={() => setZoomed(false)}
        />
      ) : null}
      {reporting ? (
        <ReportDialog
          postId={post.id}
          isVideo={Boolean(post.videoUrl)}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </>
  );
}

/** Fullscreen image; click/tap toggles 2.5× zoom at that spot, moving pans. */
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEscapeLayer(onClose);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  function at(e: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    return `${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`;
  }

  return (
    <div
      className="viewer-lightbox fixed inset-0 z-[70] grid place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Vollbild"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
        aria-label="Vollbild schließen"
      >
        <X className="size-5" />
      </button>
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          zoom ? "cursor-zoom-out touch-none" : "cursor-zoom-in",
        )}
        onClick={(e) => {
          e.stopPropagation();
          setOrigin(at(e));
          setZoom((z) => !z);
        }}
        onPointerMove={(e) => {
          if (zoom) setOrigin(at(e));
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="viewer-lightbox-img h-full w-full object-contain select-none"
          style={{ transformOrigin: origin, transform: zoom ? "scale(2.5)" : undefined }}
        />
      </div>
      <p className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80">
        {zoom ? "Bewegen zum Verschieben · Tippen zum Verkleinern" : "Tippen zum Vergrößern"}
      </p>
    </div>
  );
}

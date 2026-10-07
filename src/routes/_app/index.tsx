import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { listFeed } from "@/lib/vela/server";
import { listFeedMore } from "@/lib/vela/feed-api";
import type { PostCard } from "@/lib/vela/types";
import { FeedCard } from "@/components/feed-card";
import { isFeedShortcut, toggleFeedMuted } from "@/lib/vela/feed-prefs";
import { RitualBar } from "@/components/ritual-bar";
import { Skeleton } from "@/components/ui/skeleton";

const SEEN_KEY = "fg-last-seen";
const MORE_KEY = ["feed-more"] as const;
/** Start loading the next posts this many slides before the end. */
const PREFETCH_AHEAD = 3;

/** Postgres ("2026-10-05 12:00:00.1+00") or ISO time → ms; Safari needs the ISO shape. */
function toMs(value: string): number {
  return Date.parse(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
}

/** Same post stays "Heute im Licht" for the whole Berlin day. */
function spotlightId(posts: PostCard[]): number | null {
  if (posts.length === 0) return null;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let best = posts[0]!;
  let score = -1;
  for (const post of posts) {
    const key = `${day}:${post.id}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
    if (hash > score) {
      score = hash;
      best = post;
    }
  }
  return best.id;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export const Route = createFileRoute("/_app/")({ component: ForYou });

function ForYou() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["feed"],
    queryFn: () => listFeed(),
  });
  // Extra pages after the ranked first batch; a plain PostCard[] so likes and
  // deletions (post-cache) reach them like any other list.
  const more = useQuery<PostCard[]>({
    queryKey: MORE_KEY,
    queryFn: () => Promise.resolve([]),
    initialData: [],
    enabled: false,
    staleTime: Infinity,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const items = useMemo(() => query.data ?? [], [query.data]);
  const spot = useMemo(() => spotlightId(items), [items]);
  const ordered = useMemo(() => {
    let first = items;
    if (spot != null) {
      const hit = items.find((post) => post.id === spot);
      if (hit) first = [hit, ...items.filter((post) => post.id !== spot)];
    }
    // After a refetch the first batch may now hold posts from the extra pages.
    const seen = new Set(first.map((p) => p.id));
    return [...first, ...more.data.filter((p) => !seen.has(p.id))];
  }, [items, spot, more.data]);

  // "N neue Bilder seit deinem letzten Besuch": counted once per visit, not on every like.
  const [fresh, setFresh] = useState(0);
  const freshDone = useRef(false);
  useEffect(() => {
    if (items.length === 0 || freshDone.current) return;
    freshDone.current = true;
    let prev: string | null = null;
    try {
      prev = window.localStorage.getItem(SEEN_KEY);
    } catch {
      // Storage blocked (private mode): just no "new since" hint.
    }
    const since = prev ? toMs(prev) : NaN;
    setFresh(
      Number.isFinite(since) ? items.filter((post) => toMs(post.createdAt) > since).length : 0,
    );
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [items]);
  // The hint fades after a while; it is about the moment you arrive.
  useEffect(() => {
    if (fresh === 0) return;
    const t = window.setTimeout(() => setFresh(0), 9000);
    return () => window.clearTimeout(t);
  }, [fresh]);

  // Which slide is on screen.
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const slideCount = ordered.length + 1; // + the end slide
  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.slide ?? 0));
          }
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll<HTMLElement>("[data-slide]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [slideCount, query.isSuccess]);

  const goTo = useCallback((index: number) => {
    const root = scroller.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-slide="${index}"]`);
    target?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  // Keyboard: ↓ / J next, ↑ / K previous, M sound. (L and Leertaste live on the card.)
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isFeedShortcut(e)) return;
      const key = e.key.toLowerCase();
      if (key === "arrowdown" || key === "j" || key === "pagedown") {
        e.preventDefault();
        goTo(Math.min(activeRef.current + 1, slideCount - 1));
      } else if (key === "arrowup" || key === "k" || key === "pageup") {
        e.preventDefault();
        goTo(Math.max(activeRef.current - 1, 0));
      } else if (key === "m") {
        e.preventDefault();
        toggleFeedMuted();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, slideCount]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await listFeedMore({ data: { exclude: ordered.map((p) => p.id).slice(-2000) } });
      if (next.length === 0) setExhausted(true);
      else queryClient.setQueryData<PostCard[]>(MORE_KEY, (old = []) => [...old, ...next]);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, exhausted, ordered, queryClient]);

  // Near the end: fetch the next posts in the background.
  useEffect(() => {
    if (!query.isSuccess || ordered.length === 0 || moreFailed) return;
    if (active >= ordered.length - PREFETCH_AHEAD) void loadMore();
  }, [active, ordered.length, query.isSuccess, loadMore, moreFailed]);

  async function startOver() {
    queryClient.setQueryData<PostCard[]>(MORE_KEY, []);
    setExhausted(false);
    setMoreFailed(false);
    await query.refetch();
    scroller.current?.scrollTo({ top: 0 });
  }

  if (query.isPending) return <FeedSkeleton />;

  if (query.isError) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-xs">
          <p className="font-display text-2xl">Kurz verschnaufen</p>
          <p className="mt-2 text-sm text-fg-muted">Der Feed ist gerade nicht erreichbar.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            <RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            Nochmal versuchen
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 pb-16 text-center md:pb-0">
        <div className="max-w-sm">
          <span className="mx-auto grid size-16 place-items-center rounded-full border border-border bg-bg-elevated text-3xl">
            🐾
          </span>
          <h1 className="mt-5 font-display text-2xl">Noch still hier</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Sei die erste Pfote: Lade ein Bild oder Video hoch, und der Feed erwacht.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              to="/upload"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg"
            >
              <ImagePlus className="size-4" /> Hochladen
            </Link>
          </div>
          <div className="mt-6 flex justify-center">
            <RitualBar tone="page" />
          </div>
        </div>
      </div>
    );
  }

  const endIndex = ordered.length;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="font-display text-lg tracking-tight text-on-media drop-shadow-md md:hidden">
          Für dich
        </p>
        {fresh > 0 && active === 0 ? (
          <p
            role="status"
            className="feed-fresh rounded-full bg-bg/55 px-3 py-1 text-xs text-on-media shadow backdrop-blur-md"
          >
            {fresh} {fresh === 1 ? "neuer Beitrag" : "neue Beiträge"} seit deinem letzten Besuch
          </p>
        ) : null}
        <RitualBar />
      </div>

      <div ref={scroller} className="feed-scroller" aria-label="Für dich">
        {ordered.map((post, i) => (
          <div key={post.id} data-slide={i} className="feed-slot">
            <FeedCard
              post={post}
              spotlight={post.id === spot}
              eager={i < 2}
              active={i === active}
            />
          </div>
        ))}
        <div data-slide={endIndex} className="feed-slot">
          <FeedEnd
            loading={loadingMore || (!exhausted && !moreFailed)}
            failed={moreFailed}
            onRetry={() => void loadMore()}
            onStartOver={() => void startOver()}
            refreshing={query.isRefetching}
          />
        </div>
      </div>

      {/* Desktop: arrows + position, since there is no swipe. */}
      <div className="pointer-events-none fixed top-1/2 right-6 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 md:flex">
        <button
          type="button"
          onClick={() => goTo(Math.max(active - 1, 0))}
          disabled={active === 0}
          aria-label="Vorheriger Beitrag (↑ / K)"
          title="Vorheriger (↑ / K)"
          className="feed-nav-btn pointer-events-auto"
        >
          <ChevronUp className="size-5" />
        </button>
        <span className="text-[11px] text-fg-subtle tabular-nums" aria-live="polite">
          {Math.min(active + 1, ordered.length)} / {ordered.length}
          {exhausted ? "" : "+"}
        </span>
        <button
          type="button"
          onClick={() => goTo(Math.min(active + 1, endIndex))}
          disabled={active >= endIndex}
          aria-label="Nächster Beitrag (↓ / J)"
          title="Nächster (↓ / J)"
          className="feed-nav-btn pointer-events-auto"
        >
          <ChevronDown className="size-5" />
        </button>
      </div>
      <p className="pointer-events-none fixed bottom-4 left-1/2 z-10 hidden -translate-x-1/2 text-[11px] text-fg-subtle lg:block lg:translate-x-[calc(-50%+7rem)]">
        <kbd className="feed-kbd">↑</kbd> <kbd className="feed-kbd">↓</kbd> blättern ·{" "}
        <kbd className="feed-kbd">L</kbd> liken · <kbd className="feed-kbd">M</kbd> Ton
      </p>
    </div>
  );
}

/** The last slide: more is loading, or you have seen everything. */
function FeedEnd({
  loading,
  failed,
  refreshing,
  onRetry,
  onStartOver,
}: {
  loading: boolean;
  failed: boolean;
  refreshing: boolean;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  return (
    <section className="feed-slide grid place-items-center px-6 pb-16 text-center md:pb-0">
      {loading ? (
        <div className="flex flex-col items-center gap-3 text-fg-muted" role="status">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-sm">Mehr wird geladen …</p>
        </div>
      ) : failed ? (
        <div className="max-w-xs">
          <p className="text-sm text-fg-muted">Weitere Beiträge konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-bg-elevated px-5 text-sm"
          >
            <RefreshCw className="size-4" /> Nochmal versuchen
          </button>
        </div>
      ) : (
        <div className="feed-end max-w-sm">
          <span className="mx-auto grid size-16 place-items-center rounded-full border border-border bg-bg-elevated text-accent">
            <Sparkles className="size-7" strokeWidth={1.6} />
          </span>
          <h2 className="mt-5 font-display text-2xl">Du bist auf dem Laufenden</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Das war alles Neue für dich. Stöbere in der Galerie oder teile selbst etwas.
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link
              to="/explore"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg"
            >
              <Compass className="size-4" /> Galerie entdecken
            </Link>
            <Link
              to="/upload"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-bg-elevated px-5 text-sm"
            >
              <ImagePlus className="size-4" /> Hochladen
            </Link>
          </div>
          <button
            type="button"
            onClick={onStartOver}
            disabled={refreshing}
            className="mt-3 inline-flex min-h-11 items-center gap-2 px-3 text-sm text-fg-muted hover:text-fg disabled:opacity-60"
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} /> Feed neu mischen
          </button>
        </div>
      )}
    </section>
  );
}

/** Placeholder in the shape of a feed card, so the page doesn't jump when it arrives. */
function FeedSkeleton() {
  return (
    <div className="feed-scroller" aria-busy="true" aria-label="Feed wird geladen">
      <div className="feed-slide flex items-center justify-center">
        <div className="feed-stage relative flex h-full w-full max-w-lg items-end justify-center md:h-auto md:w-auto md:max-w-none md:gap-4">
          <div className="feed-frame relative h-full w-full overflow-hidden bg-bg-elevated">
            <span aria-hidden="true" className="fitted-shimmer absolute inset-0" />
            <div className="absolute inset-x-0 bottom-20 space-y-2 px-4 pr-20 pb-2 md:bottom-0 md:px-5 md:pb-5">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-3 w-56 max-w-full rounded-full" />
            </div>
          </div>
          <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 md:static md:pb-4">
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, Hash, Sparkles, X } from "lucide-react";
import {
  GALLERY_MAX,
  GALLERY_PAGE,
  galleryOverview,
  listGallery,
  type GallerySort,
} from "@/lib/vela/explore-api";
import { GalleryGrid, GalleryGridSkeleton } from "@/components/gallery-grid";
import { PeopleSearch } from "@/components/people-search";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeHashtag } from "@/lib/vela/hashtags";
import { cn } from "@/lib/utils";

type ExploreSearch = { hashtag?: string; sort?: "neu" };

export const Route = createFileRoute("/_app/explore")({
  component: Explore,
  validateSearch: (search: Record<string, unknown>): ExploreSearch => {
    const hashtag = typeof search.hashtag === "string" ? normalizeHashtag(search.hashtag) : null;
    const out: ExploreSearch = {};
    if (hashtag) out.hashtag = hashtag;
    if (search.sort === "neu") out.sort = "neu";
    return out;
  },
});

function Explore() {
  const { hashtag, sort: sortParam } = Route.useSearch();
  const sort: GallerySort = sortParam ?? "beliebt";
  const navigate = Route.useNavigate();
  const onHashtag = useCallback(
    (next: string | null) =>
      void navigate({
        search: (prev) => ({ sort: prev.sort, ...(next ? { hashtag: next } : {}) }),
        replace: true,
      }),
    [navigate],
  );
  const onSort = useCallback(
    (next: GallerySort) =>
      void navigate({
        search: (prev) => ({
          ...(prev.hashtag ? { hashtag: prev.hashtag } : {}),
          ...(next === "neu" ? { sort: "neu" as const } : {}),
        }),
        replace: true,
      }),
    [navigate],
  );
  const [searching, setSearching] = useState(false);
  const showStart = !searching && !hashtag;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-4">
      <header className="px-5 pb-5">
        <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Entdecken</p>
        <h1 className="mt-1 font-display text-3xl">Gallery</h1>
        <div className="mt-5">
          <PeopleSearch
            onActiveChange={setSearching}
            hashtag={hashtag ?? null}
            onHashtag={onHashtag}
          />
        </div>
      </header>

      {showStart ? <StartView onHashtag={onHashtag} /> : null}

      {/* People search for a word that isn't a hashtag: just the profiles. */}
      {searching && !hashtag ? null : (
        <GallerySection
          // A new filter or order starts again at the first page.
          key={`${hashtag ?? ""}|${sort}`}
          hashtag={hashtag ?? null}
          sort={sort}
          onSort={onSort}
          onClearHashtag={() => onHashtag(null)}
          hideWhenEmpty={searching}
        />
      )}
    </div>
  );
}

/** Start view: trending hashtags and profiles worth a look. */
function StartView({ onHashtag }: { onHashtag: (tag: string) => void }) {
  const overview = useQuery({
    queryKey: ["creators", "gallery-overview"],
    queryFn: () => galleryOverview(),
    staleTime: 60_000,
  });
  const hashtags = overview.data?.hashtags ?? [];
  const profiles = overview.data?.profiles ?? [];

  return (
    <>
      {overview.isPending || hashtags.length > 0 ? (
        <section className="px-5 pb-6" aria-labelledby="trending-heading">
          <h2
            id="trending-heading"
            className="flex items-center gap-1.5 text-sm font-medium text-fg-muted"
          >
            <Flame aria-hidden className="size-4 text-accent" />
            Angesagte Hashtags
          </h2>
          <ul className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {overview.isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="shrink-0">
                    <Skeleton className="h-11 rounded-full" style={{ width: 72 + (i % 3) * 18 }} />
                  </li>
                ))
              : hashtags.map((h, i) => (
                  <li key={h.tag} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onHashtag(h.tag)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-bg-elevated px-3.5 text-sm text-fg",
                        "transition-[border-color,background-color,scale] duration-200 hover:border-accent/50 hover:bg-bg-subtle active:scale-95",
                        "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none",
                      )}
                    >
                      <Hash aria-hidden className="size-3.5 text-accent" />
                      <span className="font-medium">{h.tag}</span>
                      {i < 3 ? (
                        <span className="ml-0.5 text-xs text-fg-subtle tabular-nums">{h.count}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
          </ul>
        </section>
      ) : null}

      {overview.isPending || profiles.length > 0 ? (
        <section className="px-5 pb-6" aria-labelledby="profiles-heading">
          <h2 id="profiles-heading" className="text-sm font-medium text-fg-muted">
            Profile entdecken
          </h2>
          <ul className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {overview.isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex w-18 shrink-0 flex-col items-center gap-2">
                    <Skeleton className="size-16 rounded-full" />
                    <Skeleton className="h-3 w-12" />
                  </li>
                ))
              : profiles.map((person) => (
                  <li key={person.handle} className="w-18 shrink-0">
                    <Link
                      to="/u/$handle"
                      params={{ handle: person.handle }}
                      className="group flex w-18 flex-col items-center gap-2 rounded-xl py-1 focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
                      aria-label={`${person.displayName} (@${person.handle})${person.isNew ? ", neu dabei" : ""}`}
                    >
                      <span className="relative">
                        <span className="block size-16 overflow-hidden rounded-full bg-bg-subtle ring-1 ring-border transition-[scale,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-hover:ring-accent/60 group-active:scale-95">
                          {person.avatarUrl ? (
                            <img
                              src={person.avatarUrl}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center font-display text-lg">
                              {person.displayName.charAt(0)}
                            </span>
                          )}
                        </span>
                        {person.isNew ? (
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-accent-fg ring-2 ring-bg">
                            Neu
                          </span>
                        ) : null}
                      </span>
                      <span className="w-full truncate text-center text-[11px] text-fg-muted">
                        @{person.handle}
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

const SORTS: { id: GallerySort; label: string; icon: typeof Flame }[] = [
  { id: "beliebt", label: "Beliebt", icon: Flame },
  { id: "neu", label: "Neu", icon: Sparkles },
];

function SortSwitch({ sort, onSort }: { sort: GallerySort; onSort: (s: GallerySort) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Sortierung"
      className="relative inline-flex rounded-full border border-border bg-bg-subtle p-0.5"
    >
      {SORTS.map(({ id, label, icon: Icon }) => {
        const active = id === sort;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSort(id)}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm transition-[background-color,color,box-shadow] duration-200",
              "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none",
              active ? "bg-bg-elevated font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            <Icon aria-hidden className={cn("size-3.5", active ? "text-accent" : "")} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function GallerySection({
  hashtag,
  sort,
  onSort,
  onClearHashtag,
  hideWhenEmpty,
}: {
  hashtag: string | null;
  sort: GallerySort;
  onSort: (s: GallerySort) => void;
  onClearHashtag: () => void;
  /** While someone searches people, a hashtag without posts just disappears. */
  hideWhenEmpty: boolean;
}) {
  const [limit, setLimit] = useState(GALLERY_PAGE);
  const query = useQuery({
    queryKey: ["explore", hashtag, sort, limit],
    queryFn: () => listGallery({ data: { hashtag, sort, limit } }),
    // Keep the grid on screen while the next page loads.
    placeholderData: (prev, prevQuery) =>
      prevQuery && prevQuery.queryKey[1] === hashtag && prevQuery.queryKey[2] === sort
        ? prev
        : undefined,
  });
  const all = query.data ?? [];
  const posts = all.length > limit ? all.slice(0, limit) : all;
  const hasMore = all.length > limit && limit < GALLERY_MAX;
  const loadingMore = query.isFetching && query.isPlaceholderData;

  const loadMore = useCallback(() => {
    setLimit((l) => Math.min(l + GALLERY_PAGE, GALLERY_MAX));
  }, []);

  // Load the next page shortly before the end comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const canAutoLoad = hasMore && !query.isFetching;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canAutoLoad || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canAutoLoad, loadMore]);

  if (hideWhenEmpty && !query.isPending && posts.length === 0) return null;

  const heading = hashtag ? null : sort === "neu" ? "Neu in der Gallery" : "Beliebt diese Woche";

  return (
    <section aria-label={hashtag ? `Beiträge mit #${hashtag}` : "Beiträge"}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 px-5 pb-4">
        {hashtag ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-10 min-w-0 items-center gap-1 rounded-full bg-accent/12 pr-1 pl-3 text-sm text-fg ring-1 ring-accent/30">
              <Hash aria-hidden className="size-3.5 shrink-0 text-accent" />
              <span className="truncate font-medium">{hashtag}</span>
              <button
                type="button"
                onClick={onClearHashtag}
                aria-label={`Filter #${hashtag} entfernen`}
                className="-my-0.5 ml-0.5 grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
              >
                <X className="size-3.5" />
              </button>
            </span>
            {!query.isPending ? (
              <span className="shrink-0 text-xs text-fg-subtle tabular-nums">
                {hasMore ? `${posts.length}+` : posts.length}{" "}
                {posts.length === 1 ? "Beitrag" : "Beiträge"}
              </span>
            ) : null}
          </div>
        ) : (
          <h2 className="text-sm font-medium text-fg-muted">{heading}</h2>
        )}
        <SortSwitch sort={sort} onSort={onSort} />
      </div>

      {query.isPending ? (
        <GalleryGridSkeleton />
      ) : query.isError ? (
        <div className="px-5 py-14 text-center">
          <p className="text-sm text-fg-muted">Die Gallery konnte nicht laden.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 inline-flex h-11 items-center rounded-full border border-border bg-bg-elevated px-5 text-sm font-medium transition-colors hover:bg-bg-subtle"
          >
            Nochmal versuchen
          </button>
        </div>
      ) : (
        <GalleryGrid
          posts={posts}
          emptyLabel={hashtag ? `Zu #${hashtag} gibt es noch nichts.` : "Die Gallery ist noch leer."}
          empty={
            <div className="flex flex-col items-center px-5 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-bg-subtle text-accent">
                {hashtag ? <Hash className="size-6" aria-hidden /> : <Sparkles className="size-6" aria-hidden />}
              </span>
              <p className="mt-4 font-display text-xl">
                {hashtag ? `Noch nichts zu #${hashtag}` : "Hier ist es noch ruhig"}
              </p>
              <p className="mt-1.5 max-w-xs text-sm text-fg-muted">
                {hashtag
                  ? "Sei die erste Pfote: lade ein Bild hoch und schreib den Hashtag in die Beschreibung."
                  : "Lade das erste Bild hoch und mach die Gallery bunt."}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  to="/upload"
                  className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-fg transition-[scale] active:scale-95"
                >
                  Hochladen
                </Link>
                {hashtag ? (
                  <button
                    type="button"
                    onClick={onClearHashtag}
                    className="inline-flex h-11 items-center rounded-full border border-border bg-bg-elevated px-5 text-sm font-medium transition-colors hover:bg-bg-subtle"
                  >
                    Alle Beiträge
                  </button>
                ) : null}
              </div>
            </div>
          }
        />
      )}

      {hasMore || loadingMore ? (
        <div ref={sentinel} className="flex justify-center px-5 pt-3 pb-6">
          <button
            type="button"
            onClick={loadMore}
            disabled={query.isFetching}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-bg-elevated px-5 text-sm font-medium text-fg transition-colors hover:bg-bg-subtle disabled:opacity-70"
          >
            {query.isFetching ? (
              <>
                <span
                  aria-hidden
                  className="size-4 animate-spin rounded-full border-2 border-fg/20 border-t-accent motion-reduce:animate-none"
                />
                Lädt…
              </>
            ) : (
              "Mehr laden"
            )}
          </button>
        </div>
      ) : !query.isPending && posts.length >= GALLERY_PAGE ? (
        <p className="px-5 pt-3 pb-6 text-center text-xs text-fg-subtle">
          {limit >= GALLERY_MAX && all.length > limit
            ? "Das war’s für jetzt – such nach einem Hashtag für mehr."
            : "Du hast alles gesehen."}
        </p>
      ) : null}
    </section>
  );
}

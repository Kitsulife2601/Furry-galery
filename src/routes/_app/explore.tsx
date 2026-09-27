import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCreators, listExplore } from "@/lib/vela/server";
import { GalleryGrid } from "@/components/gallery-grid";
import { PeopleSearch } from "@/components/people-search";
import { Skeleton } from "@/components/ui/skeleton";
import { POST_TAGS, type PostTag } from "@/lib/vela/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/explore")({ component: Explore });

function Explore() {
  const [tag, setTag] = useState<PostTag | null>(null);
  const query = useQuery({
    queryKey: ["explore", tag],
    queryFn: () => listExplore({ data: { tag } }),
  });
  const creators = useQuery({
    queryKey: ["creators"],
    queryFn: () => listCreators(),
  });
  const [searching, setSearching] = useState(false);

  return (
    <div className="mx-auto max-w-3xl pt-6">
      <header className="px-5 pb-5">
        <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Überblick</p>
        <h1 className="mt-1 font-display text-3xl">Gallery</h1>
        <div className="mt-5">
          <PeopleSearch onActiveChange={setSearching} />
        </div>
      </header>

      {searching ? null : (
        <>
          <section
            className="px-5 pb-6"
            hidden={!creators.isPending && (creators.data ?? []).length === 0}
          >
            <h2 className="text-sm font-medium text-fg-muted">Profile</h2>
            <ul className="mt-3 flex gap-4 overflow-x-auto pb-1">
              {creators.isPending
                ? Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="flex w-16 shrink-0 flex-col items-center gap-2">
                      <Skeleton className="size-14 rounded-full" />
                      <Skeleton className="h-3 w-12" />
                    </li>
                  ))
                : (creators.data ?? []).map((person) => (
                    <li key={person.handle} className="flex w-16 shrink-0 flex-col items-center">
                      <Link
                        to="/u/$handle"
                        params={{ handle: person.handle }}
                        className="flex w-16 flex-col items-center gap-2"
                      >
                        <span className="size-14 overflow-hidden rounded-full bg-bg-subtle">
                          {person.avatarUrl ? (
                            <img
                              src={person.avatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-sm">
                              {person.displayName.charAt(0)}
                            </span>
                          )}
                        </span>
                        <span className="w-full truncate text-center text-[11px] text-fg-muted">
                          @{person.handle}
                        </span>
                      </Link>
                    </li>
                  ))}
            </ul>
          </section>

          <nav aria-label="Kategorien" className="overflow-x-auto px-5 pb-4">
            <ul className="flex gap-2">
              {[{ id: null, label: "Alle" }, ...POST_TAGS].map((t) => (
                <li key={t.id ?? "all"}>
                  <button
                    type="button"
                    aria-pressed={tag === t.id}
                    onClick={() => setTag(t.id)}
                    className={cn(
                      "h-9 rounded-full border px-3 text-sm whitespace-nowrap",
                      tag === t.id ? "border-accent bg-accent text-accent-fg" : "border-border",
                    )}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {query.isPending ? (
            <div className="grid grid-cols-3 gap-px">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="aspect-3/4 rounded-none" />
              ))}
            </div>
          ) : (
            <GalleryGrid
              posts={query.data ?? []}
              emptyLabel={
                tag
                  ? "In dieser Kategorie gibt es noch keine Bilder."
                  : "Die Gallery ist noch leer."
              }
            />
          )}
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCreators, listExplore } from "@/lib/vela/server";
import { GalleryGrid } from "@/components/gallery-grid";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostCard } from "@/lib/vela/types";

export const Route = createFileRoute("/_app/explore")({ component: Explore });

function Explore() {
  const query = useQuery({
    queryKey: ["explore"],
    queryFn: () => listExplore(),
  });
  const creators = useQuery({
    queryKey: ["creators"],
    queryFn: () => listCreators(),
  });
  const [posts, setPosts] = useState<PostCard[] | null>(null);
  const items = posts ?? query.data ?? [];

  return (
    <div className="mx-auto max-w-3xl pt-6">
      <header className="px-5 pb-5">
        <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Überblick</p>
        <h1 className="mt-1 font-display text-3xl">Gallery</h1>
      </header>

      <section className="px-5 pb-6">
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

      {query.isPending ? (
        <div className="grid grid-cols-3 gap-px">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-3/4 rounded-none" />
          ))}
        </div>
      ) : (
        <GalleryGrid
          posts={items}
          onChange={setPosts}
          emptyLabel="Die Gallery ist noch leer."
        />
      )}
    </div>
  );
}

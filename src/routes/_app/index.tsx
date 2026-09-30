import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listFeed } from "@/lib/vela/server";
import type { PostCard } from "@/lib/vela/types";
import { FeedCard } from "@/components/feed-card";
import { RitualBar } from "@/components/ritual-bar";
import { Skeleton } from "@/components/ui/skeleton";

const SEEN_KEY = "fg-last-seen";

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

export const Route = createFileRoute("/_app/")({ component: ForYou });

function ForYou() {
  const query = useQuery({
    queryKey: ["feed"],
    queryFn: () => listFeed(),
  });
  const items = query.data ?? [];
  const spot = useMemo(() => spotlightId(items), [items]);
  const ordered = useMemo(() => {
    if (spot == null) return items;
    const hit = items.find((post) => post.id === spot);
    if (!hit) return items;
    return [hit, ...items.filter((post) => post.id !== spot)];
  }, [items, spot]);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    if (items.length === 0) return;
    const prev = localStorage.getItem(SEEN_KEY);
    setFresh(prev ? items.filter((post) => post.createdAt > prev).length : 0);
    const timer = window.setTimeout(() => {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [items]);

  if (query.isPending) {
    return (
      <div className="feed-scroller">
        <div className="feed-slide grid place-items-center bg-bg">
          <Skeleton className="h-[80dvh] w-full max-w-lg rounded-none" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-sm text-fg-muted">Der Feed ist gerade nicht erreichbar.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl">Noch still</h1>
          <p className="mt-2 text-sm text-fg-muted">Lade das erste Bild hoch.</p>
          <div className="mt-6 flex justify-center">
            <RitualBar tone="page" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="font-display text-lg tracking-tight text-on-media drop-shadow-md md:hidden">
          Für dich
        </p>
        {fresh > 0 ? (
          <p className="rounded-full bg-bg/55 px-3 py-1 text-xs text-on-media shadow backdrop-blur-md">
            {fresh} {fresh === 1 ? "neues Bild" : "neue Bilder"} seit deinem letzten Besuch
          </p>
        ) : null}
        <RitualBar />
      </div>
      <div className="feed-scroller">
        {ordered.map((post) => (
          <FeedCard key={post.id} post={post} spotlight={post.id === spot} />
        ))}
      </div>
    </div>
  );
}

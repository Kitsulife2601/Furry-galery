import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listFeed } from "@/lib/vela/server";
import { FeedCard } from "@/components/feed-card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/")({ component: ForYou });

function ForYou() {
  const query = useQuery({
    queryKey: ["feed"],
    queryFn: () => listFeed(),
  });
  const items = query.data ?? [];

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
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-[max(0.75rem,env(safe-area-inset-top))] text-center md:hidden">
        <p className="font-display text-lg tracking-tight text-on-media drop-shadow-md">Für dich</p>
      </div>
      <div className="feed-scroller">
        {items.map((post) => (
          <FeedCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

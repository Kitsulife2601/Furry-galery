import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listUpdates } from "@/lib/vela/server";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/updates")({ component: Updates });

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });

function Updates() {
  const query = useQuery({ queryKey: ["updates"], queryFn: () => listUpdates() });
  return (
    <div className="mx-auto max-w-xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Neuigkeiten</p>
      <h1 className="mt-1 font-display text-3xl">Updates</h1>
      {query.isPending ? (
        <Skeleton className="mt-6 h-40 w-full" />
      ) : (query.data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-fg-muted">Noch keine Updates.</p>
      ) : (
        <ol className="mt-8 space-y-8 border-l border-border pl-5">
          {(query.data ?? []).map((u) => (
            <li key={u.id} className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-accent" />
              <time className="text-xs text-fg-subtle">
                {dateFormat.format(new Date(u.createdAt))}
              </time>
              <h2 className="mt-1 font-display text-xl">{u.title}</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-fg-muted">
                {u.body}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { listUpdates, markUpdatesSeen, type UpdateItem } from "@/lib/vela/server";
import { useAppSession } from "@/lib/vela/app-session";
import { Skeleton } from "@/components/ui/skeleton";
import { UpdateBody } from "@/components/update-body";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/updates")({
  head: () => ({ meta: [{ title: "Updates · Furry Gallery" }] }),
  component: Updates,
});

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
const NEW_DAYS = 14;

function groupByMonth(list: UpdateItem[]) {
  const groups: { key: string; label: string; items: UpdateItem[] }[] = [];
  for (const u of list) {
    const d = new Date(u.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(u);
    else groups.push({ key, label: monthFormat.format(d), items: [u] });
  }
  return groups;
}

function Updates() {
  const { profile } = useAppSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["updates"], queryFn: () => listUpdates() });

  // Opening this page counts as "seen" for the "Was ist neu" pop-up.
  useEffect(() => {
    if (!profile) return;
    queryClient.setQueryData(["updates-unseen"], []);
    void markUpdatesSeen().catch(() => undefined);
  }, [profile, queryClient]);

  const list = query.data ?? [];
  const now = Date.now();
  return (
    <div className="mx-auto max-w-xl px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Neuigkeiten</p>
      <h1 className="mt-1 font-display text-3xl">Updates</h1>
      <p className="mt-2 text-sm text-fg-muted">Was sich an der Furry Gallery zuletzt getan hat.</p>
      {query.isPending ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : query.isError ? (
        <p className="mt-8 text-sm text-fg-muted">Updates konnten nicht geladen werden.</p>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
          <Sparkles className="mx-auto size-6 text-fg-subtle" aria-hidden />
          <p className="mt-2 text-sm text-fg-muted">Noch keine Updates — bald gibt’s Neues.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {groupByMonth(list).map((g, gi) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="text-xs tracking-[0.18em] text-fg-subtle uppercase">{g.label}</h2>
              <ol className="relative mt-3 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[1.375rem] before:w-px before:bg-border">
                {g.items.map((u, i) => {
                  const d = new Date(u.createdAt);
                  const fresh = now - d.getTime() < NEW_DAYS * 86400_000;
                  const latest = gi === 0 && i === 0;
                  return (
                    <li key={u.id} className="relative flex gap-4">
                      <time
                        dateTime={u.createdAt}
                        className={cn(
                          "relative z-[1] flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none",
                          latest
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border bg-bg-elevated text-fg",
                        )}
                      >
                        <span className="text-[10px] uppercase opacity-70">
                          {weekdayFormat.format(d)}
                        </span>
                        <span className="mt-0.5 font-display text-base">{dayFormat.format(d)}</span>
                      </time>
                      <article className="min-w-0 flex-1 rounded-2xl border border-border bg-bg-elevated p-4">
                        <h3 className="flex flex-wrap items-center gap-2 font-display text-xl leading-snug break-words">
                          {u.title}
                          {fresh ? (
                            <span className="rounded-full bg-accent/15 px-2 py-0.5 font-sans text-[11px] font-medium text-fg">
                              Neu
                            </span>
                          ) : null}
                        </h3>
                        <UpdateBody body={u.body} className="mt-2" />
                      </article>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Was ist neu": on the next visit after the team posts site updates, show
 * them once in a pop-up. Closing (or opening the updates page) marks them seen.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { markUpdatesSeen, unseenUpdates } from "@/lib/vela/server";
import { Button } from "@/components/ui/button";
import { UpdateBody } from "@/components/update-body";

const dayFormat = new Intl.DateTimeFormat("de", { day: "numeric", month: "long" });

export function UpdatesPopup({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["updates-unseen"],
    queryFn: () => unseenUpdates(),
    enabled,
    staleTime: Infinity,
  });
  const [closed, setClosed] = useState(false);
  const list = query.data ?? [];

  function close() {
    setClosed(true);
    queryClient.setQueryData(["updates-unseen"], []);
    void markUpdatesSeen().catch(() => undefined);
  }

  const visible = !closed && list.length > 0;
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    okRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only touches stable setters
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      className="updates-popup fixed inset-0 z-[55] flex items-end justify-center bg-bg/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="updates-title"
    >
      <div
        className="flex max-h-[min(80dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated text-fg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs tracking-[0.18em] text-accent uppercase">
              <Sparkles className="size-3.5" /> Neu
            </p>
            <h2 id="updates-title" className="mt-1 font-display text-2xl">
              Was ist neu?
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Schließen"
            className="-mt-1 -mr-2 grid size-11 place-items-center rounded-lg text-fg-subtle hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
        <ol className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {list.map((u) => (
            <li key={u.id} className="border-l-2 border-accent/60 pl-3">
              <p className="text-[11px] text-fg-subtle">
                {dayFormat.format(new Date(u.createdAt))}
              </p>
              <p className="mt-0.5 font-medium break-words">{u.title}</p>
              <UpdateBody body={u.body} className="mt-1" />
            </li>
          ))}
        </ol>
        <div className="flex gap-2 border-t border-border px-5 py-3">
          <Button asChild variant="secondary" className="flex-1">
            <Link to="/updates" onClick={close}>
              Alle Updates
            </Link>
          </Button>
          <Button ref={okRef} type="button" className="flex-1" onClick={close}>
            Alles klar
          </Button>
        </div>
      </div>
    </div>
  );
}

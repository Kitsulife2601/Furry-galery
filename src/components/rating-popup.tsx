/**
 * Small star-rating pop-up for members who joined more than a week ago.
 * Shows a few seconds after the page settles; "Später" asks again in a month.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, X } from "lucide-react";
import { toast } from "sonner";
import { postponeRating, ratingPromptDue, submitRating } from "@/lib/vela/server";
import { memberErrorMessage } from "@/lib/vela/errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABELS = ["", "Gefällt mir nicht", "Geht so", "Ganz okay", "Gefällt mir", "Liebe es!"];

export function RatingPopup({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const due = useQuery({
    queryKey: ["rating-due"],
    queryFn: () => ratingPromptDue(),
    enabled,
    staleTime: Infinity,
  });
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Don't jump at people the moment the page opens.
  useEffect(() => {
    if (!due.data) return;
    const id = window.setTimeout(() => setOpen(true), 8000);
    return () => window.clearTimeout(id);
  }, [due.data]);

  function close() {
    setOpen(false);
    queryClient.setQueryData(["rating-due"], false);
  }

  async function later() {
    close();
    await postponeRating().catch(() => undefined);
  }

  async function send() {
    if (!stars) return;
    setBusy(true);
    try {
      await submitRating({ data: { stars, comment } });
      close();
      toast.success("Danke für deine Bewertung! 🐾");
    } catch (err) {
      toast.error(memberErrorMessage(err, "Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const shown = hover || stars;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="rating-title"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-sm rounded-2xl border border-border bg-bg-elevated/95 p-5 text-fg shadow-2xl backdrop-blur-md md:right-6 md:bottom-6 md:left-auto md:mx-0"
    >
      <button
        type="button"
        onClick={() => void later()}
        aria-label="Später"
        className="absolute top-2 right-2 grid size-9 place-items-center rounded-lg text-fg-subtle hover:text-fg"
      >
        <X className="size-4" />
      </button>
      <p id="rating-title" className="pr-8 font-display text-lg leading-snug">
        Wie gefällt dir die Furry Gallery?
      </p>
      <p className="mt-1 text-xs text-fg-muted">
        Du bist schon über eine Woche dabei. Mit deiner Bewertung unterstützt du uns, die Seite
        besser zu machen.
      </p>
      <div
        className="mt-4 flex justify-center gap-1"
        role="radiogroup"
        aria-label="Sterne"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} ${n === 1 ? "Stern" : "Sterne"}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setStars(n)}
            className="grid size-11 place-items-center rounded-lg transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                "size-8",
                n <= shown ? "fill-amber-400 text-amber-400" : "text-fg-subtle",
              )}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      <p className="mt-1 h-4 text-center text-xs text-fg-muted">{LABELS[shown]}</p>
      {stars ? (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Magst du noch etwas dazu sagen? (freiwillig)"
          aria-label="Kommentar zur Bewertung"
          className="mt-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        />
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={() => void later()}>
          Später
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!stars || busy}
          onClick={() => void send()}
        >
          {busy ? "Sendet…" : "Bewerten"}
        </Button>
      </div>
    </div>
  );
}

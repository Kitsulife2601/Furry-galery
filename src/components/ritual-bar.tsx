import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimDailyGift } from "@/lib/vela/server";
import { DAILY_GIFT } from "@/lib/vela/shop";
import { PAWS_KEY, usePaws } from "@/lib/vela/use-paws";
import { cn } from "@/lib/utils";

/** Streak, the next unlock, and the once-a-day paw you collect by opening the gallery. */
export function RitualBar({ tone = "media" }: { tone?: "media" | "page" }) {
  const paws = usePaws();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const status = paws.data;
  if (!status) return null;

  const onMedia = tone === "media";

  async function claim() {
    setBusy(true);
    try {
      const next = await claimDailyGift();
      queryClient.setQueryData(PAWS_KEY, next);
      toast.success(`+${DAILY_GIFT} Pfoten. Morgen gibt es wieder welche.`);
    } catch {
      toast.error("Die Tagespfote hat gerade nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-[min(92vw,28rem)] flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border px-3 py-1.5 text-xs",
        onMedia
          ? "border-white/20 bg-bg/55 text-on-media shadow-lg backdrop-blur-md"
          : "border-border bg-bg-elevated/80 text-fg",
      )}
    >
      <span className="font-medium tabular-nums">Serie {status.streak}</span>
      <span className={onMedia ? "text-on-media/55" : "text-fg-subtle"}>·</span>
      {status.giftReady ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void claim()}
          className="rounded-full bg-accent px-2.5 py-0.5 font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? "…" : `Tagespfote +${DAILY_GIFT}`}
        </button>
      ) : (
        <span className={onMedia ? "text-on-media/80" : "text-fg-muted"}>Heute geholt</span>
      )}
      {status.nextReward ? (
        // Dot and text stay together, so a wrapped line never ends in a lone "·".
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className={onMedia ? "text-on-media/55" : "text-fg-subtle"}>·</span>
          <span className={onMedia ? "text-on-media/80" : "text-fg-muted"}>
            {status.nextReward.label} in {status.nextReward.inDays}{" "}
            {status.nextReward.inDays === 1 ? "Tag" : "Tagen"}
          </span>
        </span>
      ) : null}
    </div>
  );
}

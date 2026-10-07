import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { memberErrorMessage } from "@/lib/vela/errors";
import { reportPost } from "@/lib/vela/server";
import { REPORT_REASONS, type ReportReason } from "@/lib/vela/types";
import { useEscapeLayer, useModalBehaviour } from "@/lib/vela/use-overlay";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NOTE_MAX = 300;

export function ReportDialog({
  postId,
  isVideo,
  onClose,
}: {
  postId: number;
  /** Changes the wording ("Video melden"); unknown → "Beitrag". */
  isVideo?: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const noun = isVideo === undefined ? "Beitrag" : isVideo ? "Video" : "Bild";
  const thisNoun =
    isVideo === undefined ? "diesem Beitrag" : isVideo ? "diesem Video" : "diesem Bild";

  useModalBehaviour();
  useEscapeLayer(onClose);
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      await reportPost({ data: { postId, reason, note } });
      toast.success("Danke. Wir sehen uns das an.");
      onClose();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Melden fehlgeschlagen."));
      setBusy(false);
    }
  }

  return (
    <div
      className="viewer-backdrop fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
    >
      <div
        className="viewer-sheet max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-bg-elevated p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="report-title" className="font-display text-xl">
            {noun} melden
          </h2>
          <button
            type="button"
            className="-mr-2 grid size-11 place-items-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Was stimmt mit {thisNoun} nicht? Das Team schaut es sich an.
        </p>
        <div role="radiogroup" aria-labelledby="report-title" className="mt-4 space-y-2">
          {REPORT_REASONS.map((r, i) => {
            const selected = reason === r.id;
            return (
              <button
                key={r.id}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(r.id)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm transition-colors",
                  selected
                    ? "border-accent bg-bg-subtle text-fg"
                    : "border-border text-fg-muted hover:border-fg-subtle hover:text-fg",
                )}
              >
                {r.label}
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border",
                    selected ? "border-accent bg-accent text-accent-fg" : "border-border",
                  )}
                  aria-hidden="true"
                >
                  {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="report-note">Details (optional)</Label>
            <span className="text-xs text-fg-subtle tabular-nums">
              {note.length}/{NOTE_MAX}
            </span>
          </div>
          <Textarea
            id="report-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            placeholder="Was sollen wir wissen?"
          />
        </div>
        <Button
          className="mt-5 w-full"
          variant="danger"
          disabled={!reason || busy}
          onClick={() => void submit()}
        >
          {busy ? "Wird gesendet…" : "Meldung senden"}
        </Button>
      </div>
    </div>
  );
}

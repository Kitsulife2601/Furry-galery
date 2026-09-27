import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { memberErrorMessage } from "@/lib/vela/errors";
import { reportPost } from "@/lib/vela/server";
import { REPORT_REASONS, type ReportReason } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ReportDialog({ postId, onClose }: { postId: number; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/80 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated p-5 text-fg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="report-title" className="font-display text-xl">
            Bild melden
          </h2>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-fg-muted"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">Was stimmt mit diesem Bild nicht?</p>
        <ul className="mt-4 space-y-2">
          {REPORT_REASONS.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setReason(r.id)}
                className={cn(
                  "min-h-11 w-full rounded-lg border px-3 text-left text-sm",
                  reason === r.id ? "border-accent bg-bg-subtle" : "border-border",
                )}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2">
          <Label htmlFor="report-note">Details (optional)</Label>
          <Textarea
            id="report-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
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

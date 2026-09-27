import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { memberErrorMessage } from "@/lib/vela/errors";
import { sendFeedback } from "@/lib/vela/server";
import { FEEDBACK_KINDS, type FeedbackKind } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/feedback")({ component: Feedback });

function Feedback() {
  const [kind, setKind] = useState<FeedbackKind>("wish");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await sendFeedback({ data: { kind, body } });
      setSent(true);
      setBody("");
    } catch (err) {
      toast.error(memberErrorMessage(err, "Senden fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Mitmachen</p>
      <h1 className="mt-1 font-display text-3xl">Feedback &amp; Wünsche</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Was fehlt dir, was klappt nicht, was gefällt dir? Das Team liest alles.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-border bg-bg-elevated p-5">
          <p className="font-medium">Danke! 💛</p>
          <p className="mt-1 text-sm text-fg-muted">Dein Feedback ist beim Team angekommen.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setSent(false)}>
            Noch etwas schreiben
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label>Worum geht’s?</Label>
            <ul className="flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((k) => (
                <li key={k.id}>
                  <button
                    type="button"
                    aria-pressed={kind === k.id}
                    onClick={() => setKind(k.id)}
                    className={cn(
                      "h-9 rounded-full border px-3 text-sm",
                      kind === k.id ? "border-accent bg-accent text-accent-fg" : "border-border",
                    )}
                  >
                    {k.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feedback-body">Deine Nachricht</Label>
            <Textarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              minLength={3}
              maxLength={1000}
              rows={6}
              required
              placeholder="Ich wünsche mir …"
            />
            <p className="text-right text-xs text-fg-subtle">{body.length}/1000</p>
          </div>
          <Button type="submit" className="w-full" disabled={busy || body.trim().length < 3}>
            {busy ? "Wird gesendet…" : "Absenden"}
          </Button>
        </form>
      )}
    </div>
  );
}

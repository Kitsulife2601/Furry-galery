import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bug,
  CheckCircle2,
  Clock,
  Heart,
  Lightbulb,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { memberErrorMessage } from "@/lib/vela/errors";
import { sendFeedback } from "@/lib/vela/server";
import { myFeedback } from "@/lib/vela/admin-api";
import { useAppSession } from "@/lib/vela/app-session";
import { FEEDBACK_KINDS, type FeedbackKind } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/feedback")({
  head: () => ({ meta: [{ title: "Feedback · Furry Gallery" }] }),
  component: Feedback,
});

const KIND_META: Record<
  FeedbackKind,
  { title: string; hint: string; icon: LucideIcon; placeholder: string }
> = {
  wish: {
    title: "Wunsch",
    hint: "Idee oder neue Funktion",
    icon: Lightbulb,
    placeholder: "Ich wünsche mir …",
  },
  bug: {
    title: "Fehler",
    hint: "Etwas klappt nicht",
    icon: Bug,
    placeholder: "Was ist passiert, und wo? (z. B. Handy, Seite, was du angetippt hast)",
  },
  praise: {
    title: "Lob",
    hint: "Was dir gefällt",
    icon: Heart,
    placeholder: "Mir gefällt besonders …",
  },
  other: {
    title: "Sonstiges",
    hint: "Alles andere",
    icon: MessageCircle,
    placeholder: "Erzähl uns …",
  },
};

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const kindTitle = (id: string) =>
  KIND_META[id as FeedbackKind]?.title ?? FEEDBACK_KINDS.find((k) => k.id === id)?.label ?? id;

function Feedback() {
  const { profile } = useAppSession();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () => myFeedback(),
    enabled: Boolean(profile),
  });
  const [kind, setKind] = useState<FeedbackKind>("wish");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const meta = KIND_META[kind];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await sendFeedback({ data: { kind, body } });
      setSent(true);
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
    } catch (err) {
      toast.error(memberErrorMessage(err, "Senden fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  const list = mine.data ?? [];
  return (
    <div className="mx-auto max-w-lg px-5 py-8 pb-24">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Mitmachen</p>
      <h1 className="mt-1 font-display text-3xl">Feedback &amp; Wünsche</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Was fehlt dir, was klappt nicht, was gefällt dir? Das Team liest alles.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-border bg-bg-elevated p-5" role="status">
          <CheckCircle2 className="size-6 text-accent" aria-hidden />
          <p className="mt-2 font-medium">Danke! 💛</p>
          <p className="mt-1 text-sm text-fg-muted">
            Dein Feedback ist beim Team angekommen. Unten siehst du, wann es erledigt ist.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => setSent(false)}>
            Noch etwas schreiben
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Worum geht’s?</legend>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {FEEDBACK_KINDS.map((k) => {
                const m = KIND_META[k.id];
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKind(k.id)}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-fg"
                        : "border-border text-fg-muted hover:border-fg-subtle hover:text-fg",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl",
                        active ? "bg-accent text-accent-fg" : "bg-bg-subtle",
                      )}
                    >
                      <m.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{m.title}</span>
                      <span className="block truncate text-xs text-fg-subtle">{m.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
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
              placeholder={meta.placeholder}
            />
            <p className="text-right text-xs text-fg-subtle tabular-nums">{body.length}/1000</p>
          </div>
          <Button type="submit" className="w-full" disabled={busy || body.trim().length < 3}>
            {busy ? "Wird gesendet…" : "Absenden"}
          </Button>
        </form>
      )}

      {profile ? (
        <section className="mt-12" aria-labelledby="my-feedback-title">
          <h2 id="my-feedback-title" className="font-display text-xl">
            Deine Nachrichten
          </h2>
          {mine.isPending ? (
            <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
          ) : list.length === 0 ? (
            <p className="mt-2 text-sm text-fg-muted">Du hast noch kein Feedback geschickt.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {list.map((f) => (
                <li key={f.id} className="rounded-2xl border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-fg-muted">
                      {kindTitle(f.kind)} · {dateFormat.format(new Date(f.createdAt))}
                    </p>
                    {f.doneAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-fg">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Erledigt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-fg-muted">
                        <Clock className="size-3.5" aria-hidden /> Beim Team
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-3 break-words whitespace-pre-line">{f.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

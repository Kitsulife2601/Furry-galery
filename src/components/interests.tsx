/** TikTok-style "What are you into?" popup after sign-up, plus the same picker for settings. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { saveInterests } from "@/lib/vela/server";
import { POST_TAGS, visibleTags, type PostTag } from "@/lib/vela/types";
import { useAppSession } from "@/lib/vela/app-session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMOJI: Record<PostTag, string> = {
  artwork: "🎨",
  fursuit: "🦊",
  foto: "📷",
  sketch: "✏️",
  comic: "💬",
  "3d": "🧊",
  pixel: "👾",
  meme: "😂",
  furry: "🐾",
  yuri: "🌷",
  yaoi: "💙",
  femboy: "🎀",
  cboy: "🔥",
};

function InterestGrid({ value, onToggle }: { value: PostTag[]; onToggle: (id: PostTag) => void }) {
  // FSK-18 categories only for members verified through Discord.
  const { profile } = useAppSession();
  const tags = visibleTags(Boolean(profile?.fsk18?.verified));
  return (
    <ul className="grid grid-cols-2 gap-2">
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(t.id)}
              className={cn(
                "relative flex h-16 w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors",
                on ? "border-accent bg-accent/15" : "border-border hover:bg-bg-subtle",
              )}
            >
              <span className="text-2xl" aria-hidden="true">
                {EMOJI[t.id]}
              </span>
              <span className="text-sm font-medium">{t.label}</span>
              {on ? (
                <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-accent text-accent-fg">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useSaveInterests() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function save(tags: PostTag[], done?: string) {
    setBusy(true);
    try {
      await saveInterests({ data: { tags } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
      ]);
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, save };
}

export function InterestsDialog({ onDone }: { onDone: () => void }) {
  const [tags, setTags] = useState<PostTag[]>([]);
  const { busy, save } = useSaveInterests();
  const toggle = (id: PostTag) =>
    setTags((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-bg/85 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interests-title"
    >
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-bg-elevated p-6 pb-8 sm:rounded-3xl">
        <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Willkommen</p>
        <h2 id="interests-title" className="mt-1 font-display text-3xl">
          Was interessiert dich?
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          Wähle, was du sehen möchtest — dein „Für dich“-Feed passt sich daran an. Du kannst das
          jederzeit in den Einstellungen ändern.
        </p>
        <div className="mt-5">
          <InterestGrid value={tags} onToggle={toggle} />
        </div>
        <Button
          className="mt-6 w-full"
          size="lg"
          disabled={busy || tags.length === 0}
          onClick={() => void save(tags).then((ok) => ok && onDone())}
        >
          {tags.length === 0 ? "Wähle mindestens eins" : `Weiter (${tags.length})`}
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save([]).then((ok) => ok && onDone())}
          className="mt-3 w-full py-2 text-sm text-fg-muted hover:text-fg"
        >
          Überspringen
        </button>
      </div>
    </div>
  );
}

export function InterestsSettings({ initial }: { initial: string[] }) {
  const [tags, setTags] = useState<PostTag[]>(
    POST_TAGS.map((t) => t.id).filter((id) => initial.includes(id)),
  );
  const { busy, save } = useSaveInterests();
  const toggle = (id: PostTag) =>
    setTags((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const changed =
    tags.join() !==
    POST_TAGS.map((t) => t.id)
      .filter((id) => initial.includes(id))
      .join();

  return (
    <section className="mt-10 space-y-3">
      <div>
        <p className="text-sm font-medium">Interessen</p>
        <p className="text-xs text-fg-subtle">Davon zeigt dir „Für dich“ mehr.</p>
      </div>
      <InterestGrid value={tags} onToggle={toggle} />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy || !changed}
        onClick={() => void save(tags, "Interessen gespeichert.")}
      >
        {busy ? "Speichert…" : "Interessen speichern"}
      </Button>
    </section>
  );
}

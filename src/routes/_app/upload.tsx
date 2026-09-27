import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { compressImageFile } from "@/lib/vela/compress-image";
import { createPost } from "@/lib/vela/server";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/upload")({ component: Upload });

function Upload() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [busy, setBusy] = useState(false);
  const { profile } = useAppSession();
  const canPostNsfw = Boolean(profile?.fsk18?.verified);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const [dataUrl, tiny] = await Promise.all([
        compressImageFile(file, { maxEdge: 1080, quality: 0.72 }),
        // What unverified visitors get for FSK18 posts: 16px, shown blurred.
        compressImageFile(file, { maxEdge: 16, quality: 0.6 }),
      ]);
      setPreview(dataUrl);
      setThumb(tiny);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bild unlesbar.");
    }
  }

  async function publish() {
    if (!preview) return;
    setBusy(true);
    try {
      await createPost({
        data: {
          imageUrl: preview,
          caption,
          nsfw,
          previewUrl: nsfw ? (thumb ?? undefined) : undefined,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["explore"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["profile-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      toast.success("Veröffentlicht.");
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Neu</p>
      <h1 className="mt-1 font-display text-3xl">Hochladen</h1>
      <p className="mt-2 text-sm text-fg-muted">Ein Bild, eine Zeile. Kein Lärm.</p>

      <label className="mt-8 flex aspect-3/4 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-bg-elevated">
        {preview ? (
          <img src={preview} alt="Vorschau" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-3 text-fg-muted">
            <ImagePlus className="size-8" />
            <span className="text-sm">Bild wählen</span>
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      <div className="mt-5 space-y-2">
        <Label htmlFor="caption">Caption</Label>
        <Textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={180}
          placeholder="Ein Satz reicht."
        />
      </div>

      <div className="mt-5 rounded-xl border border-border p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-(--color-accent)"
            checked={nsfw}
            disabled={!canPostNsfw}
            onChange={(e) => setNsfw(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">FSK 18</span>
            <span className="block text-xs text-fg-muted">
              Für alle ohne Discord-Verifizierung wird das Bild unkenntlich gemacht.
            </span>
          </span>
        </label>
        {canPostNsfw ? null : (
          <p className="mt-3 text-xs text-fg-subtle">
            FSK-18-Bilder posten kannst du nach der{" "}
            <Link to="/settings" hash="fsk18" className="underline underline-offset-4">
              Verifizierung über Discord
            </Link>
            .
          </p>
        )}
      </div>

      <Button
        className="mt-6 w-full"
        size="lg"
        disabled={!preview || busy}
        onClick={() => void publish()}
      >
        {busy ? "Wird veröffentlicht…" : "Veröffentlichen"}
      </Button>
    </div>
  );
}

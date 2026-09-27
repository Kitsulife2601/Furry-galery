import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { compressImageFile } from "@/lib/vela/compress-image";
import { MEDIA_LIMITS } from "@/lib/vela/media-limits";
import { POST_TAGS, type PostTag } from "@/lib/vela/types";
import { cn } from "@/lib/utils";
import { FittedImage } from "@/components/fitted-image";
import { createPost, videoUploadEnabled } from "@/lib/vela/server";
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/vela/video";
import { videoPoster } from "@/lib/vela/video-poster";
import { FSK18_THRESHOLD, explicitScore, loadNsfwModel } from "@/lib/vela/nsfw-check";
import { formatMb } from "@/lib/vela/media-limits";
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
  const [tags, setTags] = useState<PostTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // Automatic FSK18 check: explicit content can only be posted with the box ticked.
  const [check, setCheck] = useState<"idle" | "checking" | "ok" | "fsk18" | "error">("idle");
  const checkRun = useRef(0);
  const videosOn = useQuery({ queryKey: ["video-upload"], queryFn: () => videoUploadEnabled() });
  const { profile } = useAppSession();
  const canPostNsfw = Boolean(profile?.fsk18?.verified);

  useEffect(() => {
    // Warm up the model while the member picks a file.
    void loadNsfwModel().catch(() => undefined);
  }, []);

  async function runCheck(sources: string[]) {
    const run = ++checkRun.current;
    setCheck("checking");
    try {
      const score = await explicitScore(sources);
      if (run === checkRun.current) setCheck(score >= FSK18_THRESHOLD ? "fsk18" : "ok");
    } catch {
      if (run === checkRun.current) setCheck("error");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    checkRun.current++;
    setCheck("idle");
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    if (file.type.startsWith("video/")) {
      if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) {
        toast.error("Nur MP4, WebM oder MOV.");
        return;
      }
      if (file.size > VIDEO_MAX_BYTES) {
        toast.error(`Video zu groß (max. ${formatMb(VIDEO_MAX_BYTES)}).`);
        return;
      }
      if (videosOn.data === false) {
        toast.error(
          "Video-Upload ist noch nicht eingerichtet: in Vercel den Blob-Speicher mit dem Projekt verbinden und neu deployen.",
        );
        return;
      }
      try {
        const { poster, tiny, samples } = await videoPoster(file);
        setPreview(poster);
        setThumb(tiny);
        setVideo({ file, url: URL.createObjectURL(file) });
        void runCheck(samples);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Video unlesbar.");
      }
      return;
    }
    try {
      const [dataUrl, tiny] = await Promise.all([
        compressImageFile(file, { maxEdge: 1080, quality: 0.72, keepGifUpTo: MEDIA_LIMITS.post }),
        // What unverified visitors get for FSK18 posts: 16px, shown blurred.
        compressImageFile(file, { maxEdge: 16, quality: 0.6 }),
      ]);
      setPreview(dataUrl);
      setThumb(tiny);
      void runCheck([dataUrl]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bild unlesbar.");
    }
  }

  async function publish() {
    if (!preview) return;
    if (check === "fsk18" && !nsfw) {
      toast.error("Das wirkt wie FSK 18 – bitte den Haken bei FSK 18 setzen.");
      return;
    }
    setBusy(true);
    try {
      let videoUrl: string | undefined;
      if (video) {
        setProgress(0);
        const ext = video.file.name.split(".").pop()?.toLowerCase() || "mp4";
        const blob = await upload(`videos/video.${ext}`, video.file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          contentType: video.file.type,
          onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
        });
        videoUrl = blob.url;
      }
      await createPost({
        data: {
          imageUrl: preview,
          videoUrl,
          caption,
          nsfw,
          tags,
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
      const message = err instanceof Error ? err.message : "";
      toast.error(
        /client token|blob|fetch/i.test(message)
          ? `Video-Upload fehlgeschlagen: ${message}`
          : message || "Upload fehlgeschlagen.",
      );
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Neu</p>
      <h1 className="mt-1 font-display text-3xl">Hochladen</h1>
      <p className="mt-2 text-sm text-fg-muted">Ein Bild oder Video, eine Zeile. Kein Lärm.</p>

      <label className="mt-8 flex aspect-3/4 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-bg-elevated">
        {video ? (
          <video
            src={video.url}
            poster={preview ?? undefined}
            controls
            muted
            loop
            playsInline
            className="h-full w-full bg-bg object-contain"
          />
        ) : preview ? (
          <FittedImage src={preview} alt="Vorschau" className="h-full w-full" />
        ) : (
          <span className="flex flex-col items-center gap-3 text-fg-muted">
            <ImagePlus className="size-8" />
            <span className="text-sm">Bild, GIF oder Video wählen</span>
            <span className="text-xs text-fg-subtle">
              Videos: MP4, WebM, MOV bis {formatMb(VIDEO_MAX_BYTES)}
            </span>
          </span>
        )}
        <input
          type="file"
          accept={videosOn.data === false ? "image/*" : `image/*,${VIDEO_TYPES.join(",")}`}
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      {video ? (
        <button
          type="button"
          onClick={() => {
            URL.revokeObjectURL(video.url);
            setVideo(null);
            setPreview(null);
            setThumb(null);
            checkRun.current++;
            setCheck("idle");
          }}
          className="mt-2 text-sm text-fg-muted underline underline-offset-4"
        >
          Anderes auswählen
        </button>
      ) : null}

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

      <div className="mt-5 space-y-2">
        <Label>Kategorien (bis zu 3)</Label>
        <ul className="flex flex-wrap gap-2">
          {POST_TAGS.map((t) => {
            const on = tags.includes(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && tags.length >= 3}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t.id) : [...tags, t.id])}
                  className={cn(
                    "h-9 rounded-full border px-3 text-sm disabled:opacity-40",
                    on ? "border-accent bg-accent text-accent-fg" : "border-border",
                  )}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className={cn(
          "mt-5 rounded-xl border p-4",
          check === "fsk18" && !nsfw ? "border-heart" : "border-border",
        )}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-(--color-accent)"
            checked={nsfw}
            onChange={(e) => setNsfw(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">FSK 18</span>
            <span className="block text-xs text-fg-muted">
              Für alle, die nicht über Discord verifiziert sind, wird der Beitrag unkenntlich
              gemacht. Du selbst siehst es immer.
            </span>
          </span>
        </label>
        {check === "fsk18" ? (
          <p
            role="status"
            className={cn("mt-3 text-xs", nsfw ? "text-fg-muted" : "font-medium text-heart")}
          >
            {nsfw
              ? "Erkannt als FSK 18 – passt, der Haken ist gesetzt."
              : "Dieser Beitrag wirkt wie FSK 18. Setze den Haken, sonst kannst du ihn nicht veröffentlichen."}
          </p>
        ) : null}
        {canPostNsfw ? null : (
          <p className="mt-3 text-xs text-fg-subtle">
            FSK-18-Bilder von anderen siehst du nach der{" "}
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
        disabled={!preview || busy || check === "checking" || (check === "fsk18" && !nsfw)}
        onClick={() => void publish()}
      >
        {busy
          ? progress !== null && progress < 100
            ? `Video wird hochgeladen… ${progress}%`
            : "Wird veröffentlicht…"
          : check === "checking"
            ? "Wird geprüft…"
            : "Veröffentlichen"}
      </Button>
    </div>
  );
}

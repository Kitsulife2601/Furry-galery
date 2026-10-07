import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { upload } from "@vercel/blob/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useBlocker } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  Crop,
  Eye,
  Hash,
  Heart,
  ImagePlus,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { compressImageFile, hasEdits, type ImageEdits } from "@/lib/vela/compress-image";
import { memberErrorMessage } from "@/lib/vela/errors";
import { MAX_HASHTAGS, extractHashtags, splitCaption } from "@/lib/vela/hashtags";
import { MEDIA_LIMITS, formatMb } from "@/lib/vela/media-limits";
import {
  MAX_POST_TAGS,
  POST_TAGS,
  isAdultTag,
  relationshipLabel,
  tagLabel,
  type PostCard,
  type PostTag,
} from "@/lib/vela/types";
import { cn } from "@/lib/utils";
import { FittedImage } from "@/components/fitted-image";
import { createPost, videoUploadEnabled } from "@/lib/vela/server";
import { suggestHashtags } from "@/lib/vela/upload-api";
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/vela/video";
import { videoPoster } from "@/lib/vela/video-poster";
import { FSK18_THRESHOLD, explicitScore, loadNsfwModel } from "@/lib/vela/nsfw-check";
import { Button } from "@/components/ui/button";
import { MY_UPLOADS_KEY, UploadsLink } from "@/components/my-uploads";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DecoratedAvatar } from "@/components/avatar-decoration";
import { StyledName } from "@/components/styled-name";
import { NamePlate } from "@/components/name-plate";
import { PostViewerLoader } from "@/components/post-viewer-loader";

export const Route = createFileRoute("/_app/upload")({ component: Upload });

const MAX_CAPTION = 180;
const STEPS = ["Datei", "Details", "Veröffentlichen"] as const;

type Media =
  | {
      kind: "image";
      file: File;
      /** Animated GIFs are kept as they are, so no editing. */
      gif: boolean;
      src: string;
      tiny: string;
      edits: ImageEdits;
    }
  | {
      kind: "video";
      file: File;
      url: string;
      src: string;
      tiny: string;
      frames: string[];
      duration: number;
    };

type Check = "idle" | "checking" | "ok" | "fsk18" | "error";
type Phase = "edit" | "uploading" | "saving" | "done";

function imageOpts(edits: ImageEdits) {
  return [
    { maxEdge: 1080, quality: 0.72, keepGifUpTo: MEDIA_LIMITS.post, edits },
    // What unverified visitors get for FSK18 posts: 16px, shown blurred.
    { maxEdge: 16, quality: 0.6, edits },
  ] as const;
}

function Upload() {
  const queryClient = useQueryClient();
  const { profile } = useAppSession();
  const [media, setMedia] = useState<Media | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [caption, setCaption] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [tags, setTags] = useState<PostTag[]>([]);
  const [phase, setPhase] = useState<Phase>("edit");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PostCard | null>(null);
  const [viewing, setViewing] = useState(false);
  const [view, setView] = useState<"edit" | "feed">("edit");
  const [dragging, setDragging] = useState(false);
  const [inputFocus, setInputFocus] = useState(false);
  // Automatic FSK18 check: explicit content can only be posted with the box ticked.
  const [check, setCheck] = useState<Check>("idle");
  const checkRun = useRef(0);
  const fileRun = useRef(0);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<Media | null>(null);
  const videosOn = useQuery({ queryKey: ["video-upload"], queryFn: () => videoUploadEnabled() });

  const isMinor = profile ? profile.age < 18 : false;
  const canSeeNsfw = Boolean(profile?.fsk18?.verified);
  const busy = phase === "uploading" || phase === "saving";
  const dirty = phase !== "done" && (media !== null || caption.trim() !== "");

  useEffect(() => {
    // Warm up the model while the member picks a file.
    void loadNsfwModel().catch(() => undefined);
  }, []);

  // Free the local video when leaving the page.
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(
    () => () => {
      const m = mediaRef.current;
      if (m?.kind === "video") URL.revokeObjectURL(m.url);
    },
    [],
  );

  // Don't lose a prepared upload by accident.
  useBlocker({
    shouldBlockFn: () =>
      !window.confirm(
        busy
          ? "Dein Upload läuft noch. Wirklich verlassen? Dann wird er abgebrochen."
          : "Dein Upload ist noch nicht veröffentlicht. Wirklich verlassen?",
      ),
    disabled: !dirty,
    enableBeforeUnload: dirty,
  });

  function replaceMedia(next: Media | null) {
    const old = mediaRef.current;
    if (old?.kind === "video" && old.url !== (next?.kind === "video" ? next.url : null)) {
      URL.revokeObjectURL(old.url);
    }
    mediaRef.current = next;
    setMedia(next);
  }

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

  const onFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file || busy || phase === "done") return;
      const run = ++fileRun.current;
      setError(null);
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/")) {
        toast.error("Das ist kein Bild und kein Video.");
        return;
      }
      if (isVideo) {
        if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) {
          toast.error("Videos bitte als MP4, WebM oder MOV.");
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
      }
      checkRun.current++;
      setCheck("idle");
      setPreparing(true);
      try {
        let next: Media;
        if (isVideo) {
          const { poster, tiny, samples, duration } = await videoPoster(file);
          if (run !== fileRun.current) return;
          next = {
            kind: "video",
            file,
            url: URL.createObjectURL(file),
            src: poster,
            tiny,
            frames: samples,
            duration,
          };
        } else {
          const [big, small] = imageOpts({});
          const [src, tiny] = await Promise.all([
            compressImageFile(file, big),
            compressImageFile(file, small),
          ]);
          if (run !== fileRun.current) return;
          next = { kind: "image", file, gif: file.type === "image/gif", src, tiny, edits: {} };
        }
        replaceMedia(next);
        setView("edit");
        void runCheck(next.kind === "video" ? next.frames : [next.src]);
      } catch (err) {
        if (run === fileRun.current) {
          toast.error(err instanceof Error ? err.message : "Datei unlesbar.");
        }
      } finally {
        if (run === fileRun.current) setPreparing(false);
      }
    },
    [busy, phase, videosOn.data],
  );

  // Paste an image straight from the clipboard (Strg+V / long-press → Einfügen).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = [...(e.clipboardData?.files ?? [])].find(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
      );
      if (!file) return;
      e.preventDefault();
      void onFile(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  async function applyEdits(edits: ImageEdits) {
    const current = mediaRef.current;
    if (current?.kind !== "image" || current.gif) return;
    const run = ++fileRun.current;
    setPreparing(true);
    try {
      const [big, small] = imageOpts(edits);
      const [src, tiny] = await Promise.all([
        compressImageFile(current.file, big),
        compressImageFile(current.file, small),
      ]);
      if (run !== fileRun.current) return;
      replaceMedia({ ...current, src, tiny, edits });
      void runCheck([src]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bearbeiten fehlgeschlagen.");
    } finally {
      if (run === fileRun.current) setPreparing(false);
    }
  }

  function removeMedia() {
    fileRun.current++;
    checkRun.current++;
    replaceMedia(null);
    setCheck("idle");
    setPreparing(false);
    setError(null);
    setView("edit");
  }

  function resetAll() {
    removeMedia();
    setCaption("");
    setNsfw(false);
    setTags([]);
    setProgress(0);
    setPublished(null);
    setViewing(false);
    setPhase("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onDragEnter(e: DragEvent) {
    if (!e.dataTransfer.types.includes("Files") || busy) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void onFile(e.dataTransfer.files?.[0]);
  }

  async function publish() {
    if (!media || busy) return;
    if (check === "fsk18" && !nsfw) {
      toast.error("Das wirkt wie FSK 18 – bitte den Haken bei FSK 18 setzen.");
      return;
    }
    setError(null);
    try {
      let videoUrl: string | undefined;
      if (media.kind === "video") {
        setPhase("uploading");
        setProgress(0);
        const ext = media.file.name.split(".").pop()?.toLowerCase() || "mp4";
        try {
          const blob = await upload(`videos/video.${ext}`, media.file, {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: media.file.type,
            onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
          });
          videoUrl = blob.url;
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          throw new Error(
            `Video-Upload fehlgeschlagen${message ? `: ${message}` : "."} Prüf deine Verbindung und versuch es nochmal.`,
          );
        }
      }
      setPhase("saving");
      const post = await createPost({
        data: {
          imageUrl: media.src,
          videoUrl,
          videoFrames: media.kind === "video" ? media.frames : undefined,
          caption,
          nsfw,
          tags,
          previewUrl: nsfw ? media.tiny : undefined,
        },
      });
      // Opening it right away needs no extra request.
      queryClient.setQueryData(["post", post.id], post);
      setPublished(post);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
      await Promise.all(
        [["feed"], ["explore"], ["me"], ["profile-posts"], ["profile"], MY_UPLOADS_KEY].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    } catch (err) {
      setError(memberErrorMessage(err, "Veröffentlichen fehlgeschlagen. Versuch es nochmal."));
      setPhase("edit");
      setProgress(0);
    }
  }

  const step = !media ? 0 : busy || phase === "done" ? 2 : 1;
  const blockedFsk = check === "fsk18" && !nsfw;
  const canPublish = Boolean(media) && !preparing && !busy && check !== "checking" && !blockedFsk;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 pb-28 md:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.22em] text-fg-subtle uppercase">Neu</p>
          <h1 className="mt-1 font-display text-3xl">Hochladen</h1>
          <p className="mt-2 text-sm text-fg-muted">Ein Bild oder Video, eine Zeile. Kein Lärm.</p>
        </div>
      </div>

      <Steps current={step} done={phase === "done"} />

      {phase === "done" && published ? (
        <Success
          post={published}
          onView={() => setViewing(true)}
          onAnother={resetAll}
        />
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-2 md:items-start">
          {/* 1 · Datei */}
          <section aria-labelledby="step-file" className="min-w-0 md:sticky md:top-20">
            <h2 id="step-file" className="sr-only">
              Datei
            </h2>
            <input
              ref={inputRef}
              id="upload-file"
              type="file"
              accept={videosOn.data === false ? "image/*" : `image/*,${VIDEO_TYPES.join(",")}`}
              className="sr-only"
              tabIndex={media ? -1 : 0}
              disabled={busy}
              onFocus={(e) => setInputFocus(e.target.matches(":focus-visible"))}
              onBlur={() => setInputFocus(false)}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                // Picking the same file again should work too.
                e.target.value = "";
              }}
            />
            {media ? (
              <div className="flex justify-center pb-3">
                <div
                  role="tablist"
                  aria-label="Ansicht"
                  className="inline-flex rounded-full border border-border bg-bg-elevated p-1 text-sm"
                >
                  {(
                    [
                      ["edit", "Bearbeiten"],
                      ["feed", "Im Feed"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={view === id}
                      onClick={() => setView(id)}
                      className={cn(
                        "h-9 rounded-full px-4 transition-colors",
                        view === id ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              onDragEnter={onDragEnter}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) e.preventDefault();
              }}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className="relative"
            >
              {!media ? (
                <label
                  htmlFor="upload-file"
                  className={cn(
                    "upload-drop flex aspect-3/4 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border-strong bg-bg-elevated p-6 text-center text-fg-muted transition-colors hover:border-accent/60 hover:text-fg",
                    inputFocus && "ring-2 ring-ring/70",
                    dragging && "upload-drop-active border-accent text-fg",
                  )}
                >
                  {preparing ? (
                    <>
                      <Loader2 className="size-8 animate-spin motion-reduce:animate-none" />
                      <span className="text-sm">Datei wird vorbereitet…</span>
                    </>
                  ) : (
                    <>
                      <span className="grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent">
                        <ImagePlus className="size-7" />
                      </span>
                      <span className="font-medium text-fg">
                        {dragging ? "Loslassen zum Hochladen" : "Bild, GIF oder Video wählen"}
                      </span>
                      <span className="max-w-[16rem] text-xs text-fg-subtle">
                        Hierher ziehen, antippen oder aus der Zwischenablage einfügen.
                        {videosOn.data === false
                          ? ""
                          : ` Videos: MP4, WebM, MOV bis ${formatMb(VIDEO_MAX_BYTES)}.`}
                      </span>
                    </>
                  )}
                </label>
              ) : view === "feed" ? (
                <FeedPreview
                  media={media}
                  caption={caption}
                  nsfw={nsfw}
                  tags={tags}
                  canSeeNsfw={canSeeNsfw}
                />
              ) : (
                <div className="relative aspect-3/4 overflow-hidden rounded-2xl border border-border bg-bg-elevated">
                  {media.kind === "video" ? (
                    <video
                      src={media.url}
                      poster={media.src}
                      controls
                      muted
                      loop
                      playsInline
                      className="h-full w-full bg-bg object-contain"
                    />
                  ) : (
                    <FittedImage src={media.src} alt="Vorschau" className="h-full w-full" />
                  )}
                  {preparing ? (
                    <div className="absolute inset-0 grid place-items-center bg-bg/60">
                      <Loader2 className="size-8 animate-spin text-fg motion-reduce:animate-none" />
                    </div>
                  ) : null}
                  {dragging ? (
                    <div className="upload-drop-active absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-bg/70 text-sm font-medium">
                      Loslassen zum Ersetzen
                    </div>
                  ) : null}
                  <CheckBadge check={check} nsfw={nsfw} />
                </div>
              )}
            </div>

            {media ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {media.kind === "image" && !media.gif ? (
                  <>
                    <ToolButton
                      icon={RotateCw}
                      label="Drehen"
                      disabled={preparing || busy}
                      onClick={() =>
                        void applyEdits({
                          ...media.edits,
                          rotate: (((media.edits.rotate ?? 0) + 90) % 360) as ImageEdits["rotate"],
                        })
                      }
                    />
                    <ToolButton
                      icon={Crop}
                      label="3:4"
                      pressed={Boolean(media.edits.aspect)}
                      disabled={preparing || busy}
                      onClick={() =>
                        void applyEdits({
                          ...media.edits,
                          aspect: media.edits.aspect ? null : 3 / 4,
                        })
                      }
                    />
                    {hasEdits(media.edits) ? (
                      <ToolButton
                        icon={Undo2}
                        label="Original"
                        disabled={preparing || busy}
                        onClick={() => void applyEdits({})}
                      />
                    ) : null}
                  </>
                ) : null}
                <ToolButton
                  icon={RefreshCw}
                  label="Ersetzen"
                  disabled={preparing || busy}
                  onClick={() => inputRef.current?.click()}
                />
                <ToolButton
                  icon={Trash2}
                  label="Entfernen"
                  disabled={busy}
                  onClick={removeMedia}
                />
              </div>
            ) : null}
            {media?.kind === "image" && media.gif ? (
              <p className="mt-2 text-center text-xs text-fg-subtle">
                GIFs bleiben unverändert, damit sie animiert bleiben.
              </p>
            ) : null}
            {media?.kind === "video" && media.duration ? (
              <p className="mt-2 text-center text-xs text-fg-subtle tabular-nums">
                Video · {formatDuration(media.duration)} · {formatMb(media.file.size)}
              </p>
            ) : null}
          </section>

          {/* 2 · Details, 3 · Veröffentlichen */}
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="step-details" className="space-y-5">
              <h2 id="step-details" className="font-display text-xl">
                Details
              </h2>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="caption">Caption</Label>
                  <span
                    aria-live="polite"
                    className={cn(
                      "text-xs tabular-nums",
                      caption.length > MAX_CAPTION - 15 ? "text-heart" : "text-fg-subtle",
                    )}
                  >
                    {caption.length}/{MAX_CAPTION}
                  </span>
                </div>
                <Textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={MAX_CAPTION}
                  disabled={busy}
                  placeholder="Ein Satz reicht. #hashtags helfen dem Feed."
                />
                <Hashtags caption={caption} onChange={setCaption} disabled={busy} />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label>Kategorien</Label>
                  <span className="text-xs text-fg-subtle tabular-nums">
                    {tags.length}/{MAX_POST_TAGS}
                  </span>
                </div>
                <TagChips
                  tags={POST_TAGS.filter((t) => !isAdultTag(t.id))}
                  value={tags}
                  onChange={setTags}
                  disabled={busy}
                />
              </div>

              <div
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  blockedFsk ? "border-heart bg-heart/5" : "border-border",
                )}
              >
                <label className={cn("flex items-start gap-3", isMinor ? "opacity-60" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-(--color-accent)"
                    checked={nsfw}
                    disabled={isMinor || busy}
                    onChange={(e) => {
                      setNsfw(e.target.checked);
                      // FSK-18 categories only exist on FSK-18 posts.
                      if (!e.target.checked) setTags((cur) => cur.filter((t) => !isAdultTag(t)));
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">FSK 18</span>
                    <span className="block text-xs text-fg-muted">
                      {isMinor
                        ? "FSK-18-Inhalte kannst du erst ab 18 hochladen."
                        : "Für alle, die nicht über Discord verifiziert sind, wird der Beitrag unkenntlich gemacht. Du selbst siehst es immer."}
                    </span>
                  </span>
                </label>
                {nsfw ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-fg-muted">FSK-18-Kategorien</p>
                    <TagChips
                      tags={POST_TAGS.filter((t) => isAdultTag(t.id))}
                      value={tags}
                      onChange={setTags}
                      disabled={busy}
                    />
                  </div>
                ) : null}
                {check === "fsk18" ? (
                  <p
                    role="status"
                    className={cn(
                      "mt-3 flex items-start gap-1.5 text-xs",
                      nsfw ? "text-fg-muted" : "font-medium text-heart",
                    )}
                  >
                    {nsfw ? (
                      <Check className="mt-px size-3.5 shrink-0" />
                    ) : (
                      <AlertCircle className="mt-px size-3.5 shrink-0" />
                    )}
                    {nsfw
                      ? "Erkannt als FSK 18 – passt, der Haken ist gesetzt."
                      : isMinor
                        ? "Dieser Beitrag wirkt wie FSK 18 und kann so nicht veröffentlicht werden."
                        : "Dieser Beitrag wirkt wie FSK 18. Setze den Haken, sonst kannst du ihn nicht veröffentlichen."}
                  </p>
                ) : null}
                {canSeeNsfw || isMinor ? null : (
                  <p className="mt-3 text-xs text-fg-subtle">
                    FSK-18-Bilder von anderen siehst du nach der{" "}
                    <Link to="/settings" hash="fsk18" className="underline underline-offset-4">
                      Verifizierung über Discord
                    </Link>
                    .
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="step-publish" className="space-y-3">
              <h2 id="step-publish" className="sr-only">
                Veröffentlichen
              </h2>
              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-heart/50 bg-heart/10 p-3 text-sm"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-heart" />
                  <p className="min-w-0 flex-1 break-words">{error}</p>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    aria-label="Hinweis schließen"
                    className="-m-2 grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : null}

              {busy ? (
                <div aria-live="polite" className="space-y-2">
                  <div className="flex justify-between text-xs text-fg-muted">
                    <span>
                      {phase === "uploading" ? "Video wird hochgeladen…" : "Wird veröffentlicht…"}
                    </span>
                    {phase === "uploading" ? (
                      <span className="tabular-nums">{progress}%</span>
                    ) : null}
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Fortschritt"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={phase === "uploading" ? progress : undefined}
                    className="h-2 overflow-hidden rounded-full bg-bg-subtle"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full bg-accent transition-[width] duration-300",
                        phase === "saving" && "upload-progress-indeterminate",
                      )}
                      style={{ width: phase === "uploading" ? `${Math.max(3, progress)}%` : "40%" }}
                    />
                  </div>
                </div>
              ) : media && check === "checking" ? (
                <p className="flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Wir
                  prüfen kurz automatisch, ob es FSK 18 ist…
                </p>
              ) : media && check === "error" ? (
                <p className="text-xs text-fg-subtle">
                  Die automatische Prüfung ging gerade nicht – sie läuft beim Veröffentlichen
                  nochmal.
                </p>
              ) : null}

              <Button
                className="w-full"
                size="lg"
                disabled={!canPublish}
                onClick={() => void publish()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    {phase === "uploading" ? `Lädt hoch… ${progress}%` : "Wird veröffentlicht…"}
                  </>
                ) : preparing ? (
                  "Wird vorbereitet…"
                ) : check === "checking" ? (
                  "Wird geprüft…"
                ) : error ? (
                  "Nochmal versuchen"
                ) : (
                  "Veröffentlichen"
                )}
              </Button>
              {!media ? (
                <p className="text-center text-xs text-fg-subtle">
                  Wähl zuerst ein Bild oder Video.
                </p>
              ) : null}
            </section>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md md:max-w-none">
        <UploadsLink />
      </div>

      {viewing && published ? (
        <PostViewerLoader postId={published.id} onClose={() => setViewing(false)} />
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Steps({ current, done }: { current: number; done: boolean }) {
  return (
    <ol className="mt-6 flex items-center gap-2" aria-label="Schritte">
      {STEPS.map((label, i) => {
        const complete = done || i < current;
        const active = !done && i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                complete
                  ? "border-accent bg-accent text-accent-fg"
                  : active
                    ? "border-accent text-fg"
                    : "border-border text-fg-subtle",
              )}
            >
              {complete ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs sm:text-sm",
                active || complete ? "text-fg" : "text-fg-subtle",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn("h-px min-w-3 flex-1", complete ? "bg-accent/60" : "bg-border")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function CheckBadge({ check, nsfw }: { check: Check; nsfw: boolean }) {
  if (check === "idle" || check === "error") return null;
  const label =
    check === "checking"
      ? "Prüfung…"
      : check === "fsk18"
        ? nsfw
          ? "FSK 18"
          : "Wirkt wie FSK 18"
        : "Geprüft";
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md",
        check === "fsk18" && !nsfw ? "bg-heart/90 text-on-media" : "bg-bg/70 text-on-media",
      )}
    >
      {check === "checking" ? (
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
      ) : check === "fsk18" ? (
        <Lock className="size-3" />
      ) : (
        <ShieldCheck className="size-3" />
      )}
      {label}
    </span>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  pressed,
}: {
  icon: typeof RotateCw;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors disabled:opacity-40",
        pressed
          ? "border-accent bg-accent text-accent-fg"
          : "border-border bg-bg-elevated text-fg hover:bg-bg-subtle",
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

/** Hashtags found in the caption (removable) plus one-tap suggestions. */
function Hashtags({
  caption,
  onChange,
  disabled,
}: {
  caption: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const suggestions = useQuery({
    queryKey: ["hashtag-suggestions"],
    queryFn: () => suggestHashtags(),
    staleTime: 5 * 60_000,
  });
  const found = extractHashtags(caption);
  const full = found.length >= MAX_HASHTAGS;
  const offers = [...(suggestions.data?.mine ?? []), ...(suggestions.data?.popular ?? [])]
    .filter((t) => !found.includes(t))
    .slice(0, 10);

  function add(tag: string) {
    const base = caption.trimEnd();
    const next = `${base}${base ? " " : ""}#${tag}`;
    if (next.length > MAX_CAPTION) {
      toast.error("Kein Platz mehr in der Caption.");
      return;
    }
    onChange(next);
  }

  function remove(tag: string) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    onChange(
      caption
        .replace(new RegExp(`(^|\\s)#${escaped}(?![\\p{L}\\p{N}_])`, "giu"), "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    );
  }

  if (!found.length && !offers.length) return null;
  return (
    <div className="space-y-2 pt-1">
      {found.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Deine Hashtags">
          {found.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => remove(t)}
                disabled={disabled}
                aria-label={`#${t} entfernen`}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-accent/15 pr-2 pl-3 text-xs font-medium text-accent hover:bg-accent/25"
              >
                #{t} <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {offers.length ? (
        <div className="flex items-start gap-2">
          <Hash className="mt-2 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
          <ul className="flex flex-wrap gap-1.5" aria-label="Hashtag-Vorschläge">
            {offers.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => add(t)}
                  disabled={disabled || full}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40"
                >
                  <Plus className="size-3" />
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {full ? (
        <p className="text-[11px] text-fg-subtle">Höchstens {MAX_HASHTAGS} Hashtags zählen.</p>
      ) : null}
    </div>
  );
}

/** How the post will look in the "Für dich" feed. */
function FeedPreview({
  media,
  caption,
  nsfw,
  tags,
  canSeeNsfw,
}: {
  media: Media;
  caption: string;
  nsfw: boolean;
  tags: PostTag[];
  canSeeNsfw: boolean;
}) {
  const { profile } = useAppSession();
  const [asLocked, setAsLocked] = useState(false);
  const locked = nsfw && asLocked;
  const name = profile?.displayName ?? "Du";
  return (
    <div>
      <div className="relative mx-auto aspect-9/16 max-h-[70vh] w-full max-w-[22rem] overflow-hidden rounded-[1.75rem] border border-border bg-bg shadow-[0_20px_60px_-20px_rgb(0_0_0/0.6)]">
        {locked ? (
          <>
            <img
              src={media.tiny}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
            />
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-on-media">
              <div>
                <Lock className="mx-auto size-7" strokeWidth={1.7} />
                <p className="mt-2 font-display text-xl">FSK 18</p>
                <p className="mt-1 text-xs text-on-media/80">
                  Nur für Verifizierte sichtbar.
                </p>
              </div>
            </div>
          </>
        ) : media.kind === "video" ? (
          <video
            src={media.url}
            poster={media.src}
            muted
            loop
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <FittedImage src={media.src} alt="Vorschau im Feed" className="absolute inset-0 h-full w-full" />
        )}
        {nsfw ? (
          <span className="pointer-events-none absolute top-3 left-3 flex items-center gap-1 rounded bg-bg/80 px-1.5 py-0.5 text-[10px] font-semibold text-fg">
            {locked ? <Lock className="size-3" /> : null}
            18+
          </span>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-bg/90 via-bg/40 to-transparent" />
        <div
          aria-hidden="true"
          className="absolute right-3 bottom-6 flex flex-col items-center gap-3 text-on-media"
        >
          <DecoratedAvatar
            src={profile?.avatarUrl ?? null}
            name={name}
            decoration={profile?.decoration}
            className="size-10"
            imgClassName="border border-on-media/40"
            letterClassName="text-xs"
          />
          <span className="flex flex-col items-center gap-0.5 text-[11px]">
            <Heart className="size-6" strokeWidth={1.7} />0
          </span>
          <span className="flex flex-col items-center gap-0.5 text-[11px]">
            <MessageCircle className="size-5" strokeWidth={1.7} />0
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-4 pr-16 pb-6 text-on-media">
          {profile ? (
            <NamePlate plate={profile.namePlate}>
              <StyledName
                text={`@${profile.handle}`}
                nameStyle={profile.nameStyle}
                className="text-sm font-medium"
              />
            </NamePlate>
          ) : null}
          {profile ? (
            <p className="mt-0.5 text-[11px] text-on-media/70">
              {profile.age} · {relationshipLabel(profile.relationshipStatus)}
            </p>
          ) : null}
          {caption.trim() ? (
            <p className="mt-1.5 text-xs leading-snug break-words">
              {splitCaption(caption).map((part, i) =>
                part.hashtag ? (
                  <span key={i} className="font-medium text-accent">
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-on-media/50 italic">Noch keine Caption</p>
          )}
          {tags.length ? (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-bg/50 px-2 py-0.5 text-[10px] text-on-media/90 backdrop-blur-sm"
                >
                  {tagLabel(t)}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
      {nsfw ? (
        <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={asLocked}
            onChange={(e) => setAsLocked(e.target.checked)}
            className="size-4 accent-(--color-accent)"
          />
          So sehen es Nicht-Verifizierte
          {canSeeNsfw ? null : " (und du bei anderen)"}
        </label>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
          <Eye className="size-3.5" /> So sieht dein Beitrag im Feed aus.
        </p>
      )}
    </div>
  );
}

function Success({
  post,
  onView,
  onAnother,
}: {
  post: PostCard;
  onView: () => void;
  onAnother: () => void;
}) {
  return (
    <section
      aria-live="polite"
      className="upload-success mx-auto mt-8 max-w-md rounded-3xl border border-border bg-bg-elevated/70 p-6 text-center"
    >
      <div className="relative mx-auto w-40">
        <span className="block aspect-3/4 overflow-hidden rounded-2xl border border-border bg-bg-subtle">
          <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="upload-success-check absolute -right-3 -bottom-3 grid size-11 place-items-center rounded-full border-4 border-bg-elevated bg-accent text-accent-fg">
          <Check className="size-5" strokeWidth={2.5} />
        </span>
      </div>
      <h2 className="mt-6 font-display text-2xl">Veröffentlicht!</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Dein Beitrag ist jetzt im Feed und in der Gallery.
        {post.nsfw ? " Nicht-Verifizierte sehen ihn verschwommen." : ""}
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Button onClick={onView} size="lg">
          <Eye className="size-4" /> Ansehen
        </Button>
        <Button onClick={onAnother} size="lg" variant="secondary">
          <Plus className="size-4" /> Noch eins
        </Button>
      </div>
    </section>
  );
}

function TagChips({
  tags,
  value,
  onChange,
  disabled,
}: {
  tags: readonly { id: PostTag; label: string }[];
  value: PostTag[];
  onChange: (next: PostTag[]) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={on}
              disabled={disabled || (!on && value.length >= MAX_POST_TAGS)}
              onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
              className={cn(
                "h-11 rounded-full border px-4 text-sm transition-colors disabled:opacity-40",
                on
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border hover:border-border-strong",
              )}
            >
              {t.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

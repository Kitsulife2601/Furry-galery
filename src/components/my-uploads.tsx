/**
 * "Deine Uploads" helpers: the link from the upload page (with the headline
 * numbers) and the dialog to edit or delete one of your own posts.
 */
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronRight, Eye, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deletePost, listMyUploads, type MyUpload } from "@/lib/vela/server";
import { getMyPost, updateMyPost } from "@/lib/vela/upload-api";
import { memberErrorMessage } from "@/lib/vela/errors";
import { removePostFromCaches } from "@/lib/vela/post-cache";
import { MAX_POST_TAGS, POST_TAGS, isAdultTag, type PostTag } from "@/lib/vela/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const MY_UPLOADS_KEY = ["my-uploads"] as const;

const number = new Intl.NumberFormat("de");

export function UploadsLink() {
  const query = useQuery({ queryKey: MY_UPLOADS_KEY, queryFn: () => listMyUploads() });
  const list = query.data ?? [];
  const views = list.reduce((sum, u) => sum + u.views, 0);
  const likes = list.reduce((sum, u) => sum + u.likes, 0);
  return (
    <Link
      to="/uploads"
      className="mt-10 flex items-center gap-3 rounded-2xl border border-border bg-bg-elevated/70 p-4 transition-colors hover:border-border-strong"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
        <BarChart3 className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Deine Uploads</span>
        <span className="block text-xs text-fg-muted">
          {list.length
            ? `${list.length} ${list.length === 1 ? "Beitrag" : "Beiträge"} · ${number.format(views)} Aufrufe · ${number.format(likes)} Likes`
            : "Alles, was du teilst, mit Aufrufen und Likes"}
        </span>
      </span>
      <ChevronRight className="size-5 text-fg-subtle" />
    </Link>
  );
}

const MAX_CAPTION = 180;

/** Edit caption + categories of an own post, or delete it. */
export function EditUploadDialog({
  upload,
  onClose,
  onOpenPost,
}: {
  upload: MyUpload;
  onClose: () => void;
  onOpenPost: () => void;
}) {
  const queryClient = useQueryClient();
  const details = useQuery({
    queryKey: ["my-post", upload.id],
    queryFn: () => getMyPost({ data: { id: upload.id } }),
  });
  const [caption, setCaption] = useState(upload.caption);
  const [tags, setTags] = useState<PostTag[]>([]);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (details.data) {
      setCaption(details.data.caption);
      setTags(details.data.tags);
    }
  }, [details.data]);

  const nsfw = details.data?.nsfw ?? upload.nsfw;
  const changed =
    Boolean(details.data) &&
    (caption.trim() !== details.data!.caption.trim() ||
      tags.join() !== details.data!.tags.join());

  async function refresh() {
    await Promise.all(
      [MY_UPLOADS_KEY, ["post", upload.id], ["feed"], ["explore"], ["profile-posts"], ["me"], ["profile"]].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }

  async function save() {
    setBusy("save");
    try {
      await updateMyPost({ data: { id: upload.id, caption, tags } });
      queryClient.removeQueries({ queryKey: ["my-post", upload.id] });
      await refresh();
      toast.success("Gespeichert.");
      onClose();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Speichern fehlgeschlagen."));
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await deletePost({ data: { id: upload.id } });
      removePostFromCaches(queryClient, upload.id);
      queryClient.setQueryData<MyUpload[]>(MY_UPLOADS_KEY, (old) =>
        old?.filter((u) => u.id !== upload.id),
      );
      await refresh();
      toast.success("Beitrag gelöscht.");
      onClose();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
      setBusy(null);
    }
  }

  const choices = POST_TAGS.filter((t) => nsfw || !isAdultTag(t.id));

  return (
    <Dialog.Root open onOpenChange={(open) => (open || busy ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-bg/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-bg-elevated p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg focus:outline-none sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-3xl"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-bg-subtle">
              <img src={upload.imageUrl} alt="" className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-xl">Beitrag bearbeiten</Dialog.Title>
              <p className="text-xs text-fg-muted">
                {number.format(upload.views)} Aufrufe · {number.format(upload.likes)} Likes
                {nsfw ? " · FSK 18" : ""}
              </p>
            </div>
            <Dialog.Close
              className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-muted hover:text-fg"
              aria-label="Schließen"
              disabled={busy !== null}
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          {details.isPending ? (
            <div className="grid h-48 place-items-center">
              <Loader2 className="size-6 animate-spin text-fg-muted motion-reduce:animate-none" />
            </div>
          ) : !details.data ? (
            <p className="mt-6 text-sm text-fg-muted">Diesen Beitrag gibt es nicht mehr.</p>
          ) : (
            <>
              <div className="mt-5 space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="edit-caption">Caption</Label>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      caption.length > MAX_CAPTION - 15 ? "text-heart" : "text-fg-subtle",
                    )}
                  >
                    {caption.length}/{MAX_CAPTION}
                  </span>
                </div>
                <Textarea
                  id="edit-caption"
                  value={caption}
                  maxLength={MAX_CAPTION}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Ein Satz reicht. #hashtags helfen dem Feed."
                />
              </div>
              <div className="mt-5 space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label>Kategorien</Label>
                  <span className="text-xs text-fg-subtle tabular-nums">
                    {tags.length}/{MAX_POST_TAGS}
                  </span>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {choices.map((t) => {
                    const on = tags.includes(t.id);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          disabled={!on && tags.length >= MAX_POST_TAGS}
                          onClick={() =>
                            setTags(on ? tags.filter((x) => x !== t.id) : [...tags, t.id])
                          }
                          className={cn(
                            "h-10 rounded-full border px-3.5 text-sm transition-colors disabled:opacity-40",
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
                <p className="text-[11px] text-fg-subtle">
                  FSK 18 bleibt so, wie du es beim Hochladen gewählt hast.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={onOpenPost} disabled={busy !== null}>
                  <Eye className="size-4" /> Ansehen
                </Button>
                <Button onClick={() => void save()} disabled={!changed || busy !== null}>
                  {busy === "save" ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  Speichern
                </Button>
              </div>
            </>
          )}

          <div className="mt-6 border-t border-border pt-4">
            {confirmDelete ? (
              <div className="rounded-xl border border-heart/50 bg-heart/10 p-3">
                <p className="text-sm">
                  Wirklich löschen? Likes und Kommentare sind dann auch weg.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy !== null}
                  >
                    Abbrechen
                  </Button>
                  <Button variant="danger" onClick={() => void remove()} disabled={busy !== null}>
                    {busy === "delete" ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : null}
                    Ja, löschen
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy !== null}
                className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm text-heart hover:underline"
              >
                <Trash2 className="size-4" /> Beitrag löschen
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

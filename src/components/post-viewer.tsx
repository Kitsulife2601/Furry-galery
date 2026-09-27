import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Flag, Heart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSession } from "@/lib/vela/app-session";
import { memberErrorMessage } from "@/lib/vela/errors";
import { patchPostInCaches, removePostFromCaches } from "@/lib/vela/post-cache";
import { deletePost, toggleLike } from "@/lib/vela/server";
import { relationshipLabel, type PostCard } from "@/lib/vela/types";
import { ReportDialog } from "@/components/report-dialog";
import { Fsk18Badge, Fsk18Notice, PostImage } from "@/components/fsk18";
import { Comments } from "@/components/comments";
import { TagList } from "@/components/tag-list";
import { cn } from "@/lib/utils";

export function PostViewer({ post, onClose }: { post: PostCard; onClose: () => void }) {
  const { profile, userId } = useAppSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isOwn = Boolean(userId) && userId === post.userId;

  function requireProfile(action: string): boolean {
    if (profile) return true;
    toast.error(`Anmelden und Profil anlegen, um zu ${action}.`);
    void navigate({ to: userId ? "/profile" : "/login" });
    return false;
  }

  async function like() {
    if (!requireProfile("liken")) return;
    try {
      const result = await toggleLike({ data: { postId: post.id } });
      patchPostInCaches(queryClient, { ...post, liked: result.liked, likeCount: result.likeCount });
    } catch (err) {
      toast.error(memberErrorMessage(err, "Like fehlgeschlagen."));
    }
  }

  async function remove() {
    if (!window.confirm("Dieses Bild endgültig löschen?")) return;
    setDeleting(true);
    try {
      await deletePost({ data: { id: post.id } });
      removePostFromCaches(queryClient, post.id);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Gelöscht.");
      onClose();
    } catch (err) {
      toast.error(memberErrorMessage(err, "Löschen fehlgeschlagen."));
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="absolute top-4 right-4 grid size-11 place-items-center rounded-lg text-fg"
          onClick={onClose}
          aria-label="Schließen"
        >
          <X className="size-5" />
        </button>
        <div
          className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-bg-elevated"
          onClick={(e) => e.stopPropagation()}
        >
          {post.locked ? (
            <div className="relative aspect-3/4 max-h-[60dvh] w-full">
              <PostImage post={post} className="h-full w-full" />
              <Fsk18Notice onNavigate={onClose} />
            </div>
          ) : (
            <div className="relative">
              <img
                src={post.imageUrl}
                alt={post.caption || ""}
                className="max-h-[60dvh] w-full bg-bg object-contain"
              />
              {post.nsfw ? <Fsk18Badge locked={false} /> : null}
            </div>
          )}
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link
                to="/u/$handle"
                params={{ handle: post.author.handle }}
                className="font-medium"
                onClick={onClose}
              >
                @{post.author.handle}
              </Link>
              <p className="text-xs text-fg-muted">
                {post.author.age} · {relationshipLabel(post.author.relationshipStatus)}
              </p>
              {post.caption ? <p className="mt-2 text-sm leading-snug">{post.caption}</p> : null}
              <TagList tags={post.tags} className="mt-2" />
            </div>
            <div className="flex shrink-0 items-start gap-1">
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={deleting}
                  className="grid size-11 place-items-center rounded-lg text-fg-muted hover:text-heart disabled:opacity-40"
                  aria-label="Bild löschen"
                >
                  <Trash2 className="size-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (requireProfile("melden")) setReporting(true);
                  }}
                  className="grid size-11 place-items-center rounded-lg text-fg-muted"
                  aria-label="Bild melden"
                >
                  <Flag className="size-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void like()}
                disabled={post.locked}
                className="flex min-h-11 min-w-11 flex-col items-center gap-1 disabled:opacity-40"
                aria-label="Like"
              >
                <Heart className={cn("size-6", post.liked && "fill-heart text-heart")} />
                <span className="text-xs tabular-nums">{post.likeCount}</span>
              </button>
            </div>
          </div>
          <Comments post={post} />
        </div>
      </div>
      {reporting ? <ReportDialog postId={post.id} onClose={() => setReporting(false)} /> : null}
    </>
  );
}

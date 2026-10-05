import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getPost } from "@/lib/vela/server";
import { PostViewer } from "@/components/post-viewer";

/** Opens a post by id (e.g. from a notification or "Deine Uploads"). */
export function PostViewerLoader({ postId, onClose }: { postId: number; onClose: () => void }) {
  const post = useQuery({
    queryKey: ["post", postId],
    queryFn: () => getPost({ data: { id: postId } }),
  });
  if (post.data) return <PostViewer post={post.data} onClose={onClose} />;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-6 text-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Beitrag"
    >
      <button
        type="button"
        className="absolute top-4 right-4 grid size-11 place-items-center rounded-lg text-fg"
        onClick={onClose}
        aria-label="Schließen"
      >
        <X className="size-5" />
      </button>
      <p className="text-sm text-fg-muted">
        {post.isPending ? "Lädt…" : "Diesen Beitrag gibt es nicht mehr."}
      </p>
    </div>
  );
}

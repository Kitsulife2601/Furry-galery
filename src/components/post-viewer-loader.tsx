import { useQuery } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { getPost } from "@/lib/vela/server";
import { POST_PARAM } from "@/lib/vela/share-post";
import { useEscapeLayer, useModalBehaviour } from "@/lib/vela/use-overlay";
import { PostViewer } from "@/components/post-viewer";

/** Opens a post by id (e.g. from a notification, "Deine Uploads" or a shared link). */
export function PostViewerLoader({ postId, onClose }: { postId: number; onClose: () => void }) {
  const post = useQuery({
    queryKey: ["post", postId],
    queryFn: () => getPost({ data: { id: postId } }),
  });
  if (post.data) return <PostViewer post={post.data} onClose={onClose} />;
  return (
    <LoaderShell
      state={post.isPending ? "loading" : post.isError ? "error" : "gone"}
      onClose={onClose}
      onRetry={() => void post.refetch()}
    />
  );
}

function LoaderShell({
  state,
  onClose,
  onRetry,
}: {
  state: "loading" | "error" | "gone";
  onClose: () => void;
  onRetry: () => void;
}) {
  useModalBehaviour();
  useEscapeLayer(onClose);
  return (
    <div
      className="viewer-backdrop fixed inset-0 z-50 grid place-items-center p-6 text-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Beitrag"
      aria-busy={state === "loading"}
    >
      <button
        type="button"
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-11 place-items-center rounded-full text-fg hover:bg-bg-subtle"
        onClick={onClose}
        aria-label="Schließen"
      >
        <X className="size-5" />
      </button>
      {state === "loading" ? (
        <div className="w-full max-w-sm" aria-label="Lädt…">
          <div className="viewer-skeleton aspect-3/4 w-full rounded-3xl" />
          <div className="mt-4 flex items-center gap-3">
            <span className="viewer-skeleton size-10 rounded-full" />
            <span className="viewer-skeleton h-3 w-32 rounded" />
          </div>
        </div>
      ) : (
        <div
          className="max-w-xs rounded-3xl bg-bg-elevated px-6 py-7 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-display text-xl">
            {state === "error" ? "Hat nicht geklappt" : "Nicht mehr da"}
          </p>
          <p className="mt-1.5 text-sm text-fg-muted">
            {state === "error"
              ? "Der Beitrag konnte gerade nicht geladen werden."
              : "Diesen Beitrag gibt es nicht mehr."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {state === "error" ? (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg"
              >
                Nochmal
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-full border border-border px-5 text-sm"
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Opens the viewer for shared links (`/?post=123`, see `postUrl`). Mount once inside the app
 * layout; closing removes the parameter again.
 */
export function PostLinkOpener() {
  const router = useRouter();
  const raw = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)[POST_PARAM],
  });
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete(POST_PARAM);
    router.history.replace(`${url.pathname}${url.search}${url.hash}`);
  }

  return <PostViewerLoader postId={id} onClose={close} />;
}

import { useState } from "react";
import type { PostCard } from "@/lib/vela/types";
import { PostViewer } from "@/components/post-viewer";

export function GalleryGrid({
  posts,
  onChange,
  emptyLabel,
}: {
  posts: PostCard[];
  onChange?: (posts: PostCard[]) => void;
  emptyLabel: string;
}) {
  const [active, setActive] = useState<PostCard | null>(null);

  if (posts.length === 0) {
    return (
      <p className="px-5 py-16 text-center text-sm text-fg-muted">{emptyLabel}</p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-px bg-border">
        {posts.map((post) => (
          <li key={post.id} className="bg-bg">
            <button
              type="button"
              className="aspect-3/4 w-full overflow-hidden"
              onClick={() => setActive(post)}
            >
              <img
                src={post.imageUrl}
                alt={post.caption || ""}
                className="h-full w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {active ? (
        <PostViewer
          post={posts.find((p) => p.id === active.id) ?? active}
          onClose={() => setActive(null)}
          onChange={(next) => {
            onChange?.(posts.map((p) => (p.id === next.id ? next : p)));
          }}
        />
      ) : null}
    </>
  );
}

import { useState } from "react";
import type { PostCard } from "@/lib/vela/types";
import { PostViewer } from "@/components/post-viewer";

export function GalleryGrid({ posts, emptyLabel }: { posts: PostCard[]; emptyLabel: string }) {
  const [activeId, setActiveId] = useState<number | null>(null);
  // Read the open post from the live list, so likes and deletes show up at once.
  const active = posts.find((p) => p.id === activeId) ?? null;

  if (posts.length === 0) {
    return <p className="px-5 py-16 text-center text-sm text-fg-muted">{emptyLabel}</p>;
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-px bg-border">
        {posts.map((post) => (
          <li key={post.id} className="bg-bg">
            <button
              type="button"
              className="aspect-3/4 w-full overflow-hidden"
              onClick={() => setActiveId(post.id)}
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
      {active ? <PostViewer post={active} onClose={() => setActiveId(null)} /> : null}
    </>
  );
}

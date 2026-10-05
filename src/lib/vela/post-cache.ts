import type { QueryClient } from "@tanstack/react-query";
import type { PostCard } from "./types";

/** Query keys whose data is a `PostCard[]` list (feed, gallery, profile grids). */
const POST_LIST_KEYS = new Set(["feed", "explore", "profile-posts"]);

function isPostList(queryKey: readonly unknown[]) {
  return POST_LIST_KEYS.has(String(queryKey[0]));
}

/** Write an updated post (e.g. after a like) into every cached list that holds it. */
export function patchPostInCaches(queryClient: QueryClient, next: PostCard) {
  queryClient.setQueriesData<PostCard[]>({ predicate: (q) => isPostList(q.queryKey) }, (old) =>
    old?.map((p) => (p.id === next.id ? next : p)),
  );
  // A post opened on its own (notifications, "Deine Uploads").
  queryClient.setQueryData<PostCard | null>(["post", next.id], (old) => (old ? next : old));
}

/** Drop a deleted post from every cached list. */
export function removePostFromCaches(queryClient: QueryClient, id: number) {
  queryClient.removeQueries({ queryKey: ["post", id] });
  queryClient.setQueriesData<PostCard[]>({ predicate: (q) => isPostList(q.queryKey) }, (old) =>
    old?.filter((p) => p.id !== id),
  );
}

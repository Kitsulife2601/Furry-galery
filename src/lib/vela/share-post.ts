import { toast } from "sonner";
import type { PostCard } from "./types";

/** Search param that opens a post in the viewer (see `PostLinkOpener`). */
export const POST_PARAM = "post";

/** Public link to a single post: the feed with `?post=<id>`, which opens the viewer. */
export function postUrl(id: number): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/?${POST_PARAM}=${id}`;
}

export async function copyPostLink(post: Pick<PostCard, "id">): Promise<void> {
  const url = postUrl(post.id);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link kopiert.");
  } catch {
    // Old browsers / no permission: let the user copy it by hand.
    window.prompt("Link zum Kopieren:", url);
  }
}

/** Native share sheet where available (phones), otherwise copy the link. */
export async function sharePost(post: Pick<PostCard, "id" | "caption" | "author">): Promise<void> {
  const url = postUrl(post.id);
  const title = `@${post.author.handle} auf Furry Gallery`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: post.caption || title, url });
      return;
    } catch (err) {
      // The user closed the sheet — that's fine, nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  await copyPostLink(post);
}

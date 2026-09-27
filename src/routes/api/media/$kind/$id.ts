import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { isAdminUser } from "@/lib/vela/admin";
import { isFsk18Verified } from "@/lib/vela/discord";

/**
 * Serves stored images by URL so lists (feed, gallery, search) stay small and
 * browsers can cache them — GIFs included:
 *   /api/media/avatar/<userId>?v=<n>   /api/media/banner/<userId>?v=<n>
 *   /api/media/post/<postId>
 * FSK18 posts are only sent to their uploader and to verified members.
 */
const ALLOWED = /^data:(image\/(?:jpeg|png|gif|webp));base64,/;

function imageResponse(dataUrl: string, cacheControl: string): Response {
  const match = ALLOWED.exec(dataUrl);
  if (!match) return new Response("Unsupported image", { status: 415 });
  const body = Buffer.from(dataUrl.slice(match[0].length), "base64");
  return new Response(body, {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const notFound = () => new Response("Not found", { status: 404 });
const FOREVER = "public, max-age=31536000, immutable";

export const Route = createFileRoute("/api/media/$kind/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const sql = await getSql();

        if (params.kind === "avatar" || params.kind === "banner") {
          const rows = await sql<{ url: string | null }>`
            select case when ${params.kind}::text = 'avatar' then avatar_url else banner_url end as url
            from profiles where user_id = ${params.id}
          `;
          const url = rows[0]?.url;
          if (!url) return notFound();
          // Versioned URL (?v=) — a new upload gets a new address.
          return imageResponse(url, FOREVER);
        }

        if (params.kind === "post" && /^\d+$/.test(params.id)) {
          const rows = await sql<{ image_url: string; nsfw: boolean; user_id: string }>`
            select image_url, nsfw, user_id from posts where id = ${Number(params.id)}
          `;
          const post = rows[0];
          if (!post) return notFound();
          if (!post.nsfw) return imageResponse(post.image_url, FOREVER);

          const { getSessionUser } = await import("@/lib/auth/verify.server");
          const viewer = await getSessionUser().catch(() => null);
          const allowed =
            viewer !== null &&
            (viewer.id === post.user_id ||
              (await isFsk18Verified(viewer.id)) ||
              (await isAdminUser(viewer.id)));
          if (!allowed) return new Response("FSK 18", { status: 403 });
          return imageResponse(post.image_url, "private, max-age=3600");
        }

        return notFound();
      },
    },
  },
});

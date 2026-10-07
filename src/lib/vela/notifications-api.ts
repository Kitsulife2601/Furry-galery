/**
 * Server functions for the notifications page ("Mitteilungen").
 * Richer than `listNotifications` in server.ts: knows whether you already
 * follow someone back, whether a post is a video, and hides thumbnails you
 * may not see (FSK 18 posts of others for unverified members).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isFsk18Verified } from "./discord";
import type { NotificationItem } from "./server";

export type NotificationFeedItem = NotificationItem & {
  /** Follow notifications: you already follow this person. */
  followingActor: boolean;
  postIsVideo: boolean;
  /** Thumbnail withheld (FSK 18 post of someone else, you're not verified). */
  postHidden: boolean;
};

/** Postgres timestamps → ISO (Safari can't parse "2026-10-05 12:00:00+00"). */
function asTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export const listNotificationFeed = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<NotificationFeedItem[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: NotificationItem["kind"];
      body: string;
      created_at: string;
      read: boolean;
      post_id: number | null;
      nsfw: boolean | null;
      post_owner: string | null;
      is_video: boolean | null;
      display_name: string | null;
      handle: string | null;
      avatar_url: string | null;
      following: boolean;
    }>`
      select n.id, n.kind, n.body, n.created_at::text as created_at,
             n.read_at is not null as read, n.post_id, p.nsfw, p.user_id as post_owner,
             p.video_url is not null as is_video,
             a.display_name, a.handle,
             case when a.avatar_url is null then null
                  else '/api/media/avatar/' || a.user_id || '?v=' || a.avatar_version end as avatar_url,
             exists(select 1 from follows f
                    where f.follower_id = ${context.userId} and f.following_id = n.actor_id) as following
      from notifications n
      left join profiles a on a.user_id = n.actor_id
      left join posts p on p.id = n.post_id
      where n.user_id = ${context.userId}
        -- System messages have no actor; others vanish with a banned or deleted actor.
        and (n.kind = 'system' or (a.user_id is not null and a.banned_at is null))
      order by n.created_at desc, n.id desc
      limit 150
    `;
    const needsCheck = rows.some((r) => r.nsfw && r.post_owner !== context.userId);
    const verified = needsCheck ? await isFsk18Verified(context.userId) : true;
    return rows.map((r) => {
      const postId = r.post_id ? Number(r.post_id) : null;
      const hidden = Boolean(r.nsfw) && r.post_owner !== context.userId && !verified;
      return {
        id: Number(r.id),
        kind: r.kind,
        body: r.body,
        createdAt: asTime(r.created_at),
        read: Boolean(r.read),
        actor:
          r.kind !== "system" && r.handle
            ? { displayName: r.display_name ?? r.handle, handle: r.handle, avatarUrl: r.avatar_url }
            : null,
        postId,
        postImageUrl: postId && !hidden ? `/api/media/post/${postId}` : null,
        followingActor: Boolean(r.following),
        postIsVideo: Boolean(r.is_video),
        postHidden: hidden,
      };
    });
  });

/**
 * Delete several notifications at once (a grouped row, or "Alle löschen").
 * `upToId` deletes everything up to and including that id — so "Alle löschen"
 * also clears what's beyond the loaded list, but never something that just
 * arrived.
 */
export const deleteNotificationBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      ids: z.array(z.number().int().positive()).max(500).optional(),
      upToId: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<{ deleted: number }> => {
    const sql = await getSql();
    let deleted = 0;
    if (data.upToId !== undefined) {
      const rows = await sql<{ id: number }>`
        delete from notifications where user_id = ${context.userId} and id <= ${data.upToId}
        returning id
      `;
      deleted += rows.length;
    }
    if (data.ids && data.ids.length > 0) {
      // Postgres array literal (validated ints only) — same on Neon and PGLite.
      const list = `{${data.ids.join(",")}}`;
      const rows = await sql<{ id: number }>`
        delete from notifications
        where user_id = ${context.userId} and id = any(${list}::int[])
        returning id
      `;
      deleted += rows.length;
    }
    return { deleted };
  });

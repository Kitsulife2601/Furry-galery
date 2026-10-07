/** Profile pages: follower/following lists and your own liked posts. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isFsk18Verified } from "./discord";
import { asDecoration } from "./decorations";
import { asNameStyle } from "./rewards";
import type { AvatarDecoration } from "./decorations";
import type { NameStyle } from "./rewards";
import type { PostCard } from "./types";
import { isMinorViewer, mapFeed, optionalViewerId, type FeedRow } from "./server";

export type FollowPerson = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  decoration: AvatarDecoration | null;
  nameStyle: NameStyle | null;
  /** The viewer follows this person. */
  isFollowing: boolean;
  /** This row is the viewer themself (no follow button). */
  isSelf: boolean;
};

type FollowRow = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  avatar_decoration: string | null;
  name_style: string | null;
  viewer_follows: boolean;
};

const MAX_PEOPLE = 300;

/** Who follows @handle ("followers") or whom @handle follows ("following"), newest first. */
export const listFollowPeople = createServerFn({ method: "GET" })
  .validator(
    z.object({
      handle: z.string().trim().toLowerCase().max(40),
      kind: z.enum(["followers", "following"]),
    }),
  )
  .handler(async ({ data }): Promise<FollowPerson[]> => {
    const viewerId = (await optionalViewerId()) ?? "";
    const sql = await getSql();
    const target = await sql<{ user_id: string; banned: boolean }>`
      select user_id, banned_at is not null as banned from profiles where handle = ${data.handle}
    `;
    const owner = target[0];
    // Banned profiles hide their content from everyone but themselves.
    if (!owner || (owner.banned && owner.user_id !== viewerId)) return [];
    const rows =
      data.kind === "followers"
        ? await sql<FollowRow>`
            select pr.user_id, pr.handle, pr.display_name,
              case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
              pr.avatar_decoration, pr.name_style,
              exists(select 1 from follows v where v.follower_id = ${viewerId} and v.following_id = pr.user_id) as viewer_follows
            from follows f
            join profiles pr on pr.user_id = f.follower_id
            where f.following_id = ${owner.user_id} and pr.banned_at is null
            order by f.created_at desc
            limit ${MAX_PEOPLE}
          `
        : await sql<FollowRow>`
            select pr.user_id, pr.handle, pr.display_name,
              case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
              pr.avatar_decoration, pr.name_style,
              exists(select 1 from follows v where v.follower_id = ${viewerId} and v.following_id = pr.user_id) as viewer_follows
            from follows f
            join profiles pr on pr.user_id = f.following_id
            where f.follower_id = ${owner.user_id} and pr.banned_at is null
            order by f.created_at desc
            limit ${MAX_PEOPLE}
          `;
    return rows.map((row) => ({
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      decoration: asDecoration(row.avatar_decoration),
      nameStyle: asNameStyle(row.name_style),
      isFollowing: Boolean(row.viewer_follows),
      isSelf: row.user_id === viewerId,
    }));
  });

/** Posts you liked, most recently liked first. Only ever your own list. */
export const listMyLikedPosts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PostCard[]> => {
    const viewerId = context.userId;
    const canSeeNsfw = await isFsk18Verified(viewerId);
    const sql = await getSql();
    const rows = await sql<FeedRow>`
      select
        p.id,
        p.user_id,
        '/api/media/post/' || p.id as image_url,
        p.preview_url,
        p.video_url,
        p.nsfw,
        p.tags,
        (select count(*)::int from comments c where c.post_id = p.id) as comment_count,
        p.caption,
        p.created_at::text as created_at,
        (select count(*)::int from likes l2 where l2.post_id = p.id) as like_count,
        true as liked,
        pr.display_name,
        pr.handle,
        case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
      from likes l
      join posts p on p.id = l.post_id
      join profiles pr on pr.user_id = p.user_id
      where l.user_id = ${viewerId} and pr.banned_at is null
      order by l.created_at desc
      limit 150
    `;
    return mapFeed(rows, canSeeNsfw, viewerId, await isMinorViewer(viewerId));
  });

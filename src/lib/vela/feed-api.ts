import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ageFromBirthdate } from "./age";
import { isFsk18Verified } from "./discord";
import { asDecoration, asNamePlate } from "./decorations";
import { asNameStyle } from "./rewards";
import {
  POST_TAGS,
  RELATIONSHIP_STATUSES,
  type PostCard,
  type PostTag,
  type RelationshipStatus,
} from "./types";

/**
 * "Für dich" extras: more posts once the ranked first batch (`listFeed`) is
 * used up, and which feed authors the viewer already follows.
 */

const POST_TAG_IDS = POST_TAGS.map((t) => t.id) as PostTag[];
const RELATIONSHIP_IDS = RELATIONSHIP_STATUSES.map((s) => s.id) as RelationshipStatus[];

/** How many posts one "load more" step returns. */
export const FEED_MORE_LIMIT = 20;

type MoreRow = {
  id: number;
  user_id: string;
  image_url: string;
  preview_url: string | null;
  video_url: string | null;
  nsfw: boolean;
  tags: string[] | null;
  comment_count: number;
  caption: string;
  created_at: string;
  like_count: number;
  liked: boolean;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  relationship_status: string;
  birthdate: string;
  avatar_decoration: string | null;
  name_style: string | null;
  name_plate: string | null;
};

async function viewerIdOrEmpty(): Promise<string> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    return user?.id ?? "";
  } catch {
    return "";
  }
}

function isoDay(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

function isoTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/** Same rules as the main feed: locked FSK 18 previews, hidden entirely for minors. */
function toCards(
  rows: MoreRow[],
  canSeeNsfw: boolean,
  viewerId: string,
  minor: boolean,
): PostCard[] {
  return rows
    .filter((row) => !(minor && row.nsfw))
    .map((row) => {
      const locked = Boolean(row.nsfw) && !canSeeNsfw && row.user_id !== viewerId;
      return {
        id: Number(row.id),
        userId: row.user_id,
        imageUrl: locked ? (row.preview_url ?? "") : row.image_url,
        videoUrl: locked ? null : row.video_url,
        caption: row.caption,
        createdAt: isoTime(row.created_at),
        nsfw: Boolean(row.nsfw),
        locked,
        commentCount: Number(row.comment_count) || 0,
        tags: (row.tags ?? []).filter((t): t is PostTag => POST_TAG_IDS.includes(t as PostTag)),
        likeCount: Number(row.like_count) || 0,
        liked: Boolean(row.liked),
        author: {
          displayName: row.display_name,
          handle: row.handle,
          avatarUrl: row.avatar_url,
          relationshipStatus: RELATIONSHIP_IDS.includes(
            row.relationship_status as RelationshipStatus,
          )
            ? (row.relationship_status as RelationshipStatus)
            : "single",
          age: ageFromBirthdate(isoDay(row.birthdate)),
          decoration: asDecoration(row.avatar_decoration),
          nameStyle: asNameStyle(row.name_style),
          namePlate: asNamePlate(row.name_plate),
        },
      };
    });
}

/**
 * The next posts after everything already in the feed (`exclude`): unseen ones
 * first, then popular and fresh. An empty result means the viewer has seen it all.
 */
export const listFeedMore = createServerFn({ method: "POST" })
  .validator(z.object({ exclude: z.array(z.number().int().positive()).max(2000) }))
  .handler(async ({ data }): Promise<PostCard[]> => {
    const viewerId = await viewerIdOrEmpty();
    const canSeeNsfw = await isFsk18Verified(viewerId || null);
    const sql = await getSql();
    const exclude = data.exclude.join(",");
    const rows = await sql<MoreRow>`
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
        (select count(*)::int from likes l where l.post_id = p.id) as like_count,
        exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked,
        pr.display_name,
        pr.handle,
        case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.banned_at is null
        and p.id <> all(string_to_array(${exclude}, ',')::int[])
        and not exists(select 1 from post_feedback f
                       where f.user_id = ${viewerId} and f.post_id = p.id and f.value < 0)
      order by
        exists(select 1 from post_views v where v.user_id = ${viewerId} and v.post_id = p.id) asc,
        (0.8 * ln(1 + (select count(*) from likes l where l.post_id = p.id))
          + 3.0 / (1 + extract(epoch from (now() - p.created_at)) / 86400.0)) desc,
        p.created_at desc
      limit ${FEED_MORE_LIMIT}
    `;
    let minor = false;
    if (viewerId) {
      const me = await sql<{ birthdate: string }>`
        select birthdate::text as birthdate from profiles where user_id = ${viewerId}
      `;
      minor = me[0] ? ageFromBirthdate(isoDay(me[0].birthdate)) < 18 : false;
    }
    return toCards(rows, canSeeNsfw, viewerId, minor);
  });

/** Handles of everyone the signed-in viewer follows (for the "Folgen" button in the feed). */
export const listFollowingHandles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string[]> => {
    const sql = await getSql();
    const rows = await sql<{ handle: string }>`
      select pr.handle
      from follows f join profiles pr on pr.user_id = f.following_id
      where f.follower_id = ${context.userId}
      limit 5000
    `;
    return rows.map((r) => r.handle);
  });

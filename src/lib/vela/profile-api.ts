/** Profile pages: follower/following lists and your own liked posts. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ageFromBirthdate } from "./age";
import { isFsk18Verified } from "./discord";
import { asDecoration, asNamePlate } from "./decorations";
import { asNameStyle } from "./rewards";
import { POST_TAGS, RELATIONSHIP_STATUSES } from "./types";
import type { AvatarDecoration } from "./decorations";
import type { NameStyle } from "./rewards";
import type { PostCard, PostTag, RelationshipStatus } from "./types";

// Private copies of server.ts helpers: exporting them from there would pull
// server-only imports into the client bundle. Keep in sync with server.ts.

async function optionalViewerId(): Promise<string | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function asIsoDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

/** ISO timestamps (Safari can't parse Postgres' "2026-10-05 12:00:00+00"). */
function asTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function asRelationship(value: string): RelationshipStatus {
  return RELATIONSHIP_STATUSES.some((s) => s.id === value)
    ? (value as RelationshipStatus)
    : "single";
}

async function isMinorViewer(viewerId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ birthdate: string }>`
    select birthdate::text as birthdate from profiles where user_id = ${viewerId}
  `;
  return rows[0] ? ageFromBirthdate(asIsoDate(rows[0].birthdate)) < 18 : false;
}

type FeedRow = {
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

/** Same FSK-18 rules as server.ts `mapFeed`: locked posts only carry the tiny preview. */
function mapFeed(
  rows: FeedRow[],
  canSeeNsfw: boolean,
  viewerId: string,
  hideNsfw: boolean,
): PostCard[] {
  const tagIds = POST_TAGS.map((t) => t.id) as readonly string[];
  return rows
    .filter((row) => !(hideNsfw && row.nsfw))
    .map((row) => {
      const locked = Boolean(row.nsfw) && !canSeeNsfw && row.user_id !== viewerId;
      return {
        id: Number(row.id),
        userId: row.user_id,
        imageUrl: locked ? (row.preview_url ?? "") : row.image_url,
        videoUrl: locked ? null : row.video_url,
        caption: row.caption,
        createdAt: asTime(row.created_at),
        nsfw: Boolean(row.nsfw),
        locked,
        commentCount: Number(row.comment_count) || 0,
        tags: (row.tags ?? []).filter((t): t is PostTag => tagIds.includes(t)),
        likeCount: Number(row.like_count) || 0,
        liked: Boolean(row.liked),
        author: {
          displayName: row.display_name,
          handle: row.handle,
          avatarUrl: row.avatar_url,
          relationshipStatus: asRelationship(row.relationship_status),
          age: ageFromBirthdate(asIsoDate(row.birthdate)),
          decoration: asDecoration(row.avatar_decoration),
          nameStyle: asNameStyle(row.name_style),
          namePlate: asNamePlate(row.name_plate),
        },
      };
    });
}

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

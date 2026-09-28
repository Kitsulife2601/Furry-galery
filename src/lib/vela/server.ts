import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ageFromBirthdate, isAdultBirthdate } from "./age";
import { isBackgroundId } from "./backgrounds";
import { discordConfig, discordInviteUrl, isFsk18Verified } from "./discord";
import { MEDIA_LIMITS, dataUrlChars, isImageDataUrl } from "./media-limits";
import { isAdminUser } from "./admin";
import {
  deletePostById,
  deleteProfileNow,
  dismissReportsFor,
  scheduleProfileDeletion,
  setBannedByHandle,
  sweepModeration,
} from "./moderation";
import { BAN_DURATION_IDS, DELETE_DELAY_IDS, addDuration } from "./durations";
import { notify } from "./notifications";
import { blobToken, isBlobVideoUrl } from "./video";
import { extractHashtags, normalizeHashtag } from "./hashtags";
import type {
  Fsk18Status,
  PostCard,
  PostTag,
  Profile,
  RelationshipStatus,
  ReportReason,
} from "./types";
import {
  FEEDBACK_KINDS,
  POST_TAGS,
  PROFILE_REPORT_REASONS,
  REPORT_REASONS,
  RELATIONSHIP_STATUSES,
  MAX_POST_TAGS,
  isAdultTag,
  tagLabel,
  type ProfileReportReason,
} from "./types";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const MAX_PREVIEW_CHARS = 4_000;
const RELATIONSHIP_IDS = RELATIONSHIP_STATUSES.map((s) => s.id) as [
  RelationshipStatus,
  ...RelationshipStatus[],
];
const POST_TAG_IDS = POST_TAGS.map((t) => t.id) as [PostTag, ...PostTag[]];
const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];

type ProfileRow = {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string;
  birthdate: string;
  relationship_status: string;
  avatar_url: string | null;
  banner_url: string | null;
  background_id: string;
  banned: boolean;
  ban_reason: string | null;
  banned_until: string | null;
  delete_at: string | null;
  interests: string[] | null;
  interests_asked: boolean;
  created_at: string;
};

type CountRow = { n: number };

function asIsoDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

function asTime(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return "";
}

function isRelationship(value: string): value is RelationshipStatus {
  return RELATIONSHIP_IDS.includes(value as RelationshipStatus);
}

async function loadProfileRow(userId: string): Promise<ProfileRow | null> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select user_id, display_name, handle, bio, birthdate::text as birthdate,
           relationship_status,
           case when avatar_url is null then null else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
           case when banner_url is null then null else '/api/media/banner/' || user_id || '?v=' || banner_version end as banner_url,
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, created_at::text as created_at
    from profiles where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

async function requireAdult(userId: string): Promise<ProfileRow> {
  const row = await loadProfileRow(userId);
  if (!row || ageFromBirthdate(asIsoDate(row.birthdate)) < 18) {
    throw new Error("Age verification required");
  }
  if (row.banned) throw new Error("Dein Konto ist gesperrt.");
  return row;
}

async function toPublicProfile(row: ProfileRow, viewerId: string): Promise<Profile> {
  const sql = await getSql();
  const [posts, followers, following, followRow] = await Promise.all([
    sql<CountRow>`select count(*)::int as n from posts where user_id = ${row.user_id}`,
    sql<CountRow>`select count(*)::int as n from follows where following_id = ${row.user_id}`,
    sql<CountRow>`select count(*)::int as n from follows where follower_id = ${row.user_id}`,
    sql<{ follower_id: string }>`
      select follower_id from follows
      where follower_id = ${viewerId} and following_id = ${row.user_id}
    `,
  ]);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    handle: row.handle,
    bio: row.bio,
    age: ageFromBirthdate(asIsoDate(row.birthdate)),
    relationshipStatus: isRelationship(row.relationship_status)
      ? row.relationship_status
      : "single",
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    backgroundId: row.background_id,
    createdAt: asTime(row.created_at),
    postCount: posts[0]?.n ?? 0,
    followerCount: followers[0]?.n ?? 0,
    followingCount: following[0]?.n ?? 0,
    isOwn: viewerId === row.user_id,
    isFollowing: followRow.length > 0,
    fsk18: viewerId === row.user_id ? await loadFsk18Status(row.user_id) : null,
    isAdmin: viewerId === row.user_id && (await isAdminUser(row.user_id)),
    banned: Boolean(row.banned),
    banReason: row.banned ? row.ban_reason : null,
    interests: viewerId === row.user_id ? (row.interests ?? []) : [],
    needsInterests: viewerId === row.user_id && !row.interests_asked,
    bannedUntil: row.banned && row.banned_until ? asTime(row.banned_until) : null,
    deleteAt:
      row.delete_at && (viewerId === row.user_id || (await isAdminUser(viewerId)))
        ? asTime(row.delete_at)
        : null,
  };
}

async function loadFsk18Status(userId: string): Promise<Fsk18Status> {
  const sql = await getSql();
  const rows = await sql<{ discord_username: string | null; manual: boolean }>`
    select discord_username, fsk18_manual_at is not null as manual
    from profiles where user_id = ${userId}
  `;
  return {
    verified: await isFsk18Verified(userId),
    manual: Boolean(rows[0]?.manual),
    discordUsername: rows[0]?.discord_username ?? null,
  };
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
};

async function optionalViewerId(): Promise<string | null> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * `canSeeNsfw` decides server-side which image leaves the server: unverified
 * viewers of an FSK18 post only ever receive the tiny preview, never the image.
 */
function mapFeed(rows: FeedRow[], canSeeNsfw: boolean, viewerId = ""): PostCard[] {
  return rows.map((row) => {
    // Uploaders always see their own posts, verified or not.
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
      tags: (row.tags ?? []).filter((t): t is PostTag => POST_TAG_IDS.includes(t as PostTag)),
      likeCount: Number(row.like_count) || 0,
      liked: Boolean(row.liked),
      author: {
        displayName: row.display_name,
        handle: row.handle,
        avatarUrl: row.avatar_url,
        relationshipStatus: isRelationship(row.relationship_status)
          ? row.relationship_status
          : "single",
        age: ageFromBirthdate(asIsoDate(row.birthdate)),
      },
    };
  });
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Profile | null> => {
    await sweepModeration();
    const row = await loadProfileRow(context.userId);
    if (!row) return null;
    if (ageFromBirthdate(asIsoDate(row.birthdate)) < 18) return null;
    return toPublicProfile(row, context.userId);
  });

export const createProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().trim().min(2).max(40),
      handle: z.string().trim().toLowerCase(),
      bio: z.string().trim().max(160).optional().default(""),
      birthdate: z.string(),
      relationshipStatus: z.enum(["single", "taken", "open", "complicated", "private"]),
    }),
  )
  .handler(async ({ context, data }): Promise<Profile> => {
    if (!HANDLE_RE.test(data.handle)) {
      throw new Error("Handle: 3–20 Zeichen, nur a–z, 0–9 und _.");
    }
    if (!isAdultBirthdate(data.birthdate)) {
      throw new Error("Die Furry Gallery ist nur für Personen ab 18 Jahren.");
    }
    const existing = await loadProfileRow(context.userId);
    if (existing) {
      return toPublicProfile(existing, context.userId);
    }
    const sql = await getSql();
    const taken = await sql<{ handle: string }>`
      select handle from profiles where handle = ${data.handle}
    `;
    if (taken[0]) throw new Error("Dieser Name ist schon vergeben.");
    await sql`
      insert into profiles (user_id, display_name, handle, bio, birthdate, relationship_status)
      values (
        ${context.userId},
        ${data.displayName},
        ${data.handle},
        ${data.bio ?? ""},
        ${data.birthdate},
        ${data.relationshipStatus}
      )
    `;
    const row = await loadProfileRow(context.userId);
    if (!row) throw new Error("Profil konnte nicht gespeichert werden.");
    return toPublicProfile(row, context.userId);
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().trim().min(2).max(40),
      bio: z.string().trim().max(160),
      relationshipStatus: z.enum(["single", "taken", "open", "complicated", "private"]),
      backgroundId: z.string(),
    }),
  )
  .handler(async ({ context, data }): Promise<Profile> => {
    await requireAdult(context.userId);
    if (!isBackgroundId(data.backgroundId)) {
      throw new Error("Unbekannter Hintergrund.");
    }
    const sql = await getSql();
    await sql`
      update profiles
      set display_name = ${data.displayName},
          bio = ${data.bio},
          relationship_status = ${data.relationshipStatus},
          background_id = ${data.backgroundId}
      where user_id = ${context.userId}
    `;
    const row = await loadProfileRow(context.userId);
    if (!row) throw new Error("Profil nicht gefunden.");
    return toPublicProfile(row, context.userId);
  });

export const updateAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ dataUrl: z.string().min(20).max(dataUrlChars(MEDIA_LIMITS.avatar)) }))
  .handler(async ({ context, data }): Promise<Profile> => {
    await requireAdult(context.userId);
    if (!isImageDataUrl(data.dataUrl)) {
      throw new Error("Nur Bilder (JPG, PNG, GIF, WebP) sind erlaubt.");
    }
    const sql = await getSql();
    await sql`
      update profiles set avatar_url = ${data.dataUrl}, avatar_version = avatar_version + 1
      where user_id = ${context.userId}
    `;
    const row = await loadProfileRow(context.userId);
    if (!row) throw new Error("Profil nicht gefunden.");
    return toPublicProfile(row, context.userId);
  });

/** Set (data URL) or remove (null) the profile banner image. */
export const updateBanner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ dataUrl: z.string().min(20).max(dataUrlChars(MEDIA_LIMITS.banner)).nullable() }),
  )
  .handler(async ({ context, data }): Promise<Profile> => {
    await requireAdult(context.userId);
    if (data.dataUrl !== null && !isImageDataUrl(data.dataUrl)) {
      throw new Error("Nur Bilder (JPG, PNG, GIF, WebP) sind erlaubt.");
    }
    const sql = await getSql();
    await sql`
      update profiles set banner_url = ${data.dataUrl}, banner_version = banner_version + 1
      where user_id = ${context.userId}
    `;
    const row = await loadProfileRow(context.userId);
    if (!row) throw new Error("Profil nicht gefunden.");
    return toPublicProfile(row, context.userId);
  });

/**
 * "Für dich" ranking, driven by likes ("people who like what you like also like …"):
 *  - posts liked by members who liked the same posts as the viewer,
 *  - authors the viewer engages with (like 3, comment 4, view 1) or follows,
 *  - popularity (likes) and freshness,
 * minus a penalty for posts already seen or liked. Guests get fresh + popular.
 */
export const listFeed = createServerFn({ method: "GET" }).handler(async (): Promise<PostCard[]> => {
  await sweepModeration();
  const viewerId = (await optionalViewerId()) ?? "";
  const canSeeNsfw = await isFsk18Verified(viewerId || null);
  const sql = await getSql();
  const rows = await sql<FeedRow>`
      with my_likes as (
        select post_id from likes where user_id = ${viewerId}
      ),
      -- Members with the same taste: how many of the viewer's liked posts they liked too.
      similar_members as (
        select l.user_id, count(*) as overlap
        from likes l join my_likes m on m.post_id = l.post_id
        where l.user_id <> ${viewerId}
        group by l.user_id
      ),
      -- What those members liked, weighted by how similar they are.
      liked_by_similar as (
        select l.post_id, sum(sm.overlap) as score
        from likes l join similar_members sm on sm.user_id = l.user_id
        group by l.post_id
      ),
      my_interests as (
        select coalesce((select interests from profiles where user_id = ${viewerId}), '{}') as tags
      ),
      -- Everything the viewer did, per post: likes, comments, views and the
      -- "Interessiert" / "Nicht interessiert" choices from the ⋯ menu.
      signals as (
        select l.post_id, 3.0 as w from likes l where l.user_id = ${viewerId}
        union all
        select c.post_id, 4.0 from comments c where c.user_id = ${viewerId}
        union all
        select v.post_id, 1.0 from post_views v where v.user_id = ${viewerId}
        union all
        select f.post_id, case when f.value > 0 then 6.0 else -8.0 end
        from post_feedback f where f.user_id = ${viewerId}
      ),
      author_affinity as (
        select p.user_id as author, sum(s.w) as score
        from signals s join posts p on p.id = s.post_id
        group by p.user_id
      ),
      -- Learned interests: which categories the viewer engages with (plus the
      -- ones picked in the welcome popup / settings as a head start).
      tag_affinity as (
        select tag, sum(w) as score from (
          select t.tag, s.w
          from signals s join posts p on p.id = s.post_id
          cross join lateral unnest(p.tags || p.hashtags) as t(tag)
          union all
          select unnest(tags), 5.0 from my_interests
        ) x
        group by tag
      )
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
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.banned_at is null
        and not exists(select 1 from post_feedback f
                       where f.user_id = ${viewerId} and f.post_id = p.id and f.value < 0)
      order by (
          2.0 * ln(1 + coalesce((select ls.score from liked_by_similar ls where ls.post_id = p.id), 0))
        + 1.0 * coalesce(sign((select aa.score from author_affinity aa where aa.author = p.user_id)) * ln(1 + abs((select aa.score from author_affinity aa where aa.author = p.user_id))), 0)
        + 1.2 * coalesce(sign((select sum(ta.score) from tag_affinity ta where ta.tag = any(p.tags || p.hashtags))) * ln(1 + abs((select sum(ta.score) from tag_affinity ta where ta.tag = any(p.tags || p.hashtags)))), 0)
        + case when exists(select 1 from follows f
                           where f.follower_id = ${viewerId} and f.following_id = p.user_id)
               then 2.0 else 0 end
        + 0.8 * ln(1 + (select count(*) from likes l where l.post_id = p.id))
        + 3.0 / (1 + extract(epoch from (now() - p.created_at)) / 86400.0)
        - case when exists(select 1 from post_views v
                           where v.user_id = ${viewerId} and v.post_id = p.id)
               then 2.5 else 0 end
        - case when p.user_id = ${viewerId} then 1.0 else 0 end
        - case when exists(select 1 from my_likes ml where ml.post_id = p.id) then 1.5 else 0 end
      ) desc, p.created_at desc
      limit 60
    `;
  return mapFeed(rows, canSeeNsfw, viewerId);
});

/** The viewer looked at a post in the feed (feeds the "Für dich" ranking). */
export const recordView = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      insert into post_views (user_id, post_id)
      select ${context.userId}, id from posts where id = ${data.postId}
      on conflict (user_id, post_id) do update set seen_at = now()
    `;
    return { ok: true };
  });

/** "Interessiert" / "Nicht interessiert" from the ⋯ menu (0 = undo). */
export const setPostInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      postId: z.number().int().positive(),
      value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    if (data.value === 0) {
      await sql`delete from post_feedback where user_id = ${context.userId} and post_id = ${data.postId}`;
    } else {
      await sql`
        insert into post_feedback (user_id, post_id, value)
        select ${context.userId}, id, ${data.value} from posts where id = ${data.postId}
        on conflict (user_id, post_id) do update set value = excluded.value, created_at = now()
      `;
    }
    return { ok: true };
  });

export const listExplore = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        tag: z.enum(POST_TAG_IDS).nullable().optional(),
        hashtag: z.string().max(40).nullable().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<PostCard[]> => {
    const tag = data?.tag ?? null;
    const hashtag = data?.hashtag ? normalizeHashtag(data.hashtag) : null;
    const viewerId = (await optionalViewerId()) ?? "";
    const canSeeNsfw = await isFsk18Verified(viewerId || null);
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
        (select count(*)::int from likes l where l.post_id = p.id) as like_count,
        exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked,
        pr.display_name,
        pr.handle,
        case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.banned_at is null and (${tag}::text is null or ${tag}::text = any(p.tags))
        and (${hashtag}::text is null or ${hashtag}::text = any(p.hashtags))
      order by (select count(*) from likes l where l.post_id = p.id) desc, p.created_at desc
      limit 80
    `;
    return mapFeed(rows, canSeeNsfw, viewerId);
  });

export type CreatorPreview = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  age: number;
  relationshipStatus: RelationshipStatus;
};

export const listCreators = createServerFn({ method: "GET" }).handler(
  async (): Promise<CreatorPreview[]> => {
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select user_id, display_name, handle, bio, birthdate::text as birthdate,
             relationship_status,
           case when avatar_url is null then null else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
           case when banner_url is null then null else '/api/media/banner/' || user_id || '?v=' || banner_version end as banner_url,
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, created_at::text as created_at
      from profiles
      where banned_at is null
      order by created_at asc
      limit 16
    `;
    return rows.map((row) => ({
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      age: ageFromBirthdate(asIsoDate(row.birthdate)),
      relationshipStatus: isRelationship(row.relationship_status)
        ? row.relationship_status
        : "single",
    }));
  },
);

export const listProfilePosts = createServerFn({ method: "POST" })
  .validator(z.object({ handle: z.string().trim().toLowerCase() }))
  .handler(async ({ data }): Promise<PostCard[]> => {
    const viewerId = (await optionalViewerId()) ?? "";
    const canSeeNsfw = await isFsk18Verified(viewerId || null);
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
        (select count(*)::int from likes l where l.post_id = p.id) as like_count,
        exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked,
        pr.display_name,
        pr.handle,
        case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.handle = ${data.handle} and pr.banned_at is null
      order by p.created_at desc
    `;
    return mapFeed(rows, canSeeNsfw, viewerId);
  });

export const getProfileByHandle = createServerFn({ method: "POST" })
  .validator(z.object({ handle: z.string().trim().toLowerCase() }))
  .handler(async ({ data }): Promise<Profile | null> => {
    await sweepModeration();
    const viewerId = (await optionalViewerId()) ?? "";
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select user_id, display_name, handle, bio, birthdate::text as birthdate,
             relationship_status,
           case when avatar_url is null then null else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
           case when banner_url is null then null else '/api/media/banner/' || user_id || '?v=' || banner_version end as banner_url,
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, created_at::text as created_at
      from profiles where handle = ${data.handle}
    `;
    const row = rows[0];
    if (!row) return null;
    return toPublicProfile(row, viewerId);
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      imageUrl: z.string().min(20).max(dataUrlChars(MEDIA_LIMITS.post)),
      caption: z.string().trim().max(180),
      nsfw: z.boolean().optional().default(false),
      tags: z.array(z.enum(POST_TAG_IDS)).max(MAX_POST_TAGS).optional().default([]),
      // Tiny thumbnail (~16px). The size cap keeps it unrecognisable by construction.
      previewUrl: z.string().max(MAX_PREVIEW_CHARS).optional(),
      // Video posts: the file is already in Vercel Blob; imageUrl is its poster frame.
      videoUrl: z.string().max(500).optional(),
      // Video posts: a few small frames (≤320px JPEG) for the FSK18 check.
      videoFrames: z.array(z.string().max(120_000)).max(4).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<PostCard> => {
    await requireAdult(context.userId);
    if (!isImageDataUrl(data.imageUrl)) {
      throw new Error("Nur Bilder (JPG, PNG, GIF, WebP) sind erlaubt.");
    }
    if (data.videoUrl && !isBlobVideoUrl(data.videoUrl)) {
      throw new Error("Ungültige Video-Adresse.");
    }
    const nsfw = data.nsfw ?? false;
    const adultTag = (data.tags ?? []).find(isAdultTag);
    if (adultTag && !nsfw) {
      throw new Error(`Die Kategorie „${tagLabel(adultTag)}“ gibt es nur mit FSK 18.`);
    }
    const hashtags = extractHashtags(data.caption);
    if (!nsfw) {
      const { assertFsk18Marked } = await import("./nsfw-server");
      if (data.videoUrl && !data.videoFrames?.length) {
        throw new Error("Video konnte nicht geprüft werden. Bitte erneut auswählen.");
      }
      await assertFsk18Marked([data.imageUrl, ...(data.videoUrl ? (data.videoFrames ?? []) : [])]);
    }
    if (nsfw) {
      if (!data.previewUrl?.startsWith("data:image/")) {
        throw new Error("Vorschau fehlt.");
      }
    }
    const previewUrl = nsfw ? data.previewUrl : null;
    const sql = await getSql();
    const inserted = await sql<{ id: number }>`
      insert into posts (user_id, image_url, caption, nsfw, preview_url, tags, video_url, hashtags)
      values (${context.userId}, ${data.imageUrl}, ${data.caption}, ${nsfw}, ${previewUrl},
              ${[...new Set(data.tags ?? [])]}, ${data.videoUrl ?? null}, ${hashtags})
      returning id
    `;
    const id = inserted[0]?.id;
    if (!id) throw new Error("Bild konnte nicht gespeichert werden.");
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
        0::int as like_count,
        false as liked,
        pr.display_name,
        pr.handle,
        case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where p.id = ${id}
    `;
    const mapped = mapFeed(rows, true);
    if (!mapped[0]) throw new Error("Bild konnte nicht gelesen werden.");
    return mapped[0];
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    const sql = await getSql();
    const removed = await sql<{ video_url: string | null }>`
      delete from posts where id = ${data.id} and user_id = ${context.userId} returning video_url
    `;
    const { deleteVideoFile } = await import("./moderation");
    await deleteVideoFile(removed[0]?.video_url);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ liked: boolean; likeCount: number }> => {
    await requireAdult(context.userId);
    const sql = await getSql();
    const existing = await sql<{ user_id: string }>`
      select user_id from likes where user_id = ${context.userId} and post_id = ${data.postId}
    `;
    const owner = await sql<{
      user_id: string;
    }>`select user_id from posts where id = ${data.postId}`;
    if (existing[0]) {
      await sql`delete from likes where user_id = ${context.userId} and post_id = ${data.postId}`;
      // Un-like: take the notification back too, so like/unlike doesn't spam.
      await sql`
        delete from notifications
        where kind = 'like' and actor_id = ${context.userId} and post_id = ${data.postId}
      `;
    } else {
      await sql`insert into likes (user_id, post_id) values (${context.userId}, ${data.postId})`;
      if (owner[0]) {
        await notify({
          userId: owner[0].user_id,
          kind: "like",
          actorId: context.userId,
          postId: data.postId,
        });
      }
    }
    const count = await sql<CountRow>`
      select count(*)::int as n from likes where post_id = ${data.postId}
    `;
    return { liked: !existing[0], likeCount: count[0]?.n ?? 0 };
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ handle: z.string().trim().toLowerCase() }))
  .handler(async ({ context, data }): Promise<{ following: boolean; followerCount: number }> => {
    const me = await requireAdult(context.userId);
    if (me.handle === data.handle) throw new Error("Sich selbst folgen geht nicht.");
    const sql = await getSql();
    const target = await sql<{ user_id: string }>`
      select user_id from profiles where handle = ${data.handle}
    `;
    const targetId = target[0]?.user_id;
    if (!targetId) throw new Error("Profil nicht gefunden.");
    const existing = await sql<{ follower_id: string }>`
      select follower_id from follows
      where follower_id = ${context.userId} and following_id = ${targetId}
    `;
    if (existing[0]) {
      await sql`
        delete from follows
        where follower_id = ${context.userId} and following_id = ${targetId}
      `;
    } else {
      await sql`
        insert into follows (follower_id, following_id)
        values (${context.userId}, ${targetId})
      `;
      await notify({ userId: targetId, kind: "follow", actorId: context.userId });
    }
    const count = await sql<CountRow>`
      select count(*)::int as n from follows where following_id = ${targetId}
    `;
    return { following: !existing[0], followerCount: count[0]?.n ?? 0 };
  });

export const reportPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      postId: z.number().int().positive(),
      reason: z.enum(REPORT_REASON_IDS),
      note: z.string().trim().max(300).optional().default(""),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    const sql = await getSql();
    const post = await sql<{ user_id: string }>`
      select user_id from posts where id = ${data.postId}
    `;
    if (!post[0]) throw new Error("Bild nicht gefunden.");
    if (post[0].user_id === context.userId) {
      throw new Error("Eigene Bilder kannst du löschen statt melden.");
    }
    await sql`
      insert into reports (post_id, reporter_id, reason, note)
      values (${data.postId}, ${context.userId}, ${data.reason}, ${data.note ?? ""})
      on conflict (post_id, reporter_id) do update
        set reason = excluded.reason, note = excluded.note, created_at = now()
    `;
    // Also post it to the team's Discord channel; a Discord hiccup must not fail the report.
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const origin = process.env.SITE_URL?.trim() || new URL(getRequest().url).origin;
      const { notifyDiscordOfReport } = await import("./report-notify");
      await notifyDiscordOfReport({
        postId: data.postId,
        reporterId: context.userId,
        reason: data.reason,
        note: data.note ?? "",
        siteUrl: origin,
      });
    } catch (err) {
      console.error("[report] Discord notification failed", err);
    }
    return { ok: true };
  });

const PROFILE_REPORT_REASON_IDS = PROFILE_REPORT_REASONS.map((r) => r.id) as [
  ProfileReportReason,
  ...ProfileReportReason[],
];

export const reportProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      handle: z.string().trim().toLowerCase(),
      reason: z.enum(PROFILE_REPORT_REASON_IDS),
      note: z.string().trim().max(300).optional().default(""),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    const sql = await getSql();
    const target = await sql<{ user_id: string }>`
      select user_id from profiles where handle = ${data.handle.replace(/^@/, "")}
    `;
    const profileUserId = target[0]?.user_id;
    if (!profileUserId) throw new Error("Profil nicht gefunden.");
    if (profileUserId === context.userId)
      throw new Error("Dein eigenes Profil kannst du nicht melden.");
    await sql`
      insert into profile_reports (profile_user_id, reporter_id, reason, note)
      values (${profileUserId}, ${context.userId}, ${data.reason}, ${data.note ?? ""})
      on conflict (profile_user_id, reporter_id) do update
        set reason = excluded.reason, note = excluded.note, created_at = now(), resolved_at = null
    `;
    try {
      const { notifyDiscordOfProfileReport } = await import("./report-notify");
      await notifyDiscordOfProfileReport({
        profileUserId,
        reporterId: context.userId,
        reason: data.reason,
        note: data.note ?? "",
        siteUrl: await currentSiteUrl(),
      });
    } catch (err) {
      console.error("[report] Discord profile notification failed", err);
    }
    return { ok: true };
  });

export type ProfileReportItem = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  reasons: string[];
  notes: string[];
  count: number;
  lastAt: string;
};

export const listProfileReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ProfileReportItem[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      handle: string;
      avatar_url: string | null;
      reasons: string[];
      notes: string[];
      count: number;
      last_at: string;
    }>`
      select pr.display_name, pr.handle,
             case when pr.avatar_url is null then null
                  else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
             array_agg(distinct r.reason) as reasons,
             array_remove(array_agg(nullif(r.note, '')), null) as notes,
             count(*)::int as count, max(r.created_at)::text as last_at
      from profile_reports r join profiles pr on pr.user_id = r.profile_user_id
      where r.resolved_at is null
      group by pr.user_id, pr.display_name, pr.handle, pr.avatar_url, pr.avatar_version
      order by max(r.created_at) desc
    `;
    return rows.map((r) => ({
      displayName: r.display_name,
      handle: r.handle,
      avatarUrl: r.avatar_url,
      reasons: (r.reasons ?? []).map(
        (id) => PROFILE_REPORT_REASONS.find((x) => x.id === id)?.label ?? id,
      ),
      notes: r.notes ?? [],
      count: Number(r.count),
      lastAt: asTime(r.last_at),
    }));
  });

export const resolveProfileReports = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ handle: z.string().trim().toLowerCase() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      update profile_reports set resolved_at = now()
      where resolved_at is null
        and profile_user_id = (select user_id from profiles where handle = ${data.handle})
    `;
    return { ok: true };
  });

export type SearchResult = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  age: number;
  relationshipStatus: RelationshipStatus;
};

/** Find people by handle or display name. Exact and prefix handle matches rank first. */
export const searchProfiles = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().trim().min(1).max(40) }))
  .handler(async ({ data }): Promise<SearchResult[]> => {
    const q = data.q.replace(/^@/, "").toLowerCase();
    if (!q) return [];
    // Treat user input literally inside LIKE patterns.
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    const contains = `%${escaped}%`;
    const prefix = `${escaped}%`;
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select user_id, display_name, handle, bio, birthdate::text as birthdate,
             relationship_status,
           case when avatar_url is null then null else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
           case when banner_url is null then null else '/api/media/banner/' || user_id || '?v=' || banner_version end as banner_url,
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, created_at::text as created_at
      from profiles
      where banned_at is null
        and (handle like ${contains} or lower(display_name) like ${contains})
      order by (handle = ${q}) desc, (handle like ${prefix}) desc,
               (lower(display_name) like ${prefix}) desc, display_name asc
      limit 20
    `;
    return rows.map((row) => ({
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      age: ageFromBirthdate(asIsoDate(row.birthdate)),
      relationshipStatus: isRelationship(row.relationship_status)
        ? row.relationship_status
        : "single",
    }));
  });

/** Whether Discord verification is set up, plus the invite link to show. */
export const getDiscordSetup = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; inviteUrl: string | null }> => ({
    configured: discordConfig() !== null,
    inviteUrl: discordInviteUrl(),
  }),
);

export const unlinkDiscord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update profiles
      set discord_id = null, discord_username = null,
          fsk18_verified_at = null, fsk18_checked_at = null
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Comments

type CommentRow = {
  id: number;
  body: string;
  created_at: string;
  user_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
};

/** May this viewer see the post (FSK 18 rules)? Comments follow the same rule. */
async function canViewPost(postId: number, viewerId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ nsfw: boolean; user_id: string }>`
    select nsfw, user_id from posts where id = ${postId}
  `;
  const post = rows[0];
  if (!post) return false;
  if (!post.nsfw || post.user_id === viewerId) return true;
  return isFsk18Verified(viewerId || null);
}

export const listComments = createServerFn({ method: "GET" })
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const viewerId = (await optionalViewerId()) ?? "";
    if (!(await canViewPost(data.postId, viewerId))) return { locked: true, comments: [] };
    const sql = await getSql();
    const [rows, admin, owner] = await Promise.all([
      sql<CommentRow>`
        select c.id, c.body, c.created_at::text as created_at, c.user_id,
               pr.display_name, pr.handle,
               case when pr.avatar_url is null then null
                    else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url
        from comments c
        join profiles pr on pr.user_id = c.user_id
        where c.post_id = ${data.postId} and pr.banned_at is null
        order by c.created_at asc
        limit 200
      `,
      isAdminUser(viewerId),
      sql<{ user_id: string }>`select user_id from posts where id = ${data.postId}`,
    ]);
    const postOwner = owner[0]?.user_id;
    return {
      locked: false,
      comments: rows.map((r) => ({
        id: Number(r.id),
        body: r.body,
        createdAt: asTime(r.created_at),
        canDelete: Boolean(viewerId) && (r.user_id === viewerId || postOwner === viewerId || admin),
        author: { displayName: r.display_name, handle: r.handle, avatarUrl: r.avatar_url },
      })),
    };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ postId: z.number().int().positive(), body: z.string().trim().min(1).max(300) }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    if (!(await canViewPost(data.postId, context.userId))) {
      throw new Error("Dieses Bild kannst du nicht kommentieren.");
    }
    const sql = await getSql();
    await sql`
      insert into comments (post_id, user_id, body)
      values (${data.postId}, ${context.userId}, ${data.body})
    `;
    const owner = await sql<{
      user_id: string;
    }>`select user_id from posts where id = ${data.postId}`;
    if (owner[0]) {
      await notify({
        userId: owner[0].user_id,
        kind: "comment",
        actorId: context.userId,
        postId: data.postId,
        body: data.body.slice(0, 140),
      });
    }
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    const admin = await isAdminUser(context.userId);
    // Own comment, a comment under your own post, or any comment as admin.
    await sql`
      delete from comments c
      where c.id = ${data.id}
        and (${admin} or c.user_id = ${context.userId}
             or exists(select 1 from posts p where p.id = c.post_id and p.user_id = ${context.userId}))
    `;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Moderation (admins only, see ./admin.ts)

async function requireAdmin(userId: string) {
  if (!(await isAdminUser(userId))) throw new Error("Nur für Admins.");
}

export type ReportedPost = {
  postId: number;
  imageUrl: string;
  caption: string;
  author: { displayName: string; handle: string; banned: boolean };
  count: number;
  reasons: string[];
  notes: string[];
  lastReportedAt: string;
};

export const listReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ReportedPost[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      post_id: number;
      caption: string;
      display_name: string;
      handle: string;
      banned: boolean;
      count: number;
      reasons: string[];
      notes: string[];
      last_at: string;
    }>`
      select p.id as post_id, p.caption, pr.display_name, pr.handle,
             pr.banned_at is not null as banned,
             count(*)::int as count,
             array_agg(distinct r.reason) as reasons,
             array_remove(array_agg(nullif(r.note, '')), null) as notes,
             max(r.created_at)::text as last_at
      from reports r
      join posts p on p.id = r.post_id
      join profiles pr on pr.user_id = p.user_id
      where r.resolved_at is null
      group by p.id, pr.display_name, pr.handle, pr.banned_at
      order by count(*) desc, max(r.created_at) desc
      limit 100
    `;
    return rows.map((r) => ({
      postId: Number(r.post_id),
      imageUrl: `/api/media/post/${r.post_id}`,
      caption: r.caption,
      author: { displayName: r.display_name, handle: r.handle, banned: Boolean(r.banned) },
      count: Number(r.count),
      reasons: r.reasons ?? [],
      notes: r.notes ?? [],
      lastReportedAt: asTime(r.last_at),
    }));
  });

export const dismissReports = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    await dismissReportsFor(data.postId);
    return { ok: true };
  });

export const adminDeletePost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    await deletePostById(data.postId);
    return { ok: true };
  });

export type BannedProfile = {
  displayName: string;
  handle: string;
  bannedAt: string;
  reason: string | null;
  until: string | null;
};

export const listBanned = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BannedProfile[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      handle: string;
      banned_at: string;
      ban_reason: string | null;
      banned_until: string | null;
    }>`
      select display_name, handle, banned_at::text as banned_at, ban_reason,
             banned_until::text as banned_until
      from profiles where banned_at is not null
      order by banned_at desc
    `;
    return rows.map((r) => ({
      displayName: r.display_name,
      handle: r.handle,
      bannedAt: asTime(r.banned_at),
      reason: r.ban_reason,
      until: r.banned_until ? asTime(r.banned_until) : null,
    }));
  });

export const setBanned = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      handle: z.string().trim().toLowerCase(),
      banned: z.boolean(),
      reason: z.string().trim().max(300).optional(),
      duration: z.enum(BAN_DURATION_IDS).optional().default("perm"),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const me = await loadProfileRow(context.userId);
    if (me?.handle === data.handle.replace(/^@/, "")) {
      throw new Error("Dich selbst kannst du nicht sperren.");
    }
    const until = data.banned ? addDuration(data.duration) : null;
    if (!(await setBannedByHandle(data.handle, data.banned, data.reason, until))) {
      throw new Error("Profil nicht gefunden.");
    }
    return { ok: true };
  });

/** Delete a profile now, schedule it ("7d", "3m", …) or cancel a scheduled deletion. */
export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      handle: z.string().trim().toLowerCase(),
      when: z.union([z.enum(DELETE_DELAY_IDS), z.literal("cancel")]),
    }),
  )
  .handler(async ({ context, data }): Promise<{ deleted: boolean; deleteAt: string | null }> => {
    await requireAdmin(context.userId);
    const handle = data.handle.replace(/^@/, "");
    const sql = await getSql();
    const target = await sql<{ user_id: string }>`
      select user_id from profiles where handle = ${handle}
    `;
    const userId = target[0]?.user_id;
    if (!userId) throw new Error("Profil nicht gefunden.");
    if (userId === context.userId)
      throw new Error("Dein eigenes Profil kannst du hier nicht löschen.");
    if (await isAdminUser(userId)) throw new Error("Team-Profile können nicht gelöscht werden.");
    if (data.when === "now") {
      await deleteProfileNow(userId);
      return { deleted: true, deleteAt: null };
    }
    const at = data.when === "cancel" ? null : addDuration(data.when);
    await scheduleProfileDeletion(handle, at);
    return { deleted: false, deleteAt: at ? at.toISOString() : null };
  });

// ---------------------------------------------------------------------------
// Notifications

export type NotificationItem = {
  id: number;
  kind: "like" | "comment" | "follow" | "system";
  body: string;
  createdAt: string;
  read: boolean;
  /** null for "System" messages. */
  actor: { displayName: string; handle: string; avatarUrl: string | null } | null;
  postImageUrl: string | null;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<NotificationItem[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: NotificationItem["kind"];
      body: string;
      created_at: string;
      read: boolean;
      post_id: number | null;
      nsfw: boolean | null;
      display_name: string | null;
      handle: string | null;
      avatar_url: string | null;
    }>`
      select n.id, n.kind, n.body, n.created_at::text as created_at,
             n.read_at is not null as read, n.post_id, p.nsfw,
             a.display_name, a.handle,
             case when a.avatar_url is null then null
                  else '/api/media/avatar/' || a.user_id || '?v=' || a.avatar_version end as avatar_url
      from notifications n
      left join profiles a on a.user_id = n.actor_id
      left join posts p on p.id = n.post_id
      where n.user_id = ${context.userId}
        and (n.actor_id is null or a.banned_at is null)
      order by n.created_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      body: r.body,
      createdAt: asTime(r.created_at),
      read: Boolean(r.read),
      actor: r.handle
        ? { displayName: r.display_name ?? r.handle, handle: r.handle, avatarUrl: r.avatar_url }
        : null,
      // Notifications are about your own posts, which you can always see.
      postImageUrl: r.post_id ? `/api/media/post/${r.post_id}` : null,
    }));
  });

export const unreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<number> => {
    const sql = await getSql();
    const rows = await sql<CountRow>`
      select count(*)::int as n from notifications
      where user_id = ${context.userId} and read_at is null
    `;
    return rows[0]?.n ?? 0;
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update notifications set read_at = now()
      where user_id = ${context.userId} and read_at is null
    `;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Feedback & wishes, site updates

const FEEDBACK_KIND_IDS = FEEDBACK_KINDS.map((k) => k.id) as [string, ...string[]];

async function currentSiteUrl(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { siteUrlFrom } = await import("./community-discord");
  return siteUrlFrom(getRequest()?.url);
}

export const sendFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      kind: z.enum(FEEDBACK_KIND_IDS),
      body: z.string().trim().min(3).max(1000),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const me = await requireAdult(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into feedback (user_id, kind, body)
      values (${context.userId}, ${data.kind}, ${data.body})
      returning id
    `;
    const { postFeedbackToDiscord } = await import("./community-discord");
    await postFeedbackToDiscord({
      id: Number(rows[0]?.id),
      kind: data.kind,
      body: data.body,
      handle: me.handle,
      at: new Date(),
      siteUrl: await currentSiteUrl(),
    });
    return { ok: true };
  });

export type FeedbackItem = {
  id: number;
  kind: string;
  body: string;
  createdAt: string;
  done: boolean;
  author: { displayName: string; handle: string };
};

export const listFeedback = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FeedbackItem[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      kind: string;
      body: string;
      created_at: string;
      done: boolean;
      display_name: string;
      handle: string;
    }>`
      select f.id, f.kind, f.body, f.created_at::text as created_at,
             f.done_at is not null as done, pr.display_name, pr.handle
      from feedback f join profiles pr on pr.user_id = f.user_id
      order by f.done_at is not null, f.created_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      body: r.body,
      createdAt: asTime(r.created_at),
      done: Boolean(r.done),
      author: { displayName: r.display_name, handle: r.handle },
    }));
  });

export const setFeedbackDone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive(), done: z.boolean() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const { markFeedbackDone } = await import("./moderation");
    await markFeedbackDone(data.id, data.done);
    return { ok: true };
  });

export type UpdateItem = { id: number; title: string; body: string; createdAt: string };

export const listUpdates = createServerFn({ method: "GET" }).handler(
  async (): Promise<UpdateItem[]> => {
    const sql = await getSql();
    const rows = await sql<{ id: number; title: string; body: string; created_at: string }>`
      select id, title, body, created_at::text as created_at
      from announcements order by created_at desc limit 50
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      body: r.body,
      createdAt: asTime(r.created_at),
    }));
  },
);

/** Admins: publish an update — changelog entry, System notification for everyone, Discord #updates. */
export const publishUpdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      title: z.string().trim().min(3).max(120),
      body: z.string().trim().min(3).max(3000),
      toDiscord: z.boolean().optional().default(true),
    }),
  )
  .handler(async ({ context, data }): Promise<{ discord: boolean }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      insert into announcements (title, body, created_by)
      values (${data.title}, ${data.body}, ${context.userId})
    `;
    await sql`
      insert into notifications (user_id, kind, body)
      select user_id, 'system', ${`📢 Neues Update: ${data.title}`}
      from profiles where banned_at is null
    `;
    let discord = false;
    if (data.toDiscord) {
      const { postUpdateToDiscord } = await import("./community-discord");
      discord = await postUpdateToDiscord({
        title: data.title,
        body: data.body,
        at: new Date(),
        siteUrl: await currentSiteUrl(),
      });
    }
    return { discord };
  });

// ---------------------------------------------------------------------------
// FSK 18 approvals (admin page)

export type Fsk18Approval = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  /** "team" = unlocked by hand, "discord" = verified role on the Discord server. */
  source: "team" | "discord";
  by: string | null;
  since: string;
};

export const listFsk18Approvals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Fsk18Approval[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      handle: string;
      avatar_url: string | null;
      manual: boolean;
      by: string | null;
      since: string;
    }>`
      select display_name, handle,
             case when avatar_url is null then null
                  else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
             fsk18_manual_at is not null as manual, fsk18_manual_by as by,
             coalesce(fsk18_manual_at, fsk18_verified_at)::text as since
      from profiles
      where banned_at is null and (fsk18_manual_at is not null or fsk18_verified_at is not null)
      order by coalesce(fsk18_manual_at, fsk18_verified_at) desc
    `;
    return rows.map((r) => ({
      displayName: r.display_name,
      handle: r.handle,
      avatarUrl: r.avatar_url,
      source: r.manual ? "team" : "discord",
      by: r.by,
      since: asTime(r.since),
    }));
  });

export const setFsk18Approval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ handle: z.string().trim().min(1), unlock: z.boolean() }))
  .handler(async ({ context, data }): Promise<{ displayName: string }> => {
    await requireAdmin(context.userId);
    const me = await loadProfileRow(context.userId);
    const { setManualFsk18ByHandle } = await import("./moderation");
    const result = await setManualFsk18ByHandle(
      data.handle,
      data.unlock,
      me?.display_name ?? "Admin",
    );
    if (!result) throw new Error("Profil nicht gefunden.");
    return result;
  });

/** Save the interests from the sign-up popup (or settings); an empty list = skipped. */
export const saveInterests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ tags: z.array(z.enum(POST_TAG_IDS)).max(POST_TAG_IDS.length) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`
      update profiles
      set interests = ${[...new Set(data.tags)]}, interests_asked_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

/** Whether video uploads are set up (Vercel Blob store connected). */
export const videoUploadEnabled = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => Boolean(blobToken()),
);

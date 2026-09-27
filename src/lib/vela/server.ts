import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ageFromBirthdate, isAdultBirthdate } from "./age";
import { isBackgroundId } from "./backgrounds";
import { discordConfig, discordInviteUrl, isFsk18Verified } from "./discord";
import { MEDIA_LIMITS, dataUrlChars, isImageDataUrl } from "./media-limits";
import { isAdminUser } from "./admin";
import { deletePostById, dismissReportsFor, setBannedByHandle } from "./moderation";
import { notify } from "./notifications";
import type {
  Fsk18Status,
  PostCard,
  PostTag,
  Profile,
  RelationshipStatus,
  ReportReason,
} from "./types";
import { POST_TAGS, REPORT_REASONS, RELATIONSHIP_STATUSES } from "./types";

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
           background_id, banned_at is not null as banned, created_at::text as created_at
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
 * "Für dich" ranking. Every post gets a score from:
 *  - how much the viewer engaged with its categories (like 3, comment 4, view 1),
 *  - how much they engaged with its author, and whether they follow them,
 *  - its popularity (likes) and freshness,
 * minus a penalty once they have already seen it. Guests get fresh + popular.
 */
export const listFeed = createServerFn({ method: "GET" }).handler(async (): Promise<PostCard[]> => {
  const viewerId = (await optionalViewerId()) ?? "";
  const canSeeNsfw = await isFsk18Verified(viewerId || null);
  const sql = await getSql();
  const rows = await sql<FeedRow>`
      with signals as (
        select p.tags, p.user_id as author, 3.0 as w
        from likes l join posts p on p.id = l.post_id where l.user_id = ${viewerId}
        union all
        select p.tags, p.user_id, 4.0
        from comments c join posts p on p.id = c.post_id where c.user_id = ${viewerId}
        union all
        select p.tags, p.user_id, 1.0
        from post_views v join posts p on p.id = v.post_id where v.user_id = ${viewerId}
      ),
      tag_affinity as (
        select t.tag, sum(s.w) as score
        from signals s cross join lateral unnest(s.tags) as t(tag)
        group by t.tag
      ),
      author_affinity as (
        select author, sum(w) as score from signals group by author
      )
      select
        p.id,
        p.user_id,
        '/api/media/post/' || p.id as image_url,
        p.preview_url,
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
      order by (
          1.5 * ln(1 + coalesce((select sum(ta.score) from tag_affinity ta where ta.tag = any(p.tags)), 0))
        + 1.0 * ln(1 + coalesce((select aa.score from author_affinity aa where aa.author = p.user_id), 0))
        + case when exists(select 1 from follows f
                           where f.follower_id = ${viewerId} and f.following_id = p.user_id)
               then 2.0 else 0 end
        + 0.8 * ln(1 + (select count(*) from likes l where l.post_id = p.id))
        + 3.0 / (1 + extract(epoch from (now() - p.created_at)) / 86400.0)
        - case when exists(select 1 from post_views v
                           where v.user_id = ${viewerId} and v.post_id = p.id)
               then 2.5 else 0 end
        - case when p.user_id = ${viewerId} then 1.0 else 0 end
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

export const listExplore = createServerFn({ method: "GET" })
  .validator(z.object({ tag: z.enum(POST_TAG_IDS).nullable().optional() }).optional())
  .handler(async ({ data }): Promise<PostCard[]> => {
    const tag = data?.tag ?? null;
    const viewerId = (await optionalViewerId()) ?? "";
    const canSeeNsfw = await isFsk18Verified(viewerId || null);
    const sql = await getSql();
    const rows = await sql<FeedRow>`
      select
        p.id,
        p.user_id,
        '/api/media/post/' || p.id as image_url,
        p.preview_url,
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
           background_id, banned_at is not null as banned, created_at::text as created_at
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
    const viewerId = (await optionalViewerId()) ?? "";
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select user_id, display_name, handle, bio, birthdate::text as birthdate,
             relationship_status,
           case when avatar_url is null then null else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
           case when banner_url is null then null else '/api/media/banner/' || user_id || '?v=' || banner_version end as banner_url,
           background_id, banned_at is not null as banned, created_at::text as created_at
      from profiles where handle = ${data.handle} and banned_at is null
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
      tags: z.array(z.enum(POST_TAG_IDS)).max(3).optional().default([]),
      // Tiny thumbnail (~16px). The size cap keeps it unrecognisable by construction.
      previewUrl: z.string().max(MAX_PREVIEW_CHARS).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<PostCard> => {
    await requireAdult(context.userId);
    if (!isImageDataUrl(data.imageUrl)) {
      throw new Error("Nur Bilder (JPG, PNG, GIF, WebP) sind erlaubt.");
    }
    const nsfw = data.nsfw ?? false;
    if (nsfw) {
      if (!data.previewUrl?.startsWith("data:image/")) {
        throw new Error("Vorschau fehlt.");
      }
    }
    const previewUrl = nsfw ? data.previewUrl : null;
    const sql = await getSql();
    const inserted = await sql<{ id: number }>`
      insert into posts (user_id, image_url, caption, nsfw, preview_url, tags)
      values (${context.userId}, ${data.imageUrl}, ${data.caption}, ${nsfw}, ${previewUrl},
              ${[...new Set(data.tags ?? [])]})
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
    await sql`delete from posts where id = ${data.id} and user_id = ${context.userId}`;
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
           background_id, banned_at is not null as banned, created_at::text as created_at
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

export type BannedProfile = { displayName: string; handle: string; bannedAt: string };

export const listBanned = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BannedProfile[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ display_name: string; handle: string; banned_at: string }>`
      select display_name, handle, banned_at::text as banned_at
      from profiles where banned_at is not null
      order by banned_at desc
    `;
    return rows.map((r) => ({
      displayName: r.display_name,
      handle: r.handle,
      bannedAt: asTime(r.banned_at),
    }));
  });

export const setBanned = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ handle: z.string().trim().toLowerCase(), banned: z.boolean() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const me = await loadProfileRow(context.userId);
    if (me?.handle === data.handle.replace(/^@/, "")) {
      throw new Error("Dich selbst kannst du nicht sperren.");
    }
    if (!(await setBannedByHandle(data.handle, data.banned))) {
      throw new Error("Profil nicht gefunden.");
    }
    return { ok: true };
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { MIN_AGE, ageFromBirthdate, isAllowedBirthdate } from "./age";
import { isBackgroundId } from "./backgrounds";
import { discordConfig, discordInviteUrl, isFsk18Verified } from "./discord";
import { MEDIA_LIMITS, dataUrlChars, isImageDataUrl } from "./media-limits";
import { adminHandles, isAdminUser } from "./admin";
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
import {
  AVATAR_DECORATIONS,
  PROFILE_EFFECTS,
  asDecoration,
  asNamePlate,
  asProfileEffect,
} from "./decorations";
import {
  NAME_STYLES,
  asNameStyle,
  nextTier,
  tierOn,
  type RewardItem,
  type RewardKind,
} from "./rewards";
import {
  DAILY_GIFT,
  DAILY_PAW_CAP,
  PAWS_PER_TICK,
  TICK_SECONDS,
  bundleQuote,
  canUseItem,
  shopPrice,
  type ShopKind,
} from "./shop";

function rewardLabel(item: RewardItem): string {
  const list =
    item.kind === "decoration"
      ? AVATAR_DECORATIONS
      : item.kind === "effect"
        ? PROFILE_EFFECTS
        : NAME_STYLES;
  const label = list.find((x) => x.id === item.id)?.label ?? item.id;
  return item.kind === "decoration"
    ? `Rahmen „${label}“`
    : item.kind === "effect"
      ? `Effekt „${label}“`
      : `Name „${label}“`;
}
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
  avatar_decoration: string | null;
  profile_effect: string | null;
  name_style: string | null;
  name_plate: string | null;
  created_at: string;
};

type CountRow = { n: number };

export function asIsoDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

/**
 * Timestamps as ISO strings. Postgres sends "2026-10-05 12:00:00.1+00", which
 * Safari (iPhone) can't parse — `new Date()` there gives "Invalid Date".
 */
function asTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function isRelationship(value: string): value is RelationshipStatus {
  return RELATIONSHIP_IDS.includes(value as RelationshipStatus);
}

async function loadProfileRow(userId: string): Promise<ProfileRow | null> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select user_id, display_name, handle, bio, birthdate::text as birthdate,
           relationship_status,
           case when avatar_url is null then null else '/api/media/avatar/' || user_id || '?v=' || avatar_version end as avatar_url,
           case when banner_url is null then null else '/api/media/banner/' || user_id || '?v=' || banner_version end as banner_url,
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, avatar_decoration, profile_effect, name_style, name_plate, created_at::text as created_at
    from profiles where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

async function requireAdult(userId: string): Promise<ProfileRow> {
  const row = await loadProfileRow(userId);
  if (!row || ageFromBirthdate(asIsoDate(row.birthdate)) < MIN_AGE) {
    throw new Error("Age verification required");
  }
  if (row.banned) throw new Error("Dein Konto ist gesperrt.");
  return row;
}

async function toPublicProfile(row: ProfileRow, viewerId: string): Promise<Profile> {
  const sql = await getSql();
  // Under-18 viewers never see FSK-18 posts, so they aren't counted for them either.
  const hideNsfw = viewerId !== row.user_id && (await isMinorViewer(viewerId));
  const [posts, followers, following, followRow] = await Promise.all([
    sql<CountRow>`
      select count(*)::int as n from posts
      where user_id = ${row.user_id} and (${hideNsfw}::boolean = false or nsfw = false)
    `,
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
    decoration: asDecoration(row.avatar_decoration),
    effect: asProfileEffect(row.profile_effect),
    nameStyle: asNameStyle(row.name_style),
    namePlate: asNamePlate(row.name_plate),
    activeDays: viewerId === row.user_id ? await countActiveDays(row.user_id) : null,
    paws: viewerId === row.user_id ? await loadPaws(row.user_id) : null,
    owned: viewerId === row.user_id ? await loadOwned(row.user_id) : [],
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

export type FeedRow = {
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

export async function optionalViewerId(): Promise<string | null> {
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
export function mapFeed(
  rows: FeedRow[],
  canSeeNsfw: boolean,
  viewerId = "",
  hideNsfw = false,
): PostCard[] {
  // Under 18: FSK 18 posts don't exist for them — not even the locked preview.
  return rows
    .filter((row) => !(hideNsfw && row.nsfw))
    .map((row) => {
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
          decoration: asDecoration(row.avatar_decoration),
          nameStyle: asNameStyle(row.name_style),
          namePlate: asNamePlate(row.name_plate),
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
    await recordActiveDay(context.userId);
    if (ageFromBirthdate(asIsoDate(row.birthdate)) < MIN_AGE) return null;
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
    if (!isAllowedBirthdate(data.birthdate)) {
      throw new Error("Profile gibt es auf der Furry Gallery erst ab 15 Jahren.");
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
    const current = await requireAdult(context.userId);
    if (!isBackgroundId(data.backgroundId)) {
      throw new Error("Unbekannter Hintergrund.");
    }
    // A background already in use stays allowed; a new premium one must be bought.
    if (
      data.backgroundId !== current.background_id &&
      !canUseItem("background", data.backgroundId, await shopAccess(context.userId))
    ) {
      throw new Error("Diesen Hintergrund gibt es im Shop.");
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

async function countActiveDays(userId: string): Promise<number> {
  const sql = await getSql();
  const rows =
    await sql<CountRow>`select count(*)::int as n from active_days where user_id = ${userId}`;
  return rows[0]?.n ?? 0;
}

/** Count today as an active day; on a reward day, tell the member what unlocked. */
async function recordActiveDay(userId: string): Promise<void> {
  const sql = await getSql();
  const inserted = await sql<{ day: string }>`
    insert into active_days (user_id, day)
    values (${userId}, (now() at time zone 'Europe/Berlin')::date)
    on conflict do nothing
    returning day::text as day
  `;
  if (!inserted.length) return;
  const tier = tierOn(await countActiveDays(userId));
  if (tier) {
    await notify({
      userId,
      kind: "system",
      body: `🎁 Neue Belohnung (Tag ${tier.day}): ${tier.items.map(rewardLabel).join(", ")}. Einstellungen → Avatar-Rahmen & Effekte.`,
    }).catch(() => undefined);
  }
}

/** Avatar decoration, profile effect and name style (null = none); only unlocked ones. */
export const updateLook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      decoration: z.string().max(40).nullable(),
      effect: z.string().max(40).nullable(),
      nameStyle: z.string().max(40).nullable().optional(),
      /** Omitted = keep the current name plate. */
      plate: z.string().max(40).nullable().optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    const nameStyle = data.nameStyle ?? null;
    if (data.plate != null && !asNamePlate(data.plate)) {
      throw new Error("Unbekanntes Namensschild.");
    }
    if (data.decoration !== null && !asDecoration(data.decoration)) {
      throw new Error("Unbekannter Rahmen.");
    }
    if (data.effect !== null && !asProfileEffect(data.effect)) {
      throw new Error("Unbekannter Effekt.");
    }
    if (nameStyle !== null && !asNameStyle(nameStyle)) {
      throw new Error("Unbekannter Namens-Stil.");
    }
    const [access, current] = await Promise.all([
      shopAccess(context.userId),
      loadProfileRow(context.userId),
    ]);
    // Anything already chosen stays allowed; new picks must be unlocked or bought.
    const allowed = (kind: RewardKind, id: string | null, now: string | null | undefined) =>
      id === null || id === now || canUseItem(kind, id, access);
    if (
      !allowed("decoration", data.decoration, current?.avatar_decoration) ||
      !allowed("effect", data.effect, current?.profile_effect) ||
      !allowed("name", nameStyle, current?.name_style) ||
      !(
        data.plate == null ||
        data.plate === current?.name_plate ||
        canUseItem("plate", data.plate, access)
      )
    ) {
      throw new Error("Das ist noch nicht freigeschaltet.");
    }
    const sql = await getSql();
    await sql`
      update profiles
      set avatar_decoration = ${data.decoration}, profile_effect = ${data.effect},
          name_style = ${nameStyle}
      where user_id = ${context.userId}
    `;
    if (data.plate !== undefined) {
      await sql`update profiles set name_plate = ${data.plate} where user_id = ${context.userId}`;
    }
    return { ok: true };
  });

/** Set (data URL) or remove (null) the profile picture. */
export const updateAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ dataUrl: z.string().min(20).max(dataUrlChars(MEDIA_LIMITS.avatar)).nullable() }),
  )
  .handler(async ({ context, data }): Promise<Profile> => {
    await requireAdult(context.userId);
    if (data.dataUrl !== null && !isImageDataUrl(data.dataUrl)) {
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
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
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
  return mapFeed(rows, canSeeNsfw, viewerId, await isMinorViewer(viewerId));
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
      on conflict (user_id, post_id) do update
        set seen_at = now(), view_count = post_views.view_count + 1
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
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.banned_at is null and (${tag}::text is null or ${tag}::text = any(p.tags))
        and (${hashtag}::text is null or ${hashtag}::text = any(p.hashtags || p.tags))
      order by (select count(*) from likes l where l.post_id = p.id) desc, p.created_at desc
      limit 80
    `;
    return mapFeed(rows, canSeeNsfw, viewerId, await isMinorViewer(viewerId));
  });

/** One post (for opening it from notifications or "Deine Uploads"); null if gone. */
export const getPost = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }): Promise<PostCard | null> => {
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
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where p.id = ${data.id} and (pr.banned_at is null or p.user_id = ${viewerId})
    `;
    return mapFeed(rows, canSeeNsfw, viewerId, await isMinorViewer(viewerId))[0] ?? null;
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
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, avatar_decoration, profile_effect, name_style, name_plate, created_at::text as created_at
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
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.handle = ${data.handle} and pr.banned_at is null
      order by p.created_at desc
    `;
    return mapFeed(rows, canSeeNsfw, viewerId, await isMinorViewer(viewerId));
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
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, avatar_decoration, profile_effect, name_style, name_plate, created_at::text as created_at
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
    if (nsfw && (await isMinorViewer(context.userId))) {
      throw new Error("FSK-18-Inhalte kannst du erst ab 18 hochladen.");
    }
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
        pr.birthdate::text as birthdate,
        pr.avatar_decoration,
        pr.name_style,
        pr.name_plate
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
      // Unfollowing takes back the "folgt dir jetzt" note, so follow/unfollow doesn't pile up.
      await sql`
        delete from notifications
        where user_id = ${targetId} and actor_id = ${context.userId} and kind = 'follow'
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
           background_id, banned_at is not null as banned, ban_reason, banned_until::text as banned_until, delete_at::text as delete_at, interests, interests_asked_at is not null as interests_asked, avatar_decoration, profile_effect, name_style, name_plate, created_at::text as created_at
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
  parent_id: number | null;
  like_count: number;
  liked: boolean;
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
        select c.id, c.parent_id, c.body, c.created_at::text as created_at, c.user_id,
               (select count(*)::int from comment_likes l where l.comment_id = c.id) as like_count,
               exists(select 1 from comment_likes l
                      where l.comment_id = c.id and l.user_id = ${viewerId}) as liked,
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
        parentId: r.parent_id === null ? null : Number(r.parent_id),
        likeCount: Number(r.like_count),
        liked: Boolean(r.liked),
        isOwn: Boolean(viewerId) && r.user_id === viewerId,
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
    z.object({
      postId: z.number().int().positive(),
      body: z.string().trim().min(1).max(300),
      /** Answer to this comment (replies to replies go under the same top comment). */
      replyTo: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    if (!(await canViewPost(data.postId, context.userId))) {
      throw new Error("Dieses Bild kannst du nicht kommentieren.");
    }
    const sql = await getSql();
    let parentId: number | null = null;
    let replyAuthor: string | null = null;
    if (data.replyTo) {
      const target = await sql<{ id: number; parent_id: number | null; user_id: string }>`
        select id, parent_id, user_id from comments
        where id = ${data.replyTo} and post_id = ${data.postId}
      `;
      if (!target[0]) throw new Error("Der Kommentar existiert nicht mehr.");
      parentId = Number(target[0].parent_id ?? target[0].id);
      replyAuthor = target[0].user_id;
    }
    await sql`
      insert into comments (post_id, user_id, body, parent_id)
      values (${data.postId}, ${context.userId}, ${data.body}, ${parentId})
    `;
    if (replyAuthor) {
      await notify({
        userId: replyAuthor,
        kind: "reply",
        actorId: context.userId,
        postId: data.postId,
        body: data.body.slice(0, 140),
      });
    }
    const owner = await sql<{
      user_id: string;
    }>`select user_id from posts where id = ${data.postId}`;
    // The post owner hears about it too, unless they were the one answered.
    if (owner[0] && owner[0].user_id !== replyAuthor) {
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
  kind: "like" | "comment" | "follow" | "system" | "reply" | "comment_like";
  body: string;
  createdAt: string;
  read: boolean;
  /** null for "System" messages. */
  actor: { displayName: string; handle: string; avatarUrl: string | null } | null;
  postId: number | null;
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
      postId: r.post_id ? Number(r.post_id) : null,
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

/** Delete one of your notifications (id) or all of them (no id). */
export const deleteNotifications = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive().optional() }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    if (data.id === undefined) {
      await sql`delete from notifications where user_id = ${context.userId}`;
    } else {
      await sql`
        delete from notifications where id = ${data.id} and user_id = ${context.userId}
      `;
    }
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
    if (data.unlock) {
      const sql = await getSql();
      const target = await sql<{ birthdate: string }>`
        select birthdate::text as birthdate from profiles
        where handle = ${data.handle.trim().replace(/^@/, "").toLowerCase()}
      `;
      if (target[0] && ageFromBirthdate(asIsoDate(target[0].birthdate)) < 18) {
        throw new Error("Unter 18 gibt es keine FSK-18-Freigabe.");
      }
    }
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

// ---------------------------------------------------------------------------
// Shop: Pfoten for time on the site, bought items
// ---------------------------------------------------------------------------

async function loadPaws(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ paws: number }>`select paws from profiles where user_id = ${userId}`;
  return Number(rows[0]?.paws ?? 0);
}

async function loadOwned(userId: string): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql<{ kind: string; item_id: string }>`
    select kind, item_id from shop_purchases where user_id = ${userId}
  `;
  return rows.map((r) => `${r.kind}:${r.item_id}`);
}

async function shopAccess(userId: string) {
  const [activeDays, team, owned] = await Promise.all([
    countActiveDays(userId),
    isAdminUser(userId),
    loadOwned(userId),
  ]);
  return { activeDays, team, owned };
}

function isShopItem(kind: ShopKind, id: string): boolean {
  if (kind === "background") return isBackgroundId(id);
  if (kind === "decoration") return asDecoration(id) !== null;
  if (kind === "effect") return asProfileEffect(id) !== null;
  if (kind === "plate") return asNamePlate(id) !== null;
  return asNameStyle(id) !== null;
}

const SHOP_KIND = z.enum(["background", "decoration", "effect", "name", "plate"]);

export type PawStatus = {
  paws: number;
  today: number;
  cap: number;
  /** Consecutive Berlin days ending today or yesterday. */
  streak: number;
  /** The once-a-day opening gift is still waiting. */
  giftReady: boolean;
  /** Next active-day reward, if any remain. */
  nextReward: { inDays: number; label: string } | null;
};

async function streakOf(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    with marked as (
      select day, (day - (row_number() over (order by day))::int) as grp
      from active_days
      where user_id = ${userId}
    ),
    islands as (
      select max(day) as end_day, count(*)::int as n
      from marked
      group by grp
    )
    select coalesce((
      select n from islands
      where end_day >= (now() at time zone 'Europe/Berlin')::date - 1
      order by end_day desc
      limit 1
    ), 0)::int as n
  `;
  return Number(rows[0]?.n ?? 0);
}

async function readPawStatus(userId: string): Promise<PawStatus> {
  const sql = await getSql();
  const [rows, streak, activeDays] = await Promise.all([
    sql<{ paws: number; today: number; gift_ready: boolean }>`
      select paws,
             case when paws_day = (now() at time zone 'Europe/Berlin')::date
                  then paws_today else 0 end as today,
             gift_day is distinct from (now() at time zone 'Europe/Berlin')::date as gift_ready
      from profiles where user_id = ${userId}
    `,
    streakOf(userId),
    countActiveDays(userId),
  ]);
  const tier = nextTier(activeDays);
  return {
    paws: Number(rows[0]?.paws ?? 0),
    today: Number(rows[0]?.today ?? 0),
    cap: DAILY_PAW_CAP,
    streak,
    giftReady: Boolean(rows[0]?.gift_ready ?? false),
    nextReward: tier
      ? { inDays: Math.max(0, tier.day - activeDays), label: rewardLabel(tier.items[0]!) }
      : null,
  };
}

/**
 * Balance plus today's earnings. With `tick`, the client reports a minute on
 * the site: +1 Pfote, at most once per ~minute and up to the daily cap — the
 * server decides, so extra tabs or fast timers earn nothing extra.
 */
export const collectPaws = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ tick: z.boolean() }))
  .handler(async ({ context, data }): Promise<PawStatus> => {
    const sql = await getSql();
    if (data.tick) {
      await sql`
        update profiles
        set paws = paws + ${PAWS_PER_TICK},
            paws_today = case when paws_day = (now() at time zone 'Europe/Berlin')::date
                              then paws_today + ${PAWS_PER_TICK} else ${PAWS_PER_TICK} end,
            paws_day = (now() at time zone 'Europe/Berlin')::date,
            paws_tick_at = now()
        where user_id = ${context.userId}
          and banned_at is null
          and (paws_tick_at is null
               or paws_tick_at <= now() - make_interval(secs => ${TICK_SECONDS - 10}))
          and (paws_day is distinct from (now() at time zone 'Europe/Berlin')::date
               or paws_today < ${DAILY_PAW_CAP})
      `;
    }
    return readPawStatus(context.userId);
  });

/** Eight Pfoten for showing up, once per Berlin day. Does not eat the minute cap. */
export const claimDailyGift = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PawStatus> => {
    const sql = await getSql();
    await sql`
      update profiles
      set paws = paws + ${DAILY_GIFT},
          gift_day = (now() at time zone 'Europe/Berlin')::date
      where user_id = ${context.userId}
        and banned_at is null
        and gift_day is distinct from (now() at time zone 'Europe/Berlin')::date
    `;
    return readPawStatus(context.userId);
  });

/** Buy an item with Pfoten. Buying something you already own costs nothing. */
export const buyShopItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ kind: SHOP_KIND, id: z.string().max(40) }))
  .handler(async ({ context, data }): Promise<{ paws: number }> => {
    await requireAdult(context.userId);
    const price = shopPrice(data.kind, data.id);
    if (!isShopItem(data.kind, data.id) || price === null) {
      throw new Error("Das gibt es nicht im Shop.");
    }
    const access = await shopAccess(context.userId);
    if (canUseItem(data.kind, data.id, access)) {
      throw new Error("Das hast du schon.");
    }
    if ((await loadPaws(context.userId)) < price) {
      throw new Error("Dafür hast du noch nicht genug Pfoten.");
    }
    const sql = await getSql();
    // One statement = one transaction: record the purchase and take the Pfoten
    // together. If the balance ran out meanwhile, 1/0 aborts and nothing is kept.
    const rows = await sql<{ paws: number | null }>`
      with bought as (
        insert into shop_purchases (user_id, kind, item_id, price)
        values (${context.userId}, ${data.kind}, ${data.id}, ${price})
        on conflict do nothing
        returning 1
      ),
      paid as (
        update profiles set paws = paws - ${price}
        where user_id = ${context.userId} and paws >= ${price}
          and exists (select 1 from bought)
        returning paws
      )
      select (select paws from paid) as paws,
             case when exists (select 1 from bought)
                  then 1 / (select count(*)::int from paid) else 1 end as guard
    `.catch(() => {
      throw new Error("Dafür hast du noch nicht genug Pfoten.");
    });
    return { paws: Number(rows[0]?.paws ?? (await loadPaws(context.userId))) };
  });

/** Put on a bought/unlocked item straight from the shop. */
export const equipShopItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ kind: SHOP_KIND, id: z.string().max(40) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    if (!isShopItem(data.kind, data.id)) throw new Error("Unbekannter Artikel.");
    if (!canUseItem(data.kind, data.id, await shopAccess(context.userId))) {
      throw new Error("Das musst du erst kaufen.");
    }
    const sql = await getSql();
    if (data.kind === "background") {
      await sql`update profiles set background_id = ${data.id} where user_id = ${context.userId}`;
    } else if (data.kind === "decoration") {
      await sql`update profiles set avatar_decoration = ${data.id} where user_id = ${context.userId}`;
    } else if (data.kind === "effect") {
      await sql`update profiles set profile_effect = ${data.id} where user_id = ${context.userId}`;
    } else if (data.kind === "plate") {
      await sql`update profiles set name_plate = ${data.id} where user_id = ${context.userId}`;
    } else {
      await sql`update profiles set name_style = ${data.id} where user_id = ${context.userId}`;
    }
    return { ok: true };
  });

/**
 * Team: correct a member's birthdate (fake age). Under 18 afterwards means no
 * FSK18 at all — the manual and Discord unlocks are cleared — and, since the
 * site is 18+, the member can no longer use their profile.
 */
export const adminSetBirthdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      handle: z.string().trim().toLowerCase(),
      birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ context, data }): Promise<{ age: number }> => {
    await requireAdmin(context.userId);
    const age = ageFromBirthdate(data.birthdate);
    if (age < 0 || age > 120 || new Date(data.birthdate) > new Date()) {
      throw new Error("Ungültiges Geburtsdatum.");
    }
    const handle = data.handle.replace(/^@/, "");
    const sql = await getSql();
    const minor = age < 18;
    const rows = await sql<{ user_id: string }>`
      update profiles
      set birthdate = ${data.birthdate},
          fsk18_manual_at = case when ${minor} then null else fsk18_manual_at end,
          fsk18_verified_at = case when ${minor} then null else fsk18_verified_at end
      where handle = ${handle}
      returning user_id
    `;
    const userId = rows[0]?.user_id;
    if (!userId) throw new Error("Profil nicht gefunden.");
    await notify({
      userId,
      kind: "system",
      body: minor
        ? `Das Team hat dein Alter auf ${age} Jahre korrigiert. FSK-18-Inhalte sind für dich gesperrt.`
        : `Das Team hat dein Alter auf ${age} Jahre korrigiert.`,
    });
    return { age };
  });

// ---------------------------------------------------------------------------
// Team members (moderation panel)
// ---------------------------------------------------------------------------

export type TeamMemberKind = "discord" | "user" | "handle";

export type TeamMember = {
  kind: TeamMemberKind;
  value: string;
  addedBy: string | null;
  createdAt: string;
  /** The profile this entry matches right now (null: nobody yet). */
  match: { displayName: string; handle: string; avatarUrl: string | null } | null;
};

/** Team from ADMIN_HANDLES — always team, can't be removed in the panel. */
export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ owners: string[]; members: TeamMember[] }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      ref_kind: TeamMemberKind;
      ref_value: string;
      added_by: string | null;
      created_at: string;
      display_name: string | null;
      handle: string | null;
      avatar: string | null;
    }>`
      select t.ref_kind, t.ref_value, t.added_by, t.created_at::text as created_at,
             p.display_name, p.handle,
             case when p.avatar_url is null then null
                  else '/api/media/avatar/' || p.user_id || '?v=' || p.avatar_version end as avatar
      from team_members t
      left join lateral (
        select * from profiles p
        where (t.ref_kind = 'user' and p.user_id = t.ref_value)
           or (t.ref_kind = 'handle' and p.handle = t.ref_value)
           or (t.ref_kind = 'discord' and coalesce(p.discord_id,
                 (select a."accountId" from "account" a
                  where a."userId" = p.user_id and a."providerId" = 'discord' limit 1)) = t.ref_value)
        limit 1
      ) p on true
      order by t.created_at
    `;
    return {
      owners: adminHandles(),
      members: rows.map((r) => ({
        kind: r.ref_kind,
        value: r.ref_value,
        addedBy: r.added_by,
        createdAt: asTime(r.created_at),
        match: r.handle
          ? { displayName: r.display_name ?? r.handle, handle: r.handle, avatarUrl: r.avatar }
          : null,
      })),
    };
  });

/**
 * Add a team member. Accepts a Discord user id (17–20 digits, also works before
 * the person has a profile), a website user id, or a @handle.
 */
export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ ref: z.string().trim().min(2).max(80) }))
  .handler(async ({ context, data }): Promise<{ kind: TeamMemberKind; value: string }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const raw = data.ref.replace(/^<@!?|>$/g, "");
    let kind: TeamMemberKind;
    let value: string;
    if (/^\d{15,21}$/.test(raw)) {
      kind = "discord";
      value = raw;
    } else {
      const handle = raw.replace(/^@/, "").toLowerCase();
      const byId = raw.startsWith("@")
        ? []
        : await sql<{ user_id: string }>`select user_id from profiles where user_id = ${raw}`;
      if (byId[0]) {
        kind = "user";
        value = byId[0].user_id;
      } else {
        const byHandle = await sql<{ handle: string }>`
          select handle from profiles where handle = ${handle}
        `;
        if (!byHandle[0]) {
          throw new Error("Keine passende Nutzer-ID, Discord-ID oder @Name gefunden.");
        }
        kind = "handle";
        value = byHandle[0].handle;
      }
    }
    const me = await loadProfileRow(context.userId);
    await sql`
      insert into team_members (ref_kind, ref_value, added_by)
      values (${kind}, ${value}, ${me?.handle ?? null})
      on conflict do nothing
    `;
    return { kind, value };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ kind: z.enum(["discord", "user", "handle"]), value: z.string().max(80) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      delete from team_members where ref_kind = ${data.kind} and ref_value = ${data.value}
    `;
    return { ok: true };
  });

/** Buy everything still missing from a bundle, a quarter cheaper, in one go. */
export const buyShopBundle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().max(40) }))
  .handler(async ({ context, data }): Promise<{ paws: number; count: number }> => {
    await requireAdult(context.userId);
    const quote = bundleQuote(data.id, await shopAccess(context.userId));
    if (!quote) throw new Error("Das Paket gibt es nicht.");
    if (quote.missing.length === 0) throw new Error("Du hast schon alles aus diesem Paket.");
    if ((await loadPaws(context.userId)) < quote.price) {
      throw new Error("Dafür hast du noch nicht genug Pfoten.");
    }
    // Each item is recorded at its share of the discounted price.
    const share = (it: (typeof quote.missing)[number]) =>
      Math.round((shopPrice(it.kind, it.id) ?? 0) * (quote.price / Math.max(1, quote.full)));
    const sql = await getSql();
    const rows = await sql<{ paws: number | null }>`
      with bought as (
        insert into shop_purchases (user_id, kind, item_id, price)
        select ${context.userId}, k, i, p
        from unnest(${quote.missing.map((it) => it.kind)}::text[],
                    ${quote.missing.map((it) => it.id)}::text[],
                    ${quote.missing.map(share)}::int[]) as t(k, i, p)
        on conflict do nothing
        returning 1
      ),
      paid as (
        update profiles set paws = paws - ${quote.price}
        where user_id = ${context.userId} and paws >= ${quote.price}
          and exists (select 1 from bought)
        returning paws
      )
      select (select paws from paid) as paws,
             case when exists (select 1 from bought)
                  then 1 / (select count(*)::int from paid) else 1 end as guard
    `.catch(() => {
      throw new Error("Dafür hast du noch nicht genug Pfoten.");
    });
    return {
      paws: Number(rows[0]?.paws ?? (await loadPaws(context.userId))),
      count: quote.missing.length,
    };
  });

/** Team only: the birthdate a member entered (for the "Alter ändern" dialog). */
export const adminGetBirthdate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ handle: z.string().trim().toLowerCase() }))
  .handler(async ({ context, data }): Promise<{ birthdate: string }> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ birthdate: string }>`
      select birthdate::text as birthdate from profiles
      where handle = ${data.handle.replace(/^@/, "")}
    `;
    if (!rows[0]) throw new Error("Profil nicht gefunden.");
    return { birthdate: asIsoDate(rows[0].birthdate) };
  });

/** Like / unlike a comment. */
export const toggleCommentLike = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<{ liked: boolean; likeCount: number }> => {
    await requireAdult(context.userId);
    const sql = await getSql();
    const target = await sql<{ post_id: number; user_id: string }>`
      select post_id, user_id from comments where id = ${data.id}
    `;
    if (!target[0]) throw new Error("Der Kommentar existiert nicht mehr.");
    if (!(await canViewPost(Number(target[0].post_id), context.userId))) {
      throw new Error("Diesen Kommentar kannst du nicht liken.");
    }
    const removed = await sql<{ comment_id: number }>`
      delete from comment_likes where user_id = ${context.userId} and comment_id = ${data.id}
      returning comment_id
    `;
    const liked = removed.length === 0;
    if (!liked) {
      await sql`
        delete from notifications
        where id = (
          select id from notifications
          where user_id = ${target[0].user_id} and actor_id = ${context.userId}
            and kind = 'comment_like' and post_id = ${Number(target[0].post_id)}
          order by created_at desc
          limit 1
        )
      `;
    }
    if (liked) {
      await sql`
        insert into comment_likes (user_id, comment_id) values (${context.userId}, ${data.id})
        on conflict do nothing
      `;
      await notify({
        userId: target[0].user_id,
        kind: "comment_like",
        actorId: context.userId,
        postId: Number(target[0].post_id),
      });
    }
    const count = await sql<CountRow>`
      select count(*)::int as n from comment_likes where comment_id = ${data.id}
    `;
    return { liked, likeCount: count[0]?.n ?? 0 };
  });

/** Signed-in viewer under 18 (FSK 18 posts are hidden for them entirely). */
export async function isMinorViewer(viewerId: string | null | undefined): Promise<boolean> {
  if (!viewerId) return false;
  const sql = await getSql();
  const rows = await sql<{ birthdate: string }>`
    select birthdate::text as birthdate from profiles where user_id = ${viewerId}
  `;
  return rows[0] ? ageFromBirthdate(asIsoDate(rows[0].birthdate)) < 18 : false;
}

export type MyUpload = {
  id: number;
  imageUrl: string;
  isVideo: boolean;
  caption: string;
  createdAt: string;
  nsfw: boolean;
  /** Members who looked at it (without you). */
  viewers: number;
  /** Members who came back to it more than once. */
  repeatViewers: number;
  /** All views together. */
  views: number;
  likes: number;
  comments: number;
};

/** Your own uploads with their statistics (upload page). */
export const listMyUploads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyUpload[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      video_url: string | null;
      caption: string;
      created_at: string;
      nsfw: boolean;
      viewers: number;
      repeat_viewers: number;
      views: number;
      likes: number;
      comments: number;
    }>`
      select p.id, p.video_url, p.caption, p.created_at::text as created_at, p.nsfw,
             coalesce(v.viewers, 0) as viewers, coalesce(v.repeat_viewers, 0) as repeat_viewers,
             coalesce(v.views, 0) as views,
             (select count(*)::int from likes l where l.post_id = p.id) as likes,
             (select count(*)::int from comments c where c.post_id = p.id) as comments
      from posts p
      left join lateral (
        select count(*)::int as viewers,
               count(*) filter (where pv.view_count > 1)::int as repeat_viewers,
               coalesce(sum(pv.view_count), 0)::int as views
        from post_views pv
        where pv.post_id = p.id and pv.user_id <> p.user_id
      ) v on true
      where p.user_id = ${context.userId}
      order by p.created_at desc
      limit 200
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      imageUrl: `/api/media/post/${r.id}`,
      isVideo: Boolean(r.video_url),
      caption: r.caption,
      createdAt: asTime(r.created_at),
      nsfw: Boolean(r.nsfw),
      viewers: Number(r.viewers),
      repeatViewers: Number(r.repeat_viewers),
      views: Number(r.views),
      likes: Number(r.likes),
      comments: Number(r.comments),
    }));
  });

// ---------------------------------------------------------------------------
// Star rating pop-up

/** Ask members whose profile is older than this; "Später" waits this long. */
const RATING_AFTER_DAYS = 7;
const RATING_LATER_DAYS = 30;

/** Should the rating pop-up show for you right now? */
export const ratingPromptDue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<boolean> => {
    const sql = await getSql();
    const rows = await sql<{ due: boolean }>`
      select (p.created_at <= now() - make_interval(days => ${RATING_AFTER_DAYS})
              and p.banned_at is null
              and not exists (select 1 from site_ratings r where r.user_id = p.user_id)
              and (p.rating_prompt_later_at is null
                   or p.rating_prompt_later_at <= now() - make_interval(days => ${RATING_LATER_DAYS})))
             as due
      from profiles p where p.user_id = ${context.userId}
    `;
    return Boolean(rows[0]?.due);
  });

export const submitRating = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      stars: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional().default(""),
    }),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdult(context.userId);
    const sql = await getSql();
    await sql`
      insert into site_ratings (user_id, stars, comment)
      values (${context.userId}, ${data.stars}, ${data.comment ?? ""})
      on conflict (user_id) do update
        set stars = excluded.stars, comment = excluded.comment, updated_at = now()
    `;
    return { ok: true };
  });

/** "Später": ask again in a month. */
export const postponeRating = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`update profiles set rating_prompt_later_at = now() where user_id = ${context.userId}`;
    return { ok: true };
  });

export type RatingSummary = {
  count: number;
  average: number;
  /** Index 0 = 1 star … index 4 = 5 stars. */
  distribution: number[];
  recent: {
    stars: number;
    comment: string;
    updatedAt: string;
    author: { displayName: string; handle: string };
  }[];
};

/** Team: all ratings at a glance. */
export const listRatings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RatingSummary> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const [dist, recent] = await Promise.all([
      sql<{ stars: number; n: number }>`
        select stars, count(*)::int as n from site_ratings group by stars
      `,
      sql<{
        stars: number;
        comment: string;
        updated_at: string;
        display_name: string | null;
        handle: string | null;
      }>`
        select r.stars, r.comment, r.updated_at::text as updated_at, p.display_name, p.handle
        from site_ratings r left join profiles p on p.user_id = r.user_id
        order by r.updated_at desc
        limit 50
      `,
    ]);
    const distribution = [0, 0, 0, 0, 0];
    for (const d of dist) distribution[Number(d.stars) - 1] = Number(d.n);
    const count = distribution.reduce((a, b) => a + b, 0);
    const average = count ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / count : 0;
    return {
      count,
      average,
      distribution,
      recent: recent.map((r) => ({
        stars: Number(r.stars),
        comment: r.comment,
        updatedAt: asTime(r.updated_at),
        author: {
          displayName: r.display_name ?? "Gelöschtes Profil",
          handle: r.handle ?? "—",
        },
      })),
    };
  });

// ---------------------------------------------------------------------------
// "Was ist neu" pop-up

/**
 * Site updates you haven't seen yet (newest first). Members who never saw the
 * pop-up get the last two weeks, so a new account doesn't see ancient news.
 */
export const unseenUpdates = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UpdateItem[]> => {
    const sql = await getSql();
    const rows = await sql<{ id: number; title: string; body: string; created_at: string }>`
      select a.id, a.title, a.body, a.created_at::text as created_at
      from announcements a, profiles p
      where p.user_id = ${context.userId}
        and a.created_at > coalesce(p.updates_seen_at,
                                    greatest(p.created_at, now() - interval '14 days'))
      order by a.created_at desc
      limit 5
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      body: r.body,
      createdAt: asTime(r.created_at),
    }));
  });

export const markUpdatesSeen = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`update profiles set updates_seen_at = now() where user_id = ${context.userId}`;
    return { ok: true };
  });

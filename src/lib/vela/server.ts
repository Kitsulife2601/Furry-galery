import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { ageFromBirthdate, isAdultBirthdate } from "./age";
import { isBackgroundId } from "./backgrounds";
import { discordConfig, discordInviteUrl, isFsk18Verified } from "./discord";
import type { Fsk18Status, PostCard, Profile, RelationshipStatus, ReportReason } from "./types";
import { REPORT_REASONS, RELATIONSHIP_STATUSES } from "./types";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const MAX_PREVIEW_CHARS = 4_000;
const RELATIONSHIP_IDS = RELATIONSHIP_STATUSES.map((s) => s.id) as [
  RelationshipStatus,
  ...RelationshipStatus[],
];
const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];

type ProfileRow = {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string;
  birthdate: string;
  relationship_status: string;
  avatar_url: string | null;
  background_id: string;
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
           relationship_status, avatar_url, background_id, created_at::text as created_at
    from profiles where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

async function requireAdult(userId: string): Promise<ProfileRow> {
  const row = await loadProfileRow(userId);
  if (!row || ageFromBirthdate(asIsoDate(row.birthdate)) < 18) {
    throw new Error("Age verification required");
  }
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
    backgroundId: row.background_id,
    createdAt: asTime(row.created_at),
    postCount: posts[0]?.n ?? 0,
    followerCount: followers[0]?.n ?? 0,
    followingCount: following[0]?.n ?? 0,
    isOwn: viewerId === row.user_id,
    isFollowing: followRow.length > 0,
    fsk18: viewerId === row.user_id ? await loadFsk18Status(row.user_id) : null,
  };
}

async function loadFsk18Status(userId: string): Promise<Fsk18Status> {
  const sql = await getSql();
  const rows = await sql<{ discord_username: string | null }>`
    select discord_username from profiles where user_id = ${userId}
  `;
  return {
    verified: await isFsk18Verified(userId),
    discordUsername: rows[0]?.discord_username ?? null,
  };
}

type FeedRow = {
  id: number;
  user_id: string;
  image_url: string;
  preview_url: string | null;
  nsfw: boolean;
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
function mapFeed(rows: FeedRow[], canSeeNsfw: boolean): PostCard[] {
  return rows.map((row) => {
    const locked = Boolean(row.nsfw) && !canSeeNsfw;
    return {
      id: Number(row.id),
      userId: row.user_id,
      imageUrl: locked ? (row.preview_url ?? "") : row.image_url,
      caption: row.caption,
      createdAt: asTime(row.created_at),
      nsfw: Boolean(row.nsfw),
      locked,
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
  .validator(z.object({ dataUrl: z.string().min(20).max(700_000) }))
  .handler(async ({ context, data }): Promise<Profile> => {
    await requireAdult(context.userId);
    if (!data.dataUrl.startsWith("data:image/")) {
      throw new Error("Nur Bilder sind erlaubt.");
    }
    const sql = await getSql();
    await sql`
      update profiles set avatar_url = ${data.dataUrl} where user_id = ${context.userId}
    `;
    const row = await loadProfileRow(context.userId);
    if (!row) throw new Error("Profil nicht gefunden.");
    return toPublicProfile(row, context.userId);
  });

export const listFeed = createServerFn({ method: "GET" }).handler(async (): Promise<PostCard[]> => {
  const viewerId = (await optionalViewerId()) ?? "";
  const canSeeNsfw = await isFsk18Verified(viewerId || null);
  const sql = await getSql();
  const rows = await sql<FeedRow>`
      select
        p.id,
        p.user_id,
        p.image_url,
        p.preview_url,
        p.nsfw,
        p.caption,
        p.created_at::text as created_at,
        (select count(*)::int from likes l where l.post_id = p.id) as like_count,
        exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked,
        pr.display_name,
        pr.handle,
        pr.avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      order by p.created_at desc
      limit 60
    `;
  return mapFeed(rows, canSeeNsfw);
});

export const listExplore = createServerFn({ method: "GET" }).handler(
  async (): Promise<PostCard[]> => {
    const viewerId = (await optionalViewerId()) ?? "";
    const canSeeNsfw = await isFsk18Verified(viewerId || null);
    const sql = await getSql();
    const rows = await sql<FeedRow>`
      select
        p.id,
        p.user_id,
        p.image_url,
        p.preview_url,
        p.nsfw,
        p.caption,
        p.created_at::text as created_at,
        (select count(*)::int from likes l where l.post_id = p.id) as like_count,
        exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked,
        pr.display_name,
        pr.handle,
        pr.avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      order by (select count(*) from likes l where l.post_id = p.id) desc, p.created_at desc
      limit 80
    `;
    return mapFeed(rows, canSeeNsfw);
  },
);

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
             relationship_status, avatar_url, background_id, created_at::text as created_at
      from profiles
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
        p.image_url,
        p.preview_url,
        p.nsfw,
        p.caption,
        p.created_at::text as created_at,
        (select count(*)::int from likes l where l.post_id = p.id) as like_count,
        exists(select 1 from likes l where l.post_id = p.id and l.user_id = ${viewerId}) as liked,
        pr.display_name,
        pr.handle,
        pr.avatar_url,
        pr.relationship_status,
        pr.birthdate::text as birthdate
      from posts p
      join profiles pr on pr.user_id = p.user_id
      where pr.handle = ${data.handle}
      order by p.created_at desc
    `;
    return mapFeed(rows, canSeeNsfw);
  });

export const getProfileByHandle = createServerFn({ method: "POST" })
  .validator(z.object({ handle: z.string().trim().toLowerCase() }))
  .handler(async ({ data }): Promise<Profile | null> => {
    const viewerId = (await optionalViewerId()) ?? "";
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select user_id, display_name, handle, bio, birthdate::text as birthdate,
             relationship_status, avatar_url, background_id, created_at::text as created_at
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
      imageUrl: z.string().min(20).max(700_000),
      caption: z.string().trim().max(180),
      nsfw: z.boolean().optional().default(false),
      // Tiny thumbnail (~16px). The size cap keeps it unrecognisable by construction.
      previewUrl: z.string().max(MAX_PREVIEW_CHARS).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<PostCard> => {
    await requireAdult(context.userId);
    if (!data.imageUrl.startsWith("data:image/") && !data.imageUrl.startsWith("/seed/")) {
      throw new Error("Nur Bilder sind erlaubt.");
    }
    const nsfw = data.nsfw ?? false;
    if (nsfw) {
      if (!(await isFsk18Verified(context.userId))) {
        throw new Error("FSK-18-Bilder kannst du erst nach der Discord-Verifizierung posten.");
      }
      if (!data.previewUrl?.startsWith("data:image/")) {
        throw new Error("Vorschau fehlt.");
      }
    }
    const previewUrl = nsfw ? data.previewUrl : null;
    const sql = await getSql();
    const inserted = await sql<{ id: number }>`
      insert into posts (user_id, image_url, caption, nsfw, preview_url)
      values (${context.userId}, ${data.imageUrl}, ${data.caption}, ${nsfw}, ${previewUrl})
      returning id
    `;
    const id = inserted[0]?.id;
    if (!id) throw new Error("Bild konnte nicht gespeichert werden.");
    const rows = await sql<FeedRow>`
      select
        p.id,
        p.user_id,
        p.image_url,
        p.preview_url,
        p.nsfw,
        p.caption,
        p.created_at::text as created_at,
        0::int as like_count,
        false as liked,
        pr.display_name,
        pr.handle,
        pr.avatar_url,
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
    if (existing[0]) {
      await sql`delete from likes where user_id = ${context.userId} and post_id = ${data.postId}`;
    } else {
      await sql`insert into likes (user_id, post_id) values (${context.userId}, ${data.postId})`;
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
             relationship_status, avatar_url, background_id, created_at::text as created_at
      from profiles
      where handle like ${contains} or lower(display_name) like ${contains}
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

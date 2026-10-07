import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { ageFromBirthdate } from "./age";
import { isFsk18Verified } from "./discord";
import { normalizeHashtag } from "./hashtags";
import {
  asIsoDate,
  isMinorViewer,
  isRelationship,
  mapFeed,
  optionalViewerId,
  type CreatorPreview,
  type FeedRow,
} from "./server";
import { ADULT_TAG_IDS, type PostCard } from "./types";

export const GALLERY_SORTS = ["beliebt", "neu"] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];

/** Posts per "Mehr laden" step, and the most the Gallery loads at once. */
export const GALLERY_PAGE = 30;
export const GALLERY_MAX = 240;

/** Who is looking: decides which FSK 18 posts and hashtags they may see. */
async function viewerAccess() {
  const viewerId = (await optionalViewerId()) ?? "";
  const [canSeeNsfw, minor] = await Promise.all([
    isFsk18Verified(viewerId || null),
    isMinorViewer(viewerId),
  ]);
  return { viewerId, canSeeNsfw, minor };
}

/**
 * The Gallery grid. Returns up to `limit + 1` posts — the extra one only tells
 * the page that "Mehr laden" has more to show. Stays a plain `PostCard[]` so
 * like/delete cache patches (post-cache.ts) keep working under the "explore" key.
 */
export const listGallery = createServerFn({ method: "GET" })
  .validator(
    z.object({
      hashtag: z.string().max(40).nullable().optional(),
      sort: z.enum(GALLERY_SORTS).default("beliebt"),
      limit: z.number().int().min(1).max(GALLERY_MAX).default(GALLERY_PAGE),
    }),
  )
  .handler(async ({ data }): Promise<PostCard[]> => {
    const hashtag = data.hashtag ? normalizeHashtag(data.hashtag) : null;
    const { viewerId, canSeeNsfw, minor } = await viewerAccess();
    const newest = data.sort === "neu";
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
      where pr.banned_at is null
        and (${hashtag}::text is null or ${hashtag}::text = any(p.hashtags || p.tags))
        and (not ${minor}::boolean or not p.nsfw)
      order by
        case when ${newest}::boolean then null else
          (select count(*) from likes l
            where l.post_id = p.id and l.created_at > now() - interval '7 days')
        end desc nulls last,
        case when ${newest}::boolean then null else
          (select count(*) from likes l where l.post_id = p.id)
        end desc nulls last,
        p.created_at desc,
        p.id desc
      limit ${data.limit + 1}
    `;
    return mapFeed(rows, canSeeNsfw, viewerId, minor);
  });

export type TrendingHashtag = { tag: string; count: number };
export type GalleryProfile = CreatorPreview & { isNew: boolean };
export type GalleryOverview = { hashtags: TrendingHashtag[]; profiles: GalleryProfile[] };

type OverviewProfileRow = {
  display_name: string;
  handle: string;
  avatar_url: string | null;
  birthdate: string;
  relationship_status: string;
  is_new: boolean;
};

/** Start view of the Gallery: hashtags people use right now and profiles to discover. */
export const galleryOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<GalleryOverview> => {
    const { canSeeNsfw } = await viewerAccess();
    const sql = await getSql();
    const adultTags = [...ADULT_TAG_IDS] as string[];
    const [tagRows, popularRows, newRows] = await Promise.all([
      // Unverified viewers (and minors) only see hashtags from posts they may open.
      sql<{ tag: string; recent: number; total: number }>`
        select t.tag, count(*) filter (where p.created_at > now() - interval '30 days')::int as recent,
               count(*)::int as total
        from posts p
        join profiles pr on pr.user_id = p.user_id and pr.banned_at is null
        cross join lateral unnest(p.hashtags || p.tags) as t(tag)
        where (${canSeeNsfw}::boolean or not p.nsfw)
          and (${canSeeNsfw}::boolean or not (t.tag = any(${adultTags}::text[])))
        group by t.tag
        order by recent desc, total desc, t.tag asc
        limit 14
      `,
      sql<OverviewProfileRow>`
        select pr.display_name, pr.handle, pr.birthdate::text as birthdate, pr.relationship_status,
               case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
               pr.created_at > now() - interval '14 days' as is_new
        from profiles pr
        join (
          select p.user_id, count(l.post_id) as likes, count(distinct p.id) as posts
          from posts p
          left join likes l on l.post_id = p.id and l.created_at > now() - interval '30 days'
          group by p.user_id
        ) s on s.user_id = pr.user_id
        where pr.banned_at is null
        order by s.likes desc, s.posts desc, pr.created_at desc
        limit 12
      `,
      sql<OverviewProfileRow>`
        select pr.display_name, pr.handle, pr.birthdate::text as birthdate, pr.relationship_status,
               case when pr.avatar_url is null then null else '/api/media/avatar/' || pr.user_id || '?v=' || pr.avatar_version end as avatar_url,
               pr.created_at > now() - interval '14 days' as is_new
        from profiles pr
        where pr.banned_at is null
        order by pr.created_at desc
        limit 8
      `,
    ]);

    const seen = new Set<string>();
    const profiles: GalleryProfile[] = [];
    // Popular first, then newcomers that aren't in the list yet.
    for (const row of [...popularRows, ...newRows]) {
      if (seen.has(row.handle)) continue;
      seen.add(row.handle);
      profiles.push({
        displayName: row.display_name,
        handle: row.handle,
        avatarUrl: row.avatar_url,
        age: ageFromBirthdate(asIsoDate(row.birthdate)),
        relationshipStatus: isRelationship(row.relationship_status)
          ? row.relationship_status
          : "single",
        isNew: Boolean(row.is_new),
      });
    }

    return {
      hashtags: tagRows.map((r) => ({ tag: r.tag, count: Number(r.total) || 0 })),
      profiles: profiles.slice(0, 16),
    };
  },
);

/** Hashtags starting with what someone types (for search suggestions). */
export const suggestHashtags = createServerFn({ method: "GET" })
  .validator(z.object({ q: z.string().trim().max(40) }))
  .handler(async ({ data }): Promise<TrendingHashtag[]> => {
    const q = data.q.replace(/^#/, "").toLowerCase();
    if (!q || !/^[\p{L}\p{N}_]+$/u.test(q)) return [];
    const { canSeeNsfw } = await viewerAccess();
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    const prefix = `${escaped}%`;
    const contains = `%${escaped}%`;
    const adultTags = [...ADULT_TAG_IDS] as string[];
    const sql = await getSql();
    const rows = await sql<{ tag: string; total: number }>`
      select t.tag, count(*)::int as total
      from posts p
      join profiles pr on pr.user_id = p.user_id and pr.banned_at is null
      cross join lateral unnest(p.hashtags || p.tags) as t(tag)
      where t.tag like ${contains}
        and (${canSeeNsfw}::boolean or not p.nsfw)
        and (${canSeeNsfw}::boolean or not (t.tag = any(${adultTags}::text[])))
      group by t.tag
      order by (t.tag = ${q}) desc, (t.tag like ${prefix}) desc, total desc, t.tag asc
      limit 8
    `;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.total) || 0 }));
  });

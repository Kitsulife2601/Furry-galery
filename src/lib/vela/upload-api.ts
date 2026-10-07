/**
 * Upload area: hashtag suggestions for the upload form, and editing your own
 * posts (caption + categories) from "Deine Uploads". Deleting uses `deletePost`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { MIN_AGE, ageFromBirthdate } from "./age";
import { extractHashtags } from "./hashtags";
import { MAX_POST_TAGS, POST_TAGS, isAdultTag, tagLabel, type PostTag } from "./types";

const POST_TAG_IDS = POST_TAGS.map((t) => t.id) as [PostTag, ...PostTag[]];

async function requireMember(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ birthdate: string; banned: boolean }>`
    select birthdate::text as birthdate, banned_at is not null as banned
    from profiles where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row || ageFromBirthdate(String(row.birthdate).slice(0, 10)) < MIN_AGE) {
    throw new Error("Age verification required");
  }
  if (row.banned) throw new Error("Dein Konto ist gesperrt.");
}

export type HashtagSuggestions = {
  /** Hashtags you used before, most used first. */
  mine: string[];
  /** Popular in the community lately (not from FSK-18 posts). */
  popular: string[];
};

export const suggestHashtags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HashtagSuggestions> => {
    const sql = await getSql();
    const [mine, popular] = await Promise.all([
      sql<{ tag: string }>`
        select t.tag, count(*)::int as n
        from (select hashtags from posts where user_id = ${context.userId}
              order by created_at desc limit 40) p
        cross join lateral unnest(p.hashtags) as t(tag)
        group by t.tag order by n desc, t.tag limit 8
      `,
      sql<{ tag: string }>`
        select t.tag, count(*)::int as n
        from posts p
        cross join lateral unnest(p.hashtags) as t(tag)
        where not p.nsfw and p.created_at > now() - interval '90 days'
        group by t.tag order by n desc, t.tag limit 12
      `,
    ]);
    const own = mine.map((r) => r.tag);
    return { mine: own, popular: popular.map((r) => r.tag).filter((t) => !own.includes(t)) };
  });

export type MyPostDetails = {
  id: number;
  caption: string;
  tags: PostTag[];
  nsfw: boolean;
  isVideo: boolean;
};

export const getMyPost = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ context, data }): Promise<MyPostDetails | null> => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      caption: string;
      tags: string[] | null;
      nsfw: boolean;
      video_url: string | null;
    }>`
      select id, caption, tags, nsfw, video_url from posts
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      caption: row.caption ?? "",
      tags: (row.tags ?? []).filter((t): t is PostTag => POST_TAG_IDS.includes(t as PostTag)),
      nsfw: Boolean(row.nsfw),
      isVideo: Boolean(row.video_url),
    };
  });

/** Change caption and categories of your own post. FSK 18 itself stays as uploaded. */
export const updateMyPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number().int().positive(),
      caption: z.string().trim().max(180),
      tags: z.array(z.enum(POST_TAG_IDS)).max(MAX_POST_TAGS),
    }),
  )
  .handler(async ({ context, data }): Promise<{ caption: string; tags: PostTag[] }> => {
    await requireMember(context.userId);
    const sql = await getSql();
    const rows = await sql<{ nsfw: boolean }>`
      select nsfw from posts where id = ${data.id} and user_id = ${context.userId}
    `;
    const post = rows[0];
    if (!post) throw new Error("Diesen Beitrag gibt es nicht mehr.");
    const tags = [...new Set(data.tags)];
    const adultTag = tags.find(isAdultTag);
    if (adultTag && !post.nsfw) {
      throw new Error(`Die Kategorie „${tagLabel(adultTag)}“ gibt es nur mit FSK 18.`);
    }
    await sql`
      update posts
      set caption = ${data.caption}, tags = ${tags}, hashtags = ${extractHashtags(data.caption)}
      where id = ${data.id} and user_id = ${context.userId}
    `;
    return { caption: data.caption, tags };
  });

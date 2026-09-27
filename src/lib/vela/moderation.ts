/** Moderation actions shared by the admin page and the Discord report buttons. */
import { getSql } from "@/lib/db";

export async function deletePostById(postId: number): Promise<void> {
  const sql = await getSql();
  await sql`delete from posts where id = ${postId}`;
}

export async function dismissReportsFor(postId: number): Promise<void> {
  const sql = await getSql();
  await sql`update reports set resolved_at = now() where post_id = ${postId} and resolved_at is null`;
}

/** Ban or unban by handle; banning also closes the profile's open reports. */
export async function setBannedByHandle(handle: string, banned: boolean): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    update profiles set banned_at = ${banned ? new Date().toISOString() : null}
    where handle = ${handle.replace(/^@/, "").toLowerCase()}
    returning user_id
  `;
  const userId = rows[0]?.user_id ?? null;
  if (userId && banned) {
    await sql`
      update reports set resolved_at = now()
      where resolved_at is null and post_id in (select id from posts where user_id = ${userId})
    `;
  }
  return userId;
}

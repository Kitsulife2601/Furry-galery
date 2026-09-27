/** In-app notifications (server-only). "System" messages have no actor. */
import { getSql } from "@/lib/db";

export type NotificationKind = "like" | "comment" | "follow" | "system";

export async function notify(opts: {
  userId: string;
  kind: NotificationKind;
  actorId?: string | null;
  postId?: number | null;
  body?: string;
}): Promise<void> {
  // Nobody gets notified about their own actions.
  if (opts.actorId && opts.actorId === opts.userId) return;
  try {
    const sql = await getSql();
    await sql`
      insert into notifications (user_id, kind, actor_id, post_id, body)
      values (${opts.userId}, ${opts.kind}, ${opts.actorId ?? null}, ${opts.postId ?? null},
              ${opts.body ?? ""})
    `;
  } catch (err) {
    // A failed notification must never break the action that caused it.
    console.error("[notify]", err);
  }
}

export function notifySystem(userId: string, body: string): Promise<void> {
  return notify({ userId, kind: "system", body });
}

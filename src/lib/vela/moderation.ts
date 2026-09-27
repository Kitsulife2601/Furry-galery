/** Moderation actions shared by the admin page and the Discord report buttons. */
import { getSql } from "@/lib/db";
import { notifySystem } from "./notifications";
import { REPORT_REASONS } from "./types";
import { blobToken } from "./video";
import { formatDay } from "./durations";

function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "https://furry-galery.vercel.app";
}

export async function deletePostById(postId: number): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; caption: string; video_url: string | null }>`
    delete from posts where id = ${postId} returning user_id, caption, video_url
  `;
  const post = rows[0];
  await deleteVideoFile(post?.video_url);
  if (post) {
    await notifySystem(
      post.user_id,
      `Dein Bild${post.caption ? ` „${post.caption.slice(0, 60)}“` : ""} wurde von der Moderation entfernt.`,
    );
  }
}

export async function dismissReportsFor(postId: number): Promise<void> {
  const sql = await getSql();
  await sql`update reports set resolved_at = now() where post_id = ${postId} and resolved_at is null`;
}

/**
 * Ban or unban by handle. Banning also closes the profile's open reports.
 * The member gets a "System" notification and, if we know their Discord
 * account, a private message from the bot.
 */
export async function setBannedByHandle(
  handle: string,
  banned: boolean,
  /** Written by the admin; otherwise the reasons of the profile's open reports are used. */
  reason?: string | null,
  /** End of a temporary ban; null/undefined = until lifted by hand. */
  until?: Date | null,
): Promise<string | null> {
  const sql = await getSql();
  const clean = handle.replace(/^@/, "").toLowerCase();
  const rows = await sql<{ user_id: string; handle: string; discord_id: string | null }>`
    update profiles
    set banned_at = ${banned ? new Date().toISOString() : null},
        ban_reason = ${banned ? reason?.trim() || null : null},
        banned_until = ${banned && until ? until.toISOString() : null}
    where handle = ${clean}
    returning user_id, handle,
      coalesce(discord_id, (select a."accountId" from "account" a
                            where a."userId" = profiles.user_id and a."providerId" = 'discord'
                            limit 1)) as discord_id
  `;
  const target = rows[0];
  if (!target) return null;

  let reasons: string[] = [];
  if (banned) {
    const open = await sql<{ reason: string }>`
      update reports set resolved_at = now()
      where resolved_at is null
        and post_id in (select id from posts where user_id = ${target.user_id})
      returning reason
    `;
    reasons = reason?.trim()
      ? [reason.trim()]
      : [...new Set(open.map((r) => r.reason))].map(
          (id) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id,
        );
    if (!reason?.trim() && reasons.length) {
      await sql`update profiles set ban_reason = ${reasons.join(", ")} where user_id = ${target.user_id}`;
    }
  }

  await notifySystem(
    target.user_id,
    banned
      ? `Dein Profil wurde ${until ? `bis ${formatDay(until)}` : "dauerhaft"} gesperrt.${reasons.length ? ` Grund: ${reasons.join(", ")}.` : ""}`
      : "Dein Profil wurde entsperrt. Willkommen zurück!",
  );

  if (target.discord_id) {
    try {
      const { banNoticeEmbed, botConfig, makeDiscordApi, sendSystemDm } =
        await import("./discord-bot");
      const cfg = botConfig();
      if (cfg) {
        await sendSystemDm(
          makeDiscordApi(cfg.botToken),
          target.discord_id,
          banNoticeEmbed({
            handle: target.handle,
            banned,
            reasons,
            until: banned ? (until ?? null) : null,
            at: new Date(),
            siteUrl: siteUrl(),
          }),
        );
      }
    } catch (err) {
      console.error("[moderation] Discord DM failed", err);
    }
  }
  return target.user_id;
}

export async function markFeedbackDone(id: number, done = true): Promise<void> {
  const sql = await getSql();
  await sql`update feedback set done_at = ${done ? new Date().toISOString() : null} where id = ${id}`;
}

/**
 * Unlock (or revoke) FSK 18 on the website by hand — from the admin page or the
 * Discord /web-freischalten command. The member gets a "System" notification.
 */
export async function setManualFsk18ByHandle(
  handle: string,
  unlock: boolean,
  moderator: string,
): Promise<{ displayName: string } | null> {
  const sql = await getSql();
  const rows = await sql<{ display_name: string; user_id: string }>`
    update profiles
    set fsk18_manual_at = ${unlock ? new Date().toISOString() : null},
        fsk18_manual_by = ${unlock ? moderator : null}
    where handle = ${handle.replace(/^@/, "").toLowerCase()}
    returning display_name, user_id
  `;
  const row = rows[0];
  if (!row) return null;
  await notifySystem(
    row.user_id,
    unlock
      ? "FSK 18 wurde vom Team für dich freigeschaltet. Du siehst jetzt alle Bilder."
      : "Die FSK-18-Freischaltung wurde vom Team zurückgenommen.",
  );
  return { displayName: row.display_name };
}

/** Remove a post's video from Vercel Blob; a failure only leaves an orphaned file. */
export async function deleteVideoFile(url: string | null | undefined): Promise<void> {
  const token = blobToken();
  if (!url || !token) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(url, { token });
  } catch (err) {
    console.error("[video] delete failed", err);
  }
}

/**
 * Delete a profile for good: its posts (and videos), likes, comments, follows,
 * notifications, reports and feedback, and the login itself. Returns the handle.
 */
export async function deleteProfileNow(userId: string): Promise<string | null> {
  const sql = await getSql();
  const profile = await sql<{
    handle: string;
  }>`select handle from profiles where user_id = ${userId}`;
  if (!profile[0]) return null;
  const videos = await sql<{ video_url: string | null }>`
    delete from posts where user_id = ${userId} returning video_url
  `;
  await Promise.all(videos.map((v) => deleteVideoFile(v.video_url)));
  await sql`delete from likes where user_id = ${userId}`;
  await sql`delete from post_feedback where user_id = ${userId}`;
  await sql`delete from comments where user_id = ${userId}`;
  await sql`delete from follows where follower_id = ${userId} or following_id = ${userId}`;
  await sql`delete from post_views where user_id = ${userId}`;
  await sql`delete from notifications where user_id = ${userId} or actor_id = ${userId}`;
  await sql`delete from reports where reporter_id = ${userId}`;
  await sql`delete from feedback where user_id = ${userId}`;
  await sql`delete from profiles where user_id = ${userId}`;
  // Sessions and linked Google/Discord logins go with the user (on delete cascade).
  await sql`delete from "user" where id = ${userId}`;
  return profile[0].handle;
}

/** Schedule (or cancel with null) the deletion of a profile; the member is told. */
export async function scheduleProfileDeletion(handle: string, at: Date | null): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    update profiles set delete_at = ${at ? at.toISOString() : null}
    where handle = ${handle.replace(/^@/, "").toLowerCase()}
    returning user_id
  `;
  const row = rows[0];
  if (!row) return false;
  await notifySystem(
    row.user_id,
    at
      ? `Dein Profil wird vom Team am ${formatDay(at)} gelöscht. Fragen? Melde dich auf unserem Discord.`
      : "Die geplante Löschung deines Profils wurde aufgehoben.",
  );
  return true;
}

let lastSweep = 0;

/**
 * Lifts expired temporary bans and carries out due profile deletions. Called
 * from busy read paths; runs at most once a minute per server instance.
 */
export async function sweepModeration(): Promise<void> {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  try {
    const sql = await getSql();
    const expired = await sql<{ handle: string }>`
      select handle from profiles
      where banned_at is not null and banned_until is not null and banned_until <= now()
    `;
    for (const { handle } of expired) await setBannedByHandle(handle, false);
    const due = await sql<{ user_id: string }>`
      select user_id from profiles where delete_at is not null and delete_at <= now()
    `;
    for (const { user_id } of due) await deleteProfileNow(user_id);
  } catch (err) {
    console.error("[moderation] sweep failed", err);
  }
}

/** Moderation actions shared by the admin page and the Discord report buttons. */
import { getSql } from "@/lib/db";
import { notifySystem } from "./notifications";
import { REPORT_REASONS } from "./types";
import { blobToken } from "./video";

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
): Promise<string | null> {
  const sql = await getSql();
  const clean = handle.replace(/^@/, "").toLowerCase();
  const rows = await sql<{ user_id: string; handle: string; discord_id: string | null }>`
    update profiles
    set banned_at = ${banned ? new Date().toISOString() : null},
        ban_reason = ${banned ? reason?.trim() || null : null}
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
      ? `Dein Profil wurde gesperrt.${reasons.length ? ` Grund: ${reasons.join(", ")}.` : ""}`
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

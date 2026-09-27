/** Moderation actions shared by the admin page and the Discord report buttons. */
import { getSql } from "@/lib/db";
import { notifySystem } from "./notifications";
import { REPORT_REASONS } from "./types";

function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "https://furry-galery.vercel.app";
}

export async function deletePostById(postId: number): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; caption: string }>`
    delete from posts where id = ${postId} returning user_id, caption
  `;
  const post = rows[0];
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
export async function setBannedByHandle(handle: string, banned: boolean): Promise<string | null> {
  const sql = await getSql();
  const clean = handle.replace(/^@/, "").toLowerCase();
  const rows = await sql<{ user_id: string; handle: string; discord_id: string | null }>`
    update profiles set banned_at = ${banned ? new Date().toISOString() : null}
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
    reasons = [...new Set(open.map((r) => r.reason))].map(
      (id) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id,
    );
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

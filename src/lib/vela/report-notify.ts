/**
 * Posts a new website report into the team's Discord channel (server-only):
 * image (FSK 18 as a spoiler), uploader, reporter, time and reason, with
 * buttons to delete, dismiss or ban right from Discord.
 */
import { getSql } from "@/lib/db";
import {
  botConfig,
  ensureReportChannel,
  makeDiscordApi,
  reportImageName,
  reportMessage,
} from "./discord-bot";
import { REPORT_REASONS } from "./types";

type Row = {
  image_url: string;
  caption: string;
  nsfw: boolean;
  total: number;
  author_handle: string;
  author_name: string;
  reporter_handle: string;
  reporter_name: string;
};

const DATA_URL = /^data:image\/(jpeg|png|gif|webp);base64,/;

export async function notifyDiscordOfReport(opts: {
  postId: number;
  reporterId: string;
  reason: string;
  note: string;
  siteUrl: string;
}): Promise<void> {
  const cfg = botConfig();
  if (!cfg) return; // Bot not set up — the report is still on the admin page.
  const sql = await getSql();
  const rows = await sql<Row>`
    select p.image_url, p.caption, p.nsfw,
           (select count(*)::int from reports r where r.post_id = p.id) as total,
           a.handle as author_handle, a.display_name as author_name,
           me.handle as reporter_handle, me.display_name as reporter_name
    from posts p
    join profiles a on a.user_id = p.user_id
    join profiles me on me.user_id = ${opts.reporterId}
    where p.id = ${opts.postId}
  `;
  const row = rows[0];
  if (!row) return;

  const notice = {
    postId: opts.postId,
    reason: REPORT_REASONS.find((r) => r.id === opts.reason)?.label ?? opts.reason,
    note: opts.note,
    caption: row.caption,
    nsfw: Boolean(row.nsfw),
    totalReports: Number(row.total) || 1,
    reportedAt: new Date(),
    author: { handle: row.author_handle, displayName: row.author_name },
    reporter: { handle: row.reporter_handle, displayName: row.reporter_name },
  };
  const match = DATA_URL.exec(row.image_url);
  const imageName = match ? reportImageName(notice, match[1] === "jpeg" ? "jpg" : match[1]) : null;

  const channelId = await ensureReportChannel(cfg, makeDiscordApi(cfg.botToken));
  const form = new FormData();
  form.append("payload_json", JSON.stringify(reportMessage(notice, opts.siteUrl, imageName)));
  if (match && imageName) {
    const bytes = Buffer.from(row.image_url.slice(match[0].length), "base64");
    form.append("files[0]", new Blob([bytes], { type: `image/${match[1]}` }), imageName);
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${cfg.botToken}` },
    body: form,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Discord report post → ${res.status} ${await res.text()}`);
}

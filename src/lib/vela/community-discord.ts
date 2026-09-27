/** Posts feedback (team channel) and site updates (public channel) to Discord. Server-only. */
import {
  FEEDBACK_CHANNEL,
  UPDATES_CHANNEL,
  botConfig,
  ensureChannel,
  feedbackMessage,
  makeDiscordApi,
  updateMessage,
} from "./discord-bot";

export function siteUrlFrom(requestUrl?: string): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "https://furry-galery.vercel.app";
}

/** Returns false when the bot is not set up or Discord fails — the website side still works. */
async function post(spec: typeof FEEDBACK_CHANNEL, message: unknown): Promise<boolean> {
  const cfg = botConfig();
  if (!cfg) return false;
  try {
    const api = makeDiscordApi(cfg.botToken);
    const channelId = await ensureChannel(cfg, api, spec);
    await api("POST", `/channels/${channelId}/messages`, message);
    return true;
  } catch (err) {
    console.error("[discord]", err);
    return false;
  }
}

export function postFeedbackToDiscord(opts: Parameters<typeof feedbackMessage>[0]) {
  return post(FEEDBACK_CHANNEL, feedbackMessage(opts));
}

export function postUpdateToDiscord(opts: Parameters<typeof updateMessage>[0]) {
  return post(UPDATES_CHANNEL, updateMessage(opts));
}

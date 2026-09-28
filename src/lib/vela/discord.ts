/**
 * FSK18 verification through the community Discord (server-only).
 *
 * The Discord bot hands out a "verified 18+" role after its own check. This app
 * never verifies anyone itself: a member links Discord via OAuth, and the app
 * reads their roles in the guild. With DISCORD_BOT_TOKEN set, the role is
 * re-checked in the background so a removed role also locks the content again.
 *
 * Env: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID (has a default),
 *      DISCORD_VERIFIED_ROLE_ID, optional DISCORD_BOT_TOKEN,
 *      DISCORD_REDIRECT_URI, DISCORD_INVITE_URL.
 */
import { randomBytes } from "node:crypto";
import { isAdultBirthdate } from "./age";
import { getSql } from "@/lib/db";
import { DISCORD_DEFAULTS } from "./discord-bot";

/** Short-lived cookie that ties the OAuth callback to the browser that started it. */
export const STATE_COOKIE = "vela_discord_state";

export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

const API = "https://discord.com/api/v10";
/** How long a role check stays valid before the bot re-checks it. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

function env(key: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[key]?.trim() : undefined;
  return v || undefined;
}

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  guildId: string;
  roleId: string;
};

export function discordConfig(): DiscordConfig | null {
  const clientId = env("DISCORD_CLIENT_ID") ?? DISCORD_DEFAULTS.applicationId;
  const clientSecret = env("DISCORD_CLIENT_SECRET");
  const guildId = env("DISCORD_GUILD_ID") ?? DISCORD_DEFAULTS.guildId;
  const roleId = env("DISCORD_VERIFIED_ROLE_ID") ?? DISCORD_DEFAULTS.verifiedRoleId;
  if (!clientSecret) return null;
  return { clientId, clientSecret, guildId, roleId };
}

export function discordInviteUrl(): string | null {
  return env("DISCORD_INVITE_URL") ?? null;
}

export function discordRedirectUri(requestUrl: string): string {
  return env("DISCORD_REDIRECT_URI") ?? new URL("/api/discord/callback", requestUrl).toString();
}

export function discordAuthorizeUrl(cfg: DiscordConfig, redirectUri: string, state: string) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "identify guilds.members.read");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "none");
  return url.toString();
}

export async function exchangeCode(
  cfg: DiscordConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Discord token exchange failed (${res.status})`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Discord token exchange returned no token");
  return body.access_token;
}

export type GuildMember = {
  discordId: string;
  username: string;
  roles: string[];
};

type RawMember = {
  roles?: string[];
  user?: { id: string; username: string; global_name?: string | null };
};

function toMember(raw: RawMember): GuildMember | null {
  if (!raw.user?.id) return null;
  return {
    discordId: raw.user.id,
    username: raw.user.global_name || raw.user.username,
    roles: raw.roles ?? [],
  };
}

/** The signed-in Discord user's membership in our guild, or null if not a member. */
export async function fetchOwnMembership(
  cfg: DiscordConfig,
  accessToken: string,
): Promise<GuildMember | null> {
  const res = await fetch(`${API}/users/@me/guilds/${cfg.guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Discord member lookup failed (${res.status})`);
  return toMember((await res.json()) as RawMember);
}

/**
 * Bot-side lookup for background re-checks. `undefined` = could not check
 * (no bot token, Discord down); `null` = no longer in the guild.
 */
async function fetchMemberAsBot(
  cfg: DiscordConfig,
  discordId: string,
): Promise<GuildMember | null | undefined> {
  const token = env("DISCORD_BOT_TOKEN");
  if (!token) return undefined;
  try {
    const res = await fetch(`${API}/guilds/${cfg.guildId}/members/${discordId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    return toMember((await res.json()) as RawMember);
  } catch {
    return undefined;
  }
}

type Fsk18Row = {
  birthdate: string | null;
  manual: boolean;
  discord_id: string | null;
  fsk18_verified_at: string | null;
  fsk18_checked_at: string | null;
};

/**
 * May this viewer see FSK18 images? Needs a linked Discord account holding the
 * verified role. Re-checks via the bot at most every RECHECK_MS; when a check
 * is impossible the last known result stands.
 */
export async function isFsk18Verified(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const sql = await getSql();
  const rows = await sql<Fsk18Row>`
    select birthdate::text as birthdate, fsk18_manual_at is not null as manual,
           discord_id, fsk18_verified_at::text as fsk18_verified_at,
           fsk18_checked_at::text as fsk18_checked_at
    from profiles where user_id = ${userId}
  `;
  const row = rows[0];
  // Under 18 by birthdate (e.g. corrected by the team): never, whatever else is set.
  if (!row?.birthdate || !isAdultBirthdate(row.birthdate.slice(0, 10))) return false;
  // Unlocked by hand by the team (/web-freischalten) — no Discord link needed.
  if (row?.manual) return true;
  const cfg = discordConfig();
  if (!cfg) return false;
  if (!row?.discord_id || !row.fsk18_verified_at) return false;

  const checkedAt = row.fsk18_checked_at ? Date.parse(row.fsk18_checked_at) : 0;
  if (Date.now() - checkedAt < RECHECK_MS) return true;

  const member = await fetchMemberAsBot(cfg, row.discord_id);
  if (member === undefined) return true;
  const verified = Boolean(member?.roles.includes(cfg.roleId));
  await sql`
    update profiles
    set fsk18_checked_at = now(),
        fsk18_verified_at = ${verified ? row.fsk18_verified_at : null}
    where user_id = ${userId}
  `;
  return verified;
}

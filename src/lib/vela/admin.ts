/**
 * Who may moderate on the website:
 *  - profiles whose handle is in ADMIN_HANDLES (comma-separated, default: kitsulife), or
 *  - members holding a team role on the Discord server (Owner, Fluff Admin — see
 *    DISCORD_DEFAULTS.adminRoleIds), via their linked Discord account or Discord sign-in, or
 *  - members added in the moderation panel (team_members) by Discord user id, website
 *    user id or handle — matched against the profile on every check.
 */
import { getSql } from "@/lib/db";

export function adminHandles(): string[] {
  const raw = typeof process !== "undefined" ? process.env.ADMIN_HANDLES : undefined;
  return (raw?.trim() ? raw : "kitsulife")
    .split(",")
    .map((h) => h.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

/** Discord role checks are cached per server instance for a few minutes. */
const ROLE_CACHE_MS = 5 * 60 * 1000;
const roleCache = new Map<string, { admin: boolean; at: number }>();

async function hasDiscordAdminRole(discordId: string): Promise<boolean> {
  const cached = roleCache.get(discordId);
  if (cached && Date.now() - cached.at < ROLE_CACHE_MS) return cached.admin;
  const { botConfig, makeDiscordApi } = await import("./discord-bot");
  const cfg = botConfig();
  if (!cfg || cfg.adminRoleIds.length === 0) return false;
  let admin = false;
  try {
    const member = await makeDiscordApi(cfg.botToken)<{ roles: string[] }>(
      "GET",
      `/guilds/${cfg.guildId}/members/${discordId}`,
    );
    admin = member.roles.some((id) => cfg.adminRoleIds.includes(id));
  } catch {
    admin = false; // not on the server, or Discord unreachable
  }
  roleCache.set(discordId, { admin, at: Date.now() });
  return admin;
}

export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const sql = await getSql();
  const rows = await sql<{ handle: string; discord_id: string | null }>`
    select p.handle,
           coalesce(p.discord_id, (select a."accountId" from "account" a
                                   where a."userId" = p.user_id and a."providerId" = 'discord'
                                   limit 1)) as discord_id
    from profiles p
    where p.user_id = ${userId} and p.banned_at is null
  `;
  const row = rows[0];
  if (!row) return false;
  if (adminHandles().includes(row.handle)) return true;
  const listed = await sql<{ n: number }>`
    select count(*)::int as n from team_members
    where (ref_kind = 'user' and ref_value = ${userId})
       or (ref_kind = 'handle' and ref_value = ${row.handle})
       or (ref_kind = 'discord' and ref_value = ${row.discord_id ?? ""})
  `;
  if ((listed[0]?.n ?? 0) > 0) return true;
  return row.discord_id ? hasDiscordAdminRole(row.discord_id) : false;
}

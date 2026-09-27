import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import {
  STATE_COOKIE,
  discordConfig,
  discordRedirectUri,
  exchangeCode,
  fetchOwnMembership,
} from "@/lib/vela/discord";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function back(request: Request, status: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(`/settings?discord=${status}`, request.url).toString(),
      // One-shot: the state is spent whatever the outcome.
      "Set-Cookie": `${STATE_COOKIE}=; Path=/api/discord; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}

export const Route = createFileRoute("/api/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = discordConfig();
        if (!cfg) return back(request, "unconfigured");
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const expected = readCookie(request, STATE_COOKIE);
        if (!code || !state || !expected || state !== expected) return back(request, "error");

        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const user = await getSessionUser();
        if (!user) return back(request, "signed_out");

        let member;
        try {
          const token = await exchangeCode(cfg, code, discordRedirectUri(request.url));
          member = await fetchOwnMembership(cfg, token);
        } catch (err) {
          console.error("[discord]", err);
          return back(request, "error");
        }
        if (!member) return back(request, "not_member");

        const sql = await getSql();
        const profile = await sql<{ user_id: string }>`
          select user_id from profiles where user_id = ${user.id}
        `;
        if (!profile[0]) return back(request, "no_profile");
        // One Discord account unlocks one gallery account, never several.
        const other = await sql<{ user_id: string }>`
          select user_id from profiles
          where discord_id = ${member.discordId} and user_id <> ${user.id}
        `;
        if (other[0]) return back(request, "taken");

        const verified = member.roles.includes(cfg.roleId);
        await sql`
          update profiles
          set discord_id = ${member.discordId},
              discord_username = ${member.username},
              fsk18_verified_at = ${verified ? new Date().toISOString() : null},
              fsk18_checked_at = now()
          where user_id = ${user.id}
        `;
        return back(request, verified ? "verified" : "missing_role");
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import {
  STATE_COOKIE,
  discordAuthorizeUrl,
  discordConfig,
  discordRedirectUri,
  newOAuthState,
} from "@/lib/vela/discord";

function back(request: Request, status: string) {
  return Response.redirect(new URL(`/settings?discord=${status}`, request.url).toString(), 302);
}

export const Route = createFileRoute("/api/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = discordConfig();
        if (!cfg) return back(request, "unconfigured");
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const user = await getSessionUser();
        if (!user) return back(request, "signed_out");

        const state = newOAuthState();
        const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
        return new Response(null, {
          status: 302,
          headers: {
            Location: discordAuthorizeUrl(cfg, discordRedirectUri(request.url), state),
            "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/api/discord; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
          },
        });
      },
    },
  },
});

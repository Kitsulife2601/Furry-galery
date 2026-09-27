import { createFileRoute } from "@tanstack/react-router";
import {
  DISCORD_DEFAULTS,
  botConfig,
  diagnoseBot,
  handleInteraction,
  makeDiscordApi,
  verifyDiscordSignature,
  type Interaction,
} from "@/lib/vela/discord-bot";

/** Discord "Interactions Endpoint URL": https://DEINE-DOMAIN/api/discord/interactions */
export const Route = createFileRoute("/api/discord/interactions")({
  server: {
    handlers: {
      // Open this address in the browser to see what the bot still needs.
      GET: async ({ request }) => {
        const cfg = botConfig();
        const lines = ["Furry Gallery – Bot-Status", ""];
        if (!cfg) {
          lines.push("✖ DISCORD_BOT_TOKEN fehlt in Vercel (danach neu deployen)");
        } else {
          for (const check of await diagnoseBot(cfg, makeDiscordApi(cfg.botToken))) {
            lines.push(`${check.ok ? "✔" : "✖"} ${check.text}`);
          }
        }
        lines.push(
          process.env.DISCORD_CLIENT_SECRET?.trim()
            ? "✔ DISCORD_CLIENT_SECRET ist gesetzt"
            : "✖ DISCORD_CLIENT_SECRET fehlt in Vercel (für Discord-Anmeldung und Verknüpfung)",
          "",
          "Hinweis: Der Bot wird in Discord immer als „offline“ angezeigt — das ist normal.",
          `Interactions Endpoint URL im Developer Portal: ${new URL(request.url).origin}/api/discord/interactions`,
        );
        return new Response(lines.join("\n"), {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim() || DISCORD_DEFAULTS.publicKey;
        const cfg = botConfig();
        if (!publicKey || !cfg) {
          return new Response("Discord bot is not configured", { status: 503 });
        }
        const rawBody = await request.text();
        const valid = verifyDiscordSignature(
          publicKey,
          request.headers.get("x-signature-ed25519"),
          request.headers.get("x-signature-timestamp"),
          rawBody,
        );
        if (!valid) return new Response("Invalid signature", { status: 401 });

        const siteUrl = process.env.SITE_URL?.trim() || new URL(request.url).origin;
        try {
          const reply = await handleInteraction(JSON.parse(rawBody) as Interaction, {
            cfg,
            api: makeDiscordApi(cfg.botToken),
            siteUrl,
          });
          return Response.json(reply);
        } catch (err) {
          console.error("[discord-bot]", err);
          return Response.json({
            type: 4,
            data: {
              content: "Da ist etwas schiefgelaufen. Bitte versuch es gleich nochmal.",
              flags: 64,
            },
          });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import {
  botConfig,
  handleInteraction,
  makeDiscordApi,
  verifyDiscordSignature,
  type Interaction,
} from "@/lib/vela/discord-bot";

/** Discord "Interactions Endpoint URL": https://DEINE-DOMAIN/api/discord/interactions */
export const Route = createFileRoute("/api/discord/interactions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
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

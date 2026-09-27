import { createFileRoute } from "@tanstack/react-router";
import {
  deletePostById,
  dismissReportsFor,
  markFeedbackDone,
  setBannedByHandle,
  setManualFsk18ByHandle,
} from "@/lib/vela/moderation";
import {
  DISCORD_DEFAULTS,
  botConfig,
  deferredReplyFor,
  deliverReply,
  diagnoseBot,
  handleInteraction,
  makeDiscordApi,
  registerCommands,
  verifyDiscordSignature,
  type Interaction,
  type ReportActions,
  type WebFsk18,
} from "@/lib/vela/discord-bot";

/** The report buttons in the team's #meldungen channel. */
const reportActions: ReportActions = {
  deletePost: deletePostById,
  dismiss: dismissReportsFor,
  ban: async (handle) => Boolean(await setBannedByHandle(handle, true)),
};

/** /web-freischalten and /web-sperren: set or clear the team's manual FSK 18 unlock. */
const setWebFsk18: WebFsk18 = (handle, unlock, moderator) =>
  setManualFsk18ByHandle(handle, unlock, moderator);

/**
 * Keep the function alive for work that continues after the response has been
 * sent (Vercel's waitUntil; outside Vercel the promise simply keeps running).
 */
function runAfterResponse(request: Request, work: Promise<unknown>) {
  const vercel = (globalThis as Record<symbol, { get?: () => { waitUntil?: unknown } }>)[
    Symbol.for("@vercel/request-context")
  ];
  const waitUntil =
    vercel?.get?.()?.waitUntil ?? (request as Request & { waitUntil?: unknown }).waitUntil;
  if (typeof waitUntil === "function") waitUntil(work);
}

const ephemeral = (content: string) => Response.json({ type: 4, data: { content, flags: 64 } });

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
        const rawBody = await request.text();
        const valid = verifyDiscordSignature(
          publicKey,
          request.headers.get("x-signature-ed25519"),
          request.headers.get("x-signature-timestamp"),
          rawBody,
        );
        if (!valid) return new Response("Invalid signature", { status: 401 });

        const interaction = JSON.parse(rawBody) as Interaction;
        const cfg = botConfig();

        // PING (sent when the endpoint URL is saved): answer at once, even
        // before the bot token is set up, and (re)register /verify-panel.
        if (interaction.type === 1) {
          if (cfg) {
            runAfterResponse(
              request,
              registerCommands(cfg, makeDiscordApi(cfg.botToken)).catch((err) =>
                console.error("[discord-bot]", err),
              ),
            );
          }
          return Response.json({ type: 1 });
        }
        if (!cfg) {
          return ephemeral(
            "Der Bot ist noch nicht fertig eingerichtet: DISCORD_BOT_TOKEN fehlt in Vercel.",
          );
        }

        const siteUrl = process.env.SITE_URL?.trim() || new URL(request.url).origin;
        const deferred = deferredReplyFor(interaction);
        const work = handleInteraction(interaction, {
          cfg,
          api: makeDiscordApi(cfg.botToken),
          siteUrl,
          web: setWebFsk18,
          reports: reportActions,
          feedback: { done: (id) => markFeedbackDone(id) },
        })
          .catch((err) => {
            console.error("[discord-bot]", err);
            return {
              type: 4,
              data: { content: "Da ist etwas schiefgelaufen. Bitte versuch es gleich nochmal." },
            };
          })
          .then((reply) => deliverReply(interaction, deferred, reply))
          .catch((err) => console.error("[discord-bot] follow-up failed", err));
        runAfterResponse(request, work);
        return Response.json(deferred);
      },
    },
  },
});

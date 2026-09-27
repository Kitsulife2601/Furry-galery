#!/usr/bin/env node
/**
 * Optional: shows the Discord bot as "online" with the status
 * "Schaut furry-galery.vercel.app".
 *
 * The bot's commands and buttons work without this (they run on the website).
 * Discord only shows a bot as online while a program holds a gateway
 * connection, so this must run continuously somewhere — your own PC, a
 * Raspberry Pi or any small always-on host:
 *
 *   DISCORD_BOT_TOKEN=... node scripts/bot-online.mjs
 *   (Windows PowerShell: $env:DISCORD_BOT_TOKEN="..."; node scripts/bot-online.mjs)
 *
 * No dependencies — Node 22+ has WebSocket built in.
 */
const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  console.error("DISCORD_BOT_TOKEN fehlt.");
  process.exit(1);
}
const STATUS_TEXT = process.env.BOT_STATUS_TEXT?.trim() || "furry-galery.vercel.app";

let seq = null;
let heartbeat = null;
let retryMs = 2000;

function connect() {
  const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
  const send = (op, d) => ws.send(JSON.stringify({ op, d }));

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.s != null) seq = msg.s;
    switch (msg.op) {
      case 10: // Hello → start heartbeating, then identify
        clearInterval(heartbeat);
        heartbeat = setInterval(() => send(1, seq), msg.d.heartbeat_interval);
        send(2, {
          token,
          intents: 0,
          properties: { os: process.platform, browser: "furry-gallery", device: "furry-gallery" },
          presence: {
            status: "online",
            since: null,
            afk: false,
            activities: [{ name: STATUS_TEXT, type: 3 }], // "Schaut …"
          },
        });
        break;
      case 0:
        if (msg.t === "READY") {
          retryMs = 2000;
          console.log(`Online als ${msg.d.user.username} — Strg+C zum Beenden.`);
        }
        break;
      case 1: // Server asks for a heartbeat now
        send(1, seq);
        break;
      case 7: // Reconnect requested
      case 9: // Invalid session
        ws.close(4000);
        break;
    }
  });

  ws.addEventListener("close", (event) => {
    clearInterval(heartbeat);
    if (event.code === 4004) {
      console.error("Bot-Token ungültig — bitte im Developer Portal neu erzeugen.");
      process.exit(1);
    }
    console.log(`Verbindung getrennt (${event.code}), neuer Versuch in ${retryMs / 1000}s …`);
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 60_000);
  });
}

connect();

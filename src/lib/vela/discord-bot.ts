/**
 * Verification bot for the community Discord, run as an HTTP interactions
 * endpoint (no always-on process needed — it lives in the same deploy).
 *
 * Flow:
 *   /verify-panel          (admins) posts the verification embed + button
 *   [Verifizieren]         opens a private channel for the member in the category
 *   [Freischalten]         (mods) gives the verified role → FSK 18 on the website
 *   [Ablehnen]/[Schließen] closes out the ticket
 *
 * Kept free of `@/` imports and of the database so it can be unit-tested.
 */
import { createPublicKey, verify } from "node:crypto";

export type BotConfig = {
  applicationId: string;
  botToken: string;
  guildId: string;
  verifyChannelId: string;
  categoryId: string;
  verifiedRoleId: string;
  /** Optional: role whose members may approve. Admins / "Manage Roles" always may. */
  modRoleId: string | null;
};

/**
 * Public IDs of the community server and its Discord app (not secrets — the
 * client secret and bot token always come from env). Env vars override them.
 */
export const DISCORD_DEFAULTS = {
  applicationId: "1553811273165307995",
  publicKey: "5e09597be5aacaefe3a55f3b74d2f7695851d8667dd61bf9945a67405b889b05",
  verifiedRoleId: "1553830873365872680",
  guildId: "1553802179431899266",
  verifyChannelId: "1553814568852136097",
  categoryId: "1553815320202973281",
} as const;

function env(key: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[key]?.trim() : undefined;
  return v || undefined;
}

export function botConfig(): BotConfig | null {
  const applicationId = env("DISCORD_CLIENT_ID") ?? DISCORD_DEFAULTS.applicationId;
  const botToken = env("DISCORD_BOT_TOKEN");
  const verifiedRoleId = env("DISCORD_VERIFIED_ROLE_ID") ?? DISCORD_DEFAULTS.verifiedRoleId;
  if (!botToken) return null;
  return {
    applicationId,
    botToken,
    verifiedRoleId,
    guildId: env("DISCORD_GUILD_ID") ?? DISCORD_DEFAULTS.guildId,
    verifyChannelId: env("DISCORD_VERIFY_CHANNEL_ID") ?? DISCORD_DEFAULTS.verifyChannelId,
    categoryId: env("DISCORD_VERIFY_CATEGORY_ID") ?? DISCORD_DEFAULTS.categoryId,
    modRoleId: env("DISCORD_MOD_ROLE_ID") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Request signature (Discord signs every interaction with Ed25519)

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
): boolean {
  if (!signatureHex || !timestamp) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Discord REST

export type DiscordApi = <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;

export function makeDiscordApi(botToken: string): DiscordApi {
  return async (method, path, body) => {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${botToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      throw new Error(`Discord ${method} ${path} → ${res.status} ${await res.text()}`);
    }
    return (res.status === 204 ? null : await res.json()) as never;
  };
}

/** Slash commands of this bot, registered for the guild. */
export const COMMANDS = [
  {
    name: "verify-panel",
    description: "Postet das Verifizierungs-Panel mit Button",
    default_member_permissions: String(1 << 5), // Manage Server
    contexts: [0],
  },
];

export async function registerCommands(cfg: BotConfig, api: DiscordApi) {
  await api("PUT", `/applications/${cfg.applicationId}/guilds/${cfg.guildId}/commands`, COMMANDS);
}

// ---------------------------------------------------------------------------
// Interactions

const InteractionType = { Ping: 1, Command: 2, Component: 3 } as const;
const Reply = { Pong: 1, Message: 4, Ack: 6, Update: 7 } as const;
const EPHEMERAL = 64;

const Perm = {
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageRoles: 1n << 28n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadHistory: 1n << 16n,
};
const MEMBER_ACCESS = Perm.ViewChannel | Perm.SendMessages | Perm.AttachFiles | Perm.ReadHistory;

const COLOR = 0xd4c4b0;
const TOPIC_PREFIX = "verify:";

export type Interaction = {
  type: number;
  /** Needed for the follow-up after a deferred reply. */
  token?: string;
  application_id?: string;
  guild_id?: string;
  channel_id?: string;
  data?: { name?: string; custom_id?: string };
  member?: {
    user: { id: string; username: string; global_name?: string | null };
    roles: string[];
    permissions: string;
  };
  message?: { id: string; embeds?: unknown[]; components?: unknown[] };
};

export type InteractionReply = { type: number; data?: Record<string, unknown> };

type Channel = { id: string; parent_id?: string | null; topic?: string | null };

function ephemeral(content: string): InteractionReply {
  return { type: Reply.Message, data: { content, flags: EPHEMERAL } };
}

function isModerator(cfg: BotConfig, member: NonNullable<Interaction["member"]>): boolean {
  const perms = BigInt(member.permissions || "0");
  if (perms & (Perm.Administrator | Perm.ManageRoles)) return true;
  return cfg.modRoleId !== null && member.roles.includes(cfg.modRoleId);
}

function channelName(username: string, userId: string): string {
  const slug = username
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return `verify-${slug || userId.slice(-6)}`;
}

function button(label: string, customId: string, style: number, emoji: string) {
  return { type: 2, style, label, custom_id: customId, emoji: { name: emoji } };
}

export function panelMessage(siteUrl: string) {
  return {
    embeds: [
      {
        color: COLOR,
        author: { name: "Furry Gallery", icon_url: `${siteUrl}/__grok/icon-180.png` },
        title: "🔞 Verifizierung",
        url: siteUrl,
        description:
          "Um FSK-18-Inhalte hier im Server und auf der **Furry Gallery** freizuschalten, " +
          "musst du bestätigen, dass du volljährig bist.",
        thumbnail: { url: `${siteUrl}/__grok/icon-180.png` },
        fields: [
          {
            name: "So funktioniert’s",
            value:
              "1. Klick unten auf **Verifizieren**\n" +
              "2. Es öffnet sich ein privater Kanal — nur für dich und das Team\n" +
              "3. Ein Moderator prüft dein Alter und schaltet dich frei",
          },
          { name: "Dauer", value: "Meist innerhalb von 24 Stunden", inline: true },
          { name: "Danach", value: "Rolle hier + FSK 18 auf der Webseite", inline: true },
        ],
        footer: { text: "Furry Gallery · Nur ab 18" },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          button("Verifizieren", "verify:open", 3, "✅"),
          { type: 2, style: 5, label: "Zur Webseite", url: siteUrl },
        ],
      },
    ],
  };
}

function ticketMessage(cfg: BotConfig, userId: string) {
  const mods = cfg.modRoleId ? ` <@&${cfg.modRoleId}>` : "";
  return {
    content: `<@${userId}>${mods}`,
    allowed_mentions: { users: [userId], roles: cfg.modRoleId ? [cfg.modRoleId] : [] },
    embeds: [
      {
        color: COLOR,
        title: "Willkommen zur Verifizierung",
        description:
          "Dieser Kanal ist nur für dich und das Team sichtbar.\n\n" +
          "Ein Moderator meldet sich hier und erklärt dir, wie du dein Alter bestätigst. " +
          "Bitte schick keine Ausweisdaten, bevor dich jemand vom Team darum bittet.",
        footer: { text: "Nur das Team kann freischalten oder ablehnen." },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          button("Freischalten", `verify:approve:${userId}`, 3, "✅"),
          button("Ablehnen", `verify:deny:${userId}`, 4, "✖️"),
          button("Kanal schließen", "verify:close", 2, "🔒"),
        ],
      },
    ],
  };
}

/** Same message with only the close button left, after a decision. */
function decidedComponents() {
  return [{ type: 1, components: [button("Kanal schließen", "verify:close", 2, "🔒")] }];
}

export async function handleInteraction(
  interaction: Interaction,
  ctx: { cfg: BotConfig; api: DiscordApi; siteUrl: string },
): Promise<InteractionReply> {
  const { cfg, api, siteUrl } = ctx;

  if (interaction.type === InteractionType.Ping) return { type: Reply.Pong };

  const member = interaction.member;
  if (!member || interaction.guild_id !== cfg.guildId) {
    return ephemeral("Das funktioniert nur auf unserem Server.");
  }

  if (interaction.type === InteractionType.Command && interaction.data?.name === "verify-panel") {
    if (!isModerator(cfg, member)) return ephemeral("Dafür fehlen dir die Rechte.");
    await api("POST", `/channels/${cfg.verifyChannelId}/messages`, panelMessage(siteUrl));
    return ephemeral(`Panel gepostet in <#${cfg.verifyChannelId}>.`);
  }

  if (interaction.type !== InteractionType.Component) return ephemeral("Unbekannte Aktion.");
  const [, action, targetId] = (interaction.data?.custom_id ?? "").split(":");

  if (action === "open") {
    if (member.roles.includes(cfg.verifiedRoleId)) {
      return ephemeral(`Du bist schon verifiziert. Verbinde Discord auf ${siteUrl}/settings`);
    }
    const userId = member.user.id;
    const channels = await api<Channel[]>("GET", `/guilds/${cfg.guildId}/channels`);
    const existing = channels.find(
      (c) => c.parent_id === cfg.categoryId && c.topic === `${TOPIC_PREFIX}${userId}`,
    );
    if (existing) return ephemeral(`Du hast schon einen offenen Kanal: <#${existing.id}>`);

    const overwrites = [
      { id: cfg.guildId, type: 0, deny: String(Perm.ViewChannel) }, // @everyone
      { id: userId, type: 1, allow: String(MEMBER_ACCESS) },
      {
        id: cfg.applicationId,
        type: 1,
        allow: String(MEMBER_ACCESS | Perm.ManageChannels | Perm.EmbedLinks),
      },
    ];
    if (cfg.modRoleId) {
      overwrites.push({
        id: cfg.modRoleId,
        type: 0,
        allow: String(MEMBER_ACCESS | Perm.ManageMessages),
      });
    }
    const channel = await api<Channel>("POST", `/guilds/${cfg.guildId}/channels`, {
      name: channelName(member.user.global_name || member.user.username, userId),
      type: 0,
      parent_id: cfg.categoryId,
      topic: `${TOPIC_PREFIX}${userId}`,
      permission_overwrites: overwrites,
    });
    await api("POST", `/channels/${channel.id}/messages`, ticketMessage(cfg, userId));
    return ephemeral(`Dein Verifizierungs-Kanal ist offen: <#${channel.id}>`);
  }

  if (action === "approve" || action === "deny") {
    if (!isModerator(cfg, member)) return ephemeral("Nur das Team kann das entscheiden.");
    if (!targetId) return ephemeral("Unbekanntes Mitglied.");
    let note: string;
    if (action === "approve") {
      await api("PUT", `/guilds/${cfg.guildId}/members/${targetId}/roles/${cfg.verifiedRoleId}`);
      note =
        `✅ <@${targetId}> ist jetzt verifiziert (von <@${member.user.id}>).\n` +
        `Verbinde jetzt auf der Webseite dein Discord, um FSK 18 freizuschalten: ` +
        `${siteUrl}/settings#fsk18`;
    } else {
      note = `✖️ Die Verifizierung von <@${targetId}> wurde abgelehnt (von <@${member.user.id}>).`;
    }
    await api("POST", `/channels/${interaction.channel_id}/messages`, {
      content: note,
      allowed_mentions: { users: [targetId] },
    });
    return { type: Reply.Update, data: { components: decidedComponents() } };
  }

  if (action === "close") {
    const channel = await api<Channel>("GET", `/channels/${interaction.channel_id}`);
    const ownerId = channel.topic?.startsWith(TOPIC_PREFIX)
      ? channel.topic.slice(TOPIC_PREFIX.length)
      : null;
    if (channel.parent_id !== cfg.categoryId || !ownerId) {
      return ephemeral("Das ist kein Verifizierungs-Kanal.");
    }
    if (ownerId !== member.user.id && !isModerator(cfg, member)) {
      return ephemeral("Nur du oder das Team können diesen Kanal schließen.");
    }
    await api("DELETE", `/channels/${channel.id}`);
    return { type: Reply.Ack };
  }

  return ephemeral("Unbekannte Aktion.");
}

// ---------------------------------------------------------------------------
// Setup check (GET /api/discord/interactions) — says in plain words what is
// missing, without ever printing a secret. Also (re)registers /verify-panel.

type Check = { ok: boolean; text: string };

function statusOf(err: unknown): string {
  const match = /→ (\d{3})/.exec(err instanceof Error ? err.message : "");
  return match ? match[1] : "?";
}

export async function diagnoseBot(cfg: BotConfig, api: DiscordApi): Promise<Check[]> {
  const checks: Check[] = [];
  try {
    const me = await api<{ username: string }>("GET", "/users/@me");
    checks.push({ ok: true, text: `Bot-Token gültig (Bot: ${me.username})` });
  } catch (err) {
    checks.push({
      ok: false,
      text: `Bot-Token ungültig (${statusOf(err)}) — DISCORD_BOT_TOKEN in Vercel neu eintragen und neu deployen`,
    });
    return checks;
  }

  let guildRoles: { id: string; name: string; position: number }[] = [];
  try {
    const guild = await api<{ name: string }>("GET", `/guilds/${cfg.guildId}`);
    checks.push({ ok: true, text: `Bot ist auf dem Server „${guild.name}“` });
    guildRoles = await api("GET", `/guilds/${cfg.guildId}/roles`);
  } catch (err) {
    checks.push({
      ok: false,
      text: `Bot ist nicht auf dem Server (${statusOf(err)}) — Bot über den Einladungslink hinzufügen`,
    });
    return checks;
  }

  try {
    await registerCommands(cfg, api);
    checks.push({ ok: true, text: "Befehl /verify-panel ist angemeldet" });
  } catch (err) {
    checks.push({
      ok: false,
      text: `Befehl /verify-panel konnte nicht angemeldet werden (${statusOf(err)}) — Bot mit „applications.commands“ neu einladen`,
    });
  }

  for (const [label, id] of [
    ["Verifizierungs-Kanal", cfg.verifyChannelId],
    ["Verifizierungs-Kategorie", cfg.categoryId],
  ] as const) {
    try {
      await api("GET", `/channels/${id}`);
      checks.push({ ok: true, text: `${label} gefunden` });
    } catch (err) {
      checks.push({
        ok: false,
        text: `${label} ${id} nicht erreichbar (${statusOf(err)}) — ID prüfen oder dem Bot dort „Kanal ansehen“ erlauben`,
      });
    }
  }

  const verified = guildRoles.find((r) => r.id === cfg.verifiedRoleId);
  if (!verified) {
    checks.push({
      ok: false,
      text: `Verifiziert-Rolle ${cfg.verifiedRoleId} gibt es auf dem Server nicht`,
    });
  } else {
    try {
      const self = await api<{ roles: string[] }>(
        "GET",
        `/guilds/${cfg.guildId}/members/${cfg.applicationId}`,
      );
      const top = Math.max(
        0,
        ...guildRoles.filter((r) => self.roles.includes(r.id)).map((r) => r.position),
      );
      checks.push(
        top > verified.position
          ? { ok: true, text: `Bot-Rolle steht über „${verified.name}“ und kann sie vergeben` }
          : {
              ok: false,
              text: `Bot-Rolle steht unter „${verified.name}“ — in den Servereinstellungen → Rollen die Bot-Rolle darüber ziehen`,
            },
      );
    } catch (err) {
      checks.push({ ok: false, text: `Rollen des Bots nicht lesbar (${statusOf(err)})` });
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Deferred replies. Discord drops an interaction that is not answered within
// 3 seconds — too tight for a cold serverless start plus several REST calls.
// So the endpoint acknowledges at once ("thinking…") and delivers the real
// reply afterwards through the interaction webhook.

/** The immediate acknowledgement for an interaction (never for PING). */
export function deferredReplyFor(interaction: Interaction): InteractionReply {
  const action = (interaction.data?.custom_id ?? "").split(":")[1];
  if (interaction.type === InteractionType.Component && action !== "open") {
    // Buttons that edit or remove their own message: acknowledge silently.
    return { type: 6 };
  }
  // Slash command / "Verifizieren": a private "thinking…" reply.
  return { type: 5, data: { flags: EPHEMERAL } };
}

export type WebhookSend = (method: string, url: string, body: unknown) => Promise<void>;

export const sendWebhook: WebhookSend = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Discord webhook ${method} → ${res.status} ${await res.text()}`);
};

/** Turn the final reply into the follow-up that matches the deferred ack. */
export async function deliverReply(
  interaction: Interaction,
  deferred: InteractionReply,
  reply: InteractionReply,
  send: WebhookSend = sendWebhook,
): Promise<void> {
  if (!interaction.application_id || !interaction.token) return;
  const base = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  const { flags: _flags, ...data } = reply.data ?? {};
  if (reply.type === Reply.Ack) return;
  if (reply.type === Reply.Update || deferred.type === 5) {
    // Replaces the "thinking…" reply, or edits the message the button sits on.
    await send("PATCH", `${base}/messages/@original`, data);
    return;
  }
  // A private note after a silent acknowledgement (e.g. "no permission").
  await send("POST", base, { ...data, flags: EPHEMERAL });
}

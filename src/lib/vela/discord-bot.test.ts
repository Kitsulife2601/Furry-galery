import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  deferredReplyFor,
  deliverReply,
  diagnoseBot,
  handleInteraction,
  verifyDiscordSignature,
  type BotConfig,
  type Interaction,
} from "./discord-bot.ts";

const cfg: BotConfig = {
  applicationId: "app1",
  botToken: "token",
  guildId: "g1",
  verifyChannelId: "panel-ch",
  categoryId: "cat1",
  verifiedRoleId: "role-18",
  modRoleId: "mods",
};
const siteUrl = "https://furry.example";

type Call = { method: string; path: string; body?: unknown };

function fakeApi(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const api = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return (responses[`${method} ${path}`] ?? null) as never;
  };
  return { api, calls };
}

function member(id: string, opts: { roles?: string[]; permissions?: string } = {}) {
  return {
    user: { id, username: `user${id}`, global_name: null },
    roles: opts.roles ?? [],
    permissions: opts.permissions ?? "0",
  };
}

const click = (customId: string, m = member("u1"), channelId = "ch-x"): Interaction => ({
  type: 3,
  guild_id: "g1",
  channel_id: channelId,
  data: { custom_id: customId },
  member: m,
});

describe("verifyDiscordSignature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubHex = (publicKey.export({ format: "der", type: "spki" }) as Buffer)
    .subarray(-32)
    .toString("hex");
  const body = '{"type":1}';
  const ts = "1700000000";
  const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");

  it("accepts a valid signature", () => {
    assert.equal(verifyDiscordSignature(pubHex, sig, ts, body), true);
  });
  it("rejects a tampered body, missing headers and garbage", () => {
    assert.equal(verifyDiscordSignature(pubHex, sig, ts, '{"type":2}'), false);
    assert.equal(verifyDiscordSignature(pubHex, null, ts, body), false);
    assert.equal(verifyDiscordSignature(pubHex, "zz", ts, body), false);
  });
});

describe("handleInteraction", () => {
  it("answers PING with PONG right away, without any Discord call", async () => {
    const { api, calls } = fakeApi();
    const reply = await handleInteraction({ type: 1 }, { cfg, api, siteUrl });
    assert.equal(reply.type, 1);
    assert.equal(calls.length, 0);
  });

  it("posts the panel only for moderators", async () => {
    const cmd = (m: ReturnType<typeof member>): Interaction => ({
      type: 2,
      guild_id: "g1",
      data: { name: "verify-panel" },
      member: m,
    });
    const denied = fakeApi();
    await handleInteraction(cmd(member("u1")), { cfg, api: denied.api, siteUrl });
    assert.equal(denied.calls.length, 0);

    const ok = fakeApi();
    const reply = await handleInteraction(cmd(member("m1", { roles: ["mods"] })), {
      cfg,
      api: ok.api,
      siteUrl,
    });
    assert.equal(ok.calls[0].path, "/channels/panel-ch/messages");
    const body = ok.calls[0].body as { components: { components: { custom_id?: string }[] }[] };
    assert.equal(body.components[0].components[0].custom_id, "verify:open");
    assert.equal(reply.data?.flags, 64);
  });

  it("opens a private channel in the category", async () => {
    const { api, calls } = fakeApi({
      "GET /guilds/g1/channels": [],
      "POST /guilds/g1/channels": { id: "new-ch" },
    });
    const reply = await handleInteraction(click("verify:open"), { cfg, api, siteUrl });
    const created = calls.find((c) => c.path === "/guilds/g1/channels" && c.method === "POST");
    const body = created?.body as {
      parent_id: string;
      topic: string;
      permission_overwrites: { id: string; deny?: string; allow?: string }[];
    };
    assert.equal(body.parent_id, "cat1");
    assert.equal(body.topic, "verify:u1");
    const everyone = body.permission_overwrites.find((o) => o.id === "g1");
    assert.equal(everyone?.deny, String(1n << 10n));
    assert.ok(body.permission_overwrites.some((o) => o.id === "u1" && o.allow));
    assert.ok(body.permission_overwrites.some((o) => o.id === "mods" && o.allow));
    assert.ok(calls.some((c) => c.path === "/channels/new-ch/messages"));
    assert.match(String(reply.data?.content), /<#new-ch>/);
  });

  it("does not open a second channel", async () => {
    const { api, calls } = fakeApi({
      "GET /guilds/g1/channels": [{ id: "old", parent_id: "cat1", topic: "verify:u1" }],
    });
    const reply = await handleInteraction(click("verify:open"), { cfg, api, siteUrl });
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
    assert.match(String(reply.data?.content), /<#old>/);
  });

  it("tells already verified members where to go", async () => {
    const { api, calls } = fakeApi();
    const reply = await handleInteraction(
      click("verify:open", member("u1", { roles: ["role-18"] })),
      { cfg, api, siteUrl },
    );
    assert.equal(calls.length, 0);
    assert.match(String(reply.data?.content), /schon verifiziert/);
  });

  it("lets only moderators approve, then assigns the role", async () => {
    const self = fakeApi();
    await handleInteraction(click("verify:approve:u1", member("u1")), {
      cfg,
      api: self.api,
      siteUrl,
    });
    assert.equal(self.calls.length, 0, "members cannot approve themselves");

    const mod = fakeApi();
    const reply = await handleInteraction(
      click("verify:approve:u1", member("m1", { permissions: String(1n << 28n) })),
      { cfg, api: mod.api, siteUrl },
    );
    assert.equal(mod.calls[0].method, "PUT");
    assert.equal(mod.calls[0].path, "/guilds/g1/members/u1/roles/role-18");
    assert.equal(reply.type, 7);
  });

  it("closes only verification channels, for their owner or the team", async () => {
    const ticket = { id: "t1", parent_id: "cat1", topic: "verify:u1" };
    const stranger = fakeApi({ "GET /channels/t1": ticket });
    await handleInteraction(click("verify:close", member("u2"), "t1"), {
      cfg,
      api: stranger.api,
      siteUrl,
    });
    assert.ok(!stranger.calls.some((c) => c.method === "DELETE"));

    const owner = fakeApi({ "GET /channels/t1": ticket });
    await handleInteraction(click("verify:close", member("u1"), "t1"), {
      cfg,
      api: owner.api,
      siteUrl,
    });
    assert.ok(owner.calls.some((c) => c.method === "DELETE" && c.path === "/channels/t1"));

    const other = fakeApi({ "GET /channels/c9": { id: "c9", parent_id: "general" } });
    await handleInteraction(click("verify:close", member("m1", { roles: ["mods"] }), "c9"), {
      cfg,
      api: other.api,
      siteUrl,
    });
    assert.ok(!other.calls.some((c) => c.method === "DELETE"), "never deletes other channels");
  });

  it("ignores interactions from other servers", async () => {
    const { api, calls } = fakeApi();
    await handleInteraction(
      { ...click("verify:open"), guild_id: "elsewhere" },
      { cfg, api, siteUrl },
    );
    assert.equal(calls.length, 0);
  });
});

describe("diagnoseBot", () => {
  const healthy = {
    "GET /users/@me": { username: "FurryBot" },
    "GET /guilds/g1": { name: "Furry Server" },
    "GET /guilds/g1/roles": [
      { id: "role-18", name: "18+", position: 2 },
      { id: "bot-role", name: "Bot", position: 5 },
    ],
    "GET /guilds/g1/members/app1": { roles: ["bot-role"] },
  };

  it("reports all green for a working setup", async () => {
    const { api } = fakeApi(healthy);
    const checks = await diagnoseBot(cfg, api);
    assert.ok(
      checks.every((c) => c.ok),
      JSON.stringify(checks),
    );
    assert.ok(checks.some((c) => /verify-panel/.test(c.text)));
  });

  it("stops early on an invalid token", async () => {
    const api = async () => {
      throw new Error("Discord GET /users/@me → 401 Unauthorized");
    };
    const checks = await diagnoseBot(cfg, api as never);
    assert.equal(checks.length, 1);
    assert.match(checks[0].text, /401/);
  });

  it("flags a bot role below the verified role", async () => {
    const { api } = fakeApi({
      ...healthy,
      "GET /guilds/g1/roles": [
        { id: "role-18", name: "18+", position: 6 },
        { id: "bot-role", name: "Bot", position: 5 },
      ],
    });
    const checks = await diagnoseBot(cfg, api);
    assert.ok(checks.some((c) => !c.ok && /darüber ziehen/.test(c.text)));
  });
});

describe("deferred replies", () => {
  const base = { application_id: "app1", token: "tok" };
  const cmd: Interaction = { type: 2, ...base, data: { name: "verify-panel" } };
  const open: Interaction = { type: 3, ...base, data: { custom_id: "verify:open" } };
  const approve: Interaction = { type: 3, ...base, data: { custom_id: "verify:approve:u1" } };

  it("acknowledges commands and 'Verifizieren' with a private thinking reply", () => {
    assert.deepEqual(deferredReplyFor(cmd), { type: 5, data: { flags: 64 } });
    assert.deepEqual(deferredReplyFor(open), { type: 5, data: { flags: 64 } });
    assert.deepEqual(deferredReplyFor(approve), { type: 6 });
  });

  function recorder() {
    const sent: { method: string; url: string; body: unknown }[] = [];
    const send = async (method: string, url: string, body: unknown) => {
      sent.push({ method, url, body });
    };
    return { sent, send };
  }

  it("replaces the thinking reply with the result", async () => {
    const { sent, send } = recorder();
    await deliverReply(
      cmd,
      deferredReplyFor(cmd),
      { type: 4, data: { content: "ok", flags: 64 } },
      send,
    );
    assert.equal(sent[0].method, "PATCH");
    assert.equal(sent[0].url, "https://discord.com/api/v10/webhooks/app1/tok/messages/@original");
    assert.deepEqual(sent[0].body, { content: "ok" });
  });

  it("edits the button message after approve, and posts private notes as follow-ups", async () => {
    const update = recorder();
    await deliverReply(approve, { type: 6 }, { type: 7, data: { components: [] } }, update.send);
    assert.equal(update.sent[0].method, "PATCH");

    const note = recorder();
    await deliverReply(
      approve,
      { type: 6 },
      { type: 4, data: { content: "nope", flags: 64 } },
      note.send,
    );
    assert.equal(note.sent[0].method, "POST");
    assert.deepEqual(note.sent[0].body, { content: "nope", flags: 64 });
  });

  it("sends nothing for a plain acknowledgement", async () => {
    const { sent, send } = recorder();
    await deliverReply(approve, { type: 6 }, { type: 6 }, send);
    assert.equal(sent.length, 0);
  });
});

describe("/web-freischalten and /web-sperren", () => {
  const run = (name: string, m: ReturnType<typeof member>, value = "@KitsuLife") => ({
    type: 2,
    guild_id: "g1",
    data: { name, options: [{ name: "profil", value }] },
    member: m,
  });

  it("lets moderators unlock and lock a website profile", async () => {
    const calls: [string, boolean, string][] = [];
    const web = async (handle: string, unlock: boolean, mod: string) => {
      calls.push([handle, unlock, mod]);
      return { displayName: "Denni" };
    };
    const { api } = fakeApi();
    const mod = member("m1", { roles: ["mods"] });
    const on = await handleInteraction(run("web-freischalten", mod), { cfg, api, siteUrl, web });
    const off = await handleInteraction(run("web-sperren", mod), { cfg, api, siteUrl, web });
    assert.deepEqual(calls, [
      ["kitsulife", true, "userm1"],
      ["kitsulife", false, "userm1"],
    ]);
    assert.match(String(on.data?.content), /freigeschaltet/);
    assert.match(String(off.data?.content), /gesperrt/);
  });

  it("refuses non-moderators and reports unknown profiles", async () => {
    let called = false;
    const web = async () => {
      called = true;
      return null;
    };
    const { api } = fakeApi();
    const denied = await handleInteraction(run("web-freischalten", member("u1")), {
      cfg,
      api,
      siteUrl,
      web,
    });
    assert.equal(called, false);
    assert.match(String(denied.data?.content), /Rechte/);
    const missing = await handleInteraction(
      run("web-freischalten", member("m1", { roles: ["mods"] }), "niemand"),
      { cfg, api, siteUrl, web },
    );
    assert.match(String(missing.data?.content), /kein Profil @niemand/);
  });
});

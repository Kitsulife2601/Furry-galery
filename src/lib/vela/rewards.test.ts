import assert from "node:assert/strict";
import test from "node:test";
import { isUnlocked, nextTier, REWARD_TIERS, unlockDay } from "./rewards.ts";
import { AVATAR_DECORATIONS, PROFILE_EFFECTS } from "./decorations.ts";

test("rewards point at real frames/effects, each only once (the rest is shop-only)", () => {
  const known = new Set([
    ...AVATAR_DECORATIONS.map((d) => `decoration:${d.id}`),
    ...PROFILE_EFFECTS.map((e) => `effect:${e.id}`),
  ]);
  const keys = REWARD_TIERS.flatMap((t) => t.items.map((i) => `${i.kind}:${i.id}`));
  for (const key of keys) if (!key.startsWith("name:")) assert.ok(known.has(key), key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(unlockDay("decoration", "pfoten"), 1);
});

test("unlocking by active days; the team has everything", () => {
  assert.equal(isUnlocked("decoration", "pfoten", 1), true);
  assert.equal(isUnlocked("decoration", "flammen", 29), false);
  assert.equal(isUnlocked("decoration", "flammen", 30), true);
  assert.equal(isUnlocked("name", "gold", 0, true), true);
  assert.equal(nextTier(7)?.day, 10);
  assert.equal(nextTier(999), null);
});

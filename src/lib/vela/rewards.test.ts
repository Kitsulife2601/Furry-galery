import assert from "node:assert/strict";
import test from "node:test";
import { isUnlocked, nextTier, REWARD_TIERS, unlockDay } from "./rewards.ts";
import { AVATAR_DECORATIONS, PROFILE_EFFECTS } from "./decorations.ts";

test("every frame and effect is a reward exactly once", () => {
  for (const d of AVATAR_DECORATIONS)
    assert.ok(Number.isFinite(unlockDay("decoration", d.id)), d.id);
  for (const e of PROFILE_EFFECTS) assert.ok(Number.isFinite(unlockDay("effect", e.id)), e.id);
  const keys = REWARD_TIERS.flatMap((t) => t.items.map((i) => `${i.kind}:${i.id}`));
  assert.equal(new Set(keys).size, keys.length);
});

test("unlocking by active days; the team has everything", () => {
  assert.equal(isUnlocked("decoration", "pfoten", 1), true);
  assert.equal(isUnlocked("decoration", "flammen", 29), false);
  assert.equal(isUnlocked("decoration", "flammen", 30), true);
  assert.equal(isUnlocked("name", "gold", 0, true), true);
  assert.equal(nextTier(7)?.day, 10);
  assert.equal(nextTier(999), null);
});

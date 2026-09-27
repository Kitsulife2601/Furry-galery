import assert from "node:assert/strict";
import test from "node:test";
import { addDuration } from "./durations.ts";

test("addDuration adds days and months, perm/now give null", () => {
  const from = new Date("2026-01-31T12:00:00Z");
  assert.equal(addDuration("7d", from)?.toISOString(), "2026-02-07T12:00:00.000Z");
  assert.equal(addDuration("3m", from)?.getUTCMonth(), 4); // Jan 31 + 3 months rolls into May
  assert.equal(addDuration("perm", from), null);
  assert.equal(addDuration("now", from), null);
});

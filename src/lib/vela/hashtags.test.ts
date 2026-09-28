import assert from "node:assert/strict";
import test from "node:test";
import { extractHashtags, normalizeHashtag, splitCaption } from "./hashtags.ts";

test("extractHashtags finds unique lower-cased tags incl. umlauts", () => {
  assert.deepEqual(extractHashtags("Neues Bild #Fuchs #fuchs #Rüde_art und #a"), [
    "fuchs",
    "rüde_art",
  ]);
  assert.deepEqual(extractHashtags("ohne tags"), []);
});

test("splitCaption keeps the text and marks hashtags", () => {
  assert.deepEqual(splitCaption("Hallo #Fox!"), [
    { text: "Hallo " },
    { text: "#Fox", hashtag: "fox" },
    { text: "!" },
  ]);
});

test("normalizeHashtag", () => {
  assert.equal(normalizeHashtag("#Wolf"), "wolf");
  assert.equal(normalizeHashtag("a"), null);
  assert.equal(normalizeHashtag("<script>"), null);
});

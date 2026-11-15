/** The judge is held to its own notes. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdToNotes } from "../lib/agents/judge";
import type { Checklist } from "../lib/search/score";

const base: Checklist = {
  differences: [],
  anchors: [],
  color: "match",
  silhouette: "match",
  neckline: "match",
  sleeves: "match",
  length: "match",
  surface: "match",
  extras: "none",
  polish: "as_polished",
  fabric_tier: "unknown",
  size_available: "unknown",
  stock_photo_suspected: false,
  biggest_difference: "",
  confidence: "high",
};

test("a part named in the differences can't stay a match", () => {
  const c = holdToNotes({ ...base, differences: ["outline flares more from the knee", "length a little shorter", "surface has a visible weave"] });
  assert.equal(c.silhouette, "close");
  assert.equal(c.length, "close");
  assert.equal(c.surface, "close");
  assert.equal(c.neckline, "match");
});

test("a part already marked different stays different", () => {
  assert.equal(holdToNotes({ ...base, silhouette: "different", differences: ["outline is A-line"] }).silhouette, "different");
});

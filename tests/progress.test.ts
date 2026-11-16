import { test } from "node:test";
import assert from "node:assert/strict";
import { progressOf, clock } from "../lib/search/progress";

test("each stage fills its stretch of the bar from the counts", () => {
  assert.equal(progressOf("queued").percent, 0);
  assert.equal(progressOf("gathering", { sources: 10, sources_done: 5, found: 640 }).percent, 16.5);
  assert.equal(progressOf("gathering", { sources: 10, sources_done: 5, found: 640 }).line, "Searching 10 places · 640 pieces found");
  assert.equal(progressOf("screening", { to_screen: 200, screened: 120 }).line, "Looking over 200 pieces · 120 done");
  assert.equal(progressOf("judging", { to_judge: 53, judged: 20 }).line, "Checking each match · 20 of 53");
  assert.equal(progressOf("judging", { to_judge: 50, judged: 50 }).percent, 99);
});

test("before the counts arrive, plain words and no jump", () => {
  assert.deepEqual(progressOf("screening", {}), { percent: 30, line: "Looking over what we found" });
  assert.equal(progressOf("gathering", { sources: 0 }).line, "Searching stores");
});

test("clock", () => {
  assert.equal(clock(45), "0:45");
  assert.equal(clock(72.9), "1:12");
});

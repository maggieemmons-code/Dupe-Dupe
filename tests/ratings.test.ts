import { test } from "node:test";
import assert from "node:assert/strict";
import { nudgeWeights, judgeAnswer, judgeAnswers, disagrees, joinReasons, splitReasons } from "../lib/ratings";
import type { Checklist } from "../lib/search/score";

test("a miss makes that item count more; close enough makes it count a little less", () => {
  assert.deepEqual(nudgeWeights({ color: 1.5 }, { vote: "down", reason: "Wrong color", scope: "taste" }), { color: 1.75 });
  assert.deepEqual(nudgeWeights({}, { vote: "up", reason: "The shape", scope: "taste" }), { silhouette: 1.9 });
});

test("taking a rating back undoes its nudge", () => {
  const after = nudgeWeights({ color: 1.5 }, { vote: "down", reason: "Wrong color", scope: "taste" });
  assert.deepEqual(nudgeWeights(after, { vote: "down", reason: "Wrong color", scope: "taste" }, -1), { color: 1.5 });
});

test("weights stay between 0.5 and 3; Just this piece and reasons without an item change nothing", () => {
  assert.deepEqual(nudgeWeights({ color: 3 }, { vote: "down", reason: "Wrong color", scope: "taste" }), { color: 3 });
  assert.deepEqual(nudgeWeights({ color: 1 }, { vote: "down", reason: "Wrong color", scope: "item" }), { color: 1 });
  assert.deepEqual(nudgeWeights({ color: 1 }, { vote: "down", reason: "Just not me", scope: "taste" }), { color: 1 });
});

test("what the judge said, and whether the person disagrees", () => {
  const c = { color: "match", polish: "as_polished" } as unknown as Checklist;
  assert.equal(judgeAnswer(c, "down", "Wrong color"), JSON.stringify({ "Wrong color": "color: match" }));
  assert.equal(disagrees("down", "color: match"), true);
  assert.equal(disagrees("down", "color: different"), false);
  assert.equal(disagrees("up", "color: different"), true);
  assert.equal(judgeAnswer(c, "down", "Too pricey"), null);
});

test("several reasons: each nudges its own item once, and the judge's answer is kept for each", () => {
  const both = joinReasons(["Wrong color", "Fabric looks cheap", "Wrong color"]);
  assert.equal(both, "Wrong color; Fabric looks cheap");
  assert.deepEqual(splitReasons(both), ["Wrong color", "Fabric looks cheap"]);
  assert.deepEqual(nudgeWeights({}, { vote: "down", reason: both, scope: "taste" }), { color: 2.25, polish: 2.25 });
  const c = { color: "match", polish: "looks_cheap" } as unknown as Checklist;
  const saved = judgeAnswer(c, "down", `${both}; Too pricey`);
  assert.deepEqual(judgeAnswers(saved, both), [["Wrong color", "color: match"], ["Fabric looks cheap", "polish: looks_cheap"]]);
  assert.deepEqual(judgeAnswers("color: match", "Wrong color"), [["Wrong color", "color: match"]]);
});


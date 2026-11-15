/** Scoring and verdict rules (PLAN.md › Scoring and verdicts). Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { score, type Checklist, type AnchorDef } from "../lib/search/score";

const anchors: AnchorDef[] = [
  { id: "a1", label: "Off-shoulder neckline", dealbreaker: true },
  { id: "a2", label: "Red floral jacquard" },
];

const perfect: Checklist = {
  anchors: [
    { id: "a1", result: "pass" },
    { id: "a2", result: "pass" },
  ],
  color: "match",
  silhouette: "match",
  neckline: "match",
  sleeves: "match",
  length: "match",
  sheen: "match",
  polish: "as_polished",
  fabric_tier: "target",
  fabric_evidence: "100% polyester jacquard",
  size_available: "yes",
  stock_photo_suspected: false,
  biggest_difference: "",
  confidence: "high",
};

test("a perfect checklist is approved at 100/100", () => {
  assert.deepEqual(score(perfect, anchors), { look: 100, fit: 100, verdict: "approved", caveat: null });
});

test("the same checklist always gives the same score", () => {
  assert.deepEqual(score(perfect, anchors), score(structuredClone(perfect), anchors));
});

test("failing a Must match detail is rejected, whatever else matches", () => {
  const c = { ...perfect, anchors: [{ id: "a1", result: "fail" as const }, { id: "a2", result: "pass" as const }] };
  assert.equal(score(c, anchors).verdict, "rejected");
});

test("failing an ordinary detail isn't rejected on its own", () => {
  const c = { ...perfect, anchors: [{ id: "a1", result: "pass" as const }, { id: "a2", result: "fail" as const }] };
  assert.notEqual(score(c, anchors).verdict, "rejected");
});

test("a dealbreaker fabric is rejected", () => {
  assert.equal(score({ ...perfect, fabric_tier: "dealbreaker" }, anchors).verdict, "rejected");
});

test("unknown fabric is a caveat, not a rejection", () => {
  const v = score({ ...perfect, fabric_tier: "unknown" }, anchors);
  assert.equal(v.verdict, "caveat");
  assert.match(v.caveat ?? "", /Fabric not listed/);
});

test("a different color is flagged", () => {
  assert.match(score({ ...perfect, color: "different" }, anchors).caveat ?? "", /Different color/);
});

test("looking cheap lowers the look score and is flagged", () => {
  const v = score({ ...perfect, polish: "looks_cheap" }, anchors);
  assert.ok(v.look < 100);
  assert.match(v.caveat ?? "", /less polished/);
});

test("look under 40 is rejected", () => {
  const c: Checklist = {
    ...perfect,
    anchors: [{ id: "a1", result: "partial" }, { id: "a2", result: "fail" }],
    color: "different",
    silhouette: "different",
    neckline: "close",
    sleeves: "different",
    length: "different",
    sheen: "different",
    polish: "looks_cheap",
  };
  assert.equal(score(c, anchors).verdict, "rejected");
});

test("not applicable and cannot see are left out of the total", () => {
  const c = { ...perfect, sleeves: "not_applicable" as const, anchors: [{ id: "a1", result: "pass" as const }, { id: "a2", result: "cannot_see" as const }] };
  assert.equal(score(c, anchors).look, 100);
});

test("details the judge adds on its own don't count", () => {
  const c = { ...perfect, anchors: [...perfect.anchors, { id: "made-up", result: "fail" as const }] };
  assert.deepEqual(score(c, anchors), score(perfect, anchors));
});

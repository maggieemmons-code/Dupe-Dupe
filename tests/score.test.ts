/** Scoring and verdict rules (PLAN.md › Scoring and verdicts). Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { score, WEIGHTS, type Checklist, type AnchorDef } from "../lib/search/score";

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
  surface: "match",
  extras: "none",
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

test("failing a Must match shape is rejected, whatever else matches", () => {
  const c = { ...perfect, anchors: [{ id: "a1", result: "fail" as const, kind: "shape" as const }, { id: "a2", result: "pass" as const }] };
  assert.equal(score(c, anchors).verdict, "rejected");
});

test("failing an ordinary detail isn't rejected on its own", () => {
  const c = { ...perfect, anchors: [{ id: "a1", result: "pass" as const }, { id: "a2", result: "fail" as const }] };
  assert.notEqual(score(c, anchors).verdict, "rejected");
});

test("a dealbreaker fabric is a caveat unless Fabric must match is on", () => {
  const v = score({ ...perfect, fabric_tier: "dealbreaker" }, anchors);
  assert.equal(v.verdict, "caveat");
  assert.match(v.caveat ?? "", /Different fabric/);
  assert.equal(score({ ...perfect, fabric_tier: "dealbreaker" }, anchors, undefined, { fabricMustMatch: true }).verdict, "rejected");
});

test("taste weights change the scores", () => {
  const c = { ...perfect, silhouette: "different" as const };
  const heavy = { ...WEIGHTS, silhouette: 3 };
  assert.ok(score(c, anchors, heavy).look < score(c, anchors).look);
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
    surface: "different",
    extras: "changes_look",
    polish: "looks_cheap",
  };
  assert.equal(score(c, anchors).verdict, "rejected");
});

test("not applicable is left out; a hidden detail counts half", () => {
  const na = { ...perfect, sleeves: "not_applicable" as const };
  assert.equal(score(na, anchors).look, 100);
  const hidden = { ...perfect, anchors: [{ id: "a1", result: "pass" as const }, { id: "a2", result: "cannot_see" as const }] };
  assert.ok(score(hidden, anchors).look < 100);
});

test("gates: the original's brand, its photos, resale, and a price at or above the original", () => {
  assert.equal(score({ ...perfect, same_brand_as_original: true }, anchors).verdict, "rejected");
  assert.equal(score({ ...perfect, stock_photo_suspected: true }, anchors).verdict, "rejected");
  assert.equal(score({ ...perfect, used_or_resale: true }, anchors).verdict, "rejected");
  assert.equal(score(perfect, anchors, undefined, { price: 500, retailPrice: 500 }).verdict, "rejected");
  assert.equal(score(perfect, anchors, undefined, { price: 200, retailPrice: 500 }).verdict, "approved");
});

test("a missed must-match material is a caveat unless Fabric must match is on", () => {
  const c = { ...perfect, anchors: [{ id: "a1", result: "fail" as const, kind: "material" as const }, { id: "a2", result: "pass" as const }] };
  assert.equal(score(c, anchors).verdict, "caveat");
  assert.equal(score(c, anchors, undefined, { fabricMustMatch: true }).verdict, "rejected");
  const shape = { ...perfect, anchors: [{ id: "a1", result: "fail" as const, kind: "shape" as const }, { id: "a2", result: "pass" as const }] };
  assert.equal(score(shape, anchors).verdict, "rejected");
});

test("no price can't be approved", () => {
  const v = score(perfect, anchors, undefined, { price: null });
  assert.equal(v.verdict, "caveat");
  assert.match(v.caveat ?? "", /Price at store/);
});

test("extras that change the look lower it once and are noted", () => {
  const v = score({ ...perfect, extras: "changes_look" }, anchors);
  assert.ok(v.look < 100);
  assert.match(v.caveat ?? "", /Added details/);
});

test("details the judge adds on its own don't count", () => {
  const c = { ...perfect, anchors: [...perfect.anchors, { id: "made-up", result: "fail" as const }] };
  assert.deepEqual(score(c, anchors), score(perfect, anchors));
});

test("a detail's kind comes from the search, not the judge", () => {
  const defs = [{ id: "a1", label: "Deep burgundy velvet", dealbreaker: true, kind: "material" as const }, anchors[1]];
  const c = { ...perfect, anchors: [{ id: "a1", result: "fail" as const, kind: "shape" as const }, { id: "a2", result: "pass" as const }] };
  assert.equal(score(c, defs).verdict, "caveat");
});

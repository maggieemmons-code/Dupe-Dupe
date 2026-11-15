/*
 * Scores and verdicts (PLAN.md › Appendix › Scoring and verdicts). Code, not AI:
 * the judge only fills the checklist; the same checklist always gives the same
 * scores, and changing a weight re-scores saved candidates with no new search.
 * Plain module: Results and Item detail use it too, for the See why breakdown.
 *
 * Calibrated Nov 15 from a review of Maggie's test set (NOTES.md › Calibration):
 * extras are counted once, "surface" replaces "sheen", a hidden detail scores
 * half, and hard gates reject what isn't a dupe at all.
 */

export type Match = "match" | "close" | "different" | "not_applicable";
export type AnchorResult = "pass" | "partial" | "fail" | "cannot_see";
/** shape: visible outline or neckline; material: the fabric itself; hidden: construction the photo can't show. */
export type AnchorKind = "shape" | "material" | "hidden";
export type FabricTier = "target" | "acceptable_swap" | "dealbreaker" | "unknown";
export type Polish = "as_polished" | "slightly_less" | "looks_cheap" | "cannot_tell";
export type Extras = "none" | "minor" | "changes_look";

export type Checklist = {
  differences?: string[];
  anchors: { id: string; result: AnchorResult; kind?: AnchorKind }[];
  color: Match;
  silhouette: Match;
  neckline: Match;
  sleeves: Match;
  length: Match;
  /** How the fabric reads at a glance: shine, texture, how it falls. Older checklists call it sheen. */
  surface?: Match;
  sheen?: Match;
  extras?: Extras;
  polish: Polish;
  fabric_tier: FabricTier;
  fabric_evidence?: string;
  size_available: "yes" | "no" | "unknown";
  stock_photo_suspected: boolean;
  same_brand_as_original?: boolean;
  used_or_resale?: boolean;
  biggest_difference: string;
  confidence: "high" | "medium" | "low";
};

/** kind is decided once per search (lib/search/anchorKind.ts); the judge's own label is only a fallback. */
export type AnchorDef = { id: string; label: string; dealbreaker?: boolean; kind?: AnchorKind };

/** Starting weights; a friend's taste profile adjusts them, each kept between 0.5 and 3. */
export const WEIGHTS = {
  anchor: 3,
  color: 2,
  silhouette: 2,
  neckline: 1.5,
  length: 1,
  sleeves: 1,
  surface: 1,
  extras: 1,
  polish: 2, // Maggie, Nov 15: does it look as high end as the original
  fabric: 3,
  size: 1.5,
};
export type Weights = typeof WEIGHTS;

const MATCH_POINTS: Record<Match, number | null> = { match: 1, close: 0.5, different: 0, not_applicable: null };
// A detail the photo can't show counts half (it used to drop out of the total).
const ANCHOR_POINTS: Record<AnchorResult, number> = { pass: 1, partial: 0.5, fail: 0, cannot_see: 0.5 };
const FABRIC_POINTS: Record<FabricTier, number> = { target: 1, acceptable_swap: 0.6, unknown: 0.5, dealbreaker: 0 };
const SIZE_POINTS = { yes: 1, unknown: 0.5, no: 0 } as const;
const POLISH_POINTS: Record<Polish, number> = { as_polished: 1, slightly_less: 0.5, looks_cheap: 0, cannot_tell: 0.5 };
const EXTRAS_POINTS: Record<Extras, number> = { none: 1, minor: 0.5, changes_look: 0 };

type Part = { label: string; points: number | null; weight: number };

function total(parts: Part[]) {
  let got = 0;
  let max = 0;
  for (const p of parts) {
    if (p.points == null) continue; // not_applicable is left out
    got += p.points * p.weight;
    max += p.weight;
  }
  return max ? Math.round((got / max) * 100) : null;
}

const surfaceOf = (c: Checklist): Match => c.surface ?? c.sheen ?? "close";

/** The pieces of each score, grouped the way See why shows them. */
export function breakdown(c: Checklist, anchors: AnchorDef[], w: Weights = WEIGHTS) {
  const anchorParts: Part[] = ownAnchors(c, anchors).map((a) => ({
    label: anchors.find((x) => x.id === a.id)?.label ?? a.id,
    points: ANCHOR_POINTS[a.result] ?? 0.5,
    weight: w.anchor,
  }));
  const shape: Part[] = [
    { label: "Silhouette", points: MATCH_POINTS[c.silhouette] ?? null, weight: w.silhouette },
    { label: "Neckline", points: MATCH_POINTS[c.neckline] ?? null, weight: w.neckline },
    { label: "Sleeves", points: MATCH_POINTS[c.sleeves] ?? null, weight: w.sleeves },
    { label: "Length", points: MATCH_POINTS[c.length] ?? null, weight: w.length },
  ];
  const color: Part[] = [{ label: "Color", points: MATCH_POINTS[c.color] ?? null, weight: w.color }];
  const details: Part[] = [
    ...anchorParts,
    { label: "Surface", points: MATCH_POINTS[surfaceOf(c)] ?? null, weight: w.surface },
    { label: "Extras", points: EXTRAS_POINTS[c.extras ?? "none"] ?? 1, weight: w.extras },
    { label: "Looks as high end", points: POLISH_POINTS[c.polish] ?? 0.5, weight: w.polish },
  ];
  const fabric: Part[] = [
    { label: "Fabric", points: FABRIC_POINTS[c.fabric_tier] ?? 0.5, weight: w.fabric },
    { label: "Surface", points: MATCH_POINTS[surfaceOf(c)] ?? null, weight: w.surface },
  ];
  const size: Part[] = [{ label: "Your size", points: SIZE_POINTS[c.size_available] ?? 0.5, weight: w.size }];

  return {
    look: { score: total([...shape, ...color, ...details]), groups: { Shape: total(shape), Color: total(color), Details: total(details) } },
    fit: { score: total([...fabric, ...size]), groups: { Fabric: total(fabric), "Size and fit": total(size) } },
  };
}

export type Verdict = { look: number; fit: number; verdict: "approved" | "caveat" | "rejected"; caveat: string | null };

export type ScoreOptions = {
  /** The friend switched "Fabric must match" on for this search. */
  fabricMustMatch?: boolean;
  /** The candidate's price (null: not shown) and the original's, for the price gate. */
  price?: number | null;
  retailPrice?: number | null;
};

/** Verdict rules, in order. A rejected verdict carries its reason in `caveat`. */
export function score(c: Checklist, anchors: AnchorDef[], w: Weights = WEIGHTS, opts: ScoreOptions = {}): Verdict {
  const b = breakdown(c, anchors, w);
  const look = b.look.score ?? 0;
  const fit = b.fit.score ?? 0;
  const reject = (reason: string): Verdict => ({ look, fit, verdict: "rejected", caveat: reason });

  // Gates: not a dupe at all.
  if (c.same_brand_as_original) return reject("From the original's own brand");
  if (c.stock_photo_suspected) return reject("Uses the original's photo");
  if (c.used_or_resale) return reject("Used or resale listing");
  if (opts.price != null && opts.retailPrice && opts.price >= opts.retailPrice) return reject("Costs as much as the original");

  // A missed Must match detail rejects when it's a visible shape. A material or hidden
  // detail only rejects when the friend switched Fabric must match on; otherwise it's a caveat.
  const mine = ownAnchors(c, anchors);
  const failedMust = mine.filter((a) => a.result === "fail" && anchors.find((x) => x.id === a.id)?.dealbreaker);
  const kindOf = (a: { id: string; kind?: AnchorKind }) => anchors.find((x) => x.id === a.id)?.kind ?? a.kind ?? "shape";
  if (failedMust.some((a) => kindOf(a) === "shape")) return reject("Misses a must-match detail");
  if (failedMust.length && opts.fabricMustMatch) return reject("Misses a must-match material");
  if (c.fabric_tier === "dealbreaker" && opts.fabricMustMatch) return reject("Different fabric");
  if (look < 40) return reject("Too far from the original");

  const notes: string[] = [];
  for (const a of failedMust) notes.push(`${anchors.find((x) => x.id === a.id)?.label ?? "A detail"} differs`);
  for (const a of mine) {
    if (a.result === "partial") notes.push(`${anchors.find((x) => x.id === a.id)?.label ?? "A detail"} differs`);
  }
  if (c.color === "different") notes.push("Different color");
  else if (c.color === "close") notes.push("Slightly different shade");
  if (c.extras === "changes_look") notes.push("Added details change the look");
  if (c.fabric_tier === "dealbreaker") notes.push(c.fabric_evidence ? `Different fabric: ${shortFabric(c.fabric_evidence)}` : "Different fabric");
  if (c.fabric_tier === "acceptable_swap") notes.push(c.fabric_evidence ? `${shortFabric(c.fabric_evidence)}, not the original fabric` : "Different fabric");
  if (c.fabric_tier === "unknown") notes.push("Fabric not listed");
  if (c.polish === "looks_cheap") notes.push("May look less polished");
  // Without a price it can't be approved: the friend can't tell it's within reach.
  if (opts.price === null) notes.push("Price at store");
  // Size unknown is shown on every card's size line ("Size not checked"), so it isn't repeated here.

  return notes.length ? { look, fit, verdict: "caveat", caveat: notes.slice(0, 3).join(" · ") } : { look, fit, verdict: "approved", caveat: null };
}

/** Only the friend's own signature details count; anything else the judge added is ignored. */
function ownAnchors(c: Checklist, anchors: AnchorDef[]) {
  if (!anchors.length) return [];
  const ids = new Set(anchors.map((a) => a.id));
  return c.anchors.filter((a) => ids.has(a.id));
}

function shortFabric(evidence: string) {
  const t = evidence.replace(/\s+/g, " ").trim();
  return t.length > 40 ? `${t.slice(0, 38)}…` : t;
}

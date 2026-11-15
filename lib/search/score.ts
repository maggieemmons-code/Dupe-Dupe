/*
 * Scores and verdicts (PLAN.md › Appendix › Scoring and verdicts). Code, not AI:
 * the judge only fills the checklist; the same checklist always gives the same
 * scores, and changing a weight re-scores saved candidates with no new search.
 * Plain module: Results and Item detail use it too, for the See why breakdown.
 */

export type Match = "match" | "close" | "different" | "not_applicable";
export type AnchorResult = "pass" | "partial" | "fail" | "cannot_see";
export type FabricTier = "target" | "acceptable_swap" | "dealbreaker" | "unknown";
export type Polish = "as_polished" | "slightly_less" | "looks_cheap";

export type Checklist = {
  anchors: { id: string; result: AnchorResult }[];
  color: Match;
  silhouette: Match;
  neckline: Match;
  sleeves: Match;
  length: Match;
  sheen: Match;
  polish: Polish;
  fabric_tier: FabricTier;
  fabric_evidence?: string;
  size_available: "yes" | "no" | "unknown";
  stock_photo_suspected: boolean;
  biggest_difference: string;
  confidence: "high" | "medium" | "low";
};

export type AnchorDef = { id: string; label: string; dealbreaker?: boolean };

/** Starting weights (PLAN.md); a friend's taste profile adjusts them in phase 7, each kept between 0.5 and 3. */
export const WEIGHTS = {
  anchor: 3,
  color: 2,
  silhouette: 2,
  neckline: 1.5,
  length: 1,
  sleeves: 1,
  sheen: 1,
  polish: 2, // Maggie, Nov 15: does it look as high end as the original
  fabric: 3,
  size: 1.5,
};
export type Weights = typeof WEIGHTS;

const MATCH_POINTS: Record<Match, number | null> = { match: 1, close: 0.5, different: 0, not_applicable: null };
const ANCHOR_POINTS: Record<AnchorResult, number | null> = { pass: 1, partial: 0.5, fail: 0, cannot_see: null };
const FABRIC_POINTS: Record<FabricTier, number> = { target: 1, acceptable_swap: 0.6, unknown: 0.5, dealbreaker: 0 };
const SIZE_POINTS = { yes: 1, unknown: 0.5, no: 0 } as const;
const POLISH_POINTS: Record<Polish, number> = { as_polished: 1, slightly_less: 0.5, looks_cheap: 0 };

type Part = { label: string; points: number | null; weight: number };

function total(parts: Part[]) {
  let got = 0;
  let max = 0;
  for (const p of parts) {
    if (p.points == null) continue; // not_applicable and cannot_see are left out
    got += p.points * p.weight;
    max += p.weight;
  }
  return max ? Math.round((got / max) * 100) : null;
}

/** The pieces of each score, grouped the way See why shows them. */
export function breakdown(c: Checklist, anchors: AnchorDef[], w: Weights = WEIGHTS) {
  const anchorParts: Part[] = ownAnchors(c, anchors).map((a) => ({
    label: anchors.find((x) => x.id === a.id)?.label ?? a.id,
    points: ANCHOR_POINTS[a.result] ?? null,
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
    { label: "Sheen", points: MATCH_POINTS[c.sheen] ?? null, weight: w.sheen },
    { label: "Looks as high end", points: POLISH_POINTS[c.polish] ?? 0.5, weight: w.polish },
  ];
  const fabric: Part[] = [
    { label: "Fabric", points: FABRIC_POINTS[c.fabric_tier] ?? 0.5, weight: w.fabric },
    { label: "Sheen", points: MATCH_POINTS[c.sheen] ?? null, weight: w.sheen },
  ];
  const size: Part[] = [{ label: "Your size", points: SIZE_POINTS[c.size_available] ?? 0.5, weight: w.size }];

  return {
    look: { score: total([...shape, ...color, ...details]), groups: { Shape: total(shape), Color: total(color), Details: total(details) } },
    fit: { score: total([...fabric, ...size]), groups: { Fabric: total(fabric), "Size and fit": total(size) } },
  };
}

export type Verdict = { look: number; fit: number; verdict: "approved" | "caveat" | "rejected"; caveat: string | null };

/** Verdict rules, in order (PLAN.md). */
/**
 * fabricMustMatch: the friend switched "Fabric must match" on for this search. Off (the
 * default), a dealbreaker fabric is a caveat, not a rejection (Maggie, Nov 15: looks
 * first; fabric is make-or-break only when she opts in).
 */
export function score(c: Checklist, anchors: AnchorDef[], w: Weights = WEIGHTS, opts: { fabricMustMatch?: boolean } = {}): Verdict {
  const b = breakdown(c, anchors, w);
  const look = b.look.score ?? 0;
  const fit = b.fit.score ?? 0;

  const mine = ownAnchors(c, anchors);
  const failedDealbreaker = mine.some((a) => a.result === "fail" && anchors.find((x) => x.id === a.id)?.dealbreaker);
  if (failedDealbreaker || (c.fabric_tier === "dealbreaker" && opts.fabricMustMatch) || look < 40) {
    return { look, fit, verdict: "rejected", caveat: null };
  }

  const notes: string[] = [];
  for (const a of mine) {
    if (a.result === "partial") notes.push(`${anchors.find((x) => x.id === a.id)?.label ?? "A detail"} differs`);
  }
  if (c.color === "different") notes.push("Different color");
  else if (c.color === "close") notes.push("Slightly different shade");
  if (c.fabric_tier === "dealbreaker") notes.push(c.fabric_evidence ? `Different fabric: ${shortFabric(c.fabric_evidence)}` : "Different fabric");
  if (c.fabric_tier === "acceptable_swap") notes.push(c.fabric_evidence ? `${shortFabric(c.fabric_evidence)}, not the original fabric` : "Different fabric");
  if (c.fabric_tier === "unknown") notes.push("Fabric not listed");
  if (c.polish === "looks_cheap") notes.push("May look less polished");
  if (c.stock_photo_suspected) notes.push("Confirm it's the actual item");
  // Size unknown is shown on every card's size line ("Size not checked"), so it isn't repeated as a caveat.

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

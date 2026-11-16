/*
 * Ratings (PLAN.md › Learning loop; Maggie, Nov 16: "the tuning options, like swiping left or
 * right or the thumbs up or thumbs down to capture their feedback"). Plain module, shared by
 * the screens and the server: the one-tap reasons, the checklist item each one is about, and
 * how a rating nudges that friend's weights. Code, no AI.
 */

import { WEIGHTS, type Checklist, type Weights } from "@/lib/search/score";

export type Vote = "up" | "down";

type Reason = { label: string; weight?: keyof Weights; field?: keyof Checklist };

/** Thumbs down: what missed. */
export const DOWN_REASONS: Reason[] = [
  { label: "Wrong color", weight: "color", field: "color" },
  { label: "Wrong shape", weight: "silhouette", field: "silhouette" },
  { label: "Wrong neckline", weight: "neckline", field: "neckline" },
  { label: "Wrong length", weight: "length", field: "length" },
  { label: "Fabric looks cheap", weight: "polish", field: "polish" },
  { label: "Too pricey" },
  { label: "Not my size", weight: "size", field: "size_available" },
  { label: "Just not me" },
];

/** Thumbs up, optional: "Close enough on…", the difference that's fine. */
export const UP_REASONS: Reason[] = [
  { label: "The shape", weight: "silhouette", field: "silhouette" },
  { label: "The color", weight: "color", field: "color" },
  { label: "The fabric", weight: "fabric", field: "fabric_tier" },
  { label: "The price" },
];

const reasonOf = (vote: Vote, label: string) => (vote === "down" ? DOWN_REASONS : UP_REASONS).find((r) => r.label === label);

/** A miss makes that item count more for this friend; "close enough on" makes it count a little less. */
const STEP = { down: 0.25, up: -0.1 } as const;

/**
 * The friend's weights after a rating (sign 1), or with an earlier rating taken back (sign -1).
 * Kept between 0.5 and 3, as the plan says. "Just this piece" never changes them.
 */
export function nudgeWeights(
  current: Partial<Weights>,
  rating: { vote: Vote; reason: string; scope: "taste" | "item" },
  sign: 1 | -1 = 1,
): Partial<Weights> {
  const r = reasonOf(rating.vote, rating.reason);
  if (rating.scope === "item" || !r?.weight) return current;
  const base = current[r.weight] ?? WEIGHTS[r.weight];
  const next = Math.round(Math.min(3, Math.max(0.5, base + sign * STEP[rating.vote])) * 100) / 100;
  return { ...current, [r.weight]: next };
}

/** What the judge had said about the item a reason is about ("color: match"), for the agreement count. */
export function judgeAnswer(checklist: Checklist | null, vote: Vote, reason: string): string | null {
  const f = reasonOf(vote, reason)?.field;
  if (!checklist || !f) return null;
  const v = f === "surface" ? (checklist.surface ?? checklist.sheen) : checklist[f];
  return v == null ? null : `${f}: ${typeof v === "string" ? v : JSON.stringify(v)}`;
}

/**
 * Whether the judge and the person disagree about this item: a "wrong color" on a piece the judge
 * called a color match, a "close enough on the color" where the judge called it different.
 */
export function disagrees(vote: Vote, answer: string | null): boolean | null {
  if (!answer) return null;
  const v = answer.split(": ")[1];
  if (vote === "down") return ["match", "as_polished", "yes", "target"].includes(v);
  return ["different", "looks_cheap", "no", "dealbreaker"].includes(v);
}

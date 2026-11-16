/** A result card's data: a row of public.candidates that passed the screener. */
export type CandidateRow = {
  id: string;
  search_id: string;
  kind: "new" | "secondhand";
  source: string;
  title: string;
  brand: string;
  store: string;
  store_domain: string;
  link_is_google: boolean;
  photo_url: string | null;
  thumb_url: string | null;
  price: number | null;
  old_price: number | null;
  price_is_estimate: boolean;
  price_checked_at: string | null;
  rating: number | null;
  reviews: number | null;
  delivery: string;
  size: string;
  color: string;
  color_match: "same" | "close" | "different" | "unclear" | null;
  screen_note: string | null;
  screen_rank: number | null;
  stage: string;
  look_score: number | null;
  fit_score: number | null;
  verdict: "approved" | "caveat" | "rejected" | null;
  caveat: string | null;
  judge_note: string | null;
  confidence: number | null;
  fabric_tier: string | null;
  fabric_evidence: string | null;
  checklist: import("@/lib/search/score").Checklist | null;
  store_details: string[];
  /** in_stock, sold_out, or null when it couldn't be checked. */
  availability: string | null;
};

export const CANDIDATE_FIELDS =
  "id, search_id, kind, source, title, brand, store, store_domain, link_is_google, photo_url, thumb_url, price, old_price, price_is_estimate, price_checked_at, rating, reviews, delivery, size, color, color_match, screen_note, screen_rank, stage, look_score, fit_score, verdict, caveat, judge_note, confidence, fabric_tier, fabric_evidence, checklist, store_details, availability";

export function money(n: number | null) {
  if (n == null) return "";
  return `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;
}

/** "Image · amazon.com" label on a photo tile. */
export function imageSource(c: Pick<CandidateRow, "store_domain" | "store">) {
  return c.store_domain || c.store;
}

/** "2 hrs ago", for "Price checked …". */
export function ago(iso: string | null) {
  if (!iso) return "";
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/**
 * The size line on cards and Item detail (Nov 15 review: every card said "Size not
 * checked" even when the judge had read the sizes). The judge answers yes only when
 * the listing shows one of the friend's sizes in stock, no when it says they're gone.
 */
export function sizeStatus(c: Pick<CandidateRow, "checklist" | "availability">, sizes: string[]) {
  const mine = sizes.filter(Boolean).join(" / ");
  const answer = c.checklist?.size_available;
  if (answer === "yes") return { inStock: true, short: mine ? `Size ${mine} in stock` : "Your size in stock", long: `${mine ? `Size ${mine}` : "Your size"} is in stock, going by the listing.` };
  if (answer === "no") return { inStock: false, short: mine ? `${mine} sold out or not made` : "Not in your size", long: `The listing shows ${mine ? `size ${mine}` : "your size"} sold out or not made.` };
  if (c.availability === "in_stock") return { inStock: true, short: "In stock · size not checked", long: "In stock when we checked. The listing didn't show your size; check it at the store." };
  return { inStock: false, short: "Stock not checked", long: "Not checked. Check your size at the store." };
}


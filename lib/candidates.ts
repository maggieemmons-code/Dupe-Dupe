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
};

export const CANDIDATE_FIELDS =
  "id, search_id, kind, source, title, brand, store, store_domain, link_is_google, photo_url, thumb_url, price, old_price, price_is_estimate, price_checked_at, rating, reviews, delivery, size, color, color_match, screen_note, screen_rank";

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

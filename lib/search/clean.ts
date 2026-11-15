/*
 * Cleaning step (PLAN.md › Search pipeline › 3. Clean). Code, not an agent:
 * drops what can't be a result and merges the same product sold by several
 * stores, keeping the cheapest. Every drop keeps its reason on the row.
 */

import { isNotAStore, isRental } from "@/lib/server/serpapi";

export type CleanRow = {
  id: string;
  kind: "new" | "secondhand";
  title: string;
  store: string;
  store_domain: string;
  link: string;
  photo_url: string | null;
  price: number | null;
  in_stock: boolean | null;
  size: string;
};

export type CleanContext = {
  budget: number | null;
  brand: string;
  styleName: string;
  sizes: string[];
  hiddenStores: string[];
  /** Secondhand is screened from phase 5 on. */
  secondhandOn: boolean;
};

export type CleanResult = { id: string; drop_reason: string | null; duplicate_of: string | null };

export function cleanCandidates(rows: CleanRow[], ctx: CleanContext): CleanResult[] {
  const out = new Map<string, CleanResult>();
  const hidden = ctx.hiddenStores.map(norm).filter(Boolean);
  const brand = norm(ctx.brand);
  const style = norm(ctx.styleName);

  const keep: CleanRow[] = [];
  for (const r of rows) {
    const reason = dropReason(r);
    out.set(r.id, { id: r.id, drop_reason: reason, duplicate_of: null });
    if (!reason) keep.push(r);
  }

  function dropReason(r: CleanRow): string | null {
    if (isNotAStore(r.store_domain, r.store)) return "Not a store";
    if (isRental(r.store_domain, r.store, r.title)) return "Rental, not for sale";
    if (hidden.some((h) => norm(r.store).includes(h) || norm(r.store_domain).includes(h))) return "Hidden store";
    const title = norm(r.title);
    if (style && brand && title.includes(style) && (title.includes(brand) || norm(r.store).includes(brand))) {
      return "Your original";
    }
    if (r.kind === "secondhand") {
      if (!ctx.secondhandOn) return "Secondhand comes in a later phase";
      if (r.size && ctx.sizes.length && !sizeMatches(r.size, ctx.sizes)) return "Not your size";
      return null;
    }
    if (r.price == null) return "No price shown";
    if (ctx.budget && r.price > ctx.budget) return "Over budget";
    if (r.in_stock === false) return "Out of stock";
    return null;
  }

  // Merge the same product: same link or photo, or titles that share nearly all their words.
  const groups: CleanRow[][] = [];
  for (const r of keep) {
    const g = groups.find((grp) => grp.some((o) => sameProduct(o, r)));
    if (g) g.push(r);
    else groups.push([r]);
  }
  for (const g of groups) {
    if (g.length < 2) continue;
    const best = [...g].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0];
    for (const r of g) {
      if (r.id === best.id) continue;
      out.set(r.id, { id: r.id, drop_reason: "Same item, cheaper elsewhere", duplicate_of: best.id });
    }
  }

  return [...out.values()];
}

function sameProduct(a: CleanRow, b: CleanRow) {
  if (a.link === b.link) return true;
  if (a.photo_url && a.photo_url === b.photo_url) return true;
  const wa = words(a.title);
  const wb = words(b.title);
  if (wa.size < 3 || wb.size < 3) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.85 && shared / Math.max(wa.size, wb.size) >= 0.7;
}

const STOP = new Set(["the", "a", "an", "in", "of", "for", "and", "with", "by", "women", "womens", "s", "dress", "new"]);

function words(t: string) {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Keeps a listing whose size is one of the friend's (letter or number). */
export function sizeMatches(size: string, sizes: string[]) {
  const s = size.toUpperCase().replace(/^SIZE\s*/, "").trim();
  const tokens = s.split(/[\s/,()-]+/).filter(Boolean);
  return sizes.some((mine) => {
    const m = mine.toUpperCase();
    return tokens.includes(m) || s === m;
  });
}

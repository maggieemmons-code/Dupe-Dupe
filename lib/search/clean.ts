/*
 * Cleaning step (PLAN.md › Search pipeline › 3. Clean). Code, not an agent:
 * drops what can't be a result and merges the same product sold by several
 * stores, keeping the cheapest. Every drop keeps its reason on the row.
 */

import { isNotAStore, isRental } from "@/lib/server/serpapi";
import { vetStore, AMAZON_MIN_RATING, AMAZON_MIN_REVIEWS } from "@/lib/stores";
import { isHiddenStore, type HiddenStore } from "@/lib/hiddenStores";

export type CleanRow = {
  id: string;
  kind: "new" | "secondhand";
  source: string;
  rating: number | null;
  reviews: number | null;
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
  /** New items under this price are hidden (lib/search/priceFloor.ts). */
  priceFloor: number | null;
  /** The original's price: anything at or above it isn't a dupe. */
  retailPrice?: number | null;
  brand: string;
  styleName: string;
  sizes: string[];
  /** The friend's hidden stores (store_prefs). */
  hiddenStores: HiddenStore[];
  /** Stores Maggie blocked for everyone after several friends hid them (blocked_stores). */
  blockedStores?: HiddenStore[];
  /** Secondhand is screened from phase 5 on. */
  secondhandOn: boolean;
};

export type CleanResult = { id: string; drop_reason: string | null; duplicate_of: string | null };

export function cleanCandidates(rows: CleanRow[], ctx: CleanContext): CleanResult[] {
  const out = new Map<string, CleanResult>();

  const keep: CleanRow[] = [];
  for (const r of rows) {
    const reason = dropReason(r);
    out.set(r.id, { id: r.id, drop_reason: reason, duplicate_of: null });
    if (!reason) keep.push(r);
  }

  function dropReason(r: CleanRow): string | null {
    if (isNotAStore(r.store_domain, r.store)) return "Not a store";
    if (isRental(r.store_domain, r.store, r.title, r.link)) return "Rental, not for sale";
    // Every store is allowed unless blocked (lib/stores.ts).
    if (vetStore(r.store, r.store_domain) === "blocked") return "Blocked store";
    if (isHiddenStore(r, ctx.blockedStores ?? [])) return "Blocked store";
    if (isHiddenStore(r, ctx.hiddenStores)) return "Hidden store";
    if (r.source === "amazon" && ((r.rating ?? 0) < AMAZON_MIN_RATING || (r.reviews ?? 0) < AMAZON_MIN_REVIEWS)) {
      return "Amazon: under 4 stars or 100 reviews";
    }
    if (isOriginal(r, ctx)) return "Your original";
    if (isSameBrand(r, ctx)) return "From the original's own brand";
    if (RESALE_WORDS.test(r.title)) return "Used or resale listing";
    if (isForeign(r)) return "Store outside the US";
    if (isCategoryPage(r)) return "Not a product page";
    if (r.kind === "secondhand") {
      if (!ctx.secondhandOn) return "Secondhand comes in a later phase";
      if (r.size && ctx.sizes.length && !sizeMatches(r.size, ctx.sizes)) return "Not your size";
      return null;
    }
    if (r.price == null && r.source !== "lens") return "No price shown";
    if (r.price != null && ctx.retailPrice && r.price >= ctx.retailPrice) return "Costs as much as the original";
    if (r.price != null && ctx.budget && r.price > ctx.budget) return "Over budget";
    if (r.price != null && ctx.priceFloor && r.price < ctx.priceFloor) return "Under the price floor";
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

/* ---------- the original itself, category pages, foreign storefronts (test set, Nov 15) ---------- */

/** Words that describe any garment, so they don't identify the original's style. */
const GENERIC = new Set([
  "dress", "dresses", "gown", "gowns", "maxi", "midi", "mini", "strapless", "halter", "drape", "draped", "bias", "boots", "boot",
  "coat", "coats", "blazer", "jacket", "bag", "handle", "top", "leather", "smooth", "faux", "fur", "velvet", "full", "length",
  "long", "women", "womens", "the", "and", "for", "with", "black", "white", "cream", "ivory", "red", "blue", "camel", "pink",
  "burgundy", "sapphire", "satin", "silk", "wool", "bodysuit", "bodysuits", "shirt", "skirt", "pants", "jeans", "heritage",
]);

function wordSet(t: string) {
  return new Set(
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1),
  );
}

/**
 * Lens finds the original itself at other stores (Nykaa's Amaya, Bergdorf's Françoise
 * boots). It's the original when the brand's words are all there and either a word
 * of the style name that isn't generic ("Amaya", "Rosabella", "Bayswater"), or, for
 * a style name with only generic words, most of them.
 */
function isOriginal(r: CleanRow, ctx: CleanContext) {
  const brandWords = [...wordSet(ctx.brand)].filter((w) => !["the", "and", "of"].includes(w));
  if (!brandWords.length) return false;
  const hay = wordSet(`${r.title} ${r.store} ${r.store_domain.replace(/\./g, " ")}`);
  const joined = [...hay].join("");
  const brandThere = brandWords.every((w) => hay.has(w)) || joined.includes(brandWords.join(""));
  if (!brandThere) return false;
  const style = [...wordSet(ctx.styleName)].filter((w) => !brandWords.includes(w));
  const distinctive = style.filter((w) => !GENERIC.has(w) && w.length > 2);
  const title = wordSet(r.title);
  if (distinctive.length) return distinctive.some((w) => title.has(w));
  return style.length >= 2 && style.filter((w) => title.has(w)).length >= Math.ceil(style.length * 0.75);
}

/**
 * Maggie, Nov 15 (after a calibration review): the original brand's other pieces
 * aren't dupes. The brand's words must appear together, as whole words, in the
 * title, store or web address ("Bronx Banco" matches "Bronx and Banco").
 */
function isSameBrand(r: CleanRow, ctx: CleanContext) {
  const stop = new Set(["the", "and", "of", "by"]);
  const brand = [...wordSet(ctx.brand)].filter((w) => !stop.has(w));
  if (!brand.length) return false;
  const seq = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !stop.has(w));
  const contains = (tokens: string[]) => tokens.some((_, i) => brand.every((b, k) => tokens[i + k] === b));
  const domain = r.store_domain.toLowerCase().replace(/^www\./, "").split(".")[0];
  return contains(seq(r.title)) || contains(seq(r.store)) || (domain.length > 3 && domain === brand.join(""));
}

/** Pre-owned listings belong in secondhand (phase 5), not new dupes. */
const RESALE_WORDS = /\b(pre[- ]?owned|pre[- ]?loved|second[- ]?hand|consignment|gently used|used condition)\b|\bsave \d+%/i;

const FOREIGN_TLD = /\.(jp|cn|kr|tw|ru|in|sa|ae|qa|kw|do|br|mx|tr|id|th|vn|hk|my|ph|pk|eg|gr|mt|na|au|nz|za|pl|cz|ro|hu|bg|cl|ar|pe|ec|il|sg|mo)$/;
const FOREIGN_NAME = /\b(ksa|uae|saudi|dominican republic|india|japan|korea|mexico|brazil|turkey|qatar|kuwait|egypt|nykaa|myntra|ajio|namshi|rakuten|ecuador|ubuy|trenbe|peru|chile|colombia|argentina)\b/i;
/** Letters from scripts other than Latin: a storefront for another country. */
const NON_LATIN = /[\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function isForeign(r: CleanRow) {
  const host = r.store_domain.toLowerCase();
  return FOREIGN_TLD.test(host) || /^(en-)?(saudi|uae|ksa|qa|kw)\./.test(host) || FOREIGN_NAME.test(r.store) || NON_LATIN.test(`${r.title} ${r.store}`);
}

/** Collection and search pages ("Shop Pink Mulberry Online", "Women's Black Fall Jackets"), not one product. */
const PLURAL_GARMENT = /\b(dresses|gowns|coats|jackets|blazers|bodysuits|bags|handbags|tops|skirts|sweaters|blouses|shirts)\b/i;
function isCategoryPage(r: CleanRow) {
  let path = "";
  try {
    path = new URL(r.link).pathname.toLowerCase();
  } catch {
    /* no link */
  }
  if (/\/(collections|category|categories|c|shop|search|brands?|designers?)\/[^/]*\/?$/.test(path) && !/\/products?\//.test(path)) return true;
  if (r.price != null) return false; // a priced item is almost always one product
  const t = r.title.trim();
  if (/^(shop|discover|explore|browse|view all)\b/i.test(t) || /\b(online|collection|new arrivals)\s*$/i.test(t)) return true;
  // "White Button Down Bodysuits", "The Sei Halter Dresses – Women": a plural garment noun as the main word.
  const main = t.split(/\s[–|-]\s/)[0];
  return PLURAL_GARMENT.test(main) && !/\b(set|pack|two|2)\b/i.test(main);
}

/** "Gown in Red - size XL", "… 8 / Red", "… | REVOLVE": the parts that differ between listings of one product. */
function productName(r: CleanRow) {
  return r.title
    .replace(/\s[–|]\s.*$/, "")
    .replace(/\b(size|sz)\s*[a-z0-9]{1,4}\b/gi, " ")
    .replace(/\b(x{0,3}s|x{0,3}l|m|\d{1,2})\s*\/\s*[a-z]+\s*$/i, " ")
    .replace(new RegExp(`\\b${r.store.replace(/[^a-z0-9 ]/gi, "")}\\b`, "i"), " ");
}

function sameProduct(a: CleanRow, b: CleanRow) {
  if (a.link === b.link) return true;
  if (a.photo_url && a.photo_url === b.photo_url) return true;
  // One style name at the same price ("Cassie Knee High Boot" and "Women's Cassie Boots", both $150).
  if (a.price != null && b.price != null && Math.abs(a.price - b.price) <= 0.05 * Math.max(a.price, b.price)) {
    const sa = styleWords(a.title);
    const sb = styleWords(b.title);
    if ([...sa].some((w) => sb.has(w))) return true;
  }
  const wa = words(productName(a));
  const wb = words(productName(b));
  if (wa.size < 3 || wb.size < 3) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  // Nearly all words of the shorter name appear in the longer one (one product, several stores).
  return shared >= 4 && shared / Math.min(wa.size, wb.size) >= 0.85 && shared / Math.max(wa.size, wb.size) >= 0.6;
}

/** Words that name a style rather than describe a garment: "Cassie", "Rosabella", "Hilda". */
function styleWords(t: string) {
  return new Set([...wordSet(t)].filter((w) => w.length >= 4 && !GENERIC.has(w) && !DESCRIPTIVE.test(w)));
}
const DESCRIPTIVE =
  /^(knee|high|ankle|tall|short|long|black|white|ivory|cream|nude|blush|wine|navy|beige|brown|camel|green|silver|gold|womens?|ladies|evening|formal|party|prom|wedding|bridal|guest|elegant|sexy|classic|button|down|up|sleeve|sleeveless|shoulder|corset|bandeau|tube|maxi|midi|mini|floor|slim|fitted|belted|wrap|faux|leather|vegan|suede|satin|silk|velvet|sequin|beaded|pearl|lace|wool|cotton|poplin|blend|stretch|knit|crepe|chiffon|coat|jacket|blazer|gown|dress|boot|boots|shoe|shoes|heel|heels|pump|bodysuit|shirt|blouse|skirt|pants|trench|size|plus|petite|with|from|this|that)$/;

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

/** Keeps a listing whose size is one of the friend's (letter or number). */
export function sizeMatches(size: string, sizes: string[]) {
  const s = size.toUpperCase().replace(/^SIZE\s*/, "").trim();
  const tokens = s.split(/[\s/,()-]+/).filter(Boolean);
  return sizes.some((mine) => {
    const m = mine.toUpperCase();
    return tokens.includes(m) || s === m;
  });
}

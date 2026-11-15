import "server-only";

/*
 * SerpApi: Google Lens (visual matches) and Google Shopping.
 * Shapes checked against real responses on 2026-11-14 (NOTES.md › Phase 3):
 * - Lens visual_matches have the store's own link, a store photo (`image`),
 *   a small `thumbnail`, and a price on about half of them. Lens prices carry
 *   a "*" on Google: they aren't live, so they're shown as estimates.
 * - Shopping results have a live price, a thumbnail and the store name, but
 *   only a link to Google's product page (`product_link`), not the store's.
 * - Amazon results (Maggie asked for Amazon, Nov 14) have the product's own
 *   amazon.com link, a photo, a live price, the brand and ratings.
 */

const BASE = "https://serpapi.com";

function key() {
  const k = process.env.SERPAPI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!k) throw new Error("SERPAPI_API_KEY is not set");
  return k;
}

/** One gathered item, before cleaning. Every field comes from the source. */
export type Gathered = {
  kind: "new" | "secondhand";
  source: "lens" | "shopping" | "amazon";
  query: string;
  position: number | null;
  title: string;
  brand: string;
  store: string;
  store_domain: string;
  link: string;
  link_is_google: boolean;
  photo_url: string | null;
  thumb_url: string | null;
  price: number | null;
  old_price: number | null;
  price_is_estimate: boolean;
  rating: number | null;
  reviews: number | null;
  delivery: string;
  in_stock: boolean | null;
  /** Shopping only: SerpApi's token for looking up the stores that sell it. */
  product_token?: string | null;
  drop_reason?: string;
};

async function serp(params: Record<string, string>) {
  const url = new URL(`${BASE}/search.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", key());
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  // "No results" comes back as an error message but isn't a failure.
  if (typeof body.error === "string" && /hasn't returned any results/i.test(body.error)) return {};
  if (!res.ok || body.error) throw new Error(`SerpApi ${res.status}: ${body.error ?? "request failed"}`);
  return body as Record<string, unknown>;
}

/** Searches left this month. SerpApi's Account API is free and doesn't count as a search. */
export async function serpSearchesLeft(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/account.json?api_key=${encodeURIComponent(key())}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d.total_searches_left === "number" ? d.total_searches_left : (d.plan_searches_left ?? null);
  } catch {
    return null;
  }
}

/* ---------- Lens ---------- */

type LensMatch = {
  position?: number;
  title?: string;
  link?: string;
  source?: string;
  price?: { extracted_value?: number; currency?: string };
  in_stock?: boolean;
  thumbnail?: string;
  image?: string;
};

export async function lensSearch(photoUrl: string, hint: string): Promise<Gathered[]> {
  const params: Record<string, string> = {
    engine: "google_lens",
    type: "visual_matches",
    url: photoUrl,
    hl: "en",
    country: "us",
  };
  if (hint.trim()) params.q = hint.trim();
  const body = await serp(params);
  const matches = (body.visual_matches as LensMatch[] | undefined) ?? [];
  const query = hint.trim() ? `Photo + "${hint.trim()}"` : "Photo";

  return matches
    .filter((m) => !isSponsored(m))
    .filter((m) => m.link && /^https?:\/\//.test(m.link))
    .map((m) => {
      const domain = hostOf(m.link!);
      const usd = m.price?.currency === "$" && typeof m.price.extracted_value === "number";
      return {
        kind: kindFor(domain, m.source ?? ""),
        source: "lens" as const,
        query,
        position: m.position ?? null,
        title: cleanTitle(m.title ?? "", m.source ?? ""),
        brand: "",
        store: m.source ?? domain,
        store_domain: domain,
        link: m.link!,
        link_is_google: false,
        photo_url: httpsOrNull(m.image) ?? httpsOrNull(m.thumbnail),
        thumb_url: httpsOrNull(m.thumbnail) ?? httpsOrNull(m.image),
        price: usd ? m.price!.extracted_value! : null,
        old_price: null,
        price_is_estimate: true,
        rating: null,
        reviews: null,
        delivery: "",
        in_stock: typeof m.in_stock === "boolean" ? m.in_stock : null,
      };
    });
}

/* ---------- Shopping ---------- */

type ShoppingResult = {
  position?: number;
  title?: string;
  source?: string;
  link?: string;
  product_link?: string;
  extracted_price?: number | string;
  extracted_old_price?: number | string;
  thumbnail?: string;
  rating?: number | string;
  reviews?: number | string;
  delivery?: string;
  second_hand_condition?: string;
  immersive_product_page_token?: string;
};

export async function shoppingSearch(q: string, maxPrice: number | null, minPrice: number | null = null): Promise<Gathered[]> {
  const params: Record<string, string> = { engine: "google_shopping", q, gl: "us", hl: "en" };
  if (maxPrice) params.max_price = String(Math.round(maxPrice));
  if (minPrice) params.min_price = String(Math.round(minPrice));
  const body = await serp(params);
  // Only Google's unpaid listings: paid Shopping ads come in separate blocks we never read,
  // and anything still marked sponsored is skipped (PLAN.md › Affiliate links › Integrity rules).
  const results = ((body.shopping_results as ShoppingResult[] | undefined) ?? []).filter((r) => !isSponsored(r));

  return results
    .map((r): Gathered | null => {
      const direct = r.link && /^https?:\/\//.test(r.link) ? r.link : null;
      const google = r.product_link && /^https:\/\/www\.google\./.test(r.product_link) ? r.product_link : null;
      const link = direct ?? google;
      if (!link) return null;
      const store = r.source ?? "";
      const domain = direct ? hostOf(direct) : "";
      const kind = r.second_hand_condition ? "secondhand" : kindFor(domain, store);
      return {
        kind,
        source: "shopping" as const,
        query: q,
        position: r.position ?? null,
        title: r.title ?? "",
        brand: "",
        store,
        store_domain: domain,
        link,
        link_is_google: !direct,
        photo_url: httpsOrNull(r.thumbnail),
        thumb_url: httpsOrNull(r.thumbnail),
        price: num(r.extracted_price),
        old_price: num(r.extracted_old_price),
        price_is_estimate: false,
        rating: num(r.rating),
        reviews: num(r.reviews),
        delivery: r.delivery ?? "",
        in_stock: null,
        product_token: direct ? null : (r.immersive_product_page_token ?? null),
      };
    })
    .filter((x): x is Gathered => !!x);
}

/**
 * Product details for a Google Shopping result (1 search). SerpApi's product
 * lookup lists the stores that sell it, each with a Google redirect link;
 * following that redirect (no search) gives the store's own page. It also has
 * the product's features and shopper reviews, which often describe the fabric
 * and how it looks in person, for the judge.
 */
export async function shoppingDetails(
  token: string,
  storeName: string,
): Promise<{ url: string | null; details: string[]; text: string }> {
  const body = await serp({ engine: "google_immersive_product", page_token: token });
  type Store = { name?: string; link?: string; details_and_offers?: string[]; title?: string };
  type Review = { title?: string; text?: string; rating?: number };
  const pr = (body.product_results ?? {}) as {
    title?: string;
    brand?: string;
    rating?: number;
    reviews?: number;
    stores?: Store[];
    about_the_product?: { description?: string; features?: { title?: string; value?: string }[] };
    user_reviews?: Review[];
  };

  const stores = (pr.stores ?? []).filter((s) => s.link);
  const want = storeName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const store =
    stores.find((s) => (s.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === want) ??
    stores.find((s) => want && (s.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(want)) ??
    stores[0];

  let url: string | null = null;
  if (store?.link) {
    const google = new URL(store.link, "https://www.google.com");
    url = google.toString();
    if (google.hostname.endsWith("google.com") && google.pathname === "/goto") {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null);
      const loc = res?.headers.get("location");
      url = loc && /^https:\/\//.test(loc) ? loc : null;
    }
    if (url && !/^https:\/\//.test(url)) url = null;
  }
  const details = (store?.details_and_offers ?? []).filter((d) => typeof d === "string").slice(0, 4);

  const lines: string[] = [];
  if (pr.title) lines.push(`Title: ${pr.title}`);
  if (pr.brand) lines.push(`Brand: ${pr.brand}`);
  if (pr.about_the_product?.description) lines.push(`Description: ${pr.about_the_product.description}`);
  for (const f of pr.about_the_product?.features ?? []) if (f.title && f.value) lines.push(`${f.title}: ${f.value}`);
  if (details.length) lines.push(`Store: ${details.join(" · ")}`);
  if (pr.rating) lines.push(`Rating: ${pr.rating} from ${pr.reviews ?? "?"} reviews`);
  const reviews = (pr.user_reviews ?? []).filter((r) => r.text).slice(0, 6);
  if (reviews.length) {
    lines.push("Shopper reviews:");
    for (const r of reviews) lines.push(`- ${r.rating ? `${r.rating}★ ` : ""}${(r.text ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
  }
  return { url, details, text: lines.join("\n").slice(0, 4000) };
}

/** The store's own page for a Google Shopping result (used by /go when the details weren't looked up). */
export async function storePage(token: string, storeName: string): Promise<{ url: string; details: string[] } | null> {
  const d = await shoppingDetails(token, storeName);
  return d.url ? { url: d.url, details: d.details } : null;
}

const COLOR_WORDS = new Set([
  "black", "white", "cream", "ivory", "ecru", "beige", "tan", "camel", "brown", "chocolate", "mocha", "taupe", "grey", "gray",
  "charcoal", "silver", "gold", "red", "burgundy", "wine", "maroon", "rust", "orange", "coral", "peach", "yellow", "mustard",
  "green", "olive", "sage", "emerald", "teal", "blue", "navy", "cobalt", "sapphire", "turquoise", "aqua", "purple", "plum",
  "lilac", "lavender", "pink", "blush", "fuchsia", "magenta", "nude",
]);

/**
 * When a store blocks page reading (Revolve does), find the original on Google
 * Shopping by the name in its web address, and describe it from Google's listing:
 * price, details (fabric, neckline, length…) and product photos. 2 searches.
 * Picks the result whose name matches the address best, preferring the same store.
 */
export async function lookupOriginal(link: string): Promise<{
  page: { url: string; title: string; text: string; images: string[] };
  photoUrls: string[];
  price: number | null;
} | null> {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  const slug = u.pathname
    .split("/")
    .filter((p) => /[a-z]-[a-z]/i.test(p))
    .sort((a, b) => b.length - a.length)[0];
  if (!slug) return null;
  const nameWords = decodeURIComponent(slug)
    .toLowerCase()
    .replace(/\.[a-z]+$/, "")
    .split(/[-_]+/)
    .filter((w) => /^[a-z']+$/.test(w));
  if (nameWords.length < 2) return null;
  const q = nameWords.join(" ");
  const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const distinctive = nameWords.map(key).filter((w) => w.length > 2 && !["the", "and", "for", "with"].includes(w));
  const host = u.hostname.replace(/^www\./, "").split(".")[0];

  const body = await serp({ engine: "google_shopping", q, gl: "us", hl: "en" });
  type R = { title?: string; source?: string; extracted_price?: number | string; thumbnail?: string; immersive_product_page_token?: string };
  const results = ((body.shopping_results as R[] | undefined) ?? []).filter((r) => !isSponsored(r));
  let best: R | null = null;
  let bestScore = 0;
  // The color named in the link wins: Google may list the same style in another color.
  const linkColors = nameWords.filter((w) => COLOR_WORDS.has(w));
  for (const r of results) {
    const t = new Set((r.title ?? "").toLowerCase().split(/[^a-z0-9']+/).map(key).filter(Boolean));
    const overlap = distinctive.filter((w) => t.has(w)).length / Math.max(1, distinctive.length);
    const sameStore = key(r.source ?? "").includes(key(host)) ? 0.15 : 0;
    const titleColors = [...t].filter((w) => COLOR_WORDS.has(w));
    const otherColor = linkColors.length && titleColors.length && !titleColors.some((c) => linkColors.includes(c)) ? -0.5 : 0;
    if (overlap + sameStore + otherColor > bestScore) {
      best = r;
      bestScore = overlap + sameStore + otherColor;
    }
  }
  if (!best || bestScore < 0.6) return null;

  const lines = [`Title: ${best.title}`, `Store: ${best.source}`];
  if (linkColors.length) lines.push(`Color named in the shopper's link (use this color): ${linkColors.join(" ")}`);
  const price = num(best.extracted_price);
  if (price != null) lines.push(`Price: $${price}`);
  let photoUrls = best.thumbnail ? [best.thumbnail] : [];
  if (best.immersive_product_page_token) {
    try {
      const d = await serp({ engine: "google_immersive_product", page_token: best.immersive_product_page_token });
      const pr = (d.product_results ?? {}) as {
        brand?: string;
        thumbnails?: string[];
        about_the_product?: { description?: string; features?: { title?: string; value?: string }[] };
      };
      if (pr.brand) lines.push(`Brand: ${pr.brand}`);
      if (pr.about_the_product?.description) lines.push(`Description: ${pr.about_the_product.description}`);
      for (const f of pr.about_the_product?.features ?? []) if (f.title && f.value) lines.push(`${f.title}: ${f.value}`);
      if (pr.thumbnails?.length) photoUrls = [...pr.thumbnails, ...photoUrls];
    } catch {
      // The Shopping result alone still gives the name, store, price and a photo.
    }
  }
  return {
    page: {
      url: link,
      title: best.title ?? "",
      text: `PRODUCT LISTING FROM GOOGLE SHOPPING (the store's own page couldn't be read; this is the same product found by name):\n${lines.join("\n")}`,
      images: [],
    },
    photoUrls: [...new Set(photoUrls.filter((p) => /^https:\/\//.test(p)))].slice(0, 3),
    price,
  };
}

/** Product details for an Amazon result (1 search): description, specs and feature bullets. */
export async function amazonDetails(asin: string): Promise<{ text: string; inStock: boolean | null }> {
  const body = await serp({ engine: "amazon_product", asin, amazon_domain: "amazon.com" });
  const pr = (body.product_results ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  const add = (label: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) lines.push(`${label}: ${v.trim()}`);
    else if (Array.isArray(v)) {
      const items = v
        .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x).filter((y) => typeof y === "string").join(": ") : ""))
        .filter(Boolean);
      if (items.length) lines.push(`${label}:\n- ${items.join("\n- ")}`);
    } else if (v && typeof v === "object") {
      const items = Object.entries(v).filter(([, y]) => typeof y === "string").map(([k, y]) => `${k}: ${y}`);
      if (items.length) lines.push(`${label}:\n- ${items.join("\n- ")}`);
    }
  };
  add("Title", pr.title);
  add("Brand", pr.brand);
  add("About this item", pr.about_item);
  add("Feature bullets", pr.feature_bullets);
  add("Product details", pr.product_details);
  add("Specifications", pr.item_specifications ?? pr.specifications);
  add("Description", pr.description);
  if (typeof pr.rating === "number") lines.push(`Rating: ${pr.rating} from ${pr.reviews ?? "?"} reviews`);
  const stock = typeof pr.stock === "string" ? pr.stock : "";
  return { text: lines.join("\n").slice(0, 4000), inStock: stock ? !/unavailable|out of stock/i.test(stock) : null };
}

/* ---------- Amazon ---------- */

type AmazonResult = {
  position?: number;
  asin?: string;
  title?: string;
  brand?: string;
  link?: string;
  link_clean?: string;
  thumbnail?: string;
  extracted_price?: number | string;
  extracted_old_price?: number | string;
  rating?: number | string;
  reviews?: number | string;
  sponsored?: boolean;
};

export async function amazonSearch(q: string, maxPrice: number | null, minPrice: number | null = null): Promise<Gathered[]> {
  const body = await serp({ engine: "amazon", k: q, amazon_domain: "amazon.com" });
  // Organic results only; sponsored placements are skipped.
  const results = ((body.organic_results as AmazonResult[] | undefined) ?? []).filter((r) => !isSponsored(r));

  return results
    .map((r): Gathered | null => {
      const raw = r.link_clean ?? r.link ?? "";
      const link = /^https:\/\/www\.amazon\.com\//.test(raw) ? raw : null;
      if (!link) return null;
      const price = num(r.extracted_price);
      return {
        kind: "new" as const,
        source: "amazon" as const,
        query: q,
        position: r.position ?? null,
        title: r.title ?? "",
        brand: r.brand ?? "",
        store: "Amazon",
        store_domain: "amazon.com",
        link,
        link_is_google: false,
        photo_url: httpsOrNull(r.thumbnail),
        thumb_url: httpsOrNull(r.thumbnail),
        price,
        old_price: num(r.extracted_old_price),
        price_is_estimate: false,
        rating: num(r.rating),
        reviews: num(r.reviews),
        delivery: "",
        in_stock: null,
      };
    })
    .filter((x): x is Gathered => !!x)
    // Amazon has no reliable price filter in the request, so it's applied here too (and again in cleaning).
    .filter((x) => !maxPrice || x.price == null || x.price <= maxPrice)
    .filter((x) => !minPrice || x.price == null || x.price >= minPrice);
}

/* ---------- helpers ---------- */

/** True for anything a source marks as paid placement. */
function isSponsored(item: object) {
  const r = item as { sponsored?: unknown; tag?: unknown; extensions?: unknown; badges?: unknown };
  if (r.sponsored === true) return true;
  const labels = [r.tag, ...(Array.isArray(r.extensions) ? r.extensions : []), ...(Array.isArray(r.badges) ? r.badges : [])];
  return labels.some((l) => typeof l === "string" && /^(sponsored|ad)$/i.test(l.trim()));
}

const SECONDHAND = [
  "therealreal", "poshmark", "depop", "ebay", "vestiairecollective", "vestiaire", "thredup", "grailed",
  "tradesy", "rebag", "fashionphile", "mercari", "theluxurycloset", "shoppickle", "pickle", "thevolte",
  "the volte", "the realreal", "vinted", "kidizen", "curtsy",
];
const RENTAL = ["renttherunway", "rent the runway", "thefitzroy", "the fitzroy", "nuuly", "hurr", "byrotation", "armoire", "rental"];
const NOT_A_STORE = [
  "instagram", "tiktok", "pinterest", "facebook", "youtube", "reddit", "twitter", "x.com", "threads.net",
  "wikipedia", "tumblr", "weheartit",
];

function kindFor(domain: string, store: string): "new" | "secondhand" {
  const hay = `${domain} ${store}`.toLowerCase();
  return SECONDHAND.some((s) => hay.includes(s)) ? "secondhand" : "new";
}

export function isRental(domain: string, store: string, title: string) {
  const hay = `${domain} ${store} ${title}`.toLowerCase();
  return RENTAL.some((s) => hay.includes(s)) || /\brent(al)?\b/.test(title.toLowerCase());
}

export function isNotAStore(domain: string, store: string) {
  const hay = `${domain} ${store}`.toLowerCase();
  return NOT_A_STORE.some((s) => hay.includes(s));
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function httpsOrNull(u?: string) {
  return u && /^https:\/\//.test(u) ? u : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(/[^0-9.]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Drops a trailing "– STORE" or "| Store" that Lens titles carry. */
function cleanTitle(title: string, store: string) {
  const parts = title.split(/\s+[–|]\s+|\s+-\s+(?=[^-]*$)/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "");
    const s = store.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (last && s && (last.includes(s) || s.includes(last))) parts.pop();
  }
  return parts.join(" – ").replace(/\s*\.\.\.?$|\s*…$/, "").trim();
}

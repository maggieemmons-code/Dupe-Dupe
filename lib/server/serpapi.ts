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
};

export async function shoppingSearch(q: string, maxPrice: number | null): Promise<Gathered[]> {
  const params: Record<string, string> = { engine: "google_shopping", q, gl: "us", hl: "en" };
  if (maxPrice) params.max_price = String(Math.round(maxPrice));
  const body = await serp(params);
  const results = (body.shopping_results as ShoppingResult[] | undefined) ?? [];

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
      };
    })
    .filter((x): x is Gathered => !!x);
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

export async function amazonSearch(q: string, maxPrice: number | null): Promise<Gathered[]> {
  const body = await serp({ engine: "amazon", k: q, amazon_domain: "amazon.com" });
  const results = (body.organic_results as AmazonResult[] | undefined) ?? [];

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
    .filter((x) => !maxPrice || x.price == null || x.price <= maxPrice);
}

/* ---------- helpers ---------- */

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

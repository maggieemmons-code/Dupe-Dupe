import "server-only";
import type { Gathered } from "./serpapi";

/*
 * Shopify Global Catalog (Maggie, Nov 15: tried before AliExpress and secondhand).
 * One catalog of products from stores that run on Shopify, which includes most
 * of the small brands Google's searches never surfaced (Club L, Selfie Leslie,
 * Rosier, Akira…). Free, no key: each request names our agent profile, a public
 * JSON file at /ucp/agent.json (public/ucp/agent.json). Searches by words, by a
 * photo (`like`) or both. Shapes checked against real answers, NOTES.md ›
 * Shopify Global Catalog.
 *
 * Shopify's terms: results only for shopper experiences; keep the attribution
 * parameters on links; prices and stock may be kept 10 minutes (Shop re-checks);
 * no standing product index, no training.
 */

const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const APP_URL = "https://dupe-dupe.vercel.app";
/**
 * Shopify fetches this file on every call, so it must be public. On the Mac
 * (development) our copy isn't reachable from outside, so Shopify's own example
 * profile, which declares the same catalog capabilities, stands in.
 */
export const AGENT_PROFILE =
  process.env.NODE_ENV === "production"
    ? `${APP_URL}/ucp/agent.json`
    : "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json";

type Money = { amount?: number; currency?: string };
type Variant = {
  url?: string;
  price?: Money;
  list_price?: Money;
  availability?: { available?: boolean };
  condition?: string[];
  options?: { name?: string; label?: string }[];
  seller?: { name?: string; domain?: string; url?: string };
  media?: { type?: string; url?: string }[];
};
type Product = {
  id?: string;
  title?: string;
  url?: string;
  handle?: string;
  media?: { type?: string; url?: string }[];
  options?: { name?: string; values?: { label?: string }[] }[];
  metadata?: { tech_specs?: string[]; top_features?: string[] };
  description?: { plain?: string; html?: string };
  variants?: Variant[];
  price_range?: { min?: Money; max?: Money };
};

export type CatalogSearch = {
  /** Words; may be combined with a photo. */
  query?: string;
  /** A JPEG or PNG of the original, for visual matches. */
  image?: { data: Buffer; contentType: string };
  /** Dollars. */
  maxPrice?: number | null;
  minPrice?: number | null;
  condition?: "new" | "secondhand";
  limit?: number;
  /** Override the agent profile (the probe runs before ours is online). */
  profile?: string;
};

/** Runs one catalog search and returns the products in Dupe Dupe's gathered shape. */
export async function catalogSearch(s: CatalogSearch, label: string): Promise<Gathered[]> {
  const filters: Record<string, unknown> = { ships_to: { country: "US" }, available: true };
  if (s.condition) filters.condition = [s.condition];
  if (s.maxPrice || s.minPrice) {
    filters.price = {
      ...(s.minPrice ? { min: Math.round(s.minPrice * 100) } : {}),
      ...(s.maxPrice ? { max: Math.round(s.maxPrice * 100) } : {}),
    };
  }
  const catalog: Record<string, unknown> = {
    filters,
    context: { address_country: "US", currency: "USD" },
    pagination: { limit: Math.min(s.limit ?? 30, 50) },
  };
  if (s.query) catalog.query = s.query;
  if (s.image) catalog.like = [{ image: { content_type: s.image.contentType, data: s.image.data.toString("base64") } }];
  if (!s.query && !s.image) return [];

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 1,
      params: { name: "search_catalog", arguments: { meta: { "ucp-agent": { profile: s.profile ?? AGENT_PROFILE } }, catalog } },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    result?: { isError?: boolean; structuredContent?: { products?: Product[] }; content?: { text?: string }[] };
  };
  if (!res.ok || body.error || body.result?.isError) {
    const why = body.error?.message ?? body.result?.content?.[0]?.text ?? `status ${res.status}`;
    throw new Error(`Shopify catalog: ${String(why).slice(0, 200)}`);
  }
  const products = body.result?.structuredContent?.products ?? [];
  return products.map((p, i) => toGathered(p, i + 1, label)).filter((g): g is Gathered => g !== null);
}

/** Which of these product links Shopify's catalog knows, with the price in US dollars when it gives one. */
export async function catalogLookup(urls: string[], profile?: string): Promise<{ url: string; title: string; price: number | null }[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: 1,
      params: {
        name: "lookup_catalog",
        arguments: { meta: { "ucp-agent": { profile: profile ?? AGENT_PROFILE } }, catalog: { ids: urls.slice(0, 50), filters: { available: false } } },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: { structuredContent?: { products?: Product[] } } };
  return (body.result?.structuredContent?.products ?? []).map((p) => {
    const money = p.variants?.[0]?.price ?? p.price_range?.min;
    return {
      url: p.variants?.[0]?.url ?? p.url ?? "",
      title: p.title ?? "",
      price: money?.currency === "USD" && typeof money.amount === "number" ? money.amount / 100 : null,
    };
  });
}

function toGathered(p: Product, position: number, label: string): Gathered | null {
  const v = (p.variants ?? []).find((x) => x.availability?.available !== false) ?? p.variants?.[0];
  const link = v?.url ?? p.url;
  if (!link || !p.title) return null;
  let domain = "";
  try {
    domain = new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  // Only dollar prices; another currency is left out rather than converted by guesswork.
  const money = v?.price ?? p.price_range?.min;
  const price = money?.currency === "USD" && typeof money.amount === "number" ? money.amount / 100 : null;
  const was = v?.list_price?.currency === "USD" && typeof v.list_price.amount === "number" ? v.list_price.amount / 100 : null;
  const photo = (v?.media ?? []).concat(p.media ?? []).find((m) => m.type === "image" && m.url)?.url ?? null;
  const store = v?.seller?.name?.trim() || domain;
  const secondhand = (v?.condition ?? []).some((c) => /second|used|pre-?owned/i.test(c));
  return {
    kind: secondhand ? "secondhand" : "new",
    source: "shopify",
    query: label,
    position,
    title: p.title.replace(/\s+/g, " ").trim(),
    brand: store,
    store,
    store_domain: domain,
    link,
    link_is_google: false,
    photo_url: photo,
    thumb_url: photo ? shopifyThumb(photo) : null,
    price,
    old_price: was && price && was > price ? was : null,
    price_is_estimate: false,
    rating: null,
    reviews: null,
    delivery: "",
    in_stock: v?.availability?.available ?? null,
    listing_text: listingText(p),
  };
}

/** Shopify's CDN resizes on request: a small copy for the screener's thumbnails. */
function shopifyThumb(url: string) {
  if (!/cdn\.shopify\.com/.test(url)) return url;
  const u = new URL(url);
  u.searchParams.set("width", "300");
  return u.toString();
}

/** What the store states about the piece (material, specs, sizes), for the judge and Item detail. */
function listingText(p: Product) {
  const lines: string[] = [];
  const specs = p.metadata?.tech_specs ?? [];
  if (specs.length) lines.push(...specs.map((s) => `- ${s}`));
  const sizes = (p.options ?? []).find((o) => /size/i.test(o.name ?? ""))?.values?.map((v) => v.label).filter(Boolean);
  if (sizes?.length) lines.push(`- Sizes offered: ${sizes.join(", ")}`);
  const desc = (p.description?.plain ?? p.description?.html ?? "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && /fabric|polyester|cotton|silk|wool|viscose|rayon|linen|elastane|spandex|nylon|leather|lined|lining|stretch|care|wash|dry clean|length|fit|size|model/i.test(l))
    .slice(0, 12);
  if (desc.length) lines.push(...desc.map((l) => `- ${l}`));
  return lines.length ? `From Shopify's catalog:\n${lines.join("\n")}` : null;
}

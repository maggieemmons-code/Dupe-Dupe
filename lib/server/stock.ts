import "server-only";
import { safeUrl } from "@/lib/server/linkPhotos";

/*
 * Is a result still for sale? (Maggie, Nov 15: "the results coming back are for
 * dresses that are out of stock".) Free checks, no SerpApi:
 * - Shopify stores answer /products/<handle>.js with whether each size is available.
 * - Any store page that says "sold out" or "out of stock" and offers no way to add it
 *   to a bag counts as sold out.
 * Returns true (in stock), false (sold out) or null (couldn't tell).
 */

export async function shopifyAvailable(link: string): Promise<boolean | null> {
  const safe = safeUrl(link);
  if (!safe) return null;
  const u = new URL(safe);
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return null;
  try {
    const res = await fetch(`${u.origin}/products/${m[1]}.js`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    const p = (await res.json()) as { available?: boolean; variants?: { available?: boolean }[] };
    if (typeof p.available === "boolean") return p.available;
    if (Array.isArray(p.variants)) return p.variants.some((v) => v.available);
    return null;
  } catch {
    return null;
  }
}

/**
 * A Shopify store's own price for the product, in US dollars, or null (not Shopify,
 * or the store sells in another currency). Free: /products/<handle>.js gives the
 * price in cents, /cart.js the store's currency (Nov 15: Lens matches often come
 * without a price, and the ones priced this way were mostly over the limit).
 */
export async function shopifyPriceUsd(link: string): Promise<number | null> {
  const safe = safeUrl(link);
  if (!safe) return null;
  const u = new URL(safe);
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return null;
  try {
    const opts = { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } };
    const [prod, cart] = await Promise.all([fetch(`${u.origin}/products/${m[1]}.js`, opts), fetch(`${u.origin}/cart.js`, opts)]);
    if (!prod.ok || !cart.ok) return null;
    const p = (await prod.json()) as { price?: number };
    const c = (await cart.json()) as { currency?: string };
    if (c.currency !== "USD" || typeof p.price !== "number" || p.price <= 0) return null;
    return p.price / 100;
  } catch {
    return null;
  }
}

const SOLD = /\b(sold out|out of stock|no longer available|currently unavailable|this item is unavailable|notify me when (it'?s )?(back|available))\b/i;
const BUYABLE = /\b(add to (bag|cart|basket)|buy now|in stock)\b/i;

/** From a store page's text: false when it says sold out and offers no way to buy. */
export function pageAvailable(text: string): boolean | null {
  const top = text.slice(0, 6000);
  if (SOLD.test(top) && !BUYABLE.test(top)) return false;
  if (BUYABLE.test(top)) return true;
  return null;
}

/** From Google's store offers ("In stock online", "Out of stock"). */
export function offersAvailable(details: string[]): boolean | null {
  const t = details.join(" ");
  if (/out of stock|sold out|unavailable/i.test(t)) return false;
  if (/in stock/i.test(t)) return true;
  return null;
}

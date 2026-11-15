/**
 * Tries SerpApi's product lookups for fabric: Google's for a Shopping result and Amazon's for an
 * Amazon result of the latest search (1 SerpApi search each). Prints what they say about material.
 * Run: npx tsx --env-file=.env.local scripts/test-product-details.ts <search id>
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});
const key = process.env.SERPAPI_API_KEY!.trim();

async function serp(params: Record<string, string>) {
  const u = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries({ ...params, api_key: key })) u.searchParams.set(k, v);
  return (await fetch(u)).json();
}

function material(obj: unknown) {
  const text = JSON.stringify(obj);
  const hits = text.match(/.{0,60}(polyester|cotton|silk|viscose|rayon|nylon|elastane|spandex|wool|linen|acetate|fabric|material|lining).{0,80}/gi) ?? [];
  return [...new Set(hits)].slice(0, 8);
}

async function main() {
  const id = process.argv[2];
  const { data: shop } = await db
    .from("candidates")
    .select("title, store, product_token")
    .eq("search_id", id)
    .not("product_token", "is", null)
    .ilike("store", "%revolve%")
    .limit(1)
    .single();
  if (shop) {
    const j = await serp({ engine: "google_immersive_product", page_token: shop.product_token });
    console.log(`Google lookup · ${shop.store} · ${shop.title}`);
    console.log("  keys:", Object.keys(j.product_results ?? {}));
    console.log("  about:", JSON.stringify(j.product_results?.about_the_product ?? {}).slice(0, 600));
    console.log("  material:", material(j.product_results));
  }

  const { data: amz } = await db.from("candidates").select("title, link").eq("search_id", id).eq("source", "amazon").limit(1).single();
  const asin = amz?.link.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
  if (asin) {
    const j = await serp({ engine: "amazon_product", asin, amazon_domain: "amazon.com" });
    console.log(`\nAmazon lookup · ${amz!.title.slice(0, 60)}`);
    console.log("  keys:", Object.keys(j.product_results ?? j));
    console.log("  material:", material(j.product_results ?? j));
  }
}

main();

/**
 * When a store blocks page reading (Revolve), can Google Shopping + SerpApi's product lookup
 * describe the original instead? Prints what comes back (2 SerpApi searches).
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-original-lookup.ts "<product words> <store>"
 */
const key = process.env.SERPAPI_API_KEY!.trim();

async function serp(params: Record<string, string>) {
  const u = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries({ ...params, api_key: key })) u.searchParams.set(k, v);
  return (await fetch(u)).json();
}

async function main() {
  const q = process.argv[2];
  const shop = await serp({ engine: "google_shopping", q, gl: "us", hl: "en" });
  const results = (shop.shopping_results ?? []) as { title: string; source: string; extracted_price: number; immersive_product_page_token?: string; thumbnail?: string }[];
  for (const r of results.slice(0, 5)) console.log(`- ${r.source} · $${r.extracted_price} · ${r.title}`);
  const hit = results[0];
  if (!hit?.immersive_product_page_token) return console.log("no product token");
  const d = await serp({ engine: "google_immersive_product", page_token: hit.immersive_product_page_token });
  const pr = d.product_results ?? {};
  console.log("\nLookup:", pr.title, "· brand", pr.brand, "· price range", JSON.stringify(pr.price_range));
  console.log("thumbnails:", (pr.thumbnails ?? []).length, (pr.thumbnails ?? []).slice(0, 2));
  console.log("about:", JSON.stringify(pr.about_the_product ?? {}).slice(0, 800));
  console.log("stores:", (pr.stores ?? []).slice(0, 3).map((s: { name: string; extracted_price: number; title?: string }) => `${s.name} $${s.extracted_price} ${s.title ?? ""}`));
  console.log("reviews:", (pr.user_reviews ?? []).slice(0, 2).map((r: { text: string }) => r.text?.slice(0, 160)));
}

main();

export {};

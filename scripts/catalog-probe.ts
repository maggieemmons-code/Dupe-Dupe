/**
 * Shopify catalog probe (Maggie, Nov 15): for each test item, searches Shopify's
 * Global Catalog by the original's photo, by photo plus a few words, and by two
 * look-alike phrasings, and reports where her good dupes land. Free (no SerpApi,
 * no Claude) and read-only: nothing is saved.
 * Uses each item's newest search for its photo, phrasings and price range.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/catalog-probe.ts [item numbers] [--profile=<url>] [--lookup-only: only check whether her picks are in the catalog]
 * Until /ucp/agent.json is live on Vercel, pass Shopify's example profile:
 *   --profile=https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import { catalogSearch, catalogLookup } from "../lib/server/shopifyCatalog";
import type { Gathered } from "../lib/server/serpapi";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

type Item = { name: string; original: string; good: string[]; holdout?: boolean };

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^(www|us|en-us|www2)\./, "").toLowerCase();
  } catch {
    return "";
  }
};
/** The product's handle (Shopify's /products/<handle>), or the last path part. */
const handle = (u: string) => {
  try {
    const parts = new URL(u).pathname.replace(/\/$/, "").split("/");
    const i = parts.indexOf("products");
    return (i >= 0 ? parts[i + 1] : parts[parts.length - 1]).replace(/\.html$/, "").toLowerCase();
  } catch {
    return "";
  }
};

async function main() {
  const args = process.argv.slice(2);
  const pick = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const profile = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length);
  const { items } = JSON.parse(fs.readFileSync("tests/test-set.json", "utf8")) as { items: Item[] };
  let foundTotal = 0;
  let goodTotal = 0;
  let inCatalogTotal = 0;
  const lookupOnly = args.includes("--lookup-only");

  for (const [i, item] of items.entries()) {
    if (pick.length && !pick.includes(i + 1)) continue;
    const { data } = await db
      .from("searches")
      .select("id, photo_paths, search_queries, budget, budget_min, retail_price, color, category")
      .contains("source_links", [item.original])
      .order("updated_at", { ascending: false })
      .limit(1);
    const s = data?.[0];
    console.log(`\n━━ ${i + 1}. ${item.name}`);
    if (!s) {
      console.log("   no search yet");
      continue;
    }

    const q = (s.search_queries ?? {}) as { look_alike?: string[]; lens_hint?: string };
    const hint = (q.lens_hint || [s.color, s.category].filter(Boolean).join(" ")).slice(0, 80);
    // The probe looks across the whole range up to the original's price, so a pick above her limit still counts as found.
    const maxPrice = s.retail_price ?? s.budget ?? null;
    let image: { data: Buffer; contentType: string } | undefined;
    if (s.photo_paths?.[0]) {
      const { data: blob } = await db.storage.from("photos").download(s.photo_paths[0]);
      if (blob) {
        const buf = await sharp(Buffer.from(await blob.arrayBuffer())).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
        image = { data: buf, contentType: "image/jpeg" };
      }
    }

    const runs: { label: string; search: Parameters<typeof catalogSearch>[0] }[] = [
      ...(image ? [{ label: "photo", search: { image, maxPrice, limit: 50, profile } }] : []),
      ...(image && hint ? [{ label: `photo + "${hint}"`, search: { image, query: hint, maxPrice, limit: 50, profile } }] : []),
      ...(q.look_alike ?? []).slice(0, 2).map((w) => ({ label: `"${w}"`, search: { query: w, maxPrice, limit: 50, profile } })),
    ];
    const results: { label: string; items: Gathered[] }[] = [];
    for (const r of lookupOnly ? [] : runs) {
      try {
        results.push({ label: r.label, items: await catalogSearch(r.search, r.label) });
      } catch (e) {
        console.log(`   ${r.label}: FAILED ${String(e).slice(0, 160)}`);
        results.push({ label: r.label, items: [] });
      }
    }

    for (const r of results) {
      const top = r.items.slice(0, 5).map((g) => `${g.store} "${g.title.slice(0, 40)}" $${g.price ?? "?"}`);
      console.log(`   ${r.label}: ${r.items.length} back · top: ${top.join(" | ")}`);
    }

    // Is each pick in Shopify's catalog at all? (A miss here is coverage, not ranking.)
    const known = await catalogLookup(item.good, profile).catch(() => [] as { url: string; title: string }[]);

    for (const g of item.good) {
      goodTotal++;
      const inCatalog = known.some((k) => handle(k.url) === handle(g) && host(k.url) === host(g));
      if (inCatalog) inCatalogTotal++;
      const h = handle(g);
      const site = host(g);
      const hits = results
        .map((r) => ({ label: r.label, at: r.items.findIndex((x) => handle(x.link) === h || (host(x.link) === site && handle(x.link).startsWith(h.slice(0, 20)))) }))
        .filter((x) => x.at >= 0);
      const sameStore = results.flatMap((r) => r.items).filter((x) => host(x.link) === site).length;
      if (hits.length) foundTotal++;
      console.log(
        `   ${hits.length ? "FOUND" : "  –  "} ${inCatalog ? "[in catalog]" : "[not in catalog]"} ${site}/${h.slice(0, 45)}` +
          (hits.length ? ` → ${hits.map((x) => `#${x.at + 1} by ${x.label}`).join(", ")}` : sameStore ? ` (not this piece; ${sameStore} other from that store)` : ""),
      );
    }
  }
  console.log(`\nHer good dupes in Shopify's catalog at all: ${inCatalogTotal} of ${goodTotal}; found by these searches: ${foundTotal}`);
}

main();

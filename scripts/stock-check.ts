/**
 * How many of the results shown for each test item are still for sale? Checks Shopify
 * stores' product data (free) and Google's store offers saved from lookups. Read-only.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/stock-check.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { shopifyAvailable, offersAvailable, pageAvailable } from "../lib/server/stock";
import { fetchPages } from "../lib/server/tinyfish";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const { items } = JSON.parse(readFileSync("tests/test-set.json", "utf8")) as { items: { name: string; original: string }[] };
  let total = { checked: 0, sold: 0, inStock: 0, unknown: 0 };
  for (const [i, item] of items.entries()) {
    const { data: s } = await db.from("searches").select("id").contains("source_links", [item.original]).not("brief_built_at", "is", null).order("created_at", { ascending: false }).limit(1).single();
    if (!s) continue;
    const { data } = await db
      .from("candidates")
      .select("store, title, link, store_link, store_details, look_score, in_stock")
      .eq("search_id", s.id)
      .eq("stage", "judged")
      .neq("verdict", "rejected")
      .is("drop_reason", null)
      .order("look_score", { ascending: false })
      .limit(10);
    const rows = await Promise.all(
      (data ?? []).map(async (c) => {
        const a = (await shopifyAvailable(c.store_link ?? c.link)) ?? offersAvailable(c.store_details ?? []) ?? (c.in_stock === false ? false : null);
        return { c, a };
      }),
    );
    // Couldn't tell: read the store pages (free), 10 at a time.
    const unknown = rows.filter((r) => r.a === null && !/google\./.test(r.c.store_link ?? r.c.link));
    for (let k = 0; k < unknown.length; k += 10) {
      const batch = unknown.slice(k, k + 10);
      try {
        const { pages } = await fetchPages(batch.map((r) => r.c.store_link ?? r.c.link), "Is this product in stock or sold out?", 20000);
        for (const r of batch) {
          const url = r.c.store_link ?? r.c.link;
          const pg = pages.find((p) => p.url === url || new URL(p.url).pathname === new URL(url).pathname);
          if (pg) r.a = pageAvailable(pg.text);
        }
      } catch {
        /* leave unknown */
      }
    }
    const sold = rows.filter((r) => r.a === false);
    total = {
      checked: total.checked + rows.length,
      sold: total.sold + sold.length,
      inStock: total.inStock + rows.filter((r) => r.a === true).length,
      unknown: total.unknown + rows.filter((r) => r.a === null).length,
    };
    console.log(`${i + 1}. ${item.name}: top ${rows.length} · sold out ${sold.length} · in stock ${rows.filter((r) => r.a === true).length} · can't tell ${rows.filter((r) => r.a === null).length}`);
    for (const r of sold) console.log(`     sold out: L${r.c.look_score} ${r.c.store} · ${r.c.title.slice(0, 60)}`);
    for (const r of rows.filter((x) => x.a === null).slice(0, 3)) console.log(`     can't tell: ${r.c.store} · ${(r.c.store_link ?? r.c.link).slice(0, 70)}`);
  }
  console.log("\nAll:", total);
}

main();

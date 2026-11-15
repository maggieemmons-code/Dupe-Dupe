/**
 * Re-runs today's cleaning rules on a saved search, without changing anything
 * and without new searches: shows what would be dropped and which stores survive.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/reclean.ts <search id>
 */
import { createClient } from "@supabase/supabase-js";
import { cleanCandidates, type CleanRow } from "../lib/search/clean";
import { lowEnd } from "../lib/search/priceFloor";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const id = process.argv[2];
  const { data: s } = await db.from("searches").select("brand, style_name, budget, budget_min, sizes, retail_price").eq("id", id).single();
  const { data } = await db
    .from("candidates")
    .select("id, kind, source, title, store, store_domain, link, photo_url, price, in_stock, size, rating, reviews")
    .eq("search_id", id);
  const rows = (data ?? []) as CleanRow[];
  const results = cleanCandidates(rows, {
    budget: s?.budget ?? null,
    priceFloor: lowEnd({ budget_min: s?.budget_min ?? null }),
    brand: s?.brand ?? "",
    styleName: s?.style_name ?? "",
    sizes: s?.sizes ?? [],
    hiddenStores: [],
    secondhandOn: false,
  });
  const tally: Record<string, number> = {};
  for (const r of results) tally[r.drop_reason ?? "kept"] = (tally[r.drop_reason ?? "kept"] ?? 0) + 1;
  console.log(`${rows.length} gathered:`, tally);

  const kept = new Set(results.filter((r) => !r.drop_reason).map((r) => r.id));
  const byStore: Record<string, number> = {};
  for (const r of rows) if (kept.has(r.id)) byStore[`${r.store} [${r.source}]`] = (byStore[`${r.store} [${r.source}]`] ?? 0) + 1;
  console.log("Kept by store:", byStore);

  const unknown: Record<string, number> = {};
  for (const r of results) {
    if (r.drop_reason !== "Store not approved") continue;
    const row = rows.find((x) => x.id === r.id)!;
    const k = row.store_domain || row.store;
    unknown[k] = (unknown[k] ?? 0) + 1;
  }
  console.log("Not approved:", Object.entries(unknown).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(", "));
}

main();

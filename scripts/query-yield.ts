/**
 * How many usable candidates a Google Shopping query brings: approved stores, inside the
 * search's price range, new. 1 SerpApi search per query.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/query-yield.ts <search id> "<query>" ["<query>"…]
 */
import { createClient } from "@supabase/supabase-js";
import { shoppingSearch } from "../lib/server/serpapi";
import { vetStore } from "../lib/stores";
import { lowEnd } from "../lib/search/priceFloor";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const [id, ...queries] = process.argv.slice(2);
  const { data: s } = await db.from("searches").select("budget, budget_min, retail_price, search_queries").eq("id", id).single();
  if (!s) throw new Error("search not found");
  const floor = lowEnd(s);
  if (!queries.length) {
    console.log("The brief's queries:", JSON.stringify(s.search_queries, null, 1));
    return;
  }
  for (const q of queries) {
    const items = await shoppingSearch(q, s.budget, floor);
    const usable = items.filter((x) => x.kind === "new" && vetStore(x.store, x.store_domain) === "approved");
    const stores: Record<string, number> = {};
    for (const x of usable) stores[x.store] = (stores[x.store] ?? 0) + 1;
    console.log(`"${q}" → ${items.length} results, ${usable.length} usable:`, stores);
  }
}

main();

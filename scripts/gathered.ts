/**
 * What one search gathered, by store, with the reason each was dropped. Read-only.
 * Run: npx tsx --env-file=.env.local scripts/gathered.ts <search id> [store filter]
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const [id, filter] = process.argv.slice(2);
  const { data: s } = await db.from("searches").select("search_queries, budget").eq("id", id).single();
  console.log("Queries:", JSON.stringify(s?.search_queries), "· budget", s?.budget);
  const { data } = await db
    .from("candidates")
    .select("source, store, store_domain, title, price, drop_reason, stage")
    .eq("search_id", id)
    .order("source");
  for (const c of data ?? []) {
    if (filter && !`${c.store} ${c.store_domain}`.toLowerCase().includes(filter.toLowerCase())) continue;
    console.log(`[${c.source}] ${c.store} (${c.store_domain}) · $${c.price} · ${c.drop_reason ?? c.stage} · ${c.title.slice(0, 60)}`);
  }
}

main();

/**
 * Stores that reached the judge in recent searches but are on neither the approved nor
 * the blocked list (lib/stores.ts), most frequent first, with a sample item and link.
 * Every store is allowed unless blocked; Maggie reads this to spot any to block. Read-only.
 * Run: npx tsx --env-file=.env.local scripts/unknown-stores.ts [days, default 30]
 */
import { createClient } from "@supabase/supabase-js";
import { vetStore } from "../lib/stores";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await db
    .from("candidates")
    .select("store, store_domain, title, price, link, search_id, verdict")
    .eq("stage", "judged")
    .gte("created_at", since)
    .limit(5000);

  const stores = new Map<string, { n: number; searches: Set<string>; sample: string; link: string }>();
  for (const c of data ?? []) {
    if (vetStore(c.store, c.store_domain) !== "unknown") continue;
    const key = c.store_domain || c.store;
    const s = stores.get(key) ?? { n: 0, searches: new Set<string>(), sample: `${c.title.slice(0, 50)} · $${c.price ?? "?"} · ${c.verdict}`, link: c.link };
    s.n++;
    s.searches.add(c.search_id);
    stores.set(key, s);
  }
  const rows = [...stores.entries()].sort((a, b) => b[1].searches.size - a[1].searches.size || b[1].n - a[1].n);
  console.log(`${rows.length} stores on neither list reached the judge in the last ${days} days:\n`);
  for (const [store, s] of rows) {
    console.log(`${store} · ${s.n} items in ${s.searches.size} search(es) · e.g. ${s.sample}\n    ${s.link.slice(0, 100)}`);
  }
}

main();

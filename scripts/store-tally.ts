/**
 * Shows which stores a friend's searches would scope to (lib/search/storeTally.ts), and the
 * tally behind it. Read-only. Run: npx tsx --env-file=.env.local scripts/store-tally.ts [user id]
 * (default: Maggie, the admin).
 */
import { createClient } from "@supabase/supabase-js";
import { pickStoreSearches } from "../lib/search/storeTally";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), { auth: { persistSession: false } });

async function main() {
  let userId = process.argv[2];
  if (!userId) userId = (await db.from("profiles").select("id").eq("is_admin", true).limit(1).single()).data!.id;
  const { data: passed } = await db
    .from("candidates")
    .select("id, store, search_id, query")
    .eq("user_id", userId)
    .in("verdict", ["approved", "caveat"])
    .order("created_at", { ascending: false })
    .limit(3000);
  const { data: clicks } = await db.from("events").select("candidate_id").eq("user_id", userId).eq("type", "result_clicked").limit(2000);
  const clicked = new Set((clicks ?? []).map((c) => c.candidate_id));
  const hits = (passed ?? []).map((p) => ({ store: p.store, search_id: p.search_id, clicked: clicked.has(p.id), query: p.query }));

  const count = new Map<string, { n: number; searches: Set<string>; clicks: number }>();
  for (const h of hits) {
    const t = count.get(h.store) ?? { n: 0, searches: new Set<string>(), clicks: 0 };
    t.n++;
    t.searches.add(h.search_id);
    if (h.clicked) t.clicks++;
    count.set(h.store, t);
  }
  console.log(`${hits.length} passing pieces, ${clicked.size} clicks. Top stores:`);
  for (const [store, t] of [...count].sort((a, b) => b[1].n + b[1].clicks - (a[1].n + a[1].clicks)).slice(0, 15)) {
    console.log(`  ${store}: ${t.n} passed in ${t.searches.size} searches, ${t.clicks} clicked`);
  }
  console.log(`\nStore-scoped searches: ${pickStoreSearches(hits).join(", ")}`);
}

main();

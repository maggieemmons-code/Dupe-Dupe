/**
 * Shows the latest searches (any friend), their status and their outside calls. Read-only.
 * Run: npx tsx --env-file=.env.local scripts/last-searches.ts [how many]
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const n = Number(process.argv[2] ?? 4);
  const { data: searches } = await db
    .from("searches")
    .select("id, status, error, brand, style_name, ran_at, created_at, updated_at, missing_sources")
    .order("updated_at", { ascending: false })
    .limit(n);
  for (const s of searches ?? []) {
    console.log(`\n${s.id} · ${s.brand} ${s.style_name}\n  status ${s.status}${s.error ? ` · ${s.error}` : ""} · created ${s.created_at} · updated ${s.updated_at} · ran ${s.ran_at ?? "never"}`);
    const { data: calls } = await db
      .from("api_calls")
      .select("service, stage, ok, error, created_at")
      .eq("search_id", s.id)
      .order("created_at");
    for (const c of calls ?? []) console.log(`  ${c.created_at} ${c.service}/${c.stage} ${c.ok ? "ok" : `FAILED ${c.error ?? ""}`}`);
    const { count } = await db.from("candidates").select("id", { count: "exact", head: true }).eq("search_id", s.id);
    const { data: ev } = await db.from("events").select("type, created_at").eq("search_id", s.id);
    console.log(`  candidates ${count ?? 0} · events ${(ev ?? []).map((e) => e.type).join(", ") || "none"}`);
  }
}

main();

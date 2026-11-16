// Temporary, read-only: the newest searches, their stage, counts and call timeline. Deleted after use.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), { auth: { persistSession: false } });

async function main() {
  const { data: ss } = await db
    .from("searches")
    .select("id, user_id, status, error, brand, style_name, ran_at, updated_at, progress, missing_sources")
    .order("ran_at", { ascending: false, nullsFirst: false })
    .limit(2);
  for (const s of ss ?? []) {
    const t0 = new Date(s.ran_at).getTime();
    console.log(`\n${s.id} · ${s.brand} ${s.style_name} · ${s.status}${s.error ? ` (${s.error})` : ""} · ran ${s.ran_at} · ${Math.round((Date.now() - t0) / 1000)}s ago · progress ${JSON.stringify(s.progress)} · missing ${JSON.stringify(s.missing_sources)}`);
    const { data: calls } = await db.from("api_calls").select("service, stage, ok, created_at, error").eq("search_id", s.id).gte("created_at", s.ran_at).order("created_at");
    for (const c of calls ?? []) console.log(`  +${Math.round((new Date(c.created_at).getTime() - t0) / 1000)}s ${c.service}/${c.stage} ${c.ok ? "" : "FAILED " + (c.error ?? "").slice(0, 120)}`);
  }
}
main();

/**
 * Runs one search through the background job on this Mac, without the phone:
 * re-queues a search whose brief is built, sends the Inngest event to the local
 * Inngest Dev Server, then prints its status and results as they arrive.
 * Needs `npm run dev` and `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`.
 * Uses 4 SerpApi searches.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/run-search.ts [search id | link]
 */
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});
const inngest = new Inngest({ id: "dupe-dupe", isDev: true });

async function main() {
  const arg = process.argv[2] ?? "sau-lee.com";
  const { data: recent, error } = await db
    .from("searches")
    .select("id, user_id, status, brand, style_name, budget, source_links")
    .not("brief_built_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const s = (recent ?? []).find((r) => r.id === arg || r.source_links.some((l: string) => l.includes(arg)));
  if (!s) throw new Error("No search with a built brief found");
  console.log(`Search ${s.id}: ${s.brand} ${s.style_name}, budget ${s.budget ?? "none"}, was ${s.status}`);

  await db.from("searches").update({ status: "queued", error: null }).eq("id", s.id);
  await inngest.send({ name: "search/confirmed", data: { searchId: s.id, userId: s.user_id } });

  let last = "";
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: now } = await db.from("searches").select("status, error, missing_sources").eq("id", s.id).single();
    if (now && now.status !== last) {
      last = now.status;
      console.log(`  ${Math.round((i + 1) * 2)}s · ${now.status}${now.error ? ` · ${now.error}` : ""}${now.missing_sources?.length ? ` · missing ${now.missing_sources}` : ""}`);
    }
    if (now && ["done", "failed"].includes(now.status)) break;
  }

  const { data: all } = await db.from("candidates").select("stage, drop_reason").eq("search_id", s.id);
  const tally: Record<string, number> = {};
  for (const c of all ?? []) {
    const k = c.drop_reason ?? c.stage;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  console.log(`\nGathered ${all?.length ?? 0}:`, tally);

  const { data: shown } = await db
    .from("candidates")
    .select("source, store, title, price, price_is_estimate, photo_url, color_match, link_is_google, product_token, look_score, fit_score, verdict, caveat")
    .eq("search_id", s.id)
    .eq("stage", "judged")
    .is("drop_reason", null)
    .neq("verdict", "rejected")
    .order("look_score", { ascending: false });
  console.log(`\nShown ${shown?.length ?? 0}:`);
  for (const c of shown ?? []) {
    console.log(
      `  L${c.look_score} F${c.fit_score} ${c.verdict}${c.caveat ? ` (${c.caveat})` : ""} · [${c.source}] ${c.store} · ${c.price != null ? `$${c.price}${c.price_is_estimate ? " est." : ""}` : "no price"} · ${c.photo_url ? "photo" : "NO PHOTO"} · ${c.color_match} · ${c.title.slice(0, 55)}${c.link_is_google ? (c.product_token ? " · store lookup ready" : " · NO TOKEN") : ""}`,
    );
  }
}

main();

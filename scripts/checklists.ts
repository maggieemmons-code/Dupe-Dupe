/**
 * Prints the judge's saved checklists for a search, with the listing text it saw. Read-only.
 * Run: npx tsx --env-file=.env.local scripts/checklists.ts <search id> [store filter]
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const [id, filter] = process.argv.slice(2);
  const { data: s } = await db.from("searches").select("visual_brief, composition_brief, sizes").eq("id", id).single();
  console.log("Anchors:", JSON.stringify(s?.visual_brief?.anchors));
  console.log("Composition brief:", JSON.stringify(s?.composition_brief));
  console.log("Sizes:", s?.sizes);
  const { data } = await db
    .from("candidates")
    .select("store, title, price, checklist, look_score, fit_score, verdict, listing_text")
    .eq("search_id", id)
    .eq("stage", "judged");
  for (const c of data ?? []) {
    if (filter && !c.store.toLowerCase().includes(filter.toLowerCase())) continue;
    console.log(`\n== ${c.store} · $${c.price} · ${c.title} · L${c.look_score} F${c.fit_score} ${c.verdict}`);
    console.log(JSON.stringify(c.checklist));
    console.log(`listing text (${c.listing_text?.length ?? 0} chars): ${(c.listing_text ?? "").slice(0, 400).replace(/\n/g, " | ")}`);
  }
}

main();

/**
 * Re-scores a saved search from its saved checklists, with no new search and no AI:
 * use after changing a weight or a verdict rule in lib/search/score.ts.
 * Run: npx tsx --env-file=.env.local scripts/rescore.ts <search id> [--save]
 * Without --save it only prints the new scores.
 */
import { createClient } from "@supabase/supabase-js";
import { score, type AnchorDef, type Checklist } from "../lib/search/score";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const id = process.argv[2];
  const save = process.argv.includes("--save");
  const { data: s } = await db.from("searches").select("visual_brief").eq("id", id).single();
  const anchors = ((s?.visual_brief?.anchors ?? []) as AnchorDef[]).filter((a) => a && a.id);
  const { data } = await db
    .from("candidates")
    .select("id, store, title, price, checklist, look_score, fit_score, verdict")
    .eq("search_id", id)
    .eq("stage", "judged");
  const rows = (data ?? []).map((c) => ({ ...c, next: score(c.checklist as Checklist, anchors) }));
  rows.sort((a, b) => b.next.look - a.next.look);
  for (const c of rows) {
    const was = `L${c.look_score} F${c.fit_score} ${c.verdict}`;
    const now = `L${c.next.look} F${c.next.fit} ${c.next.verdict}`;
    console.log(`${now.padEnd(22)} ${was === now ? "" : `(was ${was}) `}${c.store} · $${c.price} · ${c.title.slice(0, 50)}${c.next.caveat ? ` · ${c.next.caveat}` : ""}`);
    if (save && was !== now) {
      await db
        .from("candidates")
        .update({ look_score: c.next.look, fit_score: c.next.fit, verdict: c.next.verdict, caveat: c.next.caveat })
        .eq("id", c.id);
    }
  }
  if (!save) console.log("\n(Not saved. Add --save to write the new scores.)");
}

main();

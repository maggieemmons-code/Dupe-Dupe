import "server-only";
import { adminClient } from "./admin";
import { loadTaste } from "./taste";
import { tasteWeights } from "@/lib/taste";
import { score, type AnchorDef, type Checklist } from "@/lib/search/score";

/**
 * Re-scores one search's judged pieces from their saved checklists: code only, no
 * search and no AI. Used when a friend relaxes a Must match on Results (Nov 15 review:
 * "a way out of an empty result"). The caller has already checked the search is theirs.
 * Returns how many pieces now pass (approved or caveat).
 */
export async function rescoreSearch(searchId: string, userId: string): Promise<number> {
  const db = adminClient();
  const { data: s } = await db
    .from("searches")
    .select("visual_brief, composition_brief, retail_price")
    .eq("id", searchId)
    .eq("user_id", userId)
    .single();
  if (!s) return 0;
  const weights = tasteWeights(await loadTaste(db, userId));
  const anchors = ((s.visual_brief?.anchors ?? []) as AnchorDef[]).filter((a) => a && a.id);
  const fabricMustMatch = s.composition_brief?.must_match === true;

  const { data: rows } = await db
    .from("candidates")
    .select("id, checklist, price, look_score, fit_score, verdict, caveat")
    .eq("search_id", searchId)
    .eq("user_id", userId)
    .eq("stage", "judged")
    .is("drop_reason", null);

  let passing = 0;
  for (const r of rows ?? []) {
    if (!r.checklist) continue;
    const v = score(r.checklist as Checklist, anchors, weights, { fabricMustMatch, price: r.price, retailPrice: s.retail_price });
    if (v.verdict !== "rejected") passing++;
    if (v.look === r.look_score && v.fit === r.fit_score && v.verdict === r.verdict && v.caveat === r.caveat) continue;
    await db.from("candidates").update({ look_score: v.look, fit_score: v.fit, verdict: v.verdict, caveat: v.caveat }).eq("id", r.id);
  }
  return passing;
}

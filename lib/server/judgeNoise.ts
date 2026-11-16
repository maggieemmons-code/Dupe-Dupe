import "server-only";
import { adminClient, logJobCall } from "./admin";
import { loadTaste } from "./taste";
import { downloadThumb } from "./linkPhotos";
import { tasteText, tasteWeights } from "@/lib/taste";
import { runJudge, type JudgeCandidate } from "@/lib/agents/judge";
import { score, type AnchorDef, type Checklist } from "@/lib/search/score";
import { anchorKind } from "@/lib/search/anchorKind";
import { originalPhoto, pickFields } from "@/lib/inngest/searchJob";

/*
 * Judge noise (Nov 15 review): judge the same pieces twice, fresh, and count how often the
 * two answers differ. (Comparing with saved checklists mixed in older versions of the judge.) A rising number means results are getting less steady, so it
 * shows up here before friends notice. Twice a week from lib/inngest/judgeNoise.ts, or
 * by hand with scripts/judge-noise.ts. About 4 judge calls a run.
 */

const PIECES_PER_SEARCH = 5;
const SEARCHES = 2;
/** Alert when this run's rate is this many times the recent average (and at least 10%). */
const ALERT_FACTOR = 1.5;
const ALERT_FLOOR = 0.1;

const FIELDS = ["color", "silhouette", "neckline", "sleeves", "length", "surface", "extras", "polish", "fabric_tier", "size_available"] as const;

export async function measureJudgeNoise() {
  const db = adminClient();
  // Recent finished searches with enough judged pieces, two at random.
  const { data: recent } = await db
    .from("searches")
    .select("*")
    .eq("status", "done")
    .not("photo_paths", "eq", "{}")
    .order("updated_at", { ascending: false })
    .limit(20);
  const shuffled = [...(recent ?? [])].sort(() => Math.random() - 0.5);

  let compared = 0;
  let changed = 0;
  let flips = 0;
  let pieces = 0;
  const details: { search: string; title: string; changes: string[]; verdict: string }[] = [];

  for (const s of shuffled) {
    if (details.length >= SEARCHES * PIECES_PER_SEARCH || pieces >= SEARCHES * PIECES_PER_SEARCH) break;
    const { data: rows } = await db
      .from("candidates")
      .select("id, title, brand, store, price, photo_url, thumb_url, listing_text, checklist, verdict")
      .eq("search_id", s.id)
      .eq("stage", "judged")
      .not("checklist", "is", null)
      .limit(40);
    const pick = [...(rows ?? [])].sort(() => Math.random() - 0.5).slice(0, PIECES_PER_SEARCH);
    if (pick.length < PIECES_PER_SEARCH) continue;

    const taste = await loadTaste(db, s.user_id);
    const anchors = ((s.visual_brief?.anchors ?? []) as AnchorDef[])
      .filter((a) => a && a.id)
      .map((a) => ({ ...a, kind: a.kind ?? anchorKind(a.label) }));
    const [photo, ...thumbs] = await Promise.all([
      originalPhoto(s.photo_paths?.[0] ?? null),
      ...pick.map((r) => downloadThumb(r.photo_url ?? r.thumb_url ?? "", 512)),
    ]);
    const candidates: JudgeCandidate[] = pick.map((r, i) => ({
      id: `c${i + 1}`,
      title: r.title,
      brand: r.brand,
      store: r.store,
      price: r.price,
      photo: thumbs[i],
      listingText: r.listing_text ?? "",
    }));
    let result;
    let second;
    try {
      const run = () =>
        runJudge(
        {
          name: [s.brand, s.style_name].filter(Boolean).join(" "),
          anchors,
          photo,
          fields: pickFields(s),
          visualBrief: s.visual_brief,
          compositionBrief: s.composition_brief,
          sizes: s.sizes ?? [],
        },
        candidates,
        tasteText(taste),
      );
      [result, second] = await Promise.all([run(), run()]);
      for (const r of [result, second]) await logJobCall({ userId: s.user_id, searchId: s.id, service: "claude", stage: "judge-noise", units: r.usage, ok: true });
    } catch (e) {
      await logJobCall({ userId: s.user_id, searchId: s.id, service: "claude", stage: "judge-noise", ok: false, error: String(e) });
      continue;
    }

    const weights = tasteWeights(taste);
    for (const [i, r] of pick.entries()) {
      const again = second.checklists.get(`c${i + 1}`);
      const before = result.checklists.get(`c${i + 1}`) as Checklist | undefined;
      if (!again || !before) continue;
      pieces++;
      const changes: string[] = [];
      for (const f of FIELDS) {
        compared++;
        if (before[f] !== again[f]) changes.push(`${f}: ${before[f]} → ${again[f]}`);
      }
      for (const a of again.anchors) {
        const was = before.anchors?.find((x) => x.id === a.id);
        if (!was) continue;
        compared++;
        if (was.result !== a.result) changes.push(`${a.id}: ${was.result} → ${a.result}`);
      }
      changed += changes.length;
      const opts = { fabricMustMatch: s.composition_brief?.must_match === true, price: r.price, retailPrice: s.retail_price };
      const v1 = score(before, anchors, weights, opts).verdict;
      const v2 = score(again, anchors, weights, opts).verdict;
      if (v1 !== v2) flips++;
      details.push({ search: s.id, title: r.title.slice(0, 80), changes, verdict: v1 === v2 ? v1 : `${v1} → ${v2}` });
    }
  }

  const rate = compared ? changed / compared : 0;
  const { data: past } = await db.from("judge_noise").select("rate").order("created_at", { ascending: false }).limit(4);
  const avg = past?.length ? past.reduce((t, p) => t + Number(p.rate), 0) / past.length : null;
  const alert = avg != null && rate >= ALERT_FLOOR && rate > avg * ALERT_FACTOR;
  if (alert) console.error(`Judge noise is up: ${(rate * 100).toFixed(0)}% of answers changed (recent average ${(avg! * 100).toFixed(0)}%)`);

  const row = { pieces, fields_compared: compared, fields_changed: changed, verdicts_changed: flips, rate: Number(rate.toFixed(4)), alert, details };
  const { error } = await db.from("judge_noise").insert(row);
  if (error) console.error("judge_noise insert failed", error.message);
  return { ...row, recentAverage: avg };
}

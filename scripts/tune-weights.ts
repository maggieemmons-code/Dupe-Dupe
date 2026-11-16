/**
 * Weight tuning in code (Nov 15 review, "self-learning"): tries weight sets within 0.5 to 3
 * on the saved checklists of the newest search per test item, and keeps the one that ranks
 * Maggie's own good dupes highest. No AI calls and no searches. Tunes on the non-holdout
 * items and reports the holdout items (5, 6, 7, 10) separately, so a gain that only fits
 * the tuning items shows up. The same method works per friend once ratings exist (phase 7).
 *
 * Run: npx tsx --env-file=.env.local scripts/tune-weights.ts [--tries=4000] [--save]
 * Without --save it only prints; --save writes the best weights to Maggie's taste profile.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { score, WEIGHTS, type AnchorDef, type Checklist, type Weights } from "../lib/search/score";
import { tasteWeights, type TasteProfile } from "../lib/taste";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), { auth: { persistSession: false } });

type Item = { name: string; original: string; good: string[]; holdout?: boolean };
type Cand = { id: string; link: string; store_link: string | null; store_domain: string; title: string; price: number | null; checklist: Checklist };
type Case = { name: string; holdout: boolean; anchors: AnchorDef[]; fabricMustMatch: boolean; retail: number | null; cands: Cand[]; picks: Set<string> };

const pathKey = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^(www|us|en-us)\./, "")}${x.pathname.replace(/\/(en-us|us)\//, "/").replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2));

/** Her pick among the judged pieces: same page, or same store and most of the product's name. */
function findPick(good: string, cands: Cand[]) {
  const key = pathKey(good);
  const exact = cands.find((c) => pathKey(c.link) === key || (c.store_link && pathKey(c.store_link) === key));
  if (exact) return exact;
  const slug = words(new URL(good).pathname);
  const h = host(good);
  return cands.find((c) => {
    const sameStore = (c.store_domain && h.endsWith(c.store_domain.replace(/^www\./, ""))) || (c.store_link && host(c.store_link) === h);
    if (!sameStore) return false;
    const t = words(c.title);
    return [...slug].filter((w) => t.has(w)).length >= Math.max(2, Math.ceil(slug.size * 0.5));
  });
}

/** Mean reciprocal rank of her best-placed pick per item (1 = her pick is #1 everywhere). Rejected picks count 0. */
function evaluate(cases: Case[], w: Weights) {
  let sum = 0;
  let top3 = 0;
  const ranks: string[] = [];
  for (const c of cases) {
    const scored = c.cands
      .map((x) => ({ id: x.id, v: score(x.checklist, c.anchors, w, { fabricMustMatch: c.fabricMustMatch, price: x.price, retailPrice: c.retail }) }))
      .filter((x) => x.v.verdict !== "rejected")
      .sort((a, b) => b.v.look - a.v.look || b.v.fit - a.v.fit);
    const best = scored.findIndex((x) => c.picks.has(x.id));
    sum += best >= 0 ? 1 / (best + 1) : 0;
    if (best >= 0 && best < 3) top3++;
    ranks.push(best >= 0 ? `#${best + 1}` : "–");
  }
  return { mrr: cases.length ? sum / cases.length : 0, top3, ranks };
}

async function main() {
  const tries = Number(process.argv.find((a) => a.startsWith("--tries="))?.split("=")[1] ?? 4000);
  const save = process.argv.includes("--save");
  const { items } = JSON.parse(fs.readFileSync("tests/test-set.json", "utf8")) as { items: Item[] };
  const { data: me } = await db.from("profiles").select("id").eq("is_admin", true).limit(1).single();
  const { data: t } = await db.from("taste_profiles").select("rules, weights").eq("user_id", me!.id).maybeSingle();
  const current = tasteWeights((t as TasteProfile | null) ?? null);

  const cases: Case[] = [];
  for (const [i, item] of items.entries()) {
    const { data } = await db
      .from("searches")
      .select("id, visual_brief, composition_brief, retail_price")
      .eq("user_id", me!.id)
      .contains("source_links", [item.original])
      .eq("status", "done")
      .order("updated_at", { ascending: false })
      .limit(1);
    const s = data?.[0];
    if (!s) continue;
    const { data: rows } = await db
      .from("candidates")
      .select("id, link, store_link, store_domain, title, price, checklist")
      .eq("search_id", s.id)
      .eq("stage", "judged")
      .is("drop_reason", null)
      .not("checklist", "is", null);
    const cands = (rows ?? []) as Cand[];
    const picks = new Set(item.good.map((g) => findPick(g, cands)?.id).filter((x): x is string => !!x));
    if (!picks.size) {
      console.log(`${i + 1}. ${item.name}: none of her picks were judged; left out`);
      continue;
    }
    cases.push({
      name: `${i + 1}. ${item.name}`,
      holdout: !!item.holdout,
      anchors: ((s.visual_brief?.anchors ?? []) as AnchorDef[]).filter((a) => a && a.id),
      fabricMustMatch: s.composition_brief?.must_match === true,
      retail: s.retail_price,
      cands,
      picks,
    });
  }
  const tune = cases.filter((c) => !c.holdout);
  const hold = cases.filter((c) => c.holdout);
  console.log(`\nTuning on ${tune.length} items, checking on ${hold.length} holdout items.`);

  // Random search around the current weights, then small steps on each weight.
  const keys = Object.keys(WEIGHTS) as (keyof Weights)[];
  const clamp = (v: number) => Math.round(Math.min(3, Math.max(0.5, v)) * 4) / 4;
  let best = { w: current, ...evaluate(tune, current) };
  for (let n = 0; n < tries; n++) {
    const w = { ...best.w };
    for (const k of keys) if (Math.random() < 0.4) w[k] = clamp(w[k] + (Math.random() - 0.5) * 1.5);
    const r = evaluate(tune, w);
    if (r.mrr > best.mrr + 1e-9) best = { w, ...r };
  }
  for (const k of keys) {
    for (const d of [-0.25, 0.25]) {
      const w = { ...best.w, [k]: clamp(best.w[k] + d) };
      const r = evaluate(tune, w);
      if (r.mrr > best.mrr + 1e-9) best = { w, ...r };
    }
  }

  const show = (label: string, w: Weights) => {
    const a = evaluate(tune, w);
    const b = evaluate(hold, w);
    console.log(`${label.padEnd(9)} tuning: score ${a.mrr.toFixed(2)}, her pick in top 3 for ${a.top3}/${tune.length} (${a.ranks.join(" ")}) · holdout: ${b.mrr.toFixed(2)}, top 3 ${b.top3}/${hold.length} (${b.ranks.join(" ")})`);
  };
  show("Current", current);
  show("Best", best.w);
  console.log("\nWeight changes:");
  for (const k of keys) if (best.w[k] !== current[k]) console.log(`  ${k}: ${current[k]} → ${best.w[k]}`);

  const holdNow = evaluate(hold, current).mrr;
  const holdBest = evaluate(hold, best.w).mrr;
  if (save) {
    if (holdBest < holdNow) {
      console.log("\nNot saved: the holdout items got worse, so the gain only fits the tuning items.");
      return;
    }
    const changed = Object.fromEntries(keys.filter((k) => best.w[k] !== WEIGHTS[k]).map((k) => [k, best.w[k]]));
    const { error } = await db.from("taste_profiles").update({ weights: changed, updated_at: new Date().toISOString() }).eq("user_id", me!.id);
    console.log(error ? `\nSaving failed: ${error.message}` : "\nSaved to Maggie's taste profile. Rescore searches with scripts/rescore.ts <id> --save.");
  } else {
    console.log("\n(Not saved. Add --save to write the best weights to Maggie's taste profile; it refuses if the holdout gets worse.)");
  }
}

main();

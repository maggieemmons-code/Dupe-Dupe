/**
 * Calibration review (Maggie, Nov 15): where do her own good picks lose, and why?
 * For each test item it re-asks the screener and the judge about her picks and the
 * pieces that beat them (with her taste rules), then sends everything (instructions,
 * rules, weights, photos, ratings, checklists) to ANTHROPIC_REVIEW_MODEL and asks for
 * a diagnosis and specific fixes. Writes tests/calibration.json and tests/calibration.md.
 * Nothing is changed in the app; Maggie reviews the proposed fixes first.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/calibrate.ts [item numbers]
 */
import { readFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { downloadThumb, pickProductPhotos } from "../lib/server/linkPhotos";
import { fetchPages } from "../lib/server/tinyfish";
import { parseToolInput } from "../lib/agents/parseToolInput";
import { runScreener, SYSTEM_PROMPT as SCREENER_PROMPT } from "../lib/agents/screener";
import { runJudge, SYSTEM_PROMPT as JUDGE_PROMPT } from "../lib/agents/judge";
import { score, type AnchorDef } from "../lib/search/score";
import { anchorKind } from "../lib/search/anchorKind";
import { tasteText, tasteWeights, type TasteProfile } from "../lib/taste";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

type Item = { name: string; original: string; good: string[]; note?: string };
type Piece = { label: string; title: string; store: string; price: number | null; photo: Buffer | null; listing: string; was: string };

const pathKey = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^(www2?|us|en-us)\./, "")}${x.pathname.replace(/\/(en-us|us)\//, "/").replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^(www2?|us|en-us)\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2));
const small = async (b: Buffer | null) => (b ? sharp(b).resize({ width: 384, height: 384, fit: "inside" }).jpeg({ quality: 75 }).toBuffer() : null);

const TOOL = {
  name: "submit_calibration",
  description: "Diagnose where the shopper's picks lose and propose specific fixes.",
  input_schema: {
    type: "object" as const,
    required: ["per_item", "screener_changes", "judge_changes", "rule_changes", "weight_changes", "summary"],
    properties: {
      per_item: {
        type: "array",
        items: {
          type: "object",
          required: ["item", "where_lost", "why"],
          properties: {
            item: { type: "integer" },
            where_lost: { type: "string", description: "screener, judge, scoring, or not lost" },
            why: { type: "string", description: "The specific misreading, in one or two sentences" },
          },
        },
      },
      screener_changes: { type: "array", items: { type: "object", required: ["change", "why"], properties: { change: { type: "string", description: "Exact wording to add, replace or remove in the screener's instructions" }, why: { type: "string" } } } },
      judge_changes: { type: "array", items: { type: "object", required: ["change", "why"], properties: { change: { type: "string", description: "Exact wording to add, replace or remove in the judge's instructions, or a checklist item to add or change" }, why: { type: "string" } } } },
      rule_changes: { type: "array", items: { type: "object", required: ["change", "why"], properties: { change: { type: "string", description: "A taste rule to reword, add or drop, with the new wording" }, why: { type: "string" } } } },
      weight_changes: { type: "array", items: { type: "object", required: ["weight", "to", "why"], properties: { weight: { type: "string" }, to: { type: "number" }, why: { type: "string" } } } },
      summary: { type: "string", description: "Three or four plain sentences for the shopper: what's going wrong and what the fixes do" },
    },
  },
};

const SYSTEM = `You are calibrating a dupe finder for one shopper. A fast SCREENER rates every candidate 1 to 5 from small photos; the best go to a JUDGE that fills a checklist; code turns the checklist into look and fit scores with weights. The shopper gave, for each test item, dupes she considers good. Her picks keep losing to pieces she wouldn't choose.

For each item you see the original, her picks and the pieces that beat them, with photos, the screener's rating and note, and the judge's checklist and scores, all run with her taste rules. Find exactly where each of her picks lost (screener, judge or scoring) and what was misread. Look closely at the photos: line, proportion, how fabric falls and reflects light, how the neckline and bodice sit, finish.

Then propose specific, general fixes that would have ranked her picks higher without letting worse pieces through: exact wording for the screener's and judge's instructions, taste rules to reword, add or drop, checklist changes, and weights (each between 0.5 and 3). Fixes must generalize to garments beyond these ten; don't name these items in them. Prefer few, high-leverage changes.

Call submit_calibration exactly once.`;

async function main() {
  const pick = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const { items } = JSON.parse(readFileSync("tests/test-set.json", "utf8")) as { items: Item[] };
  const { data: me } = await db.from("profiles").select("id").eq("is_admin", true).limit(1).single();
  const { data: t } = await db.from("taste_profiles").select("rules, weights").eq("user_id", me!.id).maybeSingle();
  const taste = (t as TasteProfile | null) ?? null;
  const rules = tasteText(taste);
  const weights = tasteWeights(taste);

  const image = (buf: Buffer): Anthropic.Beta.BetaImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: `SCREENER INSTRUCTIONS:\n${SCREENER_PROMPT}\n\nJUDGE INSTRUCTIONS:\n${JUDGE_PROMPT}\n\nSHOPPER'S TASTE RULES:\n${rules}\n\nWEIGHTS: ${JSON.stringify(weights)}\nScoring: match/pass 1, close/partial 0.5, different/fail 0, cannot_see 0.5; fabric target 1, swap 0.6, unknown 0.5, dealbreaker 0; polish as_polished 1, slightly_less 0.5, looks_cheap 0, cannot_tell 0.5; extras none 1, minor 0.5, changes_look 0. Look = signature details, silhouette, neckline, sleeves, length, color, surface, extras, polish. Fit = fabric, surface, size. Rejected: the original's brand, its photo, resale, a price at or above the original, a failed must-match shape (a material only when Fabric must match is on), or look < 40. No price can't be approved.`,
    },
  ];

  for (const [i, item] of items.entries()) {
    if (pick.length && !pick.includes(i + 1)) continue;
    const { data: s } = await db
      .from("searches")
      .select("id, brand, style_name, retail_price, photo_paths, visual_brief, composition_brief, color, category, neckline, hem, fabrics, weave, details")
      .contains("source_links", [item.original])
      .not("brief_built_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!s?.photo_paths?.[0]) continue;
    const { data: cands } = await db
      .from("candidates")
      .select("id, store, store_domain, title, price, link, store_link, photo_url, thumb_url, listing_text, verdict, look_score, fit_score, stage, drop_reason")
      .eq("search_id", s.id);
    const all = cands ?? [];

    const hers: Piece[] = [];
    const herIds = new Set<string>();
    const unread: string[] = [];
    for (const g of item.good) {
      const key = pathKey(g);
      const slug = words(new URL(g).pathname);
      const c =
        all.find((x) => pathKey(x.link) === key || (x.store_link && pathKey(x.store_link) === key)) ??
        all.find((x) => {
          const same = (x.store_domain && host(g).endsWith(x.store_domain.replace(/^www\./, ""))) || (x.store_link && host(x.store_link) === host(g));
          if (!same) return false;
          const tw = words(x.title);
          return [...slug].filter((w) => tw.has(w)).length >= Math.max(2, Math.ceil(slug.size * 0.5));
        });
      if (c && (c.photo_url || c.thumb_url)) {
        herIds.add(c.id);
        hers.push({
          label: "HER PICK",
          title: c.title,
          store: c.store,
          price: c.price,
          photo: await small(await downloadThumb(c.photo_url ?? c.thumb_url ?? "", 512)),
          listing: c.listing_text ?? "",
          was: c.stage === "judged" ? `judged L${c.look_score} F${c.fit_score} ${c.verdict}` : `lost: ${c.drop_reason ?? c.stage}`,
        });
      } else unread.push(g);
    }
    if (unread.length) {
      try {
        const { pages } = await fetchPages(unread, "Read a clothing product page: name, price, fabric, photos", 25000);
        for (const pg of pages) {
          const img = pickProductPhotos(pg, 1)[0];
          if (img) hers.push({ label: "HER PICK", title: pg.title || pg.url, store: host(pg.url), price: null, photo: await small(await downloadThumb(img, 512)), listing: pg.text.slice(0, 1500), was: "never found by the search" });
        }
      } catch {
        /* skip */
      }
    }
    if (!hers.length) continue;
    const winners = all
      .filter((c) => c.stage === "judged" && c.verdict !== "rejected" && !c.drop_reason && !herIds.has(c.id))
      .sort((a, b) => (b.look_score ?? 0) - (a.look_score ?? 0))
      .slice(0, 3);
    const beat: Piece[] = [];
    for (const c of winners) {
      beat.push({ label: "BEAT HER", title: c.title, store: c.store, price: c.price, photo: await small(await downloadThumb(c.photo_url ?? c.thumb_url ?? "", 512)), listing: c.listing_text ?? "", was: `judged L${c.look_score} F${c.fit_score} ${c.verdict}` });
    }
    const pieces = [...hers, ...beat];

    // Fresh screener and judge answers for exactly these pieces, with her rules.
    const { data: blob } = await db.storage.from("photos").download(s.photo_paths[0]);
    const original = blob ? await small(Buffer.from(await blob.arrayBuffer())) : null;
    const fields = { brand: s.brand, style_name: s.style_name, category: s.category, color: s.color, neckline: s.neckline, hem: s.hem, fabrics: s.fabrics, weave: s.weave, details: s.details, retail_price: s.retail_price };
    const anchors = ((s.visual_brief?.anchors ?? []) as AnchorDef[]).filter((a) => a && a.id).map((a) => ({ ...a, kind: a.kind ?? anchorKind(a.label) }));
    const screen = await runScreener(
      { name: `${s.brand} ${s.style_name}`, fields, visualBrief: s.visual_brief, photo: original },
      pieces.map((p, n) => ({ n: n + 1, title: p.title, brand: "", store: p.store, price: p.price, photo: p.photo })),
      rules,
    );
    const judged = await runJudge(
      { name: `${s.brand} ${s.style_name}`, anchors, photo: original, fields, visualBrief: s.visual_brief, compositionBrief: s.composition_brief, sizes: [] },
      pieces.map((p, n) => ({ id: `c${n + 1}`, title: p.title, brand: "", store: p.store, price: p.price, photo: p.photo, listingText: p.listing })),
      rules,
    );

    content.push({ type: "text", text: `\n=== ITEM ${i + 1}: ${s.brand} ${s.style_name} · $${s.retail_price ?? "?"}${item.note ? ` · her note: ${item.note}` : ""}\nSignature details: ${JSON.stringify(anchors)}\nORIGINAL:` });
    if (original) content.push(image(original));
    for (const [n, p] of pieces.entries()) {
      const r = screen.picks.find((x) => x.n === n + 1);
      const c = judged.checklists.get(`c${n + 1}`);
      const v = c ? score(c, anchors, weights, { fabricMustMatch: s.composition_brief?.must_match === true, price: p.price, retailPrice: s.retail_price }) : null;
      content.push({
        type: "text",
        text: `${p.label}: ${p.title} · ${p.store} · ${p.price != null ? `$${p.price}` : "price not shown"} · in the search: ${p.was}\nscreener now: ${r ? `${r.score}/5 "${r.note}"` : "no rating"}\njudge now: ${v ? `L${v.look} F${v.fit} ${v.verdict}${v.caveat ? ` (${v.caveat})` : ""}` : "no checklist"}${c ? `\nchecklist: ${JSON.stringify(c)}` : ""}`,
      });
      if (p.photo) content.push(image(p.photo));
    }
    console.log(`Item ${i + 1}: ${hers.length} of her picks, ${beat.length} that beat them`);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() });
  const model = process.env.ANTHROPIC_REVIEW_MODEL;
  if (!model) throw new Error("ANTHROPIC_REVIEW_MODEL is not set");
  const res = await client.beta.messages.create({ model, max_tokens: 12000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] });
  const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
  const out = parseToolInput<Record<string, unknown>>(call?.input) ?? { text: res.content.map((b) => (b.type === "text" ? b.text : "")).join("\n") };
  writeFileSync("tests/calibration.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`\n${model}: ${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens`);
}

main();

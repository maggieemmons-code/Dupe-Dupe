/**
 * Builds a calibration packet Maggie can paste into Claude (Fable) herself:
 * calibration-packet/prompt.md (all the text) and one labeled picture per test item
 * (original, her picks, the pieces that beat them). Uses the latest saved results; no
 * AI calls. The folder is git-ignored.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/calibration-packet.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { downloadThumb } from "../lib/server/linkPhotos";
import { SYSTEM_PROMPT as SCREENER_PROMPT } from "../lib/agents/screener";
import { SYSTEM_PROMPT as JUDGE_PROMPT } from "../lib/agents/judge";
import { tasteText, tasteWeights, type TasteProfile } from "../lib/taste";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});
const OUT = "calibration-packet";

type Item = { name: string; original: string; good: string[]; note?: string };
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
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const W = 300;
const H = 400;
const LABEL = 56;

async function tile(photo: Buffer | null, label: string, sub: string) {
  const img = photo
    ? await sharp(photo).resize({ width: W - 20, height: H - 20, fit: "contain", background: "#f3f3f3" }).toBuffer()
    : await sharp({ create: { width: W - 20, height: H - 20, channels: 3, background: "#f3f3f3" } }).png().toBuffer();
  const svg = Buffer.from(
    `<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${label.startsWith("HER") ? "#0a0a0a" : label === "ORIGINAL" ? "#6b6b6b" : "#ffffff"}"/>` +
      `<text x="10" y="22" font-family="Helvetica, Arial" font-size="16" font-weight="700" fill="${label.startsWith("HER") || label === "ORIGINAL" ? "#ffffff" : "#0a0a0a"}">${esc(label)}</text>` +
      `<text x="10" y="44" font-family="Helvetica, Arial" font-size="13" fill="${label.startsWith("HER") || label === "ORIGINAL" ? "#ffffff" : "#4a4a4a"}">${esc(sub.slice(0, 40))}</text></svg>`,
  );
  return sharp({ create: { width: W, height: H + LABEL, channels: 3, background: "#ffffff" } })
    .composite([
      { input: img, top: 10, left: 10 },
      { input: svg, top: H, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { items } = JSON.parse(readFileSync("tests/test-set.json", "utf8")) as { items: Item[] };
  const { data: me } = await db.from("profiles").select("id").eq("is_admin", true).limit(1).single();
  const { data: t } = await db.from("taste_profiles").select("rules, weights").eq("user_id", me!.id).maybeSingle();
  const taste = (t as TasteProfile | null) ?? null;

  const md: string[] = [
    `I'm building Dupe Dupe, an app that finds cheaper dupes of clothes I love. A search goes: gather candidates (Google Lens, Google Shopping, Amazon) → a fast SCREENER (a small AI model) rates every candidate 1 to 5 from small photos → the best 45 go to a JUDGE (a stronger model) that fills a fixed checklist → code turns the checklist into Look and Fit scores (0–100) with weights, and a verdict (approved, caveat, rejected).`,
    ``,
    `For 10 test items I picked dupes I consider good. My picks keep losing to pieces I wouldn't choose. I've attached one picture per item: ORIGINAL (gray label), HER PICK (black label: my picks), BEAT HER (white label: pieces the app ranked above mine), in the order listed below.`,
    ``,
    `Please: (1) for each item, find exactly where my picks lost (screener, judge or scoring) and what was misread, looking closely at the photos: line, proportion, how fabric falls and reflects light, how the neckline and bodice sit, finish. (2) Propose specific, general fixes that would rank my picks higher without letting worse pieces through: exact wording to add, replace or remove in the screener's and judge's instructions; taste rules to reword, add or drop; checklist changes; and weights (each between 0.5 and 3). Fixes must work for garments beyond these ten, so don't name these items in them. Prefer a few high-leverage changes. (3) End with a short plain-language summary.`,
    ``,
    `## Screener's instructions`,
    "```",
    SCREENER_PROMPT,
    "```",
    ``,
    `## Judge's instructions`,
    "```",
    JUDGE_PROMPT,
    "```",
    ``,
    `## My taste rules (put into both, where it says "Shopper's taste rules")`,
    tasteText(taste),
    ``,
    `## Scoring (code)`,
    `Weights: ${JSON.stringify(tasteWeights(taste))}. Points: match/pass 1, close/partial 0.5, different/fail 0, cannot_see 0.5; fabric target 1, swap 0.6, unknown 0.5, dealbreaker 0; polish as_polished 1, slightly_less 0.5, looks_cheap 0, cannot_tell 0.5; extras none 1, minor 0.5, changes_look 0; size yes 1, unknown 0.5, no 0. Look = signature details (anchors), silhouette, neckline, sleeves, length, color, surface, extras, polish. Fit = fabric, surface, size. Rejected: the original's brand, its photo, resale, a price at or above the original, a failed must-match shape (a material only when "Fabric must match" is on), or Look < 40. No price can't be approved.`,
  ];

  let n = 0;
  for (const [i, item] of items.entries()) {
    const { data: s } = await db
      .from("searches")
      .select("id, brand, style_name, retail_price, photo_paths, visual_brief")
      .contains("source_links", [item.original])
      .not("brief_built_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!s?.photo_paths?.[0]) continue;
    const { data: cands } = await db
      .from("candidates")
      .select("id, store, store_domain, title, price, link, store_link, photo_url, thumb_url, listing_text, verdict, look_score, fit_score, caveat, judge_note, checklist, stage, drop_reason, screen_note")
      .eq("search_id", s.id);
    const all = cands ?? [];
    const hers = [];
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
      hers.push({ g, c });
    }
    const found = hers.filter((h) => h.c && (h.c.photo_url || h.c.thumb_url));
    if (!found.length) continue;
    const herIds = new Set(found.map((h) => h.c!.id));
    const beat = all
      .filter((c) => c.stage === "judged" && c.verdict !== "rejected" && !c.drop_reason && !herIds.has(c.id))
      .sort((a, b) => (b.look_score ?? 0) - (a.look_score ?? 0))
      .slice(0, 3);

    n++;
    md.push(``, `## Item ${i + 1} (picture ${n}): ${s.brand} ${s.style_name} · $${s.retail_price ?? "?"}${item.note ? ` · my note: ${item.note}` : ""}`);
    md.push(`Signature details: ${(s.visual_brief?.anchors ?? []).map((a: { label: string; dealbreaker?: boolean }) => `${a.label}${a.dealbreaker ? " (must match)" : ""}`).join(" · ") || "none"}`);
    const tiles: Buffer[] = [];
    const { data: blob } = await db.storage.from("photos").download(s.photo_paths[0]);
    tiles.push(await tile(blob ? Buffer.from(await blob.arrayBuffer()) : null, "ORIGINAL", `${s.brand}`));
    for (const h of hers) {
      if (!h.c) {
        md.push(`- MY PICK, never found by the search: ${h.g}`);
        continue;
      }
      const c = h.c;
      const state = c.stage === "judged" ? `judged Look ${c.look_score} / Fit ${c.fit_score}, ${c.verdict}${c.caveat ? ` (${c.caveat})` : ""}` : `lost before the judge: ${c.drop_reason ?? c.stage}`;
      md.push(`- MY PICK: ${c.title} · ${c.store} · ${c.price != null ? `$${c.price}` : "price not shown"} · ${state}${c.judge_note ? ` · judge: "${c.judge_note}"` : ""}${c.checklist ? `\n  checklist: ${JSON.stringify(c.checklist)}` : ""}`);
      if (c.photo_url || c.thumb_url) tiles.push(await tile(await downloadThumb(c.photo_url ?? c.thumb_url ?? "", 512), "HER PICK", c.store));
    }
    for (const c of beat) {
      md.push(`- BEAT MY PICKS: ${c.title} · ${c.store} · ${c.price != null ? `$${c.price}` : "price not shown"} · Look ${c.look_score} / Fit ${c.fit_score}, ${c.verdict}${c.caveat ? ` (${c.caveat})` : ""}${c.checklist ? `\n  checklist: ${JSON.stringify(c.checklist)}` : ""}`);
      tiles.push(await tile(await downloadThumb(c.photo_url ?? c.thumb_url ?? "", 512), "BEAT HER", c.store));
    }
    const sheet = await sharp({ create: { width: W * tiles.length, height: H + LABEL, channels: 3, background: "#ffffff" } })
      .composite(tiles.map((input, k) => ({ input, top: 0, left: k * W })))
      .jpeg({ quality: 82 })
      .toBuffer();
    writeFileSync(`${OUT}/${String(n).padStart(2, "0")}-item-${i + 1}.jpg`, sheet);
    console.log(`Item ${i + 1}: picture ${n}, ${tiles.length} tiles`);
  }
  writeFileSync(`${OUT}/prompt.md`, md.join("\n"));
  console.log(`\nWrote ${OUT}/prompt.md (${md.join("\n").length} characters) and ${n} pictures.`);
}

main();

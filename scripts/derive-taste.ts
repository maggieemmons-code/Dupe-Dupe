/**
 * Learns Maggie's eye from her test set: for each item, shows Claude the original, her
 * good dupes and the judge's own top picks (photos, prices, and the judge's checklist
 * answers), and asks what her picks share that the others lack. Writes a draft list of
 * taste rules to tests/taste-draft.json for Maggie to read and edit. One Claude call.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/derive-taste.ts
 */
import { readFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { downloadThumb, pickProductPhotos } from "../lib/server/linkPhotos";
import { fetchPages } from "../lib/server/tinyfish";
import { parseToolInput } from "../lib/agents/parseToolInput";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

type Item = { name: string; original: string; good: string[]; note?: string };
type Cand = {
  id: string;
  store: string;
  store_domain: string;
  title: string;
  price: number | null;
  link: string;
  store_link: string | null;
  photo_url: string | null;
  thumb_url: string | null;
  verdict: string | null;
  look_score: number | null;
  fit_score: number | null;
  checklist: unknown;
  stage: string;
  drop_reason: string | null;
};

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

const TOOL = {
  name: "submit_taste",
  description: "Submit what the shopper's own picks reveal about her eye.",
  input_schema: {
    type: "object" as const,
    required: ["per_item", "rules"],
    properties: {
      per_item: {
        type: "array",
        items: {
          type: "object",
          required: ["item", "her_picks_share", "judge_missed"],
          properties: {
            item: { type: "integer" },
            her_picks_share: { type: "string", description: "What her picks have in common with the original that the judge's picks don't" },
            judge_missed: { type: "string", description: "What the judge over- or under-valued, in one or two sentences" },
          },
        },
      },
      rules: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          required: ["rule", "kind", "evidence"],
          properties: {
            rule: { type: "string", description: "One plain sentence a screener or judge can apply to any garment" },
            kind: { type: "string", enum: ["prefer", "avoid", "matters_more", "matters_less"] },
            evidence: { type: "array", items: { type: "integer" }, description: "Item numbers that show it" },
          },
        },
      },
      weight_changes: {
        type: "array",
        items: {
          type: "object",
          required: ["item", "direction", "why"],
          properties: {
            item: { type: "string", enum: ["anchor", "color", "silhouette", "neckline", "length", "sleeves", "sheen", "polish", "fabric", "size"] },
            direction: { type: "string", enum: ["up", "down"] },
            why: { type: "string" },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are helping a dupe finder learn one shopper's eye. For each test item you see her ORIGINAL, the dupes SHE picked as good, and the JUDGE's top picks, with photos, prices and the judge's checklist answers.

Work out what her picks share, visually first and then in fabric and finish, that the judge's picks lack, and where the judge's checklist over- or under-valued something. Look at the photos closely: overall line and proportion, how the neckline and bodice sit, drape, texture and sheen, how expensive it looks, detail placement, color depth.

Then write up to 10 taste rules: plain sentences any screener or judge could apply to a new garment, each backed by the items that show it. Only write a rule that at least two items support. Don't restate the obvious ("it should look like the original"); say what she weighs differently. Also say which checklist weights should go up or down, if any.

Call submit_taste exactly once.`;

async function photo(url: string | null) {
  if (!url) return null;
  const b = await downloadThumb(url, 384);
  return b ? await sharp(b).jpeg({ quality: 75 }).toBuffer() : null;
}

async function main() {
  const { items } = JSON.parse(readFileSync("tests/test-set.json", "utf8")) as { items: Item[] };
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const image = (buf: Buffer): Anthropic.Beta.BetaImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } });
  let used = 0;

  for (const [i, item] of items.entries()) {
    const { data: s } = await db
      .from("searches")
      .select("id, brand, style_name, retail_price, photo_paths, visual_brief")
      .contains("source_links", [item.original])
      .not("brief_built_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!s) continue;
    const { data } = await db
      .from("candidates")
      .select("id, store, store_domain, title, price, link, store_link, photo_url, thumb_url, verdict, look_score, fit_score, checklist, stage, drop_reason")
      .eq("search_id", s.id);
    const all = (data ?? []) as Cand[];

    // Her picks, as found among the candidates; the rest read from their own pages.
    const hers: Cand[] = [];
    const notFound: string[] = [];
    for (const g of item.good) {
      const key = pathKey(g);
      const slug = words(new URL(g).pathname);
      const found =
        all.find((c) => pathKey(c.link) === key || (c.store_link && pathKey(c.store_link) === key)) ??
        all.find((c) => {
          const same = (c.store_domain && host(g).endsWith(c.store_domain.replace(/^www\./, ""))) || (c.store_link && host(c.store_link) === host(g));
          if (!same) return false;
          const t = words(c.title);
          return [...slug].filter((w) => t.has(w)).length >= Math.max(2, Math.ceil(slug.size * 0.5));
        });
      if (found && (found.photo_url || found.thumb_url)) hers.push(found);
      else notFound.push(g);
    }
    if (notFound.length) {
      try {
        const { pages } = await fetchPages(notFound, "Read a clothing product page: name, price, photos", 25000);
        for (const pg of pages) {
          const img = pickProductPhotos(pg, 1)[0];
          if (!img) continue;
          hers.push({
            id: `page-${pg.url}`, store: host(pg.url), store_domain: host(pg.url), title: pg.title || pg.url, price: null, link: pg.url,
            store_link: null, photo_url: img, thumb_url: null, verdict: null, look_score: null, fit_score: null, checklist: null,
            stage: "not found by the search", drop_reason: null,
          });
        }
      } catch {
        /* pages that can't be read are left out */
      }
    }
    if (!hers.length) continue;
    const herIds = new Set(hers.map((h) => h.id));
    const judges = all
      .filter((c) => c.stage === "judged" && c.verdict !== "rejected" && !c.drop_reason && !herIds.has(c.id))
      .sort((a, b) => (b.look_score ?? 0) - (a.look_score ?? 0))
      .slice(0, 3);

    content.push({ type: "text", text: `\n=== ITEM ${i + 1}: ${item.name} · ${s.brand} ${s.style_name} · $${s.retail_price ?? "?"}${item.note ? ` · her note: ${item.note}` : ""}\nSignature details: ${JSON.stringify((s.visual_brief?.anchors ?? []).map((a: { label: string }) => a.label))}\nORIGINAL:` });
    if (s.photo_paths?.[0]) {
      const { data: blob } = await db.storage.from("photos").download(s.photo_paths[0]);
      if (blob) {
        content.push(image(await sharp(Buffer.from(await blob.arrayBuffer())).resize({ width: 384, height: 384, fit: "inside" }).jpeg({ quality: 75 }).toBuffer()));
        used++;
      }
    }
    for (const [label, list] of [["HER PICK", hers], ["JUDGE'S PICK", judges]] as const) {
      for (const c of list) {
        const p = await photo(c.photo_url ?? c.thumb_url);
        content.push({
          type: "text",
          text: `${label}: ${c.title} · ${c.store} · ${c.price != null ? `$${c.price}` : "price not shown"} · judge ${c.look_score != null ? `L${c.look_score} F${c.fit_score} ${c.verdict}` : `not judged (${c.drop_reason ?? c.stage})`}${c.checklist ? `\nchecklist: ${JSON.stringify(c.checklist)}` : ""}`,
        });
        if (p) {
          content.push(image(p));
          used++;
        }
      }
    }
    console.log(`Item ${i + 1}: ${hers.length} of her picks, ${judges.length} judge picks`);
  }
  console.log(`${used} photos`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() });
  const res = await client.beta.messages.create({
    model: process.env.ANTHROPIC_JUDGE_MODEL!,
    max_tokens: 6000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  });
  const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
  const out = parseToolInput<Record<string, unknown>>(call?.input);
  writeFileSync("tests/taste-draft.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`\n${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens`);
}

main();

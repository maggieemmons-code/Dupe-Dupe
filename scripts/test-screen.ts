/**
 * Runs the cleaning step and the new-items screener on saved SerpApi results,
 * with no database: a cheap way to tune both without spending searches.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-screen.ts <folder with lens.json, shopping.json, amazon.json> [budget]
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { cleanCandidates } from "../lib/search/clean";
import { runScreener } from "../lib/agents/screener";
import { downloadThumb, downloadPhoto } from "../lib/server/linkPhotos";

const dir = process.argv[2];
const budget = Number(process.argv[3] ?? 300);

type Raw = Record<string, unknown>;
const load = (f: string) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : {});
const num = (v: unknown) => (v == null ? null : Number(String(v).replace(/[^0-9.]/g, "")) || null);

async function main() {
  const rows: Parameters<typeof cleanCandidates>[0] & { source: string; position: number; thumb: string | null }[] = [];
  let i = 0;
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  for (const m of (load("lens.json").visual_matches ?? []) as Raw[]) {
    const price = (m.price as Raw | undefined)?.currency === "$" ? num((m.price as Raw).extracted_value) : null;
    const domain = host(String(m.link));
    rows.push({ id: `L${i++}`, kind: /realreal|posh|depop|ebay|volte|pickle/i.test(domain + m.source) ? "secondhand" : "new", title: String(m.title), store: String(m.source), store_domain: domain, link: String(m.link), photo_url: (m.image as string) ?? null, price, in_stock: (m.in_stock as boolean) ?? null, size: "", source: "lens", position: Number(m.position), thumb: (m.thumbnail as string) ?? null });
  }
  for (const r of (load("shopping.json").shopping_results ?? []) as Raw[]) {
    rows.push({ id: `S${i++}`, kind: "new", title: String(r.title), store: String(r.source), store_domain: "", link: String(r.product_link), photo_url: (r.thumbnail as string) ?? null, price: num(r.extracted_price), in_stock: null, size: "", source: "shopping", position: Number(r.position), thumb: (r.thumbnail as string) ?? null });
  }
  for (const r of (load("amazon.json").organic_results ?? []) as Raw[]) {
    rows.push({ id: `A${i++}`, kind: "new", title: String(r.title), store: "Amazon", store_domain: "amazon.com", link: String(r.link_clean ?? r.link), photo_url: (r.thumbnail as string) ?? null, price: num(r.extracted_price), in_stock: null, size: "", source: "amazon", position: Number(r.position), thumb: (r.thumbnail as string) ?? null });
  }

  const results = cleanCandidates(rows, { budget, brand: "Sau Lee", styleName: "Joanna Jacquard Gown", sizes: ["4"], hiddenStores: [], secondhandOn: false });
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.drop_reason ?? "kept"] = (reasons[r.drop_reason ?? "kept"] ?? 0) + 1;
  console.log(`Gathered ${rows.length}:`, reasons);

  const kept = rows.filter((r) => results.find((x) => x.id === r.id && !x.drop_reason));
  const bySource = new Map<string, typeof kept>();
  for (const r of kept.sort((a, b) => a.position - b.position)) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
  const order: typeof kept = [];
  const lists = [...bySource.values()];
  for (let k = 0; order.length < kept.length; k++) for (const l of lists) if (l[k]) order.push(l[k]);

  const original = await downloadPhoto("https://www.sau-lee.com/cdn/shop/files/RS27_D1_JoannaGown-RedDate_01.jpg?v=1791430637");
  const fields = { brand: "Sau Lee", style_name: "Joanna Jacquard Gown", category: "Dress", color: "Red", color_name: "Red Date", fabrics: ["Polyester"], weave: "Jacquard", neckline: "Off-shoulder", hem: "Maxi / floor", details: ["Boned / corset bodice"], retail_price: 750, budget };
  const visualBrief = { anchors: [{ label: "Off-shoulder neckline", dealbreaker: true }, { label: "Red floral jacquard", dealbreaker: false }, { label: "Structured boned bodice", dealbreaker: false }] };

  let picked = 0;
  for (let b = 0; b < 3 && picked < 10; b++) {
    const batch = order.slice(b * 20, b * 20 + 20);
    if (!batch.length) break;
    const thumbs = await Promise.all(batch.map((r) => downloadThumb(r.thumb ?? r.photo_url ?? "")));
    const items = batch.map((r, n) => ({ n: n + 1, title: r.title, brand: "", store: r.store, price: r.price, photo: thumbs[n] }));
    const { picks, usage } = await runScreener({ name: "Sau Lee Joanna Jacquard Gown", fields, visualBrief, photo: original }, items, Math.min(6, 10 - picked));
    console.log(`\nBatch ${b + 1}: ${batch.length} items, ${thumbs.filter(Boolean).length} photos, ${usage.input_tokens} in / ${usage.output_tokens} out tokens`);
    for (const p of picks) {
      const r = batch[p.n - 1];
      console.log(`  ✓ [${r.source}] ${r.store} · $${r.price} · ${r.title.slice(0, 60)} · ${p.color_match} · ${p.note}`);
    }
    picked += picks.length;
  }
  console.log(`\nPicked ${picked}`);
}

main();

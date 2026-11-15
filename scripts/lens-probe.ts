/**
 * Tries Google Lens several ways on a test item's photos and reports which of
 * Maggie's good dupes each way finds (by store web address), plus how many
 * results have a price. 1 SerpApi search per try.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/lens-probe.ts <item number> [types…]
 * types: visual, visual-q, products, all, exact (default: visual visual-q products)
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});
const key = process.env.SERPAPI_API_KEY!.trim();
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^(www2?|us|en-us)\./, "");
  } catch {
    return "";
  }
};

async function main() {
  const [n, ...types] = process.argv.slice(2);
  const item = JSON.parse(readFileSync("tests/test-set.json", "utf8")).items[Number(n) - 1] as { name: string; original: string; good: string[] };
  const goodHosts = item.good.map(host);
  const { data: s } = await db
    .from("searches")
    .select("id, photo_paths, search_queries")
    .contains("source_links", [item.original])
    .not("brief_built_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!s?.photo_paths?.length) throw new Error("No photo saved for this item");
  console.log(`${item.name} · photos ${s.photo_paths.length} · good: ${goodHosts.join(", ")}`);
  const hint = (s.search_queries?.lens_hint as string) ?? "";

  for (const [pi, path] of s.photo_paths.slice(0, 2).entries()) {
    const { data: signed } = await db.storage.from("photos").createSignedUrl(path, 600);
    for (const t of types.length ? types : ["visual", "visual-q", "products"]) {
      const params: Record<string, string> = { engine: "google_lens", url: signed!.signedUrl, hl: "en", country: "us", api_key: key };
      if (t === "visual" || t === "visual-q") params.type = "visual_matches";
      if (t === "visual-q" && hint) params.q = hint;
      if (t === "products") params.type = "products";
      if (t === "exact") params.type = "exact_matches";
      const u = new URL("https://serpapi.com/search.json");
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      const j = await (await fetch(u)).json();
      const list = (j.visual_matches ?? j.products ?? j.exact_matches ?? []) as { link?: string; source?: string; price?: unknown; title?: string }[];
      const hits = list.filter((m) => m.link && goodHosts.includes(host(m.link)));
      const priced = list.filter((m) => m.price).length;
      console.log(
        `  photo ${pi + 1} · ${t}${t === "visual-q" ? ` ("${hint}")` : ""}: ${list.length} results, ${priced} priced, keys ${Object.keys(j).filter((k) => !k.startsWith("search_")).join("/")}${j.error ? ` · ERROR ${j.error}` : ""}`,
      );
      for (const h of hits) console.log(`     ✓ ${host(h.link!)} · ${h.title?.slice(0, 60)} · ${JSON.stringify(h.price ?? null)}`);
      const stores: Record<string, number> = {};
      for (const m of list) stores[host(m.link ?? "")] = (stores[host(m.link ?? "")] ?? 0) + 1;
      console.log(`     stores: ${Object.entries(stores).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}${v > 1 ? `×${v}` : ""}`).join(", ")}`);
    }
  }
}

main();

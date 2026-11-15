/**
 * Runs Maggie's test set (tests/test-set.json, PLAN.md › Testing) through the real
 * pipeline on this Mac, as Maggie: builds the brief from the link if needed, runs
 * the search through the local Inngest Dev Server, then reports the judge's top 3
 * and, for each of her good dupes, how far it got (never found, dropped and why,
 * or judged with its scores). About 15 SerpApi searches per item.
 * Needs `npm run dev` and `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/run-test-set.ts [item numbers, e.g. 1 3] [--no-search] [--fresh: new search and brief] [--reuse: re-judge what was already gathered, no new searches]
 */
import { createClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";
import { buildBriefFor } from "../lib/server/brief";
import type { Session } from "../lib/server/session";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});
const inngest = new Inngest({ id: "dupe-dupe", isDev: true });

type Item = { name: string; original: string; good: string[]; holdout?: boolean };

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

async function main() {
  const args = process.argv.slice(2);
  const skipSearch = args.includes("--no-search");
  const pick = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const { items } = JSON.parse(await import("fs").then((fs) => fs.readFileSync("tests/test-set.json", "utf8"))) as { items: Item[] };

  const { data: me } = await db.from("profiles").select("id, default_sizes").eq("is_admin", true).limit(1).single();
  if (!me) throw new Error("No admin profile found");
  const session = { supabase: db, userId: me.id } as unknown as Session;

  for (const [i, item] of items.entries()) {
    if (pick.length && !pick.includes(i + 1)) continue;
    console.log(`\n━━ ${i + 1}. ${item.name}${item.holdout ? " (holdout: never used for tuning)" : ""}`);

    // 1. Find or make the search, with its brief.
    const { data: existing } = await db
      .from("searches")
      .select("id, status, brief_built_at")
      .eq("user_id", me.id)
      .contains("source_links", [item.original])
      .not("brief_built_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    let id = (args.includes("--fresh") ? undefined : existing?.[0]?.id) as string | undefined;
    if (!id) {
      const { data: created, error } = await db
        .from("searches")
        .insert({ user_id: me.id, source_links: [item.original], sizes: me.default_sizes ?? [] })
        .select("id")
        .single();
      if (error || !created) throw new Error(`Couldn't create the search: ${error?.message}`);
      id = created.id as string;
      const r = await buildBriefFor(session, id);
      if (!r.ok) {
        console.log(`  Brief failed: ${r.error}`);
        continue;
      }
    }
    const { data: s } = await db.from("searches").select("*").eq("id", id).single();
    if (s.budget == null && s.retail_price) {
      // Test default: up to 60% of the original's price.
      await db.from("searches").update({ budget: Math.round(s.retail_price * 0.6) }).eq("id", id);
      s.budget = Math.round(s.retail_price * 0.6);
    }
    console.log(`  Search ${id}: ${s.brand} ${s.style_name} · $${s.retail_price ?? "?"} · budget $${s.budget ?? "none"}`);
    console.log(`  Anchors: ${(s.visual_brief?.anchors ?? []).map((a: { label: string; dealbreaker: boolean }) => `${a.label}${a.dealbreaker ? " (must)" : ""}`).join(" · ")}`);
    console.log(`  Look-alike: ${(s.search_queries?.look_alike ?? []).join(" | ")}`);

    // 2. Run the search.
    if (!skipSearch) {
      await db.from("searches").update({ status: "queued", error: null }).eq("id", id);
      await inngest.send({ name: "search/confirmed", data: { searchId: id, userId: me.id, reuseGathered: args.includes("--reuse") } });
      const t = Date.now();
      for (let k = 0; k < 120; k++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: now } = await db.from("searches").select("status, error").eq("id", id).single();
        if (now && ["done", "failed"].includes(now.status)) {
          console.log(`  ${now.status} in ${Math.round((Date.now() - t) / 1000)}s${now.error ? ` · ${now.error}` : ""}`);
          break;
        }
      }
    }

    // 3. Report.
    const { data: cands } = await db
      .from("candidates")
      .select("id, source, store, store_domain, title, price, link, store_link, stage, drop_reason, duplicate_of, verdict, look_score, fit_score, caveat, judge_note")
      .eq("search_id", id);
    const all = cands ?? [];
    const shown = all
      .filter((c) => c.stage === "judged" && !c.drop_reason && c.verdict !== "rejected")
      .sort((a, b) => (b.look_score ?? 0) - (a.look_score ?? 0));
    console.log(`  Gathered ${all.length}, judged ${all.filter((c) => c.stage === "judged").length}, shown ${shown.length}`);
    console.log("  Judge's top 3:");
    for (const c of shown.slice(0, 3)) console.log(`    L${c.look_score} F${c.fit_score} ${c.verdict} · ${c.store} · $${c.price} · ${c.title.slice(0, 60)}${c.caveat ? ` · ${c.caveat}` : ""}`);
    if (!shown.length) console.log("    (none)");

    console.log("  Your good dupes:");
    for (const g of item.good) {
      const key = pathKey(g);
      const slug = words(new URL(g).pathname);
      let found = all.find((c) => pathKey(c.link) === key || (c.store_link && pathKey(c.store_link) === key));
      if (!found) {
        // Same store and most of the product's name in the title.
        const h = host(g);
        found = all.find((c) => {
          const sameStore = (c.store_domain && h.endsWith(c.store_domain.replace(/^www\./, ""))) || (c.store_link && host(c.store_link) === h);
          if (!sameStore) return false;
          const t = words(c.title);
          const shared = [...slug].filter((w) => t.has(w)).length;
          return shared >= Math.max(2, Math.ceil(slug.size * 0.5));
        });
      }
      const label = `${host(g)} ${new URL(g).pathname.split("/").filter(Boolean).pop()?.slice(0, 50)}`;
      // Merged into a cheaper listing of the same item: report that copy instead.
      if (found?.duplicate_of) {
        const copy = all.find((c) => c.id === found!.duplicate_of);
        if (copy) {
          console.log(`    → same item found cheaper at ${copy.store} ($${copy.price}); that copy:`);
          found = copy;
        }
      }
      if (!found) console.log(`    ✗ never found · ${label}`);
      else if (found.stage === "judged")
        console.log(`    ${found.verdict === "rejected" ? "✗" : "✓"} judged L${found.look_score} F${found.fit_score} ${found.verdict} · ${label}${found.verdict === "rejected" ? ` · ${found.judge_note}` : ""}`);
      else console.log(`    ✗ found, then dropped at ${found.stage}: ${found.drop_reason ?? "not reached"} · $${found.price} · ${label}`);
    }
  }
}

main();

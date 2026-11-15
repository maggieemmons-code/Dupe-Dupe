/*
 * Runs the brief builder on a product link, with no app or database involved.
 * Use it to check the test set (PLAN.md › Testing) after changing the prompt.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-brief.ts <link> ["typed notes"]
 *
 * Costs one TinyFish read (free) and one Claude call (a few cents).
 */
import { fetchPages } from "@/lib/server/tinyfish";
import { runBriefBuilder } from "@/lib/agents/briefBuilder";

async function main() {
  const [link, notes = ""] = process.argv.slice(2);
  if (!link) throw new Error("Pass a product link");

  const { pages, failed } = await fetchPages([link], "Read a clothing product page to describe the garment");
  console.log(`TinyFish: ${pages.length} page(s) read${failed.length ? `, failed: ${failed.join(", ")}` : ""}`);
  if (pages[0]) console.log(`Page title: ${pages[0].title} · ${pages[0].text.length} characters\n`);

  const { brief, usage } = await runBriefBuilder({
    pages,
    unreadLinks: pages.length ? [] : [link],
    notes,
    photos: [],
    tasteRules: "None yet.",
  });

  console.log("ITEM FIELDS");
  for (const [k, v] of Object.entries(brief.item)) {
    const src = brief.sources[k as keyof typeof brief.sources];
    const shown = Array.isArray(v) ? v.join(", ") : v ?? "";
    if (shown !== "") console.log(`  ${k}: ${shown}  [${src?.from ?? "?"}${src?.note ? ` · ${src.note}` : ""}]`);
  }
  console.log("\nANCHORS");
  for (const a of brief.visual_brief.anchors) console.log(`  ${a.label}${a.dealbreaker ? "  (must match)" : ""}`);
  console.log("\nCOMPOSITION BRIEF", JSON.stringify(brief.composition_brief));
  console.log("SEARCH QUERIES", JSON.stringify(brief.search_queries));
  console.log(`\nTokens: ${usage.input_tokens} in, ${usage.output_tokens} out (${usage.model})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

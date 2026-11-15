/**
 * Shows exactly what the brief builder's tool call returns for a link, before any
 * cleaning, to debug missing anchors. Uses the Google Shopping lookup for blocked
 * pages (2 SerpApi searches) and one Claude call.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/debug-brief.ts <link>
 */
import Anthropic from "@anthropic-ai/sdk";
import { lookupOriginal } from "../lib/server/serpapi";

async function main() {
  const link = process.argv[2];
  const found = await lookupOriginal(link);
  console.log("Lookup text:\n", found?.page.text.slice(0, 1200));
  // Re-run the brief builder with a patched client that prints the raw tool input.
  const orig = Anthropic.Beta.Messages.prototype.create;
  Anthropic.Beta.Messages.prototype.create = async function (this: unknown, ...a: unknown[]) {
    const res = await (orig as (...x: unknown[]) => Promise<{ content: { type: string; name?: string; input?: unknown }[] }>).apply(this, a);
    for (const b of res.content) {
      if (b.type === "tool_use") {
        const vb = (b.input as { visual_brief?: unknown })?.visual_brief;
        console.log("\nvisual_brief type:", typeof vb);
        console.log(typeof vb === "string" ? vb.slice(0, 1500) : JSON.stringify(vb, null, 1).slice(0, 1500));
      }
    }
    return res;
  } as typeof orig;
  const { runBriefBuilder } = await import("../lib/agents/briefBuilder");
  const r = await runBriefBuilder({ pages: found ? [found.page] : [], unreadLinks: found ? [] : [link], notes: "", photos: [], tasteRules: "None yet." });
  console.log("\nAfter cleaning, anchors:", JSON.stringify(r.brief.visual_brief.anchors));
}

main();

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { parseToolInput } from "./parseToolInput";

/*
 * New-items screener (PLAN.md › Search pipeline › 4. Screen), Haiku 5.5 via
 * ANTHROPIC_FAST_MODEL. It sees titles, stores, prices and small photos, 20 at
 * a time, and picks the ones that could pass for the original. It only picks
 * by number: titles, prices and links stay exactly as the source gave them.
 * Like the brief builder: no forced tool_choice, ask once more if no call
 * comes back (NOTES.md › Phase 2).
 */

export type ScreenItem = {
  n: number;
  title: string;
  store: string;
  brand: string;
  price: number | null;
  photo: Buffer | null;
};

export type ScreenOriginal = {
  name: string;
  fields: Record<string, unknown>;
  visualBrief: unknown;
  photo: Buffer | null;
};

export type ScreenPick = { n: number; color_match: "same" | "close" | "different" | "unclear"; note: string };

const SUBMIT_PICKS_TOOL = {
  name: "submit_picks",
  description: "Submit the candidates that could pass for the original, best first.",
  input_schema: {
    type: "object" as const,
    required: ["picks"],
    properties: {
      picks: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          required: ["n", "color_match", "note"],
          properties: {
            n: { type: "integer", description: "The candidate's number" },
            color_match: {
              type: "string",
              enum: ["same", "close", "different", "unclear"],
              description: "Its color against the original's: same family and shade, a close shade, a different color, or can't tell",
            },
            note: { type: "string", description: "Up to 12 words: what matches, then the biggest difference" },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a fashion buyer screening search results for a dupe finder. A shopper loves an original piece and wants new items, under budget, that could pass for it at a glance.

You see the original (its photo, details and the details that make the piece) and a numbered list of candidates, each with its title, store, price and a small photo.

Pass every candidate a shopper might plausibly accept as a dupe: the same kind of garment with a similar silhouette, neckline and color family. A stricter judge checks each one closely next, including fabric and quality, so when in doubt, pass it. Judge mostly from the photo; titles are often stuffed with keywords.

Skip only clear misses: a different kind of garment, a clearly different silhouette or color family, a "must match" detail that is plainly missing, a costume or a set, or a photo you can't make out.

Pick at most {{max}}, best first.

Pick only by number. Never invent a product, a price or a link.

Call submit_picks exactly once.`;

export async function runScreener(original: ScreenOriginal, items: ScreenItem[], maxPicks: number) {
  const model = process.env.ANTHROPIC_FAST_MODEL;
  if (!model) throw new Error("ANTHROPIC_FAST_MODEL is not set");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim().replace(/^["']|["']$/g, "") });

  const image = (buf: Buffer): Anthropic.Beta.BetaImageBlockParam => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") },
  });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  content.push({
    type: "text",
    text: `THE ORIGINAL: ${original.name}\nDetails: ${JSON.stringify(original.fields)}\nVisual brief: ${JSON.stringify(original.visualBrief)}`,
  });
  if (original.photo) content.push(image(original.photo));
  content.push({ type: "text", text: "CANDIDATES:" });
  for (const it of items) {
    const price = it.price != null ? `$${it.price}` : "price not shown";
    const brand = it.brand ? ` · ${it.brand}` : "";
    content.push({ type: "text", text: `#${it.n} · ${it.title}${brand} · ${it.store} · ${price}${it.photo ? "" : " · (no photo)"}` });
    if (it.photo) content.push(image(it.photo));
  }

  const request = {
    model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT.replace("{{max}}", String(maxPicks)),
    tools: [SUBMIT_PICKS_TOOL],
    tool_choice: { type: "auto" as const },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    messages: [{ role: "user" as const, content }],
  };

  const valid = new Set(items.map((i) => i.n));
  let usage = { input_tokens: 0, output_tokens: 0, model, photos: items.filter((i) => i.photo).length };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.beta.messages.create(request);
    usage = {
      ...usage,
      input_tokens: usage.input_tokens + response.usage.input_tokens,
      output_tokens: usage.output_tokens + response.usage.output_tokens,
    };
    if (response.stop_reason === "refusal") throw new Error("The screener declined this request");
    const call = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_picks",
    );
    const raw = parseToolInput<{ picks?: ScreenPick[] }>(call?.input)?.picks;
    if (Array.isArray(raw)) {
      const seen = new Set<number>();
      const picks = raw
        .filter((p) => valid.has(p.n) && !seen.has(p.n) && seen.add(p.n))
        .slice(0, maxPicks)
        .map((p) => ({
          n: p.n,
          color_match: (["same", "close", "different", "unclear"] as const).includes(p.color_match) ? p.color_match : "unclear",
          note: String(p.note ?? "").slice(0, 120),
        }));
      return { picks, usage };
    }
  }
  throw new Error("The screener did not return picks");
}

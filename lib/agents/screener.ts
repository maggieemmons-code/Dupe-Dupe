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

/** One rating per candidate; code then sends the best-rated across all batches to the judge. */
export type ScreenPick = { n: number; score: number; color_match: "same" | "close" | "different" | "unclear"; note: string };

const SUBMIT_PICKS_TOOL = {
  name: "submit_ratings",
  description: "Rate every candidate.",
  input_schema: {
    type: "object" as const,
    required: ["ratings"],
    properties: {
      ratings: {
        type: "array",
        items: {
          type: "object",
          required: ["n", "score", "color_match", "note"],
          properties: {
            n: { type: "integer", description: "The candidate's number" },
            score: { type: "integer", minimum: 1, maximum: 5, description: "5 could pass for it; 4 close; 3 similar with clear differences; 2 weak; 1 clear miss" },
            color_match: {
              type: "string",
              enum: ["same", "close", "different", "unclear"],
              description: "Its color against the original's: same family and shade, a close shade, a different color, or can't tell",
            },
            note: { type: "string", description: "Up to 12 words: what matches, then the biggest difference (empty for scores 1 and 2)" },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You are a fashion buyer screening search results for a dupe finder. A shopper loves an original piece and wants new items, under budget, that could pass for it at a glance.

You see the original (its photo, details and the details that make the piece) and a numbered list of candidates, each with its title, store, price and a small photo.

Rate EVERY candidate from 1 to 5 on how well it could pass for the original at a glance:
5 = could pass for it: same kind of garment, silhouette, neckline, color family and the details that make the piece.
4 = close: a shopper would happily consider it.
3 = similar, with clear differences.
2 = weak: the same kind of garment, but it misses what makes the piece.
1 = clear miss: a different kind of garment, a clearly different color family or silhouette, a "must match" detail the photo shows is replaced by something else, a costume, a piece from the original's own brand (check the title and store), a used or resale listing, a page showing many products, or a photo you can't make out.

Rate the piece, not the photo. A back view, a crop or a tucked-in top hides details; it doesn't remove them. Rate what you can see, use a plain title to confirm what's hidden, and don't go below 4 for a hidden part alone. The same product in two listings gets the same rating.

What matters at a glance, in order: outline and proportions (length and the size of trim included), then neckline (for shoes, toe and heel), then how the surface looks, then color. The right outline with one small added or missing detail is a 4, not a 3. Words for extras in a title (with cape, with scarf, embellished) don't lower a rating unless the photo shows they change the outline.

When torn between two ratings, give the higher: the judge can reject what you pass but never sees what you drop.

A stricter judge checks the best-rated ones closely next, including fabric and quality. Titles are often stuffed with keywords. Use the full range: don't rate everything 3.

Apply the shopper's taste rules below when rating: they say what she weighs more or less than the checklist does.

Shopper's taste rules:
{{taste_rules}}

Rate only by number. Never invent a product, a price or a link.

Call submit_ratings exactly once, with one rating for every candidate.`;

export async function runScreener(original: ScreenOriginal, items: ScreenItem[], tasteRules = "None yet.") {
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
    max_tokens: 4000,
    system: SYSTEM_PROMPT.replace("{{taste_rules}}", tasteRules),
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
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_ratings",
    );
    const raw = parseToolInput<{ ratings?: ScreenPick[] }>(call?.input)?.ratings;
    if (Array.isArray(raw) && raw.length) {
      const seen = new Set<number>();
      const picks = raw
        .filter((p) => valid.has(p.n) && !seen.has(p.n) && seen.add(p.n))
        .map((p) => ({
          n: p.n,
          score: Math.max(1, Math.min(5, Math.round(Number(p.score) || 1))),
          color_match: (["same", "close", "different", "unclear"] as const).includes(p.color_match) ? p.color_match : "unclear",
          note: String(p.note ?? "").slice(0, 120),
        }));
      // Anything left unrated counts as a miss.
      for (const n of valid) if (!seen.has(n)) picks.push({ n, score: 1, color_match: "unclear", note: "" });
      return { picks, usage };
    }
  }
  throw new Error("The screener did not return ratings");
}

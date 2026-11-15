import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Checklist } from "@/lib/search/score";

/*
 * Judge (PLAN.md › Appendix › Judge), on ANTHROPIC_JUDGE_MODEL, 5 candidates a
 * call. It fills a fixed checklist and never scores or approves anything; code
 * does that (lib/search/score.ts). Added since the plan: "polish" (Maggie,
 * Nov 15: does it look as high end as the original). Like the brief builder:
 * no forced tool_choice and no strict mode; ask once more if no call comes back.
 */

const MATCH = ["match", "close", "different"];
const MATCH_NA = ["match", "close", "different", "not_applicable"];

const SUBMIT_CHECKLISTS_TOOL = {
  name: "submit_checklists",
  description: "Submit one checklist per candidate.",
  input_schema: {
    type: "object" as const,
    required: ["checklists"],
    properties: {
      checklists: {
        type: "array",
        items: {
          type: "object",
          required: [
            "candidate_id", "anchors", "color", "silhouette", "neckline", "sleeves", "length", "sheen", "polish",
            "fabric_tier", "size_available", "stock_photo_suspected", "biggest_difference", "confidence",
          ],
          properties: {
            candidate_id: { type: "string" },
            anchors: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "result"],
                properties: { id: { type: "string" }, result: { type: "string", enum: ["pass", "partial", "fail", "cannot_see"] } },
              },
            },
            color: { type: "string", enum: MATCH },
            silhouette: { type: "string", enum: MATCH },
            neckline: { type: "string", enum: MATCH_NA },
            sleeves: { type: "string", enum: MATCH_NA },
            length: { type: "string", enum: MATCH_NA },
            sheen: { type: "string", enum: MATCH },
            polish: { type: "string", enum: ["as_polished", "slightly_less", "looks_cheap"] },
            fabric_tier: { type: "string", enum: ["target", "acceptable_swap", "dealbreaker", "unknown"] },
            fabric_evidence: { type: "string", description: "The exact words from the listing, or empty" },
            size_available: { type: "string", enum: ["yes", "no", "unknown"] },
            stock_photo_suspected: { type: "boolean" },
            biggest_difference: { type: "string", description: "One plain sentence" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are the strict, independent quality checker for Dupe Dupe. Another agent chose these candidates and tends to be generous. Your job is to protect the shopper from weak matches by answering a checklist honestly. You do not score or approve anything.

The shopper wants a piece that looks as high end as the original and is made of the same kind of fabric, not just something with a similar outline.

The first image is the ORIGINAL. Each later image belongs to the candidate named beside it. Compare each candidate to the original and to the briefs.

For every candidate:
- anchors: judge each anchor in the visual brief, by its id. pass = clearly present; partial = present but changed; fail = absent; cannot_see = the photo doesn't show that part.
- color, silhouette, neckline, sleeves, length, sheen: match, close or different. "close" means a shopper would accept it without being told. Use the brief's acceptable and dealbreaker shades for color.
- polish: would a shopper believe it cost about what the original did? Judge fabric weight and drape, finish (seams, lining, hardware) and construction from the photo and the listing. Shopper reviews that describe the fabric or finish count. as_polished, slightly_less, or looks_cheap.
- fabric_tier: place the fabric using ONLY words in the listing text: stated fiber content or a named fabric. Quote them in fabric_evidence. Reviews alone don't set the fiber. If the listing doesn't state the fabric, answer unknown. Never infer fabric from the photo alone.
- size_available: from the listing's sizes, compared with the shopper's sizes. unknown if the listing doesn't say.
- stock_photo_suspected: true if the candidate's photo appears to be the original brand's own product image rather than a photo of this item.
- biggest_difference: one plain sentence a shopper would understand.
- confidence: low when the photo is small, cropped or unclear, or the listing says little.

Apply the shopper's taste rules below when deciding what counts as close.

Shopper's taste rules:
{{taste_rules}}

Call submit_checklists exactly once, with one checklist per candidate.`;

export type JudgeCandidate = {
  id: string;
  title: string;
  brand: string;
  store: string;
  price: number | null;
  photo: Buffer | null;
  listingText: string;
};

export type JudgeOriginal = {
  name: string;
  photo: Buffer | null;
  fields: Record<string, unknown>;
  visualBrief: unknown;
  compositionBrief: unknown;
  sizes: string[];
};

export async function runJudge(original: JudgeOriginal, candidates: JudgeCandidate[], tasteRules = "None yet.") {
  const model = process.env.ANTHROPIC_JUDGE_MODEL;
  if (!model) throw new Error("ANTHROPIC_JUDGE_MODEL is not set");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim().replace(/^["']|["']$/g, "") });

  const image = (buf: Buffer): Anthropic.Beta.BetaImageBlockParam => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") },
  });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (original.photo) content.push(image(original.photo));
  content.push({
    type: "text",
    text: [
      `ORIGINAL: ${original.name}`,
      `Details: ${JSON.stringify(original.fields)}`,
      `Visual brief: ${JSON.stringify(original.visualBrief)}`,
      `Composition brief: ${JSON.stringify(original.compositionBrief)}`,
      `Shopper's sizes: ${original.sizes.join(", ") || "not given"}`,
    ].join("\n"),
  });
  for (const c of candidates) {
    content.push({
      type: "text",
      text: `CANDIDATE ${c.id}: ${c.title}${c.brand ? ` · ${c.brand}` : ""} · ${c.store} · ${c.price != null ? `$${c.price}` : "price not shown"}${c.photo ? "" : " · (no photo)"}\nListing text:\n${c.listingText || "(nothing beyond the title)"}`,
    });
    if (c.photo) content.push(image(c.photo));
  }

  const request = {
    model,
    max_tokens: 6000,
    system: SYSTEM_PROMPT.replace("{{taste_rules}}", tasteRules),
    tools: [SUBMIT_CHECKLISTS_TOOL],
    tool_choice: { type: "auto" as const },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    messages: [{ role: "user" as const, content }],
  };

  const ids = new Set(candidates.map((c) => c.id));
  let usage = { input_tokens: 0, output_tokens: 0, model, candidates: candidates.length };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.beta.messages.create(request);
    usage = {
      ...usage,
      input_tokens: usage.input_tokens + response.usage.input_tokens,
      output_tokens: usage.output_tokens + response.usage.output_tokens,
    };
    if (response.stop_reason === "refusal") throw new Error("The judge declined this request");
    const call = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_checklists",
    );
    const raw = (call?.input as { checklists?: (Checklist & { candidate_id: string })[] } | undefined)?.checklists;
    if (Array.isArray(raw) && raw.some((c) => ids.has(c.candidate_id))) {
      const out = new Map<string, Checklist>();
      for (const c of raw) if (ids.has(c.candidate_id) && !out.has(c.candidate_id)) out.set(c.candidate_id, cleanChecklist(c));
      return { checklists: out, usage };
    }
  }
  throw new Error("The judge did not return checklists");
}

/** Code-side guardrails: anything off-list becomes the cautious answer. */
function cleanChecklist(c: Checklist): Checklist {
  const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
  return {
    anchors: (Array.isArray(c.anchors) ? c.anchors : [])
      .filter((a) => a && typeof a.id === "string")
      .map((a) => ({ id: a.id, result: pick(a.result, ["pass", "partial", "fail", "cannot_see"] as const, "cannot_see") })),
    color: pick(c.color, ["match", "close", "different"] as const, "different"),
    silhouette: pick(c.silhouette, ["match", "close", "different"] as const, "different"),
    neckline: pick(c.neckline, ["match", "close", "different", "not_applicable"] as const, "different"),
    sleeves: pick(c.sleeves, ["match", "close", "different", "not_applicable"] as const, "different"),
    length: pick(c.length, ["match", "close", "different", "not_applicable"] as const, "different"),
    sheen: pick(c.sheen, ["match", "close", "different"] as const, "different"),
    polish: pick(c.polish, ["as_polished", "slightly_less", "looks_cheap"] as const, "slightly_less"),
    fabric_tier: pick(c.fabric_tier, ["target", "acceptable_swap", "dealbreaker", "unknown"] as const, "unknown"),
    fabric_evidence: typeof c.fabric_evidence === "string" ? c.fabric_evidence.slice(0, 200) : "",
    size_available: pick(c.size_available, ["yes", "no", "unknown"] as const, "unknown"),
    stock_photo_suspected: c.stock_photo_suspected === true,
    biggest_difference: String(c.biggest_difference ?? "").slice(0, 200),
    confidence: pick(c.confidence, ["high", "medium", "low"] as const, "low"),
  };
}

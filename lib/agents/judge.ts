import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { parseToolInput } from "./parseToolInput";
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
            "candidate_id", "differences", "anchors", "color", "silhouette", "neckline", "sleeves", "length", "surface", "extras",
            "polish", "fabric_tier", "size_available", "stock_photo_suspected", "same_brand_as_original", "used_or_resale",
            "biggest_difference", "confidence",
          ],
          properties: {
            candidate_id: { type: "string" },
            differences: {
              type: "array",
              maxItems: 4,
              items: { type: "string" },
              description: "First: up to four short phrases for the differences you can actually see, each starting with the part (outline, length, neckline, trim size, surface, color, extra)",
            },
            anchors: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "result", "kind"],
                properties: {
                  id: { type: "string" },
                  result: { type: "string", enum: ["pass", "partial", "fail", "cannot_see"] },
                  kind: { type: "string", enum: ["shape", "material", "hidden"], description: "shape: a visible outline or neckline; material: the fabric itself; hidden: construction a photo can't show" },
                },
              },
            },
            color: { type: "string", enum: MATCH },
            silhouette: { type: "string", enum: MATCH },
            neckline: { type: "string", enum: MATCH_NA },
            sleeves: { type: "string", enum: MATCH_NA },
            length: { type: "string", enum: MATCH_NA },
            surface: { type: "string", enum: MATCH },
            extras: { type: "string", enum: ["none", "minor", "changes_look"] },
            polish: { type: "string", enum: ["as_polished", "slightly_less", "looks_cheap", "cannot_tell"] },
            fabric_tier: { type: "string", enum: ["target", "acceptable_swap", "dealbreaker", "unknown"] },
            fabric_evidence: { type: "string", description: "The exact words from the listing, or empty" },
            size_available: { type: "string", enum: ["yes", "no", "unknown"] },
            stock_photo_suspected: { type: "boolean" },
            same_brand_as_original: { type: "boolean" },
            used_or_resale: { type: "boolean" },
            biggest_difference: { type: "string", description: "One plain sentence" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You are the strict, independent quality checker for Dupe Dupe. Another agent chose these candidates and tends to be generous. Your job is to protect the shopper from weak matches by answering a checklist honestly. You do not score or approve anything.

The shopper wants a piece that would be taken for the original when worn: same outline, proportions and surface. Fabric quality is recorded separately and is not a reason to mark the look down.

The first image is the ORIGINAL. Each later image belongs to the candidate named beside it. Compare each candidate to the original and to the briefs.

For every candidate, first list the differences you can actually see. Then fill the fields so they agree with your list: if you wrote that the outline, length, neckline, heel, trim size or surface differs, that field cannot be "match" and that anchor cannot be "pass". "match" means you looked for a difference and found none.

Judge only what the photo shows. If a part is hidden, answer cannot_see, unless the listing plainly names the detail, in which case answer pass. Never pass a detail you can neither see nor read.

For every candidate:
- differences: up to four short phrases, each starting with the part (outline, length, neckline, trim size, surface, color, extra).
- anchors: judge exactly the signature details listed under ANCHORS TO JUDGE, by their ids, and no others. Many name more than one thing (a shape plus a detail, or a detail plus its size). pass = every part is there at about the original's scale. partial = the main part is there and a secondary part is missing, changed or clearly smaller. fail = the main part is missing or replaced by its opposite (high becomes plunging, straight becomes flared, big becomes skimpy). An extra detail on or near an anchor doesn't lower it while the anchor is still clearly there: record it under extras. Give each anchor its kind: shape (a visible outline, neckline, toe, heel or trim), material (the fabric itself, such as velvet or jacquard) or hidden (construction a photo can't show, such as boning or lining).
- color, silhouette, neckline, sleeves, length: match, close or different. "close" means a shopper would accept it without being told. Use the brief's acceptable and dealbreaker shades for color. Silhouette is the whole outline. A straight column, a mermaid, an A-line and a full skirt are different outlines; a slight flare at the hem of a column is close. Skimming the body and hanging loose are different.
- surface: does the fabric read the same at a glance? Shine (matte, soft glow, liquid, glossy), texture (pile, grain, visible weave, smooth) and how it falls (clings, hangs straight, stands away). Judge the photo, whatever the listing calls the fabric.
- extras: details the original doesn't have (a slit, a pleated bust, ruching, a cut-out, a cape). none; minor (doesn't change the outline); or changes_look. Count them here once, not again in other fields.
- polish: would a shopper believe it cost about what the original did? as_polished needs something visible to point to, such as weight in the drape or clean seams; shopper reviews that describe the fabric or finish count. slightly_less, looks_cheap, or cannot_tell for flat lays, renders and listings that say nothing.
- fabric_tier: place the fabric using ONLY words in the listing text: stated fiber content or a named fabric. Quote them in fabric_evidence. Reviews alone don't set the fiber. If the listing doesn't state the fabric, answer unknown. Never infer fabric from the photo alone.
- size_available: yes only if the listing shows one of the shopper's sizes in stock; no only if it says the shopper's sizes are sold out or not made. A size in the title ("Gown in Red - size XL") is just the variant the store listed, not what's available, so on its own it means unknown.
- stock_photo_suspected: true if the candidate's photo appears to be the original brand's own product image rather than a photo of this item.
- same_brand_as_original: true if the piece is from the original's brand (check the title, brand and store), including another style or color from that label.
- used_or_resale: true if the listing is pre-owned, used, vintage resale or a rental.
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
  anchors: { id: string; label: string; dealbreaker?: boolean }[];
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
      `ANCHORS TO JUDGE:\n${original.anchors.map((a) => `- ${a.id}: ${a.label}${a.dealbreaker ? " (must match)" : ""}`).join("\n") || "(none)"}`,
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
    const raw = parseToolInput<{ checklists?: (Checklist & { candidate_id: string })[] }>(call?.input)?.checklists;
    if (Array.isArray(raw) && raw.some((c) => ids.has(c.candidate_id))) {
      const out = new Map<string, Checklist>();
      const anchorIds = new Set(original.anchors.map((a) => a.id));
      for (const c of raw) {
        if (!ids.has(c.candidate_id) || out.has(c.candidate_id)) continue;
        const clean = cleanChecklist(c);
        clean.anchors = clean.anchors.filter((a) => anchorIds.has(a.id));
        out.set(c.candidate_id, clean);
      }
      return { checklists: out, usage };
    }
  }
  throw new Error("The judge did not return checklists");
}

/**
 * The judge lists the differences it sees, each starting with the part. A field it
 * named can't stay "match" (review, Nov 15: it wrote "flares more" and still marked
 * the silhouette a match). Code holds it to its own notes.
 */
const PART_FIELD: [RegExp, "silhouette" | "length" | "neckline" | "sleeves" | "surface" | "color"][] = [
  [/^(outline|silhouette|shape|fit|cut)\b/i, "silhouette"],
  [/^(length|hem|proportion)/i, "length"],
  [/^(neckline|neck|collar|toe|heel)\b/i, "neckline"],
  [/^(sleeve|sleeves|cuff|cuffs)\b/i, "sleeves"],
  [/^(surface|fabric|shine|sheen|texture|finish)\b/i, "surface"],
  [/^(colou?r|shade|tone)\b/i, "color"],
];

export function holdToNotes(c: Checklist): Checklist {
  const out = { ...c };
  for (const d of c.differences ?? []) {
    for (const [re, field] of PART_FIELD) {
      if (re.test(d.trim()) && out[field] === "match") out[field] = "close";
    }
  }
  return out;
}

/** Code-side guardrails: anything off-list becomes the cautious answer. */
function cleanChecklist(c: Checklist): Checklist {
  return holdToNotes(cleanFields(c));
}

function cleanFields(c: Checklist): Checklist {
  const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
  return {
    differences: (Array.isArray(c.differences) ? c.differences : []).filter((d) => typeof d === "string").slice(0, 4).map((d) => d.slice(0, 120)),
    anchors: (Array.isArray(c.anchors) ? c.anchors : [])
      .filter((a) => a && typeof a.id === "string")
      .map((a) => ({
        id: a.id,
        result: pick(a.result, ["pass", "partial", "fail", "cannot_see"] as const, "cannot_see"),
        kind: pick(a.kind, ["shape", "material", "hidden"] as const, "shape"),
      })),
    color: pick(c.color, ["match", "close", "different"] as const, "different"),
    silhouette: pick(c.silhouette, ["match", "close", "different"] as const, "different"),
    neckline: pick(c.neckline, ["match", "close", "different", "not_applicable"] as const, "different"),
    sleeves: pick(c.sleeves, ["match", "close", "different", "not_applicable"] as const, "different"),
    length: pick(c.length, ["match", "close", "different", "not_applicable"] as const, "different"),
    surface: pick(c.surface ?? c.sheen, ["match", "close", "different"] as const, "different"),
    extras: pick(c.extras, ["none", "minor", "changes_look"] as const, "minor"),
    polish: pick(c.polish, ["as_polished", "slightly_less", "looks_cheap", "cannot_tell"] as const, "cannot_tell"),
    fabric_tier: pick(c.fabric_tier, ["target", "acceptable_swap", "dealbreaker", "unknown"] as const, "unknown"),
    fabric_evidence: typeof c.fabric_evidence === "string" ? c.fabric_evidence.slice(0, 200) : "",
    size_available: pick(c.size_available, ["yes", "no", "unknown"] as const, "unknown"),
    stock_photo_suspected: c.stock_photo_suspected === true,
    same_brand_as_original: c.same_brand_as_original === true,
    used_or_resale: c.used_or_resale === true,
    biggest_difference: String(c.biggest_difference ?? "").slice(0, 200),
    confidence: pick(c.confidence, ["high", "medium", "low"] as const, "low"),
  };
}

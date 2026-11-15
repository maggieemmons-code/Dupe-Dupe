import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/*
 * Brief builder (PLAN.md › Appendix › Brief builder).
 * Schema and system prompt are copied from the plan as written, with one
 * addition for DESIGN.md › Prefill on Review: a `sources` map that says where
 * each item field came from (link, photo, typed or guess).
 */

import {
  CATEGORIES,
  FIT_STYLES,
  STRETCH,
  ITEM_FIELDS,
  GUESSABLE,
  type ItemField,
  type Source,
  type Anchor,
} from "@/lib/fields";

export { CATEGORIES, ITEM_FIELDS, type ItemField, type Anchor };

export type BriefResult = {
  item: {
    brand: string;
    style_name: string;
    category: string;
    color: string;
    composition: string;
    fabrics: string[];
    care: string[];
    fit_style: string[];
    stretch: string[];
    neckline: string;
    sleeve: string;
    hem: string;
    closure: string;
    features: string;
    retail_price: number | null;
    fit_notes: string;
  };
  sources: Partial<Record<ItemField, { from: Source; note?: string }>>;
  visual_brief: {
    silhouette: Record<string, string>;
    color: { primary?: string; acceptable_shades?: string[]; dealbreaker_shades?: string[] };
    sheen: string;
    pattern: { kind?: string; scale?: string };
    anchors: Anchor[];
  };
  composition_brief: {
    target_fabrics: string[];
    acceptable_swaps: string[];
    dealbreakers: string[];
    lining?: string;
    stretch_tolerance?: string;
    closure?: string;
  };
  search_queries: {
    exact: string[];
    look_alike: string[];
    lens_hint?: string;
    peer_brands: { brand: string; query: string }[];
  };
};

const SOURCE_ENTRY = {
  type: "object",
  required: ["from"],
  properties: {
    from: { enum: ["link", "photo", "typed", "guess"] },
    note: { type: "string", description: "For a guess: the reason, under 8 words" },
  },
};

export const SUBMIT_BRIEF_TOOL: Anthropic.Tool = {
  name: "submit_brief",
  description: "Submit the search brief for this garment.",
  input_schema: {
    type: "object",
    required: ["item", "sources", "visual_brief", "composition_brief", "search_queries"],
    properties: {
      item: {
        type: "object",
        description: "Plain fields shown to the friend. Empty string or [] when unknown.",
        properties: {
          brand: { type: "string" },
          style_name: { type: "string" },
          category: { enum: [...CATEGORIES, ""] },
          color: { type: "string" },
          composition: {
            type: "string",
            description: "Exact text from the source, e.g. 100% Polyester. Never estimated.",
          },
          fabrics: { type: "array", items: { type: "string" } },
          care: { type: "array", items: { type: "string" } },
          fit_style: { type: "array", items: { enum: [...FIT_STYLES] } },
          stretch: { type: "array", items: { enum: [...STRETCH] } },
          neckline: { type: "string" },
          sleeve: { type: "string" },
          hem: { type: "string" },
          closure: { type: "string" },
          features: { type: "string" },
          retail_price: { type: ["number", "null"] },
          fit_notes: { type: "string", description: "Model size, true-to-size notes, as stated." },
        },
      },
      sources: {
        type: "object",
        description: "Where each filled item field came from. One entry per non-empty item field, keyed by field name.",
        properties: Object.fromEntries(ITEM_FIELDS.map((f) => [f, SOURCE_ENTRY])),
      },
      visual_brief: {
        type: "object",
        required: ["silhouette", "color", "sheen", "pattern", "anchors"],
        properties: {
          silhouette: {
            type: "object",
            properties: {
              shape: { type: "string", description: "e.g. column, A-line, fit and flare" },
              structure: { type: "string", description: "e.g. boned bodice, unstructured" },
              drape: { enum: ["rigid", "soft", "fluid"] },
              waist: { type: "string" },
              length: { type: "string" },
            },
          },
          color: {
            type: "object",
            properties: {
              primary: { type: "string" },
              acceptable_shades: { type: "array", items: { type: "string" } },
              dealbreaker_shades: { type: "array", items: { type: "string" } },
            },
          },
          sheen: { enum: ["matte", "soft sheen", "satin", "metallic", "textured"] },
          pattern: {
            type: "object",
            properties: {
              kind: { type: "string", description: "solid, jacquard, floral print, and so on" },
              scale: { enum: ["none", "small", "medium", "large"] },
            },
          },
          anchors: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: {
              type: "object",
              required: ["id", "label", "dealbreaker"],
              properties: {
                id: { type: "string", description: "short slug, e.g. off-shoulder" },
                label: { type: "string", description: "plain words a friend recognizes" },
                dealbreaker: { type: "boolean" },
              },
            },
          },
        },
      },
      composition_brief: {
        type: "object",
        required: ["target_fabrics", "acceptable_swaps", "dealbreakers"],
        properties: {
          target_fabrics: { type: "array", items: { type: "string" } },
          acceptable_swaps: { type: "array", items: { type: "string" } },
          dealbreakers: { type: "array", items: { type: "string" } },
          lining: { enum: ["required", "preferred", "not needed"] },
          stretch_tolerance: { type: "string", description: "e.g. rigid only, up to 5% elastane" },
          closure: { type: "string" },
        },
      },
      search_queries: {
        type: "object",
        required: ["exact", "look_alike", "peer_brands"],
        properties: {
          exact: { type: "array", maxItems: 3, items: { type: "string" } },
          look_alike: { type: "array", maxItems: 4, items: { type: "string" } },
          lens_hint: { type: "string", description: "3 to 6 words sent with the photo to Google Lens" },
          peer_brands: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              properties: { brand: { type: "string" }, query: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You write the search brief for Dupe Dupe, which finds affordable dupes and secondhand matches for a higher-end garment.

Read every source you are given: listing text, the shopper's notes, photos and, if present, the shopper's edited fields. Edited fields are final; never contradict them.

Rules for item fields:
- Report only what a source states or a photo clearly shows. Use "" or [] when unknown.
- Copy composition exactly as written. Never estimate a fiber percentage.
- Use only the allowed values for category, fit_style and stretch.

Rules for the visual brief:
- Anchors are the 2 or 3 details that make this piece recognizable. A dupe that misses them is a generic garment, not this one. Prefer specific construction ("fold-over off-shoulder band", "boned bodice") over general traits ("red", "long").
- Mark an anchor as a dealbreaker only if the piece would read as a different garment without it.
- List sister shades a shopper would accept, and undertones that would read as a different color.

Rules for the composition brief:
- Target fabrics: the original's fiber and weave, or fabrics that drape and wear the same way.
- Acceptable swaps: cheaper fabrics that keep the look and structure.
- Dealbreakers: fabrics that would make it look or wear cheap for this piece, such as thin jersey for a structured gown.

Rules for search queries:
- Write queries the way resale sellers title listings: 2 to 6 words, brand first when known.
- exact: brand plus style name, and brand plus color and fabric.
- look_alike: construction, fabric and silhouette words, no brand.
- peer_brands: labels similar in style and price. Never claim they share a factory or made this item.

Rules for sources:
- For every item field you fill, add an entry under sources with the same field name: "link" if the listing text states it, "photo" if a photo clearly shows it, "typed" if the shopper's notes say it.
- You may fill a field as "guess" only for stretch, fit_style, hem, sleeve, closure and care, only when the evidence points one way, and with the reason in note. Never guess brand, style_name, category, color, composition, fabrics, neckline, features, retail_price or fit_notes; leave them empty instead.

Apply the shopper's taste rules below when choosing anchors and dealbreakers. A rule marked dealbreaker becomes a dealbreaker anchor or fabric where it applies.

Shopper's taste rules:
{{taste_rules}}

Call submit_brief exactly once.`;

export type BriefInput = {
  pages: { url: string; title: string; text: string }[];
  unreadLinks: string[];
  notes: string;
  photos: { data: string; mediaType: "image/jpeg" }[];
  tasteRules: string;
  editedFields?: Partial<BriefResult["item"]>;
};

export async function runBriefBuilder(input: BriefInput) {
  const model = process.env.ANTHROPIC_JUDGE_MODEL;
  if (!model) throw new Error("ANTHROPIC_JUDGE_MODEL is not set");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic();

  const parts: string[] = [];
  for (const p of input.pages) {
    parts.push(`LISTING PAGE ${p.url}${p.title ? ` (${p.title})` : ""}\n${p.text.slice(0, 30000)}`);
  }
  if (input.unreadLinks.length) {
    parts.push(
      `PRODUCT LINKS (the page could not be read; use only what the URL itself names, such as brand and style name):\n${input.unreadLinks.join("\n")}`,
    );
  }
  if (input.notes.trim()) parts.push(`SHOPPER'S NOTES:\n${input.notes.trim()}`);
  if (input.editedFields && Object.keys(input.editedFields).length) {
    parts.push(`SHOPPER'S EDITED FIELDS (final):\n${JSON.stringify(input.editedFields)}`);
  }
  if (input.photos.length) {
    parts.push(`PHOTOS: ${input.photos.length} attached, all of the original garment.`);
  }

  const content: Anthropic.ContentBlockParam[] = [
    ...input.photos.map(
      (p): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: p.mediaType, data: p.data },
      }),
    ),
    { type: "text", text: parts.join("\n\n") || "(no sources)" },
  ];

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT.replace("{{taste_rules}}", input.tasteRules || "None yet."),
    tools: [SUBMIT_BRIEF_TOOL],
    tool_choice: { type: "tool", name: "submit_brief" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_brief",
  );
  if (!toolUse) throw new Error("The brief builder did not return a brief");

  return {
    brief: cleanBrief(toolUse.input as BriefResult),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens, model },
  };
}

/** Code-side guardrails on what the agent returned. */
function cleanBrief(raw: BriefResult): BriefResult {
  const item = { ...emptyItem(), ...(raw.item ?? {}) };
  const sources: BriefResult["sources"] = {};

  for (const field of ITEM_FIELDS) {
    const value = item[field];
    const filled = Array.isArray(value) ? value.length > 0 : value !== null && value !== "";
    const src = raw.sources?.[field];
    if (!filled) continue;

    if (!src) {
      // No stated source: keep it, but never show it as if it were read from a source.
      sources[field] = { from: "guess", note: "Source not stated" };
      continue;
    }
    if (src.from === "guess" && !GUESSABLE.includes(field)) {
      // A guess where guesses aren't allowed (brand, fabric, price…): drop it.
      (item as Record<string, unknown>)[field] = Array.isArray(value) ? [] : field === "retail_price" ? null : "";
      continue;
    }
    sources[field] = { from: src.from, note: src.note };
  }

  item.category = (CATEGORIES as readonly string[]).includes(item.category) ? item.category : "";
  item.fit_style = (item.fit_style ?? []).filter((v) => (FIT_STYLES as readonly string[]).includes(v));
  item.stretch = (item.stretch ?? []).filter((v) => (STRETCH as readonly string[]).includes(v));

  const anchors = (raw.visual_brief?.anchors ?? [])
    .filter((a) => a && a.label)
    .slice(0, 3)
    .map((a, i) => ({ id: a.id || `anchor-${i + 1}`, label: a.label, dealbreaker: !!a.dealbreaker }));

  return {
    ...raw,
    item,
    sources,
    visual_brief: { ...raw.visual_brief, anchors },
  };
}

function emptyItem(): BriefResult["item"] {
  return {
    brand: "",
    style_name: "",
    category: "",
    color: "",
    composition: "",
    fabrics: [],
    care: [],
    fit_style: [],
    stretch: [],
    neckline: "",
    sleeve: "",
    hem: "",
    closure: "",
    features: "",
    retail_price: null,
    fit_notes: "",
  };
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { parseToolInput } from "./parseToolInput";
import {
  CATEGORIES,
  COLOR_NAMES,
  FIBERS,
  WEAVES,
  STRETCH,
  SIZING,
  FIT_STYLES,
  NECKLINES,
  SLEEVES,
  LENGTHS,
  CLOSURES,
  CARE,
  DETAILS,
  SINGLE_CHOICE,
  MULTI_CHOICE,
  ITEM_FIELDS,
  GUESSABLE,
  type ItemField,
  type Source,
  type Anchor,
} from "@/lib/fields";

export { CATEGORIES, ITEM_FIELDS, type ItemField, type Anchor };

/*
 * Brief builder (PLAN.md › Appendix › Brief builder).
 * The visual brief, composition brief, search queries and prompt come from the
 * plan. Changes since, all recorded in NOTES.md:
 * - every item field a friend can change is a pick from a list in lib/fields.ts
 *   (Maggie's call: no free typing), so the item schema uses those lists;
 * - a `sources` list says where each field came from, for Review's tags;
 * - stretch may be inferred from the fabric, and product photos from the link are read.
 */

export type BriefItem = {
  brand: string;
  style_name: string;
  category: string;
  color: string;
  color_name: string;
  composition: string;
  fabrics: string[];
  weave: string;
  care: string[];
  fit_style: string[];
  stretch: string[];
  sizing: string;
  neckline: string;
  sleeve: string;
  hem: string;
  closure: string;
  details: string[];
  retail_price: number | null;
  fit_notes: string;
};

export type BriefResult = {
  item: BriefItem;
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

/** What the model returns: like BriefResult, but sources as a list. */
type RawBrief = Omit<BriefResult, "sources"> & {
  sources: { field: ItemField; from: Source; note?: string }[];
};

const one = (list: readonly string[]) => ({ enum: [...list, ""] });
const many = (list: readonly string[]) => ({ type: "array", items: { enum: [...list] } });

/*
 * The plan's submit_brief tool. Claude Sonnet 5.5 doesn't accept a forced tool
 * call (tool_choice "tool"), and this schema is too large for strict mode, so
 * the prompt asks for the call, tool_choice stays "auto", and the code checks
 * the answer and asks once more if no call came back (Claude API docs).
 */
export const SUBMIT_BRIEF_TOOL: Anthropic.Tool = {
  name: "submit_brief",
  description: "Submit the search brief for this garment.",
  input_schema: {
    type: "object",
    required: ["item", "sources", "visual_brief", "composition_brief", "search_queries"],
    properties: {
      item: {
        type: "object",
        description: "Plain fields shown to the friend. Empty string, [] or null when unknown. Pick-list fields use only the listed values.",
        properties: {
          brand: { type: "string" },
          style_name: { type: "string" },
          category: one(CATEGORIES),
          color: { ...one(COLOR_NAMES), description: "Color family" },
          color_name: { type: "string", description: "The store's own name for the shade, exactly as written, e.g. Red Date" },
          composition: {
            type: "string",
            description: "Exact text from the source, e.g. 100% Polyester. Never estimated.",
          },
          fabrics: { ...many(FIBERS), description: "Fibers present" },
          weave: { ...one(WEAVES), description: "Weave or finish of the main fabric" },
          care: many(CARE),
          fit_style: many(FIT_STYLES),
          stretch: { ...many(STRETCH), maxItems: 1 },
          sizing: { ...one(SIZING), description: "Only from what the listing says about sizing" },
          neckline: one(NECKLINES),
          sleeve: one(SLEEVES),
          hem: { ...one(LENGTHS), description: "Length" },
          closure: one(CLOSURES),
          details: { ...many(DETAILS), description: "Construction details present" },
          retail_price: { type: ["number", "null"] },
          fit_notes: { type: "string", description: "Model size, true-to-size notes, as stated." },
        },
      },
      sources: {
        type: "array",
        description: "Where each filled item field came from: one entry per non-empty item field.",
        items: {
          type: "object",
          required: ["field", "from"],
          properties: {
            field: { enum: [...ITEM_FIELDS] },
            from: { enum: ["link", "photo", "typed", "guess"] },
            note: { type: "string", description: "For a guess: the reason, under 8 words" },
          },
        },
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
- Use only the allowed values for every pick-list field. Choose the closest listed value; if none fits, leave it empty.
- color is the color family; color_name is the store's own name for the shade, copied as written.
- fabrics lists the fibers of the shell (the main fabric), not the lining.
- Product photos show the garment itself. Read neckline, sleeve, length (hem), closure, color, weave and construction details from them when the listing text doesn't say.
- If the sources say "Color named in the shopper's link", that is the piece's color. Photos from a Google listing may show the same style in another color: take shape and details from them, but use the link's color for color, color_name, anchors and queries.
- If the listing doesn't state stretch, infer it from the shell fabric: woven jacquard, brocade, taffeta, satin, crepe, organza, tweed or denim with no elastane in the shell is "None"; knit, jersey or elastane in the shell is "Slight" or more. Mark it as a guess with the reason. Lining fabric doesn't count.

Rules for the visual brief:
- Anchors are the 2 or 3 details that make this piece recognizable. A dupe that misses them is a generic garment, not this one. Prefer specific construction ("fold-over off-shoulder band", "boned bodice") over general traits ("red", "long").
- Each anchor names one detail, in 2 to 5 words. Name the color in the plain words a shopper would search ("burnt red", not only the brand's color name).
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
- For every item field you fill, add an entry to sources naming the field: "link" if the listing text states it, "photo" if a photo clearly shows it, "typed" if the shopper's notes say it.
- You may fill a field as "guess" only for stretch, fit_style, hem, sleeve, closure and care, only when the evidence points one way, and with the reason in note. Never guess any other field; leave it empty instead.

Apply the shopper's taste rules below when choosing anchors and dealbreakers. A rule marked dealbreaker becomes a dealbreaker anchor or fabric where it applies.

Shopper's taste rules:
{{taste_rules}}

Call submit_brief exactly once.`;

export type BriefInput = {
  pages: { url: string; title: string; text: string }[];
  unreadLinks: string[];
  notes: string;
  /** The shopper's own photos. */
  photos: { data: string; mediaType: "image/jpeg" }[];
  /** Product photos taken from the listing page. */
  productPhotos?: { data: string; mediaType: "image/jpeg" }[];
  tasteRules: string;
  editedFields?: Partial<BriefItem>;
};

export async function runBriefBuilder(input: BriefInput) {
  const model = process.env.ANTHROPIC_JUDGE_MODEL;
  if (!model) throw new Error("ANTHROPIC_JUDGE_MODEL is not set");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  // Tolerate a stray space, line break or quotes from pasting the key into settings.
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim().replace(/^["']|["']$/g, "") });
  const productPhotos = input.productPhotos ?? [];

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
  const photoLines = [];
  if (input.photos.length) photoLines.push(`${input.photos.length} from the shopper`);
  if (productPhotos.length) photoLines.push(`${productPhotos.length} product photo(s) from the listing page`);
  if (photoLines.length) parts.push(`PHOTOS ATTACHED, all of the original garment: ${photoLines.join(", ")}, in that order.`);

  const image = (p: { data: string; mediaType: "image/jpeg" }): Anthropic.Beta.BetaImageBlockParam => ({
    type: "image",
    source: { type: "base64", media_type: p.mediaType, data: p.data },
  });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...input.photos.map(image),
    ...productPhotos.map(image),
    { type: "text", text: parts.join("\n\n") || "(no sources)" },
  ];

  const request = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT.replace("{{taste_rules}}", input.tasteRules || "None yet."),
    tools: [SUBMIT_BRIEF_TOOL],
    tool_choice: { type: "auto" as const },
    // If a safety check declines (very unlikely for clothing), Anthropic retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    messages: [{ role: "user" as const, content }],
  };

  let usage = { input_tokens: 0, output_tokens: 0, model, photos: input.photos.length + productPhotos.length };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.beta.messages.create(request);
    usage = {
      ...usage,
      input_tokens: usage.input_tokens + response.usage.input_tokens,
      output_tokens: usage.output_tokens + response.usage.output_tokens,
    };
    if (response.stop_reason === "refusal") throw new Error("The brief builder declined this request");

    const call = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_brief",
    );
    const raw = parseToolInput<RawBrief>(call?.input);
    if (raw?.item && raw.visual_brief && raw.search_queries) {
      return { brief: cleanBrief(raw), usage };
    }
    // No call, or an incomplete one: ask once more.
  }
  throw new Error("The brief builder did not return a brief");
}

/** Code-side guardrails on what the agent returned. */
function cleanBrief(raw: RawBrief): BriefResult {
  const item: BriefItem = { ...emptyItem(), ...(raw.item ?? {}) };

  // Pick-list fields keep only listed values.
  for (const [field, list] of Object.entries(SINGLE_CHOICE) as [keyof typeof SINGLE_CHOICE, readonly string[]][]) {
    if (field === "stretch") continue;
    const v = (item as Record<string, unknown>)[field];
    (item as Record<string, unknown>)[field] = typeof v === "string" && list.includes(v) ? v : "";
  }
  item.stretch = (item.stretch ?? []).filter((v) => (STRETCH as readonly string[]).includes(v)).slice(0, 1);
  for (const [field, list] of Object.entries(MULTI_CHOICE) as [keyof typeof MULTI_CHOICE, readonly string[]][]) {
    const v = item[field];
    item[field] = Array.isArray(v) ? [...new Set(v.filter((x) => list.includes(x)))] : [];
  }

  const stated = new Map<string, { from: Source; note?: string }>();
  for (const s of raw.sources ?? []) if (s?.field) stated.set(s.field, { from: s.from, note: s.note || undefined });

  const sources: BriefResult["sources"] = {};
  for (const field of ITEM_FIELDS) {
    const value = item[field];
    const filled = Array.isArray(value) ? value.length > 0 : value !== null && value !== "";
    if (!filled) continue;
    const src = stated.get(field);

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

function emptyItem(): BriefItem {
  return {
    brand: "",
    style_name: "",
    category: "",
    color: "",
    color_name: "",
    composition: "",
    fabrics: [],
    weave: "",
    care: [],
    fit_style: [],
    stretch: [],
    sizing: "",
    neckline: "",
    sleeve: "",
    hem: "",
    closure: "",
    details: [],
    retail_price: null,
    fit_notes: "",
  };
}

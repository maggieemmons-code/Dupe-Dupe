/** Item fields and allowed values, shared by the brief builder (server) and the screens. */

export const CATEGORIES = [
  "Dress",
  "Top / Blouse",
  "Sweater / Knit",
  "Outerwear",
  "Bottoms",
  "Denim",
  "Activewear",
  "Shoes",
  "Bag / Accessory",
] as const;
export const FIT_STYLES = ["Slim", "Relaxed", "Oversized", "Tailored", "Cropped", "Bodycon"] as const;
export const STRETCH = ["None", "Slight", "Moderate", "Very stretchy"] as const;

export const ITEM_FIELDS = [
  "brand",
  "style_name",
  "category",
  "color",
  "composition",
  "fabrics",
  "care",
  "fit_style",
  "stretch",
  "neckline",
  "sleeve",
  "hem",
  "closure",
  "features",
  "retail_price",
  "fit_notes",
] as const;
export type ItemField = (typeof ITEM_FIELDS)[number];

/** Fields the agent may guess (always shown as "Guess · Please check"). Everything else must come from a source. */
export const GUESSABLE: ItemField[] = ["stretch", "fit_style", "hem", "sleeve", "closure", "care"];

export type Source = "link" | "photo" | "typed" | "guess";

export type Anchor = { id: string; label: string; dealbreaker: boolean };

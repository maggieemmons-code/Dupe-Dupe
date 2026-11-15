/**
 * Item fields and their allowed values, shared by the brief builder (server)
 * and the screens. Every field a friend can change is a pick from one of these
 * lists, so the brief builder may only answer from the same lists.
 */

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

/** Color families, each with the swatch shown in its color dot. */
export const COLORS = [
  { name: "Black", hex: "#111111" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Ivory / Cream", hex: "#F3EBDA" },
  { name: "Beige / Camel", hex: "#C9A57A" },
  { name: "Brown", hex: "#6B4428" },
  { name: "Gray", hex: "#9A9A9A" },
  { name: "Navy", hex: "#1F2A4D" },
  { name: "Blue", hex: "#2F5FC4" },
  { name: "Light blue", hex: "#A9C8EC" },
  { name: "Green", hex: "#2F7A45" },
  { name: "Olive", hex: "#6E6B35" },
  { name: "Yellow", hex: "#EFCB3A" },
  { name: "Orange", hex: "#E07A2E" },
  { name: "Red", hex: "#B3262A" },
  { name: "Burgundy / Wine", hex: "#6B1E2E" },
  { name: "Pink", hex: "#EDA3B8" },
  { name: "Purple", hex: "#6E4A9E" },
  { name: "Gold", hex: "#C9A23A" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Multicolor / Print", hex: "conic-gradient(#B3262A, #EFCB3A, #2F7A45, #2F5FC4, #6E4A9E, #B3262A)" },
] as const;
export const COLOR_NAMES = COLORS.map((c) => c.name);

export const FIBERS = [
  "Cotton",
  "Linen",
  "Wool",
  "Cashmere",
  "Silk",
  "Polyester",
  "Nylon",
  "Viscose / Rayon",
  "Acetate",
  "Spandex / Elastane",
  "Leather",
  "Faux leather",
] as const;

export const WEAVES = [
  "Jacquard",
  "Brocade",
  "Satin",
  "Crepe",
  "Chiffon",
  "Velvet",
  "Lace",
  "Taffeta",
  "Organza",
  "Tweed",
  "Denim",
  "Knit",
  "Jersey",
  "Sequin",
  "Plain weave",
] as const;

export const STRETCH = ["None", "Slight", "Moderate", "Very stretchy"] as const;
export const SIZING = ["Runs small", "True to size", "Runs large"] as const;
export const FIT_STYLES = ["Slim", "Relaxed", "Oversized", "Tailored", "Cropped", "Bodycon"] as const;
export const NECKLINES = [
  "Crew",
  "V-neck",
  "Scoop",
  "Square",
  "Sweetheart",
  "Off-shoulder",
  "One-shoulder",
  "Strapless",
  "Halter",
  "Collared",
  "Turtleneck",
  "Cowl",
  "Boat",
] as const;
export const SLEEVES = ["Sleeveless", "Straps", "Cap", "Short", "Elbow", "3/4", "Long", "Puff"] as const;
export const LENGTHS = ["Cropped", "Hip", "Mini", "Above knee", "Knee", "Midi", "Ankle", "Floor-length"] as const;
export const CLOSURES = [
  "Pullover",
  "Back zip",
  "Side zip",
  "Front zip",
  "Buttons",
  "Tie / Wrap",
  "Hook & eye",
  "Lace-up",
] as const;
export const CARE = ["Machine wash", "Hand wash", "Dry clean only", "Spot clean"] as const;
export const DETAILS = [
  "Boned / corset bodice",
  "Fully lined",
  "Slit",
  "Pockets",
  "Ruching",
  "Pleats",
  "Ruffles",
  "Cutouts",
  "Bow",
  "Smocking",
  "Embellished",
  "Open back",
] as const;

/** Single-choice fields and their lists. */
export const SINGLE_CHOICE = {
  category: CATEGORIES,
  color: COLOR_NAMES,
  weave: WEAVES,
  stretch: STRETCH,
  sizing: SIZING,
  neckline: NECKLINES,
  sleeve: SLEEVES,
  hem: LENGTHS,
  closure: CLOSURES,
} as const satisfies Record<string, readonly string[]>;

/** Pick-any fields and their lists. */
export const MULTI_CHOICE = {
  fabrics: FIBERS,
  fit_style: FIT_STYLES,
  care: CARE,
  details: DETAILS,
} as const satisfies Record<string, readonly string[]>;

export type SingleField = keyof typeof SINGLE_CHOICE;
export type MultiField = keyof typeof MULTI_CHOICE;

export const ITEM_FIELDS = [
  "brand",
  "style_name",
  "category",
  "color",
  "color_name",
  "composition",
  "fabrics",
  "weave",
  "care",
  "fit_style",
  "stretch",
  "sizing",
  "neckline",
  "sleeve",
  "hem",
  "closure",
  "details",
  "retail_price",
  "fit_notes",
] as const;
export type ItemField = (typeof ITEM_FIELDS)[number];

/** Fields the agent may guess (shown as "Guess" with its reason). Everything else must come from a source. */
export const GUESSABLE: ItemField[] = ["stretch", "fit_style", "hem", "sleeve", "closure", "care"];

export type Source = "link" | "photo" | "typed" | "guess";

export type Anchor = { id: string; label: string; dealbreaker: boolean };

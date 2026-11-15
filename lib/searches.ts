import type { Anchor, ItemField } from "@/lib/fields";

/** A row of public.searches, as the screens use it. */
export type SearchRow = {
  id: string;
  user_id: string;
  status: string;
  error: string | null;
  source_links: string[];
  pasted_text: string;
  photo_paths: string[];
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
  field_sources: Partial<Record<ItemField, { from: string; note?: string }>>;
  budget: number | null;
  sizes: string[];
  view: "all" | "new" | "used";
  visual_brief: { anchors?: Anchor[] } & Record<string, unknown> | null;
  brief_built_at: string | null;
  brief_stale: boolean;
  created_at: string;
};

/** The name a search goes by on Find and Review. */
export function searchName(s: Pick<SearchRow, "brand" | "style_name" | "pasted_text" | "source_links" | "photo_paths">) {
  const named = [s.brand, s.style_name].filter(Boolean).join(" ").trim();
  if (named) return named;
  if (s.pasted_text.trim()) return s.pasted_text.trim().slice(0, 40);
  const link = s.source_links[0];
  if (link) {
    try {
      const slug = new URL(link).pathname.split("/").filter(Boolean).pop() ?? "";
      const words = decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim();
      if (words) return words.slice(0, 40);
      return new URL(link).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  return s.photo_paths.length ? "Photo search" : "Untitled search";
}

export const SIZES = [
  "XXS", "XS", "S", "M", "L", "XL", "XXL", "1X", "2X", "3X",
  "00", "0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24", "One size",
];

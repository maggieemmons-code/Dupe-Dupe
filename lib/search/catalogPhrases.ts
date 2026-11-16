/* Shopify catalog phrasings (code, no AI). See NOTES.md › Shopify Global Catalog. */

/**
 * One catalog phrasing per signature detail: the shade, the detail, the garment word
 * ("black big plush faux fur shawl collar coat"). Words already in the detail aren't repeated.
 */
export function detailPhrases(
  s: { color?: string | null; color_name?: string | null; visual_brief?: { anchors?: { label?: string }[] } | null },
  lookAlike: string[],
) {
  const shade = (s.color_name || (s.color ?? "").split("/")[0] || "").trim().toLowerCase();
  const garment = (lookAlike[0] ?? "").trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  const out: string[] = [];
  for (const a of s.visual_brief?.anchors ?? []) {
    const label = (a?.label ?? "").trim().toLowerCase();
    if (!label) continue;
    const words = [shade, label, garment].join(" ").split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    const phrase = words.filter((w) => (seen.has(w) ? false : (seen.add(w), true))).join(" ");
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out.slice(0, 3);
}


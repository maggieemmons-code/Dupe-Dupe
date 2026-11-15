/**
 * Keeps the parts of a product page the judge needs (fabric, lining, care,
 * fit, sizes) and drops menus, footers and other products. Page text can run
 * to 50,000 characters; this keeps it under about 2,500.
 */
const USEFUL =
  /(\d+\s?%|polyester|cotton|silk|satin|viscose|rayon|nylon|elastane|spandex|lycra|wool|cashmere|linen|acetate|modal|lyocell|tencel|cupro|leather|jacquard|brocade|crepe|chiffon|tulle|lace|velvet|lining|lined|fabric|material|composition|shell|care|dry clean|hand wash|machine wash|boning|boned|corset|zip|stretch|fits? true|runs (small|large)|model is|model wears|size)/i;

export function usefulPageText(text: string, max = 2500) {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim())
    .filter((l) => l.length > 2 && l.length < 400 && USEFUL.test(l));
  const seen = new Set<string>();
  const out: string[] = [];
  let len = 0;
  for (const l of lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (len + l.length > max) break;
    out.push(l);
    len += l.length + 1;
  }
  return out.join("\n");
}

import "server-only";

/**
 * Reads a US-dollar retail price straight from listing text, as a safety net
 * when the brief builder leaves it empty. Looks only near the top of the page
 * (where the product price sits, before "you may also like" items), and only
 * at amounts marked as US dollars, so another currency is never shown as dollars.
 */
export function usdPriceFromPage(text: string): number | null {
  const top = text.slice(0, 2500);
  const match = top.match(/(?:US\$|USD\s?\$?|(?<![A-Z])\$)\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?(?!\s?(?:AUD|CAD|NZD|SGD|HKD))/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, "")) + (match[2] ? Number(match[2]) / 100 : 0);
  return Number.isFinite(value) && value >= 5 && value <= 50000 ? value : null;
}

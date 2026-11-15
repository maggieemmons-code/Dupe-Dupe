/**
 * Price range for new items. On Review the friend drags both ends of a slider:
 * `budget_min` (the low end; null or 0 = none) and `budget` (the high end;
 * null = no limit). Both start where the friend left them on their last search.
 *
 * History: the low end used to start at 15% of the original's price (Nov 15),
 * then capped at $75; Maggie then asked that friends set it themselves, because
 * a very expensive original skews any floor worked out from its price.
 */

/** The low end a search uses: only what the friend set. */
export function lowEnd(s: { budget_min: number | null }) {
  return s.budget_min != null && s.budget_min > 0 ? s.budget_min : null;
}

/** Top of the slider: the original's price, or a sensible scale when it's unknown. */
export function sliderMax(retailPrice: number | null, budget: number | null) {
  const base = retailPrice && retailPrice > 0 ? retailPrice : Math.max(500, (budget ?? 0) * 2);
  return Math.max(100, Math.ceil(Math.max(base, budget ?? 0) / 10) * 10);
}

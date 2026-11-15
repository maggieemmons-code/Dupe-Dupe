/**
 * Price range for new items (Maggie, Nov 15). Very cheap pieces rarely look as
 * high end as the original, so the low end of the range starts at 15% of the
 * original's retail price ($750 gown → $113). On Review the friend drags both
 * ends of a slider: `budget_min` (low, null = this default, 0 = no low end) and
 * `budget` (high, null = no limit).
 */
export const PRICE_FLOOR_SHARE = 0.15;

/** The starting low end before a friend moves it. Null when there's no retail price or the budget is tight. */
export function priceFloor(retailPrice: number | null, budget: number | null): number | null {
  if (!retailPrice || retailPrice <= 0) return null;
  const floor = Math.round(retailPrice * PRICE_FLOOR_SHARE);
  if (budget && floor >= budget * 0.6) return null; // a tight budget wins over the floor
  return floor;
}

/** The low end a search actually uses: the friend's choice if they moved it, else the default floor. */
export function lowEnd(s: { budget_min: number | null; retail_price: number | null; budget: number | null }) {
  if (s.budget_min != null) return s.budget_min > 0 ? s.budget_min : null;
  return priceFloor(s.retail_price, s.budget);
}

/** Top of the slider: the original's price, or a sensible scale when it's unknown. */
export function sliderMax(retailPrice: number | null, budget: number | null) {
  const base = retailPrice && retailPrice > 0 ? retailPrice : Math.max(500, (budget ?? 0) * 2);
  return Math.max(100, Math.ceil(Math.max(base, budget ?? 0) / 10) * 10);
}

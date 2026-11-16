/*
 * Learn which stores deliver (Nov 15 review, "self-learning"). Two of each search's
 * Google Shopping searches are scoped to a store by adding its name to the words. They
 * used to be fixed (Revolve, Nordstrom); now they're the friend's own best stores: the
 * ones that most often gave them dupes that passed the judge, with clicks counting double,
 * across at least two searches. Per friend only, so one friend's taste never changes
 * another's results. Plain code, no AI.
 */

export const DEFAULT_STORE_SEARCHES = ["Revolve", "Nordstrom"];

/** Marketplaces and sites where adding the name to the words doesn't scope the search. */
const NOT_SCOPABLE = /\b(amazon|ebay|etsy|walmart|target|poshmark|mercari|depop|aliexpress|temu|shein|google|editorialist|lyst|modesens|shopstyle)\b|\s[-–]\s/i;

/** `query`: the search that found it. Pieces from a store's own scoped search don't count for that store (it would only reinforce itself). */
export type StoreHit = { store: string; search_id: string; clicked?: boolean; query?: string };

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.(com|us|co\.uk|net)\b/g, "")
    .replace(/\b(us|usa|official)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function pickStoreSearches(hits: StoreHit[], n = 2, defaults = DEFAULT_STORE_SEARCHES, minSearches = 2): string[] {
  const tally = new Map<string, { points: number; searches: Set<string>; names: Map<string, number> }>();
  for (const h of hits) {
    const name = (h.store ?? "").trim();
    if (!name || NOT_SCOPABLE.test(name)) continue;
    const k = key(name);
    if (k.length < 3) continue;
    if (h.query && key(h.query).endsWith(` ${k}`)) continue;
    const t = tally.get(k) ?? { points: 0, searches: new Set<string>(), names: new Map<string, number>() };
    t.points += h.clicked ? 2 : 1;
    t.searches.add(h.search_id);
    t.names.set(name, (t.names.get(name) ?? 0) + 1);
    tally.set(k, t);
  }
  const learned = [...tally.values()]
    .filter((t) => t.searches.size >= minSearches)
    .sort((a, b) => b.points - a.points || b.searches.size - a.searches.size)
    .map((t) => [...t.names.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  const out: string[] = [];
  for (const s of [...learned, ...defaults]) {
    if (out.length >= n) break;
    if (!out.some((o) => key(o) === key(s))) out.push(s);
  }
  return out;
}

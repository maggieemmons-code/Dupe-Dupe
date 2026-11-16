/*
 * Hidden stores (Maggie, Nov 15: "a way for the user to say, don't show me this store").
 * One friend's choice, saved in store_prefs (migration 0011). Plain module: cleaning in the
 * search job and the result screens use the same matching, so a hidden store disappears from
 * past results at once and is dropped from every new search.
 */

export type HiddenStore = { name: string; domain: string };

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const host = (s: string) => (s ?? "").toLowerCase().replace(/^www\./, "");

/** By web address when both are known, else by name ("The Dress Outlet", "thedressoutlet.com"). */
export function isHiddenStore(c: { store: string; store_domain: string }, hidden: HiddenStore[]): boolean {
  if (!hidden.length) return false;
  const name = norm(c.store);
  const domain = host(c.store_domain);
  return hidden.some((h) => {
    const d = host(h.domain);
    if (d && domain && (domain === d || domain.endsWith(`.${d}`))) return true;
    const n = norm(h.name);
    if (!n) return false;
    // "DDMINE" also matches "SHOP DDMINE"; very short names must match exactly.
    return name === n || (n.length >= 5 && (name.includes(n) || (!!domain && norm(domain).includes(n))));
  });
}

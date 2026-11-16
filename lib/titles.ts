/*
 * Cleaner product titles on screen (Nov 15 review: store titles arrive keyword-stuffed).
 * Code, not AI, and display only: the saved title stays as the store wrote it, so links,
 * matching and the judge are unchanged. Removes the store's own name and shop slogans at
 * either end, a leading "Amazon.com:" or category trail, and calms ALL-CAPS titles.
 */

const SEPARATOR = /\s+[–—|]\s+|\s+-\s+/;
const JUNK = /^(usa?|uk|us store|official( site| store)?|online|shop( now| online)?|buy .*|free shipping.*|women'?s?|womens|new arrivals?|sale)$/i;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(com|us|co\.uk|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

export function cleanTitle(title: string, store = ""): string {
  let t = (title ?? "").replace(/\s+/g, " ").trim();
  if (!t) return t;
  // "Amazon.com: …", "Walmart.com: …"
  t = t.replace(/^[\w.-]+\.(com|net|co\.uk|us)\s*:\s*/i, "");
  // "Clothing: Maxi Dresses: 'Persephone' …" — a category trail before the name.
  t = t.replace(/^(?:[A-Z][\w&' ]{1,24}:\s+){1,3}(?=\S)/, "");

  const storeKey = norm(store.replace(/\b(us|usa|uk|official)\b/gi, ""));
  const isStore = (seg: string) => {
    const k = norm(seg.replace(/\b(us|usa|uk|official)\b/gi, ""));
    return !!k && !!storeKey && (k === storeKey || (k.length >= 4 && (storeKey.includes(k) || k.includes(storeKey))));
  };
  const parts = t.split(SEPARATOR).map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && (JUNK.test(parts[parts.length - 1]) || isStore(parts[parts.length - 1]))) parts.pop();
  while (parts.length > 1 && (JUNK.test(parts[0]) || isStore(parts[0]))) parts.shift();
  t = parts.join(" – ");

  // ALL CAPS reads as shouting; most store titles in caps are just a template.
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length > 8 && letters === letters.toUpperCase()) {
    t = t.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, pre: string, a: string) => pre + a.toUpperCase());
  }
  return t;
}

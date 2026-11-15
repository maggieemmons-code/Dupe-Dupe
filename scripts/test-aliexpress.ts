/**
 * Can Dupe Dupe read an AliExpress listing (reviews, store rating, store age, photos)?
 * Finds one through Google Shopping (2 SerpApi searches), follows Google's link to
 * AliExpress, then reads the page with TinyFish (free) and prints what it found.
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-aliexpress.ts "<words>"
 */
import { shoppingDetails, shoppingSearch } from "../lib/server/serpapi";
import { fetchPages } from "../lib/server/tinyfish";

async function main() {
  const q = process.argv[2] ?? "white strapless maxi dress aliexpress";
  const items = (await shoppingSearch(q, null)).filter((x) => /aliexpress/i.test(x.store));
  const first = items.find((x) => x.product_token);
  if (!first?.product_token) return console.log("No AliExpress result");
  const d = await shoppingDetails(first.product_token, "AliExpress");
  console.log("Store page:", d.url);
  if (!d.url) return;
  const t = Date.now();
  const { pages, failed } = await fetchPages([d.url], "Read an AliExpress product page: reviews count and rating, store name, store rating, store open since, product photos", 45000);
  console.log(`Read ${pages.length}, failed ${failed.length}, ${((Date.now() - t) / 1000).toFixed(0)}s`);
  const p = pages[0];
  if (!p) return;
  console.log(`${p.text.length} chars, ${p.images.length} images`);
  for (const l of p.text.split("\n").filter((l) => /review|rating|stars?|sold|store|open|since|year|feedback|positive|followers/i.test(l)).slice(0, 25)) {
    console.log("  |", l.trim().slice(0, 160));
  }
}

main();

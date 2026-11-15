/**
 * Reads one or more pages with TinyFish and prints what it found about fabric (free; no SerpApi).
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-read.ts <url> [url…]
 */
import { fetchPages } from "../lib/server/tinyfish";

async function main() {
  const urls = process.argv.slice(2);
  const t = Date.now();
  const { pages, failed } = await fetchPages(urls, "Read a clothing product page: fabric content, lining, care, sizes in stock, price");
  console.log(`${pages.length} read, ${failed.length} failed, ${((Date.now() - t) / 1000).toFixed(1)}s`);
  for (const p of pages) {
    const lines = p.text.split("\n").filter((l) => /polyester|cotton|silk|viscose|rayon|nylon|elastane|spandex|wool|linen|acetate|lining|fabric|material|composition|shell/i.test(l));
    console.log(`\n${p.url.slice(0, 100)}\n  title: ${p.title.slice(0, 80)} · ${p.text.length} chars`);
    for (const l of lines.slice(0, 8)) console.log(`  | ${l.trim().slice(0, 160)}`);
    const links = p.text.match(/https?:\/\/[^\s)]+/g)?.filter((u) => !/google|gstatic/.test(u)).slice(0, 5) ?? [];
    if (links.length) console.log("  links:", links.join(" "));
  }
  for (const f of failed) console.log("FAILED", f.slice(0, 100));
}

main();

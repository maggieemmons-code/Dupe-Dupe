import "server-only";
import sharp from "sharp";
import type { FetchedPage } from "./tinyfish";

/*
 * Picks the product photos out of a listing page's image links and downloads them.
 * A page lists everything: menu banners, logos, other products. We keep images
 * whose file name shares words with the product's page address or title, skip
 * obvious site chrome, and take up to 3 in page order.
 */

const CHROME = /(logo|wordmark|icon|sprite|favicon|nav|menu|banner|badge|payment|flag|placeholder|loader|swatch)/i;
const STOP = new Set(["products", "product", "collections", "shop", "the", "and", "with", "for", "www", "com", "html"]);
const MAX_BYTES = 8 * 1024 * 1024;

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** The image's file name without size or version suffixes, used to group copies of one photo. */
function baseKey(url: string) {
  const u = new URL(url);
  return (u.hostname + u.pathname).toLowerCase();
}

function widthOf(url: string) {
  const w = new URL(url).searchParams.get("width") ?? new URL(url).searchParams.get("w");
  return w ? parseInt(w, 10) || 0 : 0;
}

/** Only public https addresses: no IP literals, no local names. */
export function safeUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const host = u.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || !host.includes(".") || host.endsWith(".local") || host === "localhost") {
      return null;
    }
    if (/\.svg($|\?)/i.test(u.pathname) || /\.gif($|\?)/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function pickProductPhotos(page: FetchedPage, max = 3) {
  const productWords = [...new Set([...words(new URL(page.url).pathname), ...words(page.title)])];

  // One entry per photo (a page lists the same photo at several widths).
  const groups = new Map<string, { url: string; width: number; file: string; order: number }>();
  page.images.forEach((raw, order) => {
    const url = safeUrl(raw);
    if (!url) return;
    const file = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").toLowerCase();
    if (CHROME.test(file)) return;
    const key = baseKey(url);
    const width = widthOf(url);
    const prev = groups.get(key);
    // Prefer the copy closest to 1,024px wide (the largest at or under 1,400).
    const better = !prev || (width <= 1400 && width > prev.width) || (prev.width > 1400 && width < prev.width);
    if (better) groups.set(key, { url, width, file: file.replace(/[^a-z0-9]/g, ""), order: prev?.order ?? order });
  });
  const photos = [...groups.values()];

  // Words rare on the page (the style name) count more than common ones ("gown").
  // Stores often run words together ("JoannaGown-RedDate"), so match inside the file name.
  const weight = new Map(
    productWords.map((w) => [w, 1 / Math.max(1, photos.filter((p) => p.file.includes(w)).length)]),
  );
  const scored = photos
    .map((p) => ({ ...p, score: productWords.reduce((sum, w) => sum + (p.file.includes(w) ? weight.get(w)! : 0), 0) }))
    .filter((p) => p.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((p) => p.score));

  return scored
    .filter((p) => p.score >= best * 0.6)
    .sort((a, b) => a.order - b.order)
    .slice(0, max)
    .map((p) => p.url);
}

/** Downloads a photo and shrinks it to a 1,024px JPEG with no metadata. Returns null if it isn't a usable image. */
export async function downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    const img = sharp(buf);
    const meta = await img.metadata();
    if (!meta.width || !meta.height || Math.max(meta.width, meta.height) < 300) return null;
    return await img
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Downloads a result's photo for the screener (256px) or the judge (larger) and shrinks it. Null if unusable. */
export async function downloadThumb(url: string, side = 256): Promise<Buffer | null> {
  const safe = safeUrl(url);
  if (!safe) return null;
  try {
    const res = await fetch(safe, { signal: AbortSignal.timeout(10000), redirect: "follow" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    return await sharp(buf)
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {
    return null;
  }
}

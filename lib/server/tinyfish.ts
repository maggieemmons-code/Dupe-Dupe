import "server-only";

const FETCH_URL = "https://api.fetch.tinyfish.ai";

export type FetchedPage = { url: string; title: string; text: string; images: string[] };

/**
 * Reads web pages as markdown with TinyFish Fetch (free up to 1,000 URLs a day),
 * plus the image links on each page. Returns the pages that loaded and the URLs that failed.
 */
export async function fetchPages(urls: string[], purpose: string, perUrlTimeoutMs = 45000) {
  // Tolerate a stray space, line break or quotes from pasting the key into settings.
  const key = process.env.TINYFISH_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("TINYFISH_API_KEY is not set");

  const res = await fetch(FETCH_URL, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: urls.slice(0, 10),
      format: "markdown",
      purpose,
      image_links: true,
      per_url_timeout_ms: perUrlTimeoutMs,
    }),
    signal: AbortSignal.timeout(perUrlTimeoutMs + 15000),
  });

  if (!res.ok) {
    throw new Error(`TinyFish ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    results?: { url: string; final_url?: string; title?: string; text?: unknown; image_links?: unknown }[];
    errors?: { url: string; error?: string }[];
  };

  const pages: FetchedPage[] = (data.results ?? [])
    .filter((r) => typeof r.text === "string" && r.text.trim())
    .map((r) => ({
      url: r.final_url || r.url,
      title: r.title ?? "",
      text: String(r.text),
      images: Array.isArray(r.image_links) ? r.image_links.filter((u): u is string => typeof u === "string") : [],
    }));
  const failed = (data.errors ?? []).map((e) => e.url);

  return { pages, failed };
}

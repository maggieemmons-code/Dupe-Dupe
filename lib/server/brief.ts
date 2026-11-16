import "server-only";
import { logApiCall, type Session } from "@/lib/server/session";
import { fetchPages, type FetchedPage } from "@/lib/server/tinyfish";
import { loadPhotosBase64, savePhoto } from "@/lib/server/photos";
import { pickProductPhotos, downloadPhoto, downloadThumb } from "@/lib/server/linkPhotos";
import { lookupOriginal } from "@/lib/server/serpapi";
import { usdPriceFromPage } from "@/lib/server/price";
import { runBriefBuilder } from "@/lib/agents/briefBuilder";
import type { SearchRow } from "@/lib/searches";
import { ITEM_FIELDS } from "@/lib/fields";
import { loadTaste } from "@/lib/server/taste";
import { tasteText } from "@/lib/taste";

type Result = { ok: true } | { ok: false; error: string };

/*
 * Shared by the Review page's server action and scripts/run-test-set.ts, which
 * passes a session made from the server key and the friend's user id.
 */

/**
 * Runs the brief builder once for a new search: reads the link with TinyFish,
 * sends the page, notes and photos to Claude, and saves the plain fields and briefs.
 */
export async function buildBriefFor(session: Session, searchId: string, opts: { keepEdits?: boolean } = {}): Promise<Result> {
  const { supabase } = session;

  // Claim the search so two tabs (or React's double run in development) never pay twice.
  const { data: claimed } = await supabase
    .from("searches")
    .update({ status: "briefing", error: null })
    .eq("id", searchId)
    .eq("status", "new")
    .select("*")
    .maybeSingle();
  if (!claimed) return { ok: true }; // already running or done; the page will refresh
  const search = claimed as SearchRow;
  // Progress bar while reading (Maggie, Nov 15). A failure here never stops the brief.
  const step = async (n: number) => {
    await supabase.from("searches").update({ progress: { brief_step: n } }).eq("id", searchId);
  };
  await step(1);

  // Edit details after a search (Maggie, Nov 15): the friend's edits win over the page. They go to
  // the brief builder as corrections and are written back over its answers. Signature details are
  // rebuilt too (an edit can change them: pink → black), keeping her Must match switches where a
  // detail is the same as before.
  const edits: Record<string, unknown> = {};
  if (opts.keepEdits) {
    for (const [field, src] of Object.entries((search.field_sources ?? {}) as Record<string, { from?: string }>)) {
      if (src?.from === "edited" && (ITEM_FIELDS as readonly string[]).includes(field)) edits[field] = (search as Record<string, unknown>)[field];
    }
  }
  const corrections = Object.entries(edits)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("; ");

  try {
    // 1. Read the product links.
    let pages: FetchedPage[] = [];
    let unreadLinks: string[] = [];
    if (search.source_links.length) {
      try {
        const res = await fetchPages(
          search.source_links,
          "Read a clothing product page (name, brand, price, fabric, fit and details) to describe the garment",
        );
        pages = res.pages;
        unreadLinks = search.source_links.filter((u) => !res.pages.some((p) => p.url === u) && res.failed.includes(u));
        if (!pages.length) unreadLinks = search.source_links;
        await logApiCall(session, {
          service: "tinyfish",
          stage: "brief",
          searchId,
          units: { pages: pages.length, failed: unreadLinks.length },
          ok: pages.length > 0,
        });
      } catch (e) {
        unreadLinks = search.source_links;
        await logApiCall(session, { service: "tinyfish", stage: "brief", searchId, ok: false, error: String(e) });
      }
    }

    // 1b. Stores like Revolve block page reading. Then find the same product on
    //     Google Shopping by the name in its address (2 SerpApi searches).
    let lookupPhotos: string[] = [];
    const tooThin = !pages.length || pages[0].text.length < 400;
    if (tooThin && search.source_links[0]) {
      try {
        const found = await lookupOriginal(search.source_links[0]);
        await logApiCall(session, { service: "serpapi", stage: "brief-lookup", searchId, units: { searches: 2, found: !!found }, ok: true });
        if (found) {
          pages = [found.page];
          unreadLinks = [];
          lookupPhotos = found.photoUrls;
        }
      } catch (e) {
        await logApiCall(session, { service: "serpapi", stage: "brief-lookup", searchId, ok: false, error: String(e) });
      }
    }

    await step(2);
    // 2. Product photos from the listing page (up to 3). If the friend gave no
    //    photos of their own, the first one becomes the search's main photo.
    const productPhotos: { data: string; mediaType: "image/jpeg" }[] = [];
    const productPaths: string[] = [];
    if (pages[0] && search.photo_paths.length < 4) {
      const room = Math.min(3, 4 - search.photo_paths.length);
      const buffers = lookupPhotos.length
        ? (await Promise.all(lookupPhotos.slice(0, room).map((u) => downloadThumb(u, 1024)))).filter((b): b is Buffer => !!b)
        : (await Promise.all(pickProductPhotos(pages[0], room).map(downloadPhoto))).filter((b): b is Buffer => !!b);
      for (const [i, buf] of buffers.entries()) {
        productPhotos.push({ data: buf.toString("base64"), mediaType: "image/jpeg" });
        if (!search.photo_paths.length) {
          try {
            productPaths.push(await savePhoto(session, searchId, `link-${i + 1}`, buf));
          } catch (e) {
            console.error("Saving a product photo failed", e);
          }
        }
      }
    }

    await step(3);
    // 3. Ask the brief builder.
    const photos = await loadPhotosBase64(session, search.photo_paths);
    let result;
    try {
      result = await runBriefBuilder({
        pages,
        unreadLinks,
        notes: corrections
          ? `${search.pasted_text ? `${search.pasted_text}\n\n` : ""}The shopper corrected these details. They are right; use them over the product page: ${corrections}`
          : search.pasted_text,
        photos,
        productPhotos,
        tasteRules: tasteText(await loadTaste(supabase as never, session.userId)),
      });
      await logApiCall(session, { service: "claude", stage: "brief", searchId, units: result.usage, ok: true });
    } catch (e) {
      await logApiCall(session, { service: "claude", stage: "brief", searchId, ok: false, error: String(e) });
      throw e;
    }

    const { brief } = result;

    // Safety net: if the brief builder missed the price, read it from the page text itself.
    if (brief.item.retail_price == null && pages[0]) {
      const price = usdPriceFromPage(pages[0].text);
      if (price != null) {
        brief.item.retail_price = price;
        brief.sources.retail_price = { from: "link", note: "Price shown on the page" };
      }
    }
    const { error } = await supabase
      .from("searches")
      .update({
        // Only the known item fields: the agent sometimes adds others (e.g. "sources"), which the table doesn't have.
        ...Object.fromEntries(Object.entries(brief.item).filter(([k]) => (ITEM_FIELDS as readonly string[]).includes(k))),
        ...edits,
        ...(productPaths.length ? { photo_paths: productPaths } : {}),
        field_sources: { ...brief.sources, ...Object.fromEntries(Object.keys(edits).map((k) => [k, { from: "edited" }])) },
        visual_brief: opts.keepEdits ? { ...brief.visual_brief, anchors: carryMustMatch(brief.visual_brief?.anchors, search.visual_brief?.anchors) } : brief.visual_brief,
        composition_brief:
          opts.keepEdits && search.composition_brief?.must_match != null
            ? { ...brief.composition_brief, must_match: search.composition_brief.must_match }
            : brief.composition_brief,
        search_queries: brief.search_queries,
        brief_built_at: new Date().toISOString(),
        brief_stale: false,
        status: "review",
        error: unreadLinks.length
          ? "We couldn't open the product page, so we only read what the web address says. Add a screenshot or check the details below."
          : null,
      })
      .eq("id", searchId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    console.error("Brief failed", e);
    await supabase
      .from("searches")
      .update({ status: "failed", error: "We couldn't read this piece." })
      .eq("id", searchId);
    return { ok: false, error: "We couldn't read this piece. Try again, or add a photo or a few words." };
  }
}

type AnchorLike = { id: string; label: string; dealbreaker?: boolean };

/** New signature details, with the friend's Must match switches carried over by id or by wording. */
export function carryMustMatch(next: AnchorLike[] | undefined, before: AnchorLike[] | undefined): AnchorLike[] {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return (next ?? []).map((a) => {
    const old = (before ?? []).find((b) => b.id === a.id || norm(b.label) === norm(a.label));
    return old ? { ...a, dealbreaker: !!old.dealbreaker } : a;
  });
}


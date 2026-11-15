"use server";

import { getSession, logApiCall } from "@/lib/server/session";
import { fetchPages, type FetchedPage } from "@/lib/server/tinyfish";
import { loadPhotosBase64, savePhoto } from "@/lib/server/photos";
import { pickProductPhotos, downloadPhoto } from "@/lib/server/linkPhotos";
import { usdPriceFromPage } from "@/lib/server/price";
import { runBriefBuilder } from "@/lib/agents/briefBuilder";
import { SINGLE_CHOICE, MULTI_CHOICE, type Anchor, type ItemField } from "@/lib/fields";
import type { SearchRow } from "@/lib/searches";
import { inngest, SEARCH_CONFIRMED } from "@/lib/inngest/client";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Runs the brief builder once for a new search: reads the link with TinyFish,
 * sends the page, notes and photos to Claude, and saves the plain fields and briefs.
 */
export async function buildBrief(searchId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
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

    // 2. Product photos from the listing page (up to 3). If the friend gave no
    //    photos of their own, the first one becomes the search's main photo.
    const productPhotos: { data: string; mediaType: "image/jpeg" }[] = [];
    const productPaths: string[] = [];
    if (pages[0] && search.photo_paths.length < 4) {
      const urls = pickProductPhotos(pages[0], Math.min(3, 4 - search.photo_paths.length));
      const buffers = (await Promise.all(urls.map(downloadPhoto))).filter((b): b is Buffer => !!b);
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

    // 3. Ask the brief builder.
    const photos = await loadPhotosBase64(session, search.photo_paths);
    let result;
    try {
      result = await runBriefBuilder({
        pages,
        unreadLinks,
        notes: search.pasted_text,
        photos,
        productPhotos,
        tasteRules: "None yet.",
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
        ...brief.item,
        ...(productPaths.length ? { photo_paths: productPaths } : {}),
        field_sources: brief.sources,
        visual_brief: brief.visual_brief,
        composition_brief: brief.composition_brief,
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

/** Lets a failed brief run again. */
export async function retryBrief(searchId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  await session.supabase
    .from("searches")
    .update({ status: "new", error: null })
    .eq("id", searchId)
    .eq("status", "failed");
  return { ok: true };
}

const TEXT_FIELDS: ItemField[] = ["brand", "style_name"];

type FieldValue = string | string[] | number | null;

/**
 * Saves edited item fields. Pick-list fields accept only listed values; brand
 * and item name are short text; retail price is a number. Never runs a search;
 * marks the briefs out of date.
 */
export async function saveFields(
  searchId: string,
  edits: Partial<Record<ItemField, FieldValue>>,
): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;

  const { data: current } = await supabase
    .from("searches")
    .select("field_sources, brief_built_at")
    .eq("id", searchId)
    .single();
  if (!current) return { ok: false, error: "This search wasn't found." };

  const update: Record<string, unknown> = {};
  const sources = { ...(current.field_sources ?? {}) } as Record<string, unknown>;

  for (const [field, raw] of Object.entries(edits) as [ItemField, FieldValue][]) {
    let value: FieldValue;
    if (field in SINGLE_CHOICE) {
      const list = SINGLE_CHOICE[field as keyof typeof SINGLE_CHOICE] as readonly string[];
      const v = typeof raw === "string" && list.includes(raw) ? raw : "";
      value = field === "stretch" ? (v ? [v] : []) : v;
    } else if (field in MULTI_CHOICE) {
      const list = MULTI_CHOICE[field as keyof typeof MULTI_CHOICE] as readonly string[];
      value = Array.isArray(raw) ? [...new Set(raw.filter((x) => list.includes(x)))] : [];
    } else if (TEXT_FIELDS.includes(field)) {
      value = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
    } else if (field === "retail_price") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/[^0-9.]/g, ""));
      value = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    } else {
      continue; // composition, color_name and fit_notes are read from sources only
    }
    update[field] = value;
    const filled = Array.isArray(value) ? value.length > 0 : value !== null && value !== "";
    if (filled) sources[field] = { from: "edited" };
    else delete sources[field];
  }

  if (!Object.keys(update).length) return { ok: true };

  const { error } = await supabase
    .from("searches")
    .update({
      ...update,
      field_sources: sources,
      changed_at: new Date().toISOString(),
      brief_stale: !!current.brief_built_at,
    })
    .eq("id", searchId);
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

/** Saves the signature details (anchors) and their Must match switches. */
export async function saveAnchors(searchId: string, anchors: Anchor[]): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;

  const { data: current } = await supabase.from("searches").select("visual_brief").eq("id", searchId).single();
  if (!current) return { ok: false, error: "This search wasn't found." };

  const clean = anchors
    .filter((a) => a.label?.trim())
    .slice(0, 6)
    .map((a, i) => ({
      id: a.id || `custom-${i + 1}`,
      label: a.label.trim().slice(0, 80),
      dealbreaker: !!a.dealbreaker,
    }));

  const { error } = await supabase
    .from("searches")
    .update({ visual_brief: { ...(current.visual_brief ?? {}), anchors: clean } })
    .eq("id", searchId);
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

/** Saves view, budget and sizes. Sizes also become the friend's default if they had none. */
export async function saveChoices(
  searchId: string,
  choices: { view?: "all" | "new" | "used"; budget?: string; budgetMin?: number | null; sizes?: string[] },
): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase, userId } = session;

  const update: Record<string, unknown> = {};
  if (choices.view && ["all", "new", "used"].includes(choices.view)) update.view = choices.view;
  if (choices.budget !== undefined) {
    const n = parseFloat(choices.budget.replace(/[^0-9.]/g, ""));
    update.budget = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (choices.budgetMin !== undefined) {
    const n = Number(choices.budgetMin);
    update.budget_min = choices.budgetMin === null ? null : Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if (choices.sizes) update.sizes = choices.sizes.slice(0, 12);

  const { error } = await supabase.from("searches").update(update).eq("id", searchId);
  if (error) return { ok: false, error: "That didn't save. Try again." };

  if (choices.sizes?.length) {
    const { data: profile } = await supabase.from("profiles").select("default_sizes").eq("id", userId).single();
    if (profile && !profile.default_sizes?.length) {
      await supabase.from("profiles").update({ default_sizes: choices.sizes }).eq("id", userId);
    }
  }
  return { ok: true };
}

/**
 * "Looks right, search": marks the search queued and hands it to the
 * background job (lib/inngest/searchJob.ts). The daily cap was checked when
 * the search was started on Find.
 */
export async function confirmSearch(searchId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { data, error } = await session.supabase
    .from("searches")
    .update({ status: "queued", error: null })
    .eq("id", searchId)
    .in("status", ["review", "queued", "failed"])
    .not("brief_built_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "That didn't save. Try again." };
  if (!data) return { ok: true }; // already searching or done; the page shows where it is
  // (A stuck "queued" search is re-sent below; the job claims queued → gathering once, so it never runs twice.)

  try {
    await inngest.send({ name: SEARCH_CONFIRMED, data: { searchId, userId: session.userId } });
  } catch (e) {
    console.error("Starting the search job failed", e);
    await session.supabase.from("searches").update({ status: "review" }).eq("id", searchId);
    return { ok: false, error: "The search didn't start. Try again in a minute." };
  }
  await session.supabase.from("events").insert({ type: "search_started", search_id: searchId });
  return { ok: true };
}

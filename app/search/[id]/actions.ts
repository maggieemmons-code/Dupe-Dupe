"use server";

import { getSession, logApiCall } from "@/lib/server/session";
import { fetchPages } from "@/lib/server/tinyfish";
import { loadPhotosBase64 } from "@/lib/server/photos";
import { runBriefBuilder, ITEM_FIELDS, CATEGORIES, type Anchor, type ItemField } from "@/lib/agents/briefBuilder";
import type { SearchRow } from "@/lib/searches";

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
    let pages: { url: string; title: string; text: string }[] = [];
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

    // 2. Ask the brief builder.
    const photos = await loadPhotosBase64(session, search.photo_paths);
    let result;
    try {
      result = await runBriefBuilder({
        pages,
        unreadLinks,
        notes: search.pasted_text,
        photos,
        tasteRules: "None yet.",
      });
      await logApiCall(session, { service: "claude", stage: "brief", searchId, units: result.usage, ok: true });
    } catch (e) {
      await logApiCall(session, { service: "claude", stage: "brief", searchId, ok: false, error: String(e) });
      throw e;
    }

    const { brief } = result;
    const { error } = await supabase
      .from("searches")
      .update({
        ...brief.item,
        field_sources: brief.sources,
        visual_brief: brief.visual_brief,
        composition_brief: brief.composition_brief,
        search_queries: brief.search_queries,
        brief_built_at: new Date().toISOString(),
        brief_stale: false,
        status: "review",
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

const ARRAY_FIELDS: ItemField[] = ["fabrics", "care", "fit_style", "stretch"];

/** Saves edited item fields. Never runs a search; marks the briefs out of date. */
export async function saveFields(
  searchId: string,
  edits: Partial<Record<ItemField, string>>,
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

  for (const [field, raw] of Object.entries(edits) as [ItemField, string][]) {
    if (!ITEM_FIELDS.includes(field)) continue;
    const text = String(raw ?? "").trim().slice(0, 500);
    if (ARRAY_FIELDS.includes(field)) {
      update[field] = text ? text.split(/\s*,\s*/).filter(Boolean).slice(0, 12) : [];
    } else if (field === "retail_price") {
      const n = parseFloat(text.replace(/[^0-9.]/g, ""));
      update[field] = Number.isFinite(n) ? n : null;
    } else if (field === "category") {
      update[field] = (CATEGORIES as readonly string[]).includes(text) ? text : "";
    } else {
      update[field] = text;
    }
    if (text) sources[field] = { from: "edited" };
    else delete sources[field];
  }

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
  choices: { view?: "all" | "new" | "used"; budget?: string; sizes?: string[] },
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

/** "Looks right, search": saves the confirmed search as queued. The search itself runs from phase 3. */
export async function confirmSearch(searchId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { error } = await session.supabase
    .from("searches")
    .update({ status: "queued" })
    .eq("id", searchId)
    .in("status", ["review", "queued"]);
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

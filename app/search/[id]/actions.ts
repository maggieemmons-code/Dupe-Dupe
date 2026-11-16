"use server";

import { getSession } from "@/lib/server/session";
import { buildBriefFor } from "@/lib/server/brief";
import { SINGLE_CHOICE, MULTI_CHOICE, type Anchor, type ItemField } from "@/lib/fields";
import { inngest, SEARCH_CONFIRMED } from "@/lib/inngest/client";
import { rescoreSearch } from "@/lib/server/rescore";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Runs the brief builder once for a new search (lib/server/brief.ts).
 */
export async function buildBrief(searchId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  return buildBriefFor(session, searchId);
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

/** Typed fields and their longest length. Every detail can be edited (Maggie, Nov 15), including the fabric tag. */
const TEXT_FIELDS: Partial<Record<ItemField, number>> = { brand: 80, style_name: 80, color_name: 60, composition: 120, fit_notes: 200 };

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
    } else if (field in TEXT_FIELDS) {
      value = typeof raw === "string" ? raw.trim().slice(0, TEXT_FIELDS[field]) : "";
    } else if (field === "retail_price") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/[^0-9.]/g, ""));
      value = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    } else {
      continue;
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

/** "Fabric must match" on Review: when on, a dealbreaker fabric rejects a piece instead of a caveat. */
export async function saveFabricMustMatch(searchId: string, on: boolean): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;
  const { data: current } = await supabase.from("searches").select("composition_brief").eq("id", searchId).single();
  if (!current) return { ok: false, error: "This search wasn't found." };
  const { error } = await supabase
    .from("searches")
    .update({ composition_brief: { ...(current.composition_brief ?? {}), must_match: !!on } })
    .eq("id", searchId);
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

/**
 * Turns one Must match on or off after a search has run, then re-scores the saved
 * checklists (code only: no search, no AI). `target` is a signature detail's id, or
 * "fabric" for Fabric must match. Returns how many pieces now pass.
 */
export async function setMustMatch(
  searchId: string,
  target: string,
  on: boolean,
): Promise<{ ok: true; passing: number } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;
  // Read with the friend's own session: row-level security makes sure the search is theirs.
  const { data: current } = await supabase.from("searches").select("visual_brief, composition_brief").eq("id", searchId).single();
  if (!current) return { ok: false, error: "This search wasn't found." };

  const update =
    target === "fabric"
      ? { composition_brief: { ...(current.composition_brief ?? {}), must_match: on } }
      : {
          visual_brief: {
            ...(current.visual_brief ?? {}),
            anchors: ((current.visual_brief?.anchors ?? []) as Anchor[]).map((a) => (a.id === target ? { ...a, dealbreaker: on } : a)),
          },
        };
  const { error } = await supabase.from("searches").update(update).eq("id", searchId);
  if (error) return { ok: false, error: "That didn't save. Try again." };
  return { ok: true, passing: await rescoreSearch(searchId, session.userId) };
}

/**
 * Edit details after a search has run (Maggie, Nov 15): rebuilds the search brief from the
 * details as they are now (the friend's edits win over the product page), then either
 * re-checks the pieces already found (fresh = false: no new store searches) or searches again.
 */
export async function updateResults(searchId: string, fresh: boolean): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;
  const { data: claimed } = await supabase
    .from("searches")
    .update({ status: "new", error: null })
    .eq("id", searchId)
    .in("status", ["done", "failed", "review"])
    .not("brief_built_at", "is", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "This search is still running. Try again when it's done." };

  const built = await buildBriefFor(session, searchId, { keepEdits: true });
  if (!built.ok) {
    await supabase.from("searches").update({ status: "done", error: null }).eq("id", searchId).eq("status", "failed");
    return { ok: false, error: "We couldn't update the details. Your results haven't changed; try again." };
  }

  const { error } = await supabase.from("searches").update({ status: "queued", error: null }).eq("id", searchId).eq("status", "review");
  if (error) return { ok: false, error: "That didn't save. Try again." };
  try {
    await inngest.send({ name: SEARCH_CONFIRMED, data: { searchId, userId: session.userId, reuseGathered: !fresh } });
  } catch (e) {
    console.error("Starting the search job failed", e);
    await supabase.from("searches").update({ status: "done" }).eq("id", searchId);
    return { ok: false, error: "The update didn't start. Try again in a minute." };
  }
  await supabase.from("events").insert({ type: "search_started", search_id: searchId });
  return { ok: true };
}


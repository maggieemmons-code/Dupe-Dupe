import "server-only";
import sharp from "sharp";
import { inngest, SEARCH_CONFIRMED, type SearchConfirmed } from "./client";
import { adminClient, logJobCall } from "@/lib/server/admin";
import { lensSearch, shoppingSearch, amazonSearch, serpSearchesLeft, type Gathered } from "@/lib/server/serpapi";
import { downloadThumb } from "@/lib/server/linkPhotos";
import { cleanCandidates, type CleanRow } from "@/lib/search/clean";
import { runScreener, type ScreenItem } from "@/lib/agents/screener";
import { searchName } from "@/lib/searches";

/*
 * The search job (PLAN.md › Search pipeline). One Inngest step per stage, so a
 * failed step retries on its own and a paid search never runs twice.
 * Phase 3: gather (Lens, Shopping, Amazon) → clean → screen new items → done.
 * Enrich and judge come in phases 4 to 6; secondhand in phase 5.
 */

/** Pause searches when SerpApi gets this low (PLAN.md › Costs and guardrails). */
const SERP_FLOOR = 30;
const MAX_RESULTS = 10;
const BATCH = 20;
const MAX_BATCHES = 3;

type Ctx = {
  userId: string;
  name: string;
  photoPath: string | null;
  lensHint: string;
  lookAlike: string[];
  budget: number | null;
  brand: string;
  styleName: string;
  sizes: string[];
  fields: Record<string, unknown>;
  visualBrief: unknown;
};

export const runSearch = inngest.createFunction(
  {
    id: "run-search",
    name: "Run a search",
    retries: 1,
    triggers: [{ event: SEARCH_CONFIRMED }],
    concurrency: { key: "event.data.userId", limit: 2 },
    onFailure: async ({ event }) => {
      const { searchId, userId } = (event.data.event.data ?? {}) as SearchConfirmed;
      if (!searchId) return;
      await adminClient()
        .from("searches")
        .update({ status: "failed", error: "The search stopped partway. Try again in a minute." })
        .eq("id", searchId)
        .eq("user_id", userId)
        .neq("status", "done");
    },
  },
  async ({ event, step, attempt, maxAttempts }) => {
    const { searchId, userId } = event.data as SearchConfirmed;
    const db = adminClient();
    const lastTry = attempt + 1 >= (maxAttempts ?? 2);

    /* 1. Claim the search and check the SerpApi allowance. */
    const ctx = await step.run("start", async (): Promise<Ctx | null> => {
      const { data: s } = await db
        .from("searches")
        .update({ status: "gathering", error: null, missing_sources: [], ran_at: new Date().toISOString() })
        .eq("id", searchId)
        .eq("user_id", userId)
        .eq("status", "queued")
        .select("*")
        .maybeSingle();
      if (!s) return null; // already running, or not confirmed

      const left = await serpSearchesLeft();
      if (left != null && left < SERP_FLOOR) {
        await db
          .from("searches")
          .update({ status: "failed", error: "Dupe Dupe has used this month's searches. Maggie has been told; try again soon." })
          .eq("id", searchId);
        console.error(`SerpApi floor reached: ${left} searches left`);
        return null;
      }

      // A rerun starts fresh.
      await db.from("candidates").delete().eq("search_id", searchId).eq("user_id", userId);

      const q = (s.search_queries ?? {}) as { look_alike?: string[]; lens_hint?: string };
      const fallback = [s.color, s.category].filter(Boolean).join(" ");
      return {
        userId,
        name: searchName(s),
        photoPath: s.photo_paths?.[0] ?? null,
        lensHint: (q.lens_hint || fallback).slice(0, 80),
        lookAlike: (q.look_alike ?? []).filter(Boolean).length ? q.look_alike!.filter(Boolean) : [fallback || searchName(s)],
        budget: s.budget ?? null,
        brand: s.brand ?? "",
        styleName: s.style_name ?? "",
        sizes: s.sizes ?? [],
        fields: pickFields(s),
        visualBrief: s.visual_brief,
      };
    });
    if (!ctx) return { skipped: true };

    /* 2. Gather, all sources at once. A source that still fails after a retry is skipped. */
    const gather = (name: string, label: string, run: () => Promise<Gathered[]>) =>
      step.run(name, async () => {
        try {
          const items = await run();
          await saveGathered(searchId, userId, items);
          await logJobCall({ userId, searchId, service: "serpapi", stage: name, units: { searches: 1, results: items.length }, ok: true });
          return { name, label, found: items.length, failed: false };
        } catch (e) {
          await logJobCall({ userId, searchId, service: "serpapi", stage: name, ok: false, error: String(e) });
          if (!lastTry) throw e;
          return { name, label, found: 0, failed: true };
        }
      });

    const sources = await Promise.all([
      ctx.photoPath
        ? gather("lens", "Google Lens", async () => {
            const { data, error } = await db.storage.from("photos").createSignedUrl(ctx.photoPath!, 600);
            if (error || !data) throw new Error(`Signed photo link failed: ${error?.message}`);
            return lensSearch(data.signedUrl, ctx.lensHint);
          })
        : Promise.resolve(null),
      gather("shopping-1", "Google Shopping", () => shoppingSearch(ctx.lookAlike[0], ctx.budget)),
      ctx.lookAlike[1]
        ? gather("shopping-2", "Google Shopping", () => shoppingSearch(ctx.lookAlike[1], ctx.budget))
        : Promise.resolve(null),
      gather("amazon", "Amazon", () => amazonSearch(ctx.lookAlike[0], ctx.budget)),
    ]);

    const missing = [...new Set(sources.filter((s) => s?.failed).map((s) => s!.label))];

    /* 3. Clean (code, no AI). */
    const survivors = await step.run("clean", async () => {
      await db.from("searches").update({ status: "screening", missing_sources: missing }).eq("id", searchId);
      const { data: rows } = await db
        .from("candidates")
        .select("id, kind, source, position, title, store, store_domain, link, photo_url, price, in_stock, size")
        .eq("search_id", searchId)
        .eq("user_id", userId);
      const all = (rows ?? []) as (CleanRow & { source: string; position: number | null })[];
      const results = cleanCandidates(all, {
        budget: ctx.budget,
        brand: ctx.brand,
        styleName: ctx.styleName,
        sizes: ctx.sizes,
        hiddenStores: [], // the friend's hidden stores arrive with Your eye (phase 7)
        secondhandOn: false,
      });

      // Write drops in groups (few distinct reasons), then mark the rest cleaned.
      const groups = new Map<string, string[]>();
      for (const r of results) {
        if (!r.drop_reason) continue;
        const k = JSON.stringify([r.drop_reason, r.duplicate_of]);
        groups.set(k, [...(groups.get(k) ?? []), r.id]);
      }
      for (const [k, ids] of groups) {
        const [drop_reason, duplicate_of] = JSON.parse(k);
        await db.from("candidates").update({ drop_reason, duplicate_of }).in("id", ids);
      }
      const keptIds = new Set(results.filter((r) => !r.drop_reason).map((r) => r.id));
      if (keptIds.size) await db.from("candidates").update({ stage: "cleaned" }).in("id", [...keptIds]);

      // Screening order: take turns between sources, each in its own ranking order.
      const kept = all.filter((r) => keptIds.has(r.id) && r.kind === "new");
      const bySource = new Map<string, typeof kept>();
      for (const r of kept.sort((a, b) => (a.position ?? 999) - (b.position ?? 999))) {
        bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
      }
      const order: string[] = [];
      const lists = [...bySource.values()];
      for (let i = 0; order.length < kept.length; i++) for (const l of lists) if (l[i]) order.push(l[i].id);
      return order.slice(0, BATCH * MAX_BATCHES);
    });

    /* 4. Screen new items, 20 at a time, until there are enough. Picks show up on the phone as each batch finishes. */
    let picked = 0;
    for (let b = 0; b < MAX_BATCHES && picked < MAX_RESULTS; b++) {
      const ids = survivors.slice(b * BATCH, (b + 1) * BATCH);
      if (!ids.length) break;
      const room = Math.min(6, MAX_RESULTS - picked);
      const got = await step.run(`screen-${b + 1}`, async () => {
        const { data: rows } = await db
          .from("candidates")
          .select("id, title, brand, store, price, thumb_url, photo_url")
          .in("id", ids)
          .eq("user_id", userId);
        const byId = new Map((rows ?? []).map((r) => [r.id, r]));
        const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);

        const [original, ...thumbs] = await Promise.all([
          originalPhoto(ctx.photoPath),
          ...ordered.map((r) => downloadThumb(r.thumb_url ?? r.photo_url ?? "")),
        ]);
        const items: ScreenItem[] = ordered.map((r, i) => ({
          n: i + 1,
          title: r.title,
          brand: r.brand,
          store: r.store,
          price: r.price,
          photo: thumbs[i],
        }));

        let result;
        try {
          result = await runScreener(
            { name: ctx.name, fields: ctx.fields, visualBrief: ctx.visualBrief, photo: original },
            items,
            room,
          );
          await logJobCall({ userId, searchId, service: "claude", stage: "screen", units: result.usage, ok: true });
        } catch (e) {
          await logJobCall({ userId, searchId, service: "claude", stage: "screen", ok: false, error: String(e) });
          throw e;
        }

        const pickedIds = new Set<string>();
        for (const [i, p] of result.picks.entries()) {
          const row = ordered[p.n - 1];
          pickedIds.add(row.id);
          await db
            .from("candidates")
            .update({ stage: "screened", screen_note: p.note, color_match: p.color_match, screen_rank: picked + i + 1 })
            .eq("id", row.id);
        }
        const passed = ordered.filter((r) => !pickedIds.has(r.id)).map((r) => r.id);
        if (passed.length) await db.from("candidates").update({ drop_reason: "Screener passed" }).in("id", passed);
        return result.picks.length;
      });
      picked += got;
    }

    /* 5. Done (enrich and judge arrive in later phases). */
    await step.run("finish", async () => {
      // Cleaned items the screener never reached (it stops once it has enough).
      await db
        .from("candidates")
        .update({ drop_reason: "Not screened, enough picks" })
        .eq("search_id", searchId)
        .eq("stage", "cleaned")
        .is("drop_reason", null);
      await db.from("searches").update({ status: "done" }).eq("id", searchId).eq("user_id", userId);
    });

    return { picked, missing };
  },
);

async function saveGathered(searchId: string, userId: string, items: Gathered[]) {
  if (!items.length) return;
  const now = new Date().toISOString();
  const rows = items.map((it) => ({ ...it, search_id: searchId, user_id: userId, price_checked_at: it.price != null ? now : null }));
  const { error } = await adminClient().from("candidates").insert(rows);
  if (error) throw new Error(`Saving candidates failed: ${error.message}`);
}

async function originalPhoto(path: string | null) {
  if (!path) return null;
  const { data } = await adminClient().storage.from("photos").download(path);
  if (!data) return null;
  return sharp(Buffer.from(await data.arrayBuffer()))
    .resize({ width: 512, height: 512, fit: "inside" })
    .jpeg({ quality: 80 })
    .toBuffer();
}

const FIELD_KEYS = [
  "brand", "style_name", "category", "color", "color_name", "fabrics", "weave", "fit_style", "neckline",
  "sleeve", "hem", "closure", "details", "retail_price", "budget",
];

function pickFields(s: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of FIELD_KEYS) {
    const v = s[k];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

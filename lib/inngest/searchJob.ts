import "server-only";
import sharp from "sharp";
import { inngest, SEARCH_CONFIRMED, type SearchConfirmed } from "./client";
import { adminClient, logJobCall } from "@/lib/server/admin";
import {
  lensSearch,
  shoppingSearch,
  amazonSearch,
  serpSearchesLeft,
  shoppingDetails,
  amazonDetails,
  type Gathered,
} from "@/lib/server/serpapi";
import { fetchPages } from "@/lib/server/tinyfish";
import { catalogSearch, catalogLookup } from "@/lib/server/shopifyCatalog";
import { detailPhrases } from "@/lib/search/catalogPhrases";
import { pickStoreSearches, type StoreHit } from "@/lib/search/storeTally";
import { usefulPageText } from "@/lib/search/listingText";
import { usdPriceFromPage } from "@/lib/server/price";
import { shopifyAvailable, shopifyPriceUsd, pageAvailable, offersAvailable } from "@/lib/server/stock";
import { runJudge, type JudgeCandidate } from "@/lib/agents/judge";
import { score, type AnchorDef, type Weights } from "@/lib/search/score";
import { anchorKind } from "@/lib/search/anchorKind";
import { loadTaste } from "@/lib/server/taste";
import { tasteText, tasteWeights } from "@/lib/taste";
import { downloadThumb } from "@/lib/server/linkPhotos";
import { cleanCandidates, type CleanRow } from "@/lib/search/clean";
import { runScreener, type ScreenItem } from "@/lib/agents/screener";
import { searchName } from "@/lib/searches";
import { lowEnd } from "@/lib/search/priceFloor";

/*
 * The search job (PLAN.md › Search pipeline). One Inngest step per stage, so a
 * failed step retries on its own and a paid search never runs twice.
 * gather (Lens, Shopping, Amazon, Shopify's catalog) → clean → screen new items → enrich (product
 * lookups and page reads for fabric) → judge (checklist; code scores) → done.
 * Secondhand comes in phase 5.
 */

/** Pause searches when SerpApi gets this low (PLAN.md › Costs and guardrails). */
const SERP_FLOOR = 30;
/**
 * How many screened picks go on to the judge. Maggie, Nov 15: "I'd rather pay for
 * more searches than get bad results"; at 12 the screener cut two of her own good
 * test-set picks before the judge saw them. The best-rated 45 (3/5 or better) go on:
 * at 30, her own picks rated 3/5 by the screener still missed the cut.
 */
const MAX_RESULTS = 45;
/** The lowest screener rating (1–5) that can go on to the judge. */
const MIN_SCREEN_SCORE = 3;
/** Google Lens runs on this many of the original's photos (visual matches matter most). */
const LENS_PHOTOS = 2;
/**
 * Google Shopping runs every look-alike phrasing from the brief (up to 4: each
 * brings different stores), plus one search per store below, scoped by adding
 * the store's name to the words (Maggie, Nov 15: Revolve had dupes the general
 * search missed; more phrasings and Nordstrom for more good candidates).
 * Friends' own favorite stores can take this over in phase 7.
 */
const MAX_PHRASINGS = 4;
// The two store-scoped searches come from the friend's own best stores (lib/search/storeTally.ts),
// with Revolve and Nordstrom until there's enough history.
/**
 * Shopify's catalog (free, no SerpApi): by photo, and by one phrasing per signature
 * detail. Plain phrasings drown in cheap results; naming the detail found Maggie's
 * picks (NOTES.md › Shopify Global Catalog): "white embellished strapless maxi dress"
 * put her Meshki Hilda at #1.
 */
const CATALOG_PHOTOS = 2;
const CATALOG_PHRASINGS = 2;
const CATALOG_LIMIT = 50;
/**
 * Above the limit (Maggie, Nov 15: the Results price slider should reveal pieces above
 * her limit without a new search). Between the friend's limit and the original's price,
 * one Google Shopping search (1 SerpApi search) and Shopify's catalog (free) gather more;
 * Lens and Amazon matches above the limit are kept instead of dropped. Pieces in range
 * are screened and judged first; then the best this many above the limit.
 */
const ABOVE_LIMIT_JUDGED = 8;
/** Screening places kept for pieces above the limit (2 batches), when there are that many. */
const ABOVE_LIMIT_SCREENED = 40;
const BATCH = 20;
const MAX_BATCHES = 10;
/** Paid product lookups (1 SerpApi search each) per search, for the top picks (Maggie, Nov 15: top picks, open to upgrading). */
const MAX_LOOKUPS = 12;
/** Candidates per judge call (PLAN.md). */
const JUDGE_BATCH = 5;

type Ctx = {
  userId: string;
  name: string;
  photoPath: string | null;
  photoPaths: string[];
  lensHint: string;
  lookAlike: string[];
  /** Stores whose names scope two Shopping searches: the friend's best, learned (storeTally.ts). */
  storeSearches: string[];
  /** Shopify catalog phrasings: color + one signature detail + the garment word. */
  detailPhrases: string[];
  budget: number | null;
  /** The most anything gathered may cost: the original's price when it's above the limit (else the limit). */
  ceiling: number | null;
  priceFloor: number | null;
  brand: string;
  styleName: string;
  sizes: string[];
  fields: Record<string, unknown>;
  visualBrief: unknown;
  compositionBrief: unknown;
  anchors: AnchorDef[];
  tasteRules: string;
  weights: Weights;
  retailPrice: number | null;
  fabricMustMatch: boolean;
};

export const runSearch = inngest.createFunction(
  {
    id: "run-search",
    name: "Run a search",
    retries: 1,
    triggers: [{ event: SEARCH_CONFIRMED }],
    // Steps per friend at once: 5 is the most Inngest's free plan allows across the account
    // (Nov 15: at 2, a search took over 4 minutes).
    concurrency: { key: "event.data.userId", limit: 5 },
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
    const { searchId, userId, reuseGathered } = event.data as SearchConfirmed;
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
      if (!s) {
        // Already running or not confirmed. Make sure it's not because the search is missing.
        const { data: exists } = await db.from("searches").select("status").eq("id", searchId).maybeSingle();
        if (!exists) throw new Error(`Search ${searchId} not found with the server key`);
        console.log(`Search ${searchId} is ${exists.status}, not queued; skipping`);
        return null;
      }

      // Fresh counts for the progress bar (a separate update: if migration 0010 hasn't run, nothing else breaks).
      await db.from("searches").update({ progress: {} }).eq("id", searchId);

      const left = await serpSearchesLeft();
      if (left != null && left < SERP_FLOOR) {
        await db
          .from("searches")
          .update({ status: "failed", error: "Dupe Dupe has used this month's searches. Maggie has been told; try again soon." })
          .eq("id", searchId);
        console.error(`SerpApi floor reached: ${left} searches left`);
        return null;
      }

      if (reuseGathered) {
        // Keep what was gathered (and any lookups already paid for); undo every later decision.
        await db
          .from("candidates")
          .update({
            stage: "gathered", drop_reason: null, duplicate_of: null, screen_note: null, screen_rank: null, color_match: null,
            checklist: null, fabric_tier: null, fabric_evidence: null, stock_photo_flag: null, judge_note: null, confidence: null,
            look_score: null, fit_score: null, verdict: null, caveat: null, availability: null,
          })
          .eq("search_id", searchId)
          .eq("user_id", userId);
        // Shopify's catalog is free: gather it again below rather than reuse it.
        await db.from("candidates").delete().eq("search_id", searchId).eq("user_id", userId).eq("source", "shopify");
      } else {
        // A rerun starts fresh.
        await db.from("candidates").delete().eq("search_id", searchId).eq("user_id", userId);
      }

      const q = (s.search_queries ?? {}) as { look_alike?: string[]; lens_hint?: string };
      const fallback = [s.color, s.category].filter(Boolean).join(" ");
      return {
        userId,
        name: searchName(s),
        photoPath: s.photo_paths?.[0] ?? null,
        photoPaths: (s.photo_paths ?? []).slice(0, LENS_PHOTOS),
        lensHint: (q.lens_hint || fallback).slice(0, 80),
        lookAlike: (q.look_alike ?? []).filter(Boolean).length ? q.look_alike!.filter(Boolean) : [fallback || searchName(s)],
        detailPhrases: detailPhrases(s, (q.look_alike ?? []).filter(Boolean)),
        storeSearches: pickStoreSearches(await storeHits(db, userId)),
        budget: s.budget ?? null,
        ceiling: s.budget != null && s.retail_price != null && s.retail_price > s.budget ? s.retail_price : (s.budget ?? null),
        priceFloor: lowEnd({ budget_min: s.budget_min ?? null }),
        brand: s.brand ?? "",
        styleName: s.style_name ?? "",
        sizes: s.sizes ?? [],
        fields: pickFields(s),
        visualBrief: s.visual_brief,
        compositionBrief: s.composition_brief,
        anchors: ((s.visual_brief?.anchors ?? []) as AnchorDef[])
          .filter((a) => a && a.id)
          .map((a) => ({ ...a, kind: a.kind ?? anchorKind(a.label) })),
        ...(await (async () => {
          const taste = await loadTaste(db, userId);
          return { tasteRules: tasteText(taste), weights: tasteWeights(taste) };
        })()),
        fabricMustMatch: s.composition_brief?.must_match === true,
        retailPrice: s.retail_price ?? null,
      };
    });
    if (!ctx) return { skipped: true };

    /* 2. Gather, all sources at once. A source that still fails after a retry is skipped. */
    const gather = (
      name: string,
      label: string,
      run: () => Promise<Gathered[] | { items: Gathered[]; searches: number }>,
      service: "serpapi" | "shopify" = "serpapi",
    ) =>
      step.run(name, async () => {
        try {
          const out = await run();
          const items = Array.isArray(out) ? out : out.items;
          const searches = Array.isArray(out) ? 1 : out.searches;
          await saveGathered(searchId, userId, items);
          await logJobCall({ userId, searchId, service, stage: name, units: { searches, results: items.length }, ok: true });
          await bumpProgress(searchId, "sources_done", 1);
          await bumpProgress(searchId, "found", items.length);
          return { name, label, found: items.length, failed: false };
        } catch (e) {
          await logJobCall({ userId, searchId, service, stage: name, ok: false, error: String(e) });
          if (!lastTry) throw e;
          await bumpProgress(searchId, "sources_done", 1);
          return { name, label, found: 0, failed: true };
        }
      });

    // Shopify's catalog runs every time, also when reusing paid results (it's free). All of its
    // searches run in one step: steps run at most 5 at a time (Inngest's free plan), and ten
    // free searches in ten steps held up the paid ones.
    const catalogPlan: (() => Promise<Gathered[]>)[] = [
      ...ctx.photoPaths.slice(0, CATALOG_PHOTOS).map((path, i) => async () => {
        const image = await catalogPhoto(path);
        return image ? catalogSearch({ image, maxPrice: ctx.budget, minPrice: ctx.priceFloor, limit: CATALOG_LIMIT }, `photo ${i + 1}`) : [];
      }),
      ...[...ctx.detailPhrases, ...ctx.lookAlike.slice(0, CATALOG_PHRASINGS)].map(
        (q) => () => catalogSearch({ query: q, maxPrice: ctx.budget, minPrice: ctx.priceFloor, limit: CATALOG_LIMIT }, q),
      ),
      // Above the limit, up to the original's price: the first photo and two detail phrasings.
      ...(above(ctx)
        ? [
            ...ctx.photoPaths.slice(0, 1).map((path) => async () => {
              const image = await catalogPhoto(path);
              return image ? catalogSearch({ image, minPrice: ctx.budget, maxPrice: ctx.ceiling, limit: CATALOG_LIMIT }, "photo, above limit") : [];
            }),
            ...(ctx.detailPhrases.length ? ctx.detailPhrases : ctx.lookAlike)
              .slice(0, 2)
              .map((q) => () => catalogSearch({ query: q, minPrice: ctx.budget, maxPrice: ctx.ceiling, limit: CATALOG_LIMIT }, `${q} (above limit)`)),
          ]
        : []),
    ];
    const catalogSources = [
      gather(
        "shopify",
        "Shopify",
        async () => {
          // One failed catalog search doesn't lose the others; only all failing counts as a failure.
          const settled = await Promise.allSettled(catalogPlan.map((run) => run()));
          const ok = settled.filter((r): r is PromiseFulfilledResult<Gathered[]> => r.status === "fulfilled");
          if (!ok.length && settled.length) throw (settled[0] as PromiseRejectedResult).reason;
          return { items: ok.flatMap((r) => r.value), searches: ok.length };
        },
        "shopify",
      ),
    ];

    const paidSources = reuseGathered ? [] : [
      ...ctx.photoPaths.map((path, i) =>
        gather(`lens-${i + 1}`, "Google Lens", async () => {
          const { data, error } = await db.storage.from("photos").createSignedUrl(path, 600);
          if (error || !data) throw new Error(`Signed photo link failed: ${error?.message}`);
          // The first photo goes with a few words; the second goes alone, for purely visual matches.
          return lensSearch(data.signedUrl, i === 0 ? ctx.lensHint : "");
        }),
      ),
      ...ctx.lookAlike
        .slice(0, MAX_PHRASINGS)
        .map((q, i) => gather(`shopping-${i + 1}`, "Google Shopping", () => shoppingSearch(q, ctx.budget, ctx.priceFloor))),
      ...ctx.storeSearches.map((store) => {
        // The shortest phrasing works best with a store name added.
        const q = [...ctx.lookAlike].sort((a, b) => a.length - b.length)[0];
        return gather(`shopping-${store.toLowerCase()}`, "Google Shopping", () =>
          shoppingSearch(`${q} ${store.toLowerCase()}`, ctx.budget, ctx.priceFloor),
        );
      }),
      // Amazon's price filter is applied in code, so keeping up to the ceiling loses nothing in range.
      gather("amazon", "Amazon", () => amazonSearch(ctx.lookAlike[0], ctx.ceiling, ctx.priceFloor)),
      // One Shopping search between the limit and the original's price (the others stay in range).
      ...(above(ctx)
        ? [
            gather("shopping-above", "Google Shopping", () =>
              shoppingSearch(`${ctx.lookAlike[0]}`, ctx.ceiling, ctx.budget).then((items) =>
                items.map((it) => ({ ...it, query: `${it.query} (above limit)` })),
              ),
            ),
          ]
        : []),
    ];
    // Progress bar: how many places this search looks in.
    const plannedSources = catalogSources.length + paidSources.length;
    await step.run("progress-sources", () => setProgress(searchId, { sources: plannedSources }));
    const sources = await Promise.all([...catalogSources, ...paidSources]);

    const missing = [...new Set(sources.filter((s) => s?.failed).map((s) => s!.label))];

    /* 3. Clean (code, no AI). */
    const survivors = await step.run("clean", async () => {
      await db.from("searches").update({ status: "screening", missing_sources: missing }).eq("id", searchId);
      const { data: rows } = await db
        .from("candidates")
        .select("id, kind, source, query, position, title, store, store_domain, link, photo_url, price, in_stock, size, rating, reviews")
        .eq("search_id", searchId)
        .eq("user_id", userId);
      const all = (rows ?? []) as (CleanRow & { position: number | null; query: string })[];
      const results = cleanCandidates(all, {
        // Pieces above the limit are kept (up to the original's price) for the price slider.
        budget: ctx.ceiling,
        priceFloor: ctx.priceFloor,
        retailPrice: ctx.retailPrice,
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

      // Screening order: every search takes turns, each in its own ranking order, and
      // Lens's visual matches get two places a turn (Maggie, Nov 15: visual matches matter
      // most). Putting all of Lens first crowded out Shopping, which found her Dessy pick.
      const kept = all.filter((r) => keptIds.has(r.id) && r.kind === "new");
      const byQuery = new Map<string, typeof kept>();
      for (const r of [...kept].sort((a, b) => (a.position ?? 999) - (b.position ?? 999))) {
        const k = `${r.source}|${r.query}`;
        byQuery.set(k, [...(byQuery.get(k) ?? []), r]);
      }
      // Shopify's photo matches count as visual matches too.
      const lists = [...byQuery.entries()].map(([k, rows]) => ({
        rows,
        take: k.startsWith("lens|") || k.startsWith("shopify|photo") ? 2 : 1,
        at: 0,
      }));
      const order: string[] = [];
      while (order.length < kept.length) {
        for (const l of lists) for (let t = 0; t < l.take && l.at < l.rows.length; t++) order.push(l.rows[l.at++].id);
      }
      // In range first, then above the limit (same turn-taking order within each). Pieces above
      // the limit keep a few places, or the in-range ones fill every batch and none get screened.
      const over = new Set(kept.filter((r) => isAbove(r.price, ctx)).map((r) => r.id));
      const inRange = order.filter((id) => !over.has(id));
      const aboveLimit = order.filter((id) => over.has(id));
      const room = BATCH * MAX_BATCHES;
      const aboveTake = Math.min(aboveLimit.length, Math.max(ABOVE_LIMIT_SCREENED, room - inRange.length));
      const toScreen = [...inRange.slice(0, room - aboveTake), ...aboveLimit.slice(0, aboveTake)];
      await setProgress(searchId, { to_screen: toScreen.length });
      return toScreen;
    });

    /*
     * 4. Screen: the screener rates every candidate 1 to 5, 20 at a time, all batches at
     *    once; then the best-rated across all batches go to the judge. (Picking batch by
     *    batch until full cut Maggie's own good picks that came in later batches.)
     */
    const batchIds: string[][] = [];
    for (let b = 0; b < MAX_BATCHES && b * BATCH < survivors.length; b++) batchIds.push(survivors.slice(b * BATCH, (b + 1) * BATCH));
    const ratings = (
      await Promise.all(
        batchIds.map((ids, b) =>
          step.run(`screen-${b + 1}`, async () => {
            const { data: rows } = await db
              .from("candidates")
              .select("id, title, brand, store, price, source, thumb_url, photo_url")
              .in("id", ids)
              .eq("user_id", userId);
            const byId = new Map((rows ?? []).map((r) => [r.id, r]));
            const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
            const [original, ...thumbs] = await Promise.all([
              originalPhoto(ctx.photoPath),
              // 384px: at 256 the screener couldn't see line, proportion or texture well.
              ...ordered.map((r) => downloadThumb(r.photo_url ?? r.thumb_url ?? "", 384).then((x) => x ?? downloadThumb(r.thumb_url ?? "", 384))),
            ]);
            const items: ScreenItem[] = ordered.map((r, i) => ({ n: i + 1, title: r.title, brand: r.brand, store: r.store, price: r.price, photo: thumbs[i] }));
            try {
              const result = await runScreener({ name: ctx.name, fields: ctx.fields, visualBrief: ctx.visualBrief, photo: original }, items, ctx.tasteRules);
              await logJobCall({ userId, searchId, service: "claude", stage: "screen", units: result.usage, ok: true });
              await bumpProgress(searchId, "screened", ids.length);
              return result.picks.map((p) => ({
                id: ordered[p.n - 1].id,
                score: p.score,
                color: p.color_match,
                note: p.note,
                order: b * BATCH + p.n,
                priced: ordered[p.n - 1].price != null,
                lens: ordered[p.n - 1].source === "lens",
                above: isAbove(ordered[p.n - 1].price, ctx),
              }));
            } catch (e) {
              await logJobCall({ userId, searchId, service: "claude", stage: "screen", ok: false, error: String(e) });
              if (!lastTry) throw e;
              return [];
            }
          }),
        ),
      )
    ).flat();

    const picked = await step.run("screen-pick", async () => {
      const ranked = ratings
        .filter((r) => r.score >= MIN_SCREEN_SCORE)
        // Ties: priced pieces first (a friend can see they're within reach), then Lens's visual matches.
        .sort((a, b) => b.score - a.score || Number(b.priced) - Number(a.priced) || Number(b.lens) - Number(a.lens) || a.order - b.order);
      // In range first; then the best few above the limit, judged last (for the price slider).
      const best = [
        ...ranked.filter((r) => !r.above).slice(0, MAX_RESULTS),
        ...ranked.filter((r) => r.above).slice(0, ABOVE_LIMIT_JUDGED),
      ];
      for (const [i, r] of best.entries()) {
        await db
          .from("candidates")
          .update({ stage: "screened", screen_note: r.note, color_match: r.color, screen_rank: i + 1 })
          .eq("id", r.id);
      }
      const chosen = new Set(best.map((r) => r.id));
      const byScore = new Map<number, string[]>();
      for (const r of ratings) if (!chosen.has(r.id)) byScore.set(r.score, [...(byScore.get(r.score) ?? []), r.id]);
      for (const [score, ids] of byScore) {
        await db.from("candidates").update({ drop_reason: `Screener rated ${score}/5` }).in("id", ids);
      }
      await setProgress(searchId, { picked: best.length });
      return best.length;
    });

    /* 5. Enrich: look up the top picks' product details (fabric words, reviews, store link), then read store pages. */
    const picks = await step.run("enrich-start", async () => {
      await db.from("searches").update({ status: "enriching" }).eq("id", searchId);
      const { data } = await db
        .from("candidates")
        .select("id, source, link, product_token, store, listing_text")
        .eq("search_id", searchId)
        .eq("user_id", userId)
        .eq("stage", "screened")
        .is("drop_reason", null)
        .order("screen_rank");
      return data ?? [];
    });

    // Product lookups (paid, 1 SerpApi search each) for the top picks, all in one step. One step per
    // pick held every pick's turn in line, 5 at a time, even the ones with nothing to look up.
    await step.run("lookups", async () => {
      // Fresh from the database, so a retried step skips what's already looked up.
      const { data: fresh } = await db.from("candidates").select("id, listing_text").in("id", picks.map((p) => p.id));
      const done = new Set((fresh ?? []).filter((r) => r.listing_text).map((r) => r.id));
      await Promise.all(
        picks.slice(0, MAX_LOOKUPS).map(async (p) => {
          if (done.has(p.id)) return;
          const asin = p.source === "amazon" ? p.link.match(/\/dp\/([A-Z0-9]{10})/)?.[1] : null;
          if (!(p.source === "shopping" && p.product_token) && !asin) return; // Lens links are read for free below
          try {
            if (asin) {
              const d = await amazonDetails(asin);
              await db
                .from("candidates")
                .update({ listing_text: d.text, ...(d.inStock === false ? { drop_reason: "Out of stock" } : {}) })
                .eq("id", p.id);
            } else {
              const d = await shoppingDetails(p.product_token!, p.store);
              await db
                .from("candidates")
                .update({ listing_text: d.text, store_details: d.details, ...(d.url ? { store_link: d.url } : {}) })
                .eq("id", p.id);
            }
            await logJobCall({ userId, searchId, service: "serpapi", stage: "lookup", units: { searches: 1 }, ok: true });
          } catch (e) {
            // A failed lookup isn't retried (it costs a search); the judge works from the title and photo.
            await logJobCall({ userId, searchId, service: "serpapi", stage: "lookup", ok: false, error: String(e) });
          }
        }),
      );
    });

    await step.run("read-pages", async () => {
      const { data: rows } = await db
        .from("candidates")
        .select("id, source, link, store_link, listing_text, price, store_details, availability")
        .in("id", picks.map((p) => p.id));
      const urlFor = (r: { source: string; link: string; store_link: string | null }) =>
        r.source === "amazon" ? null : (r.store_link ?? (r.source === "shopping" ? null : r.link));
      const targets = (rows ?? []).filter((r) => urlFor(r));

      // Stock (Maggie, Nov 15: results were sold out). Shopify's own data and Google's
      // store offers first, then the page text below. Sold out → dropped.
      const stock = new Map<string, boolean | null>();
      await Promise.all(
        (rows ?? []).map(async (r) => {
          const fromOffers = offersAvailable(r.store_details ?? []);
          const url = urlFor(r);
          stock.set(r.id, fromOffers ?? (url ? await shopifyAvailable(url) : null));
        }),
      );

      if (targets.length) {
        try {
          // The reader takes 10 addresses a call: read them all, in parallel.
          const chunks: string[][] = [];
          for (let k = 0; k < targets.length; k += 10) chunks.push(targets.slice(k, k + 10).map((r) => urlFor(r)!));
          const pages = (
            await Promise.all(
              chunks.map((urls) =>
                fetchPages(urls, "Read a clothing product page: fabric content, lining, care, fit, sizes and whether it's in stock", 20000)
                  .then((x) => x.pages)
                  .catch(() => []),
              ),
            )
          ).flat();
          // Match each page to its own address (two items from one store must not share a page).
          const key = (u: string) => {
            const x = new URL(u);
            return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`;
          };
          for (const r of targets) {
            const page = pages.find((pg) => pg.url === urlFor(r) || key(pg.url) === key(urlFor(r)!));
            const useful = page ? usefulPageText(page.text) : "";
            if (page && stock.get(r.id) == null) stock.set(r.id, pageAvailable(page.text));
            // Lens matches that showed no price: read it from the page, and keep to the friend's range.
            const pagePrice = r.price == null && page ? usdPriceFromPage(page.text) : null;
            const priceUpdate =
              pagePrice != null
                ? {
                    price: pagePrice,
                    price_is_estimate: false,
                    price_checked_at: new Date().toISOString(),
                    ...(ctx.ceiling && pagePrice > ctx.ceiling ? { drop_reason: "Over budget" } : {}),
                    ...(ctx.priceFloor && pagePrice < ctx.priceFloor ? { drop_reason: "Under the price floor" } : {}),
                  }
                : {};
            if (useful || pagePrice != null) {
              await db
                .from("candidates")
                .update({
                  ...(useful ? { listing_text: [r.listing_text, `From the store's page:\n${useful}`].filter(Boolean).join("\n\n") } : {}),
                  ...priceUpdate,
                })
                .eq("id", r.id);
            }
          }
          await logJobCall({ userId, searchId, service: "tinyfish", stage: "enrich", units: { pages: pages.length, asked: targets.length }, ok: true });
        } catch (e) {
          await logJobCall({ userId, searchId, service: "tinyfish", stage: "enrich", ok: false, error: String(e) });
        }
      }
      // Still no price (Google Lens matches): Shopify's catalog, then the store's own Shopify
      // data, both free and in US dollars. Anything still unpriced isn't shown (Maggie, Nov 15:
      // "Price at store" cards were mostly over her limit).
      const { data: unpriced } = await db
        .from("candidates")
        .select("id, link, store_link")
        .in("id", picks.map((p) => p.id))
        .is("price", null)
        .is("drop_reason", null);
      if (unpriced?.length) {
        const urlOf = (r: { link: string; store_link: string | null }) => r.store_link ?? r.link;
        const known = await catalogLookup(unpriced.map(urlOf)).catch(() => []);
        await Promise.all(
          unpriced.map(async (r) => {
            const url = urlOf(r);
            const price = known.find((k) => samePage(k.url, url))?.price ?? (await shopifyPriceUsd(url));
            if (price == null) {
              await db.from("candidates").update({ drop_reason: "No price found" }).eq("id", r.id);
              return;
            }
            await db
              .from("candidates")
              .update({
                price,
                price_is_estimate: false,
                price_checked_at: new Date().toISOString(),
                ...(ctx.ceiling && price > ctx.ceiling ? { drop_reason: "Over budget" } : {}),
                ...(ctx.retailPrice && price >= ctx.retailPrice ? { drop_reason: "Costs as much as the original" } : {}),
                ...(ctx.priceFloor && price < ctx.priceFloor ? { drop_reason: "Under the price floor" } : {}),
              })
              .eq("id", r.id);
          }),
        );
      }

      const soldOut = [...stock].filter(([, a]) => a === false).map(([id]) => id);
      const inStock = [...stock].filter(([, a]) => a === true).map(([id]) => id);
      if (soldOut.length) await db.from("candidates").update({ availability: "sold_out", drop_reason: "Sold out" }).in("id", soldOut);
      if (inStock.length) await db.from("candidates").update({ availability: "in_stock" }).in("id", inStock);
      await db
        .from("candidates")
        .update({ stage: "enriched", enriched_at: new Date().toISOString() })
        .in("id", picks.map((p) => p.id))
        .is("drop_reason", null);
    });

    /* 6. Judge, 5 at a time; cards appear on the phone as each batch is scored. */
    await step.run("judge-start", async () => {
      await db.from("searches").update({ status: "judging" }).eq("id", searchId);
      await setProgress(searchId, { to_judge: picks.length });
    });
    const batches: string[][] = [];
    for (let i = 0; i < picks.length; i += JUDGE_BATCH) batches.push(picks.slice(i, i + JUDGE_BATCH).map((p) => p.id));

    await Promise.all(
      batches.map((ids, b) =>
        step.run(`judge-${b + 1}`, async () => {
          const { data: rows } = await db
            .from("candidates")
            .select("id, title, brand, store, price, photo_url, thumb_url, listing_text, drop_reason")
            .in("id", ids)
            .is("drop_reason", null);
          if (!rows?.length) return 0;
          const [original, ...photos] = await Promise.all([
            originalPhoto(ctx.photoPath),
            ...rows.map((r) => downloadThumb(r.photo_url ?? r.thumb_url ?? "", 512).then((x) => x ?? downloadThumb(r.thumb_url ?? "", 512))),
          ]);
          const candidates: JudgeCandidate[] = rows.map((r, i) => ({
            id: `c${i + 1}`,
            title: r.title,
            brand: r.brand,
            store: r.store,
            price: r.price,
            photo: photos[i],
            listingText: r.listing_text ?? "",
          }));

          const judgeOriginal = {
            name: ctx.name,
            anchors: ctx.anchors,
            photo: original,
            fields: ctx.fields,
            visualBrief: ctx.visualBrief,
            compositionBrief: ctx.compositionBrief,
            sizes: ctx.sizes,
          };
          let result;
          try {
            result = await runJudge(judgeOriginal, candidates, ctx.tasteRules);
            await logJobCall({ userId, searchId, service: "claude", stage: "judge", units: result.usage, ok: true });
            // The judge sometimes leaves a candidate out of its answer: ask once more for those.
            const skipped = candidates.filter((c) => !result!.checklists.has(c.id));
            if (skipped.length) {
              const again = await runJudge(judgeOriginal, skipped, ctx.tasteRules);
              await logJobCall({ userId, searchId, service: "claude", stage: "judge-retry", units: again.usage, ok: true });
              for (const [id, c] of again.checklists) result.checklists.set(id, c);
            }
          } catch (e) {
            await logJobCall({ userId, searchId, service: "claude", stage: "judge", ok: false, error: String(e) });
            if (!lastTry) throw e;
            return 0;
          }

          let judged = 0;
          for (const [i, r] of rows.entries()) {
            const c = result.checklists.get(`c${i + 1}`);
            if (!c) continue;
            const v = score(c, ctx.anchors, ctx.weights, { fabricMustMatch: ctx.fabricMustMatch, price: r.price, retailPrice: ctx.retailPrice });
            await db
              .from("candidates")
              .update({
                stage: "judged",
                checklist: c,
                fabric_tier: c.fabric_tier,
                fabric_evidence: c.fabric_evidence || null,
                stock_photo_flag: c.stock_photo_suspected,
                judge_note: c.biggest_difference,
                confidence: c.confidence === "high" ? 1 : c.confidence === "medium" ? 0.6 : 0.3,
                look_score: v.look,
                fit_score: v.fit,
                verdict: v.verdict,
                caveat: v.caveat,
              })
              .eq("id", r.id);
            judged++;
          }
          await bumpProgress(searchId, "judged", judged);
          return judged;
        }),
      ),
    );

    /*
     * 6b. Stock check on the top 10: anything not yet confirmed in stock gets its store
     *     page found (Google Shopping results: 1 SerpApi search each) and checked.
     */
    await step.run("check-stock", async () => {
      const { data: top } = await db
        .from("candidates")
        .select("id, source, link, store_link, product_token, store, store_details, availability, look_score")
        .eq("search_id", searchId)
        .eq("stage", "judged")
        .neq("verdict", "rejected")
        .is("drop_reason", null)
        // Only pieces in range: the stock check can cost SerpApi searches.
        .or(ctx.budget != null ? `price.is.null,price.lte.${ctx.budget}` : "price.is.null,price.gte.0")
        .order("look_score", { ascending: false })
        .limit(10);
      const unsure = (top ?? []).filter((c) => c.availability !== "in_stock" && c.source !== "amazon");
      const results = await Promise.all(
        unsure.map(async (c) => {
          let url: string | null = c.store_link ?? (c.source === "shopping" ? null : c.link);
          let a: boolean | null = offersAvailable(c.store_details ?? []);
          if (a == null && !url && c.product_token) {
            try {
              const d = await shoppingDetails(c.product_token, c.store);
              await logJobCall({ userId, searchId, service: "serpapi", stage: "stock", units: { searches: 1 }, ok: true });
              url = d.url;
              a = offersAvailable(d.details);
              if (d.url) await db.from("candidates").update({ store_link: d.url, store_details: d.details }).eq("id", c.id);
            } catch (e) {
              await logJobCall({ userId, searchId, service: "serpapi", stage: "stock", ok: false, error: String(e) });
            }
          }
          if (a == null && url) a = await shopifyAvailable(url);
          return { id: c.id, url, a };
        }),
      );
      const toRead = results.filter((r) => r.a == null && r.url);
      if (toRead.length) {
        try {
          const { pages } = await fetchPages(toRead.map((r) => r.url!), "Is this product in stock or sold out?", 20000);
          for (const r of toRead) {
            const pg = pages.find((p) => p.url === r.url || new URL(p.url).pathname === new URL(r.url!).pathname);
            if (pg) r.a = pageAvailable(pg.text);
          }
        } catch {
          /* leave unknown */
        }
      }
      for (const r of results) {
        if (r.a === false) await db.from("candidates").update({ availability: "sold_out", drop_reason: "Sold out" }).eq("id", r.id);
        else if (r.a === true) await db.from("candidates").update({ availability: "in_stock" }).eq("id", r.id);
      }
    });

    /* 7. Done. */
    await step.run("finish", async () => {
      // Cleaned items beyond the screener's batches.
      await db
        .from("candidates")
        .update({ drop_reason: "Not screened, too many candidates" })
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

export async function originalPhoto(path: string | null) {
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

export function pickFields(s: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of FIELD_KEYS) {
    const v = s[k];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

/** The original's photo, smaller, for Shopify's visual search. */
async function catalogPhoto(path: string) {
  const { data } = await adminClient().storage.from("photos").download(path);
  if (!data) return null;
  const buf = await sharp(Buffer.from(await data.arrayBuffer()))
    .resize({ width: 768, height: 768, fit: "inside" })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { data: buf, contentType: "image/jpeg" };
}

/** Whether this search gathers above the friend's limit (a limit is set and the original costs more). */
function above(ctx: { budget: number | null; ceiling: number | null }) {
  return ctx.budget != null && ctx.ceiling != null && ctx.ceiling > ctx.budget;
}

/** A piece priced above the friend's limit (no price counts as in range, as on Results). */
function isAbove(price: number | null | undefined, ctx: { budget: number | null }) {
  return price != null && ctx.budget != null && price > ctx.budget;
}

/** The same product page: host (without www) and path, ignoring query strings. */
function samePage(a: string, b: string) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "") && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

/** Progress bar counts (migration 0010). A failure here never stops a search. */
async function bumpProgress(searchId: string, key: string, by: number) {
  if (!by) return;
  const { error } = await adminClient().rpc("bump_search_progress", { p_search: searchId, p_key: key, p_by: by });
  if (error) console.error("progress", error.message);
}

async function setProgress(searchId: string, values: Record<string, number>) {
  const { error } = await adminClient().rpc("set_search_progress", { p_search: searchId, p_values: values });
  if (error) console.error("progress", error.message);
}

/** The friend's own pieces that passed the judge, and the ones they clicked, for the store tally. */
async function storeHits(db: ReturnType<typeof adminClient>, userId: string): Promise<StoreHit[]> {
  const { data: passed } = await db
    .from("candidates")
    .select("id, store, search_id, query")
    .eq("user_id", userId)
    .in("verdict", ["approved", "caveat"])
    .order("created_at", { ascending: false })
    .limit(3000);
  const { data: clicks } = await db.from("events").select("candidate_id").eq("user_id", userId).eq("type", "result_clicked").limit(2000);
  const clicked = new Set((clicks ?? []).map((c) => c.candidate_id));
  return (passed ?? []).map((p) => ({ store: p.store, search_id: p.search_id, clicked: clicked.has(p.id), query: p.query }));
}


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
import { usefulPageText } from "@/lib/search/listingText";
import { runJudge, type JudgeCandidate } from "@/lib/agents/judge";
import { score, type AnchorDef } from "@/lib/search/score";
import { downloadThumb } from "@/lib/server/linkPhotos";
import { cleanCandidates, type CleanRow } from "@/lib/search/clean";
import { runScreener, type ScreenItem } from "@/lib/agents/screener";
import { searchName } from "@/lib/searches";
import { lowEnd } from "@/lib/search/priceFloor";

/*
 * The search job (PLAN.md › Search pipeline). One Inngest step per stage, so a
 * failed step retries on its own and a paid search never runs twice.
 * gather (Lens, Shopping, Amazon) → clean → screen new items → enrich (product
 * lookups and page reads for fabric) → judge (checklist; code scores) → done.
 * Secondhand comes in phase 5.
 */

/** Pause searches when SerpApi gets this low (PLAN.md › Costs and guardrails). */
const SERP_FLOOR = 30;
/** How many screened picks go on to the judge (PLAN.md: up to 10 new; a few more since the judge now does the filtering). */
const MAX_RESULTS = 12;
/**
 * Google Shopping runs every look-alike phrasing from the brief (up to 4: each
 * brings different stores), plus one search per store below, scoped by adding
 * the store's name to the words (Maggie, Nov 15: Revolve had dupes the general
 * search missed; more phrasings and Nordstrom for more good candidates).
 * Friends' own favorite stores can take this over in phase 7.
 */
const MAX_PHRASINGS = 4;
const STORE_SEARCHES = ["Revolve", "Nordstrom"];
const BATCH = 20;
const MAX_BATCHES = 3;
/** Paid product lookups (1 SerpApi search each) per search, for the top picks (Maggie, Nov 15: top picks, open to upgrading). */
const MAX_LOOKUPS = 8;
/** Candidates per judge call (PLAN.md). */
const JUDGE_BATCH = 5;

type Ctx = {
  userId: string;
  name: string;
  photoPath: string | null;
  lensHint: string;
  lookAlike: string[];
  budget: number | null;
  priceFloor: number | null;
  brand: string;
  styleName: string;
  sizes: string[];
  fields: Record<string, unknown>;
  visualBrief: unknown;
  compositionBrief: unknown;
  anchors: AnchorDef[];
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
      if (!s) {
        // Already running or not confirmed. Make sure it's not because the search is missing.
        const { data: exists } = await db.from("searches").select("status").eq("id", searchId).maybeSingle();
        if (!exists) throw new Error(`Search ${searchId} not found with the server key`);
        console.log(`Search ${searchId} is ${exists.status}, not queued; skipping`);
        return null;
      }

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
        priceFloor: lowEnd({ budget_min: s.budget_min ?? null }),
        brand: s.brand ?? "",
        styleName: s.style_name ?? "",
        sizes: s.sizes ?? [],
        fields: pickFields(s),
        visualBrief: s.visual_brief,
        compositionBrief: s.composition_brief,
        anchors: ((s.visual_brief?.anchors ?? []) as AnchorDef[]).filter((a) => a && a.id),
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
      ...ctx.lookAlike
        .slice(0, MAX_PHRASINGS)
        .map((q, i) => gather(`shopping-${i + 1}`, "Google Shopping", () => shoppingSearch(q, ctx.budget, ctx.priceFloor))),
      ...STORE_SEARCHES.map((store) => {
        // The shortest phrasing works best with a store name added.
        const q = [...ctx.lookAlike].sort((a, b) => a.length - b.length)[0];
        return gather(`shopping-${store.toLowerCase()}`, "Google Shopping", () =>
          shoppingSearch(`${q} ${store.toLowerCase()}`, ctx.budget, ctx.priceFloor),
        );
      }),
      gather("amazon", "Amazon", () => amazonSearch(ctx.lookAlike[0], ctx.budget, ctx.priceFloor)),
    ]);

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
        budget: ctx.budget,
        priceFloor: ctx.priceFloor,
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

      // Screening order: take turns between searches (Lens, each Shopping search, Amazon),
      // each in its own ranking order, so the store search isn't buried.
      const kept = all.filter((r) => keptIds.has(r.id) && r.kind === "new");
      const bySource = new Map<string, typeof kept>();
      for (const r of kept.sort((a, b) => (a.position ?? 999) - (b.position ?? 999))) {
        const k = `${r.source}|${r.query}`;
        bySource.set(k, [...(bySource.get(k) ?? []), r]);
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
      const room = Math.min(10, MAX_RESULTS - picked);
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

    /* 5. Enrich: look up the top picks' product details (fabric words, reviews, store link), then read store pages. */
    const picks = await step.run("enrich-start", async () => {
      await db.from("searches").update({ status: "enriching" }).eq("id", searchId);
      const { data } = await db
        .from("candidates")
        .select("id, source, link, product_token, store")
        .eq("search_id", searchId)
        .eq("user_id", userId)
        .eq("stage", "screened")
        .is("drop_reason", null)
        .order("screen_rank");
      return data ?? [];
    });

    await Promise.all(
      picks.map((p, i) =>
        step.run(`lookup-${i + 1}`, async () => {
          if (i >= MAX_LOOKUPS) return;
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
      ),
    );

    await step.run("read-pages", async () => {
      const { data: rows } = await db
        .from("candidates")
        .select("id, source, link, store_link, listing_text")
        .in("id", picks.map((p) => p.id));
      const urlFor = (r: { source: string; link: string; store_link: string | null }) =>
        r.source === "amazon" ? null : (r.store_link ?? (r.source === "shopping" ? null : r.link));
      const targets = (rows ?? []).filter((r) => urlFor(r));
      if (targets.length) {
        try {
          const { pages } = await fetchPages(
            targets.map((r) => urlFor(r)!),
            "Read a clothing product page: fabric content, lining, care, fit and sizes in stock",
            20000,
          );
          // Match each page to its own address (two items from one store must not share a page).
          const key = (u: string) => {
            const x = new URL(u);
            return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`;
          };
          for (const r of targets) {
            const page = pages.find((pg) => pg.url === urlFor(r) || key(pg.url) === key(urlFor(r)!));
            const useful = page ? usefulPageText(page.text) : "";
            if (useful) {
              await db
                .from("candidates")
                .update({ listing_text: [r.listing_text, `From the store's page:\n${useful}`].filter(Boolean).join("\n\n") })
                .eq("id", r.id);
            }
          }
          await logJobCall({ userId, searchId, service: "tinyfish", stage: "enrich", units: { pages: pages.length, asked: targets.length }, ok: true });
        } catch (e) {
          await logJobCall({ userId, searchId, service: "tinyfish", stage: "enrich", ok: false, error: String(e) });
        }
      }
      await db
        .from("candidates")
        .update({ stage: "enriched", enriched_at: new Date().toISOString() })
        .in("id", picks.map((p) => p.id))
        .is("drop_reason", null);
    });

    /* 6. Judge, 5 at a time; cards appear on the phone as each batch is scored. */
    await step.run("judge-start", async () => {
      await db.from("searches").update({ status: "judging" }).eq("id", searchId);
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

          let result;
          try {
            result = await runJudge(
              {
                name: ctx.name,
                anchors: ctx.anchors,
                photo: original,
                fields: ctx.fields,
                visualBrief: ctx.visualBrief,
                compositionBrief: ctx.compositionBrief,
                sizes: ctx.sizes,
              },
              candidates,
            );
            await logJobCall({ userId, searchId, service: "claude", stage: "judge", units: result.usage, ok: true });
          } catch (e) {
            await logJobCall({ userId, searchId, service: "claude", stage: "judge", ok: false, error: String(e) });
            if (!lastTry) throw e;
            return 0;
          }

          let judged = 0;
          for (const [i, r] of rows.entries()) {
            const c = result.checklists.get(`c${i + 1}`);
            if (!c) continue;
            const v = score(c, ctx.anchors);
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
          return judged;
        }),
      ),
    );

    /* 7. Done. */
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

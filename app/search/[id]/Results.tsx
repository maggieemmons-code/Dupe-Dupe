"use client";

/* eslint-disable @next/next/no-img-element -- product photos come from many stores' own servers */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { confirmSearch } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { searchName, type SearchRow } from "@/lib/searches";
import { money, imageSource, type CandidateRow } from "@/lib/candidates";
import { lowEnd } from "@/lib/search/priceFloor";
import styles from "./results.module.css";
import ui from "../../ui.module.css";

const RUNNING = ["queued", "gathering", "screening", "enriching", "judging"];

const STATUS: Record<string, string> = {
  queued: "Starting your search…",
  gathering: "Looking for dupes…",
  screening: "Picking the closest matches…",
  enriching: "Reading the listings…",
  judging: "Checking each match…",
};

export default function Results({
  search,
  photoUrl,
  candidates,
  misses = [],
}: {
  search: SearchRow;
  photoUrl: string | null;
  candidates: CandidateRow[];
  misses?: CandidateRow[];
}) {
  const router = useRouter();
  const running = RUNNING.includes(search.status);
  const scored = candidates.some((c) => c.look_score != null);
  const [sort, setSort] = useState<"look" | "fit" | "price">("look");
  const [view, setView] = useState<"all" | "new" | "used">(search.view ?? "all");
  const [pending, startTransition] = useTransition();
  const [retryError, setRetryError] = useState<string | null>(null);

  // A search still "queued" a minute after it was confirmed never started (for example a
  // server setting was wrong). Offer to start it again instead of waiting forever.
  const [timedOut, setTimedOut] = useState<string | null>(null); // the updated_at that timed out
  const stuck = search.status === "queued" && timedOut === search.updated_at;
  useEffect(() => {
    if (search.status !== "queued") return;
    const wait = Math.max(0, 60_000 - (Date.now() - new Date(search.updated_at).getTime()));
    const t = setTimeout(() => setTimedOut(search.updated_at), wait);
    return () => clearTimeout(t);
  }, [search.status, search.updated_at]);

  function retry() {
    setRetryError(null);
    startTransition(async () => {
      const r = await confirmSearch(search.id);
      if (!r.ok) return setRetryError(r.error);
      setTimedOut(null);
      router.refresh();
    });
  }

  // Live updates: new cards and status changes arrive through Supabase Realtime.
  // A slow refresh while the search runs covers a dropped connection.
  useEffect(() => {
    if (!running) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 400);
    };
    const channel = supabase
      .channel(`search-${search.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates", filter: `search_id=eq.${search.id}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "searches", filter: `id=eq.${search.id}` }, refresh)
      .subscribe();
    const poll = setInterval(() => router.refresh(), 6000);
    return () => {
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [running, search.id, router]);

  const items = useMemo(() => {
    const list = candidates.filter((c) => view === "all" || (view === "new" ? c.kind === "new" : c.kind === "secondhand"));
    if (sort === "price") list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    else if (scored && sort === "fit") list.sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1) || (b.look_score ?? -1) - (a.look_score ?? -1));
    else if (scored) list.sort((a, b) => (b.look_score ?? -1) - (a.look_score ?? -1) || (b.fit_score ?? -1) - (a.fit_score ?? -1));
    return list;
  }, [candidates, sort, view, scored]);

  const name = searchName(search);
  const summary = [search.hem, search.neckline, search.composition || search.fabrics.join(", "), search.color_name || search.color]
    .filter(Boolean)
    .join(" · ");
  const countLabel = running
    ? candidates.length
      ? `${candidates.length} so far`
      : "Searching"
    : `${candidates.length} dupe${candidates.length === 1 ? "" : "s"}`;

  return (
    <main className={`${ui.page} ${styles.page}`}>
      <header className={ui.topbar}>
        <Link href="/" className={ui.iconBtn} aria-label="Back to Find">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className={ui.screenTitle}>Results</span>
        <span className={styles.count}>{countLabel}</span>
      </header>

      {/* Your original, in the black strip */}
      <section className={styles.original} aria-label="Your original">
        <div className={styles.originalTile}>{photoUrl && <img src={photoUrl} alt="" />}</div>
        <div className={styles.originalText}>
          <span className={styles.originalEyebrow}>Your original</span>
          <span className={styles.originalName}>
            {name}
            {search.retail_price != null && ` · ${money(search.retail_price)}`}
          </span>
          {summary && <span className={styles.originalMeta}>{summary}</span>}
        </div>
      </section>

      {running && !stuck && (
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {STATUS[search.status] ?? "Searching…"}
        </p>
      )}

      {(stuck || search.status === "failed") && (
        <section className={styles.retry}>
          <p className={ui.error}>
            {stuck ? "This search didn't start." : (search.error ?? "The search stopped partway.")}
          </p>
          <button className={ui.btnSmall} onClick={retry} disabled={pending}>
            {pending ? "Starting…" : "Try again"}
          </button>
          {retryError && <p className={ui.error}>{retryError}</p>}
        </section>
      )}

      {search.missing_sources?.length > 0 && (
        <p className={styles.note}>
          Some stores didn&rsquo;t answer this time, so there may be fewer results than usual.
        </p>
      )}

      {candidates.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.segmented} role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["new", "New"],
                ["used", "Secondhand"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>
          {search.budget != null && (
            <span className={styles.budget}>
              {(() => {
                const floor = lowEnd(search);
                return floor ? `${money(floor)}–${money(search.budget)}` : `Under ${money(search.budget)}`;
              })()}
            </span>
          )}
        </div>
      )}

      {candidates.length > 1 && (
        <div className={styles.sortRow}>
          <span className={styles.sortLabel}>Sort</span>
          <div className={styles.segmented} role="group" aria-label="Sort">
            {(scored
              ? ([
                  ["look", "Best look"],
                  ["fit", "Best fit"],
                  ["price", "Lowest price"],
                ] as const)
              : ([
                  ["look", "Best match"],
                  ["price", "Lowest price"],
                ] as const)
            ).map(([v, label]) => (
              <button key={v} aria-pressed={sort === v} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className={styles.grid}>
          {items.map((c) => (
            <li key={c.id}>
              <Card c={c} />
            </li>
          ))}
        </ul>
      )}

      {!running && search.status === "done" && !items.length && (
        <section className={styles.empty}>
          <h2>Nothing strong enough yet</h2>
          <p>
            {view === "used"
              ? "Secondhand arrives in a later update."
              : "We only show close matches, and none made the cut this time. Secondhand often has the real thing; it arrives in a later update."}
          </p>
        </section>
      )}
      {misses.length > 0 && view !== "used" && (
        <section className={styles.misses} aria-labelledby="misses-title">
          <h2 id="misses-title" className={styles.missesTitle}>
            Closest we found, not a true match
          </h2>
          <p className={styles.note}>These missed something that matters. Each says what&rsquo;s different.</p>
          <ul className={styles.grid}>
            {misses.map((c) => (
              <li key={c.id}>
                <Card c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  );
}

function Card({ c }: { c: CandidateRow }) {
  const onSale = c.old_price != null && c.price != null && c.old_price > c.price;
  return (
    <Link href={`/search/${c.search_id}/item/${c.id}`} className={styles.card}>
      <div className={styles.tile}>
        {c.photo_url || c.thumb_url ? (
          <img
            src={c.photo_url ?? c.thumb_url!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const img = e.currentTarget;
              if (c.thumb_url && img.src !== c.thumb_url) img.src = c.thumb_url;
            }}
          />
        ) : (
          <span className={styles.noPhoto}>No photo</span>
        )}
        <span className={styles.badges}>
          {c.color_match === "different" && <span className={styles.badgeInk}>Different color</span>}
          {onSale && <span className={styles.badgeInk}>Sale</span>}
        </span>
        <span className={styles.imageLabel}>Image · {imageSource(c)}</span>
      </div>
      <div className={styles.cardText}>
        <span className={styles.storeRow}>
          <span className={styles.store}>{c.brand && c.brand.toLowerCase() !== c.store.toLowerCase() ? `${c.brand} · ${c.store}` : c.store}</span>
          {c.look_score != null && (
            <span className={styles.scores} aria-label={`Look ${c.look_score}, fit ${c.fit_score}`}>
              L{c.look_score} · F{c.fit_score}
            </span>
          )}
        </span>
        <span className={styles.name}>{c.title}</span>
        <span className={styles.priceLine}>
          {c.price != null ? (
            <>
              <span className={styles.price}>{money(c.price)}</span>
              {c.price_is_estimate && <span className={styles.est}>Est.</span>}
              {onSale && <s className={styles.was}>{money(c.old_price)}</s>}
            </>
          ) : (
            <span className={styles.est}>Price at store</span>
          )}
        </span>
        {c.rating != null && (
          <span className={styles.meta}>
            ★ {c.rating}
            {c.reviews ? ` (${c.reviews.toLocaleString("en-US")})` : ""}
          </span>
        )}
        <span className={styles.sizeLine}>
          <span className={styles.sizeDotHollow} aria-hidden="true" />
          Size not checked
        </span>
        {c.verdict === "rejected" && c.judge_note && <span className={styles.caveat}>{c.judge_note}</span>}
        {c.verdict === "caveat" && c.caveat && (
          <span className={styles.caveat}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 2 21h20L12 3z" />
              <path d="M12 10v5M12 18h.01" />
            </svg>
            {c.caveat}
          </span>
        )}
      </div>
    </Link>
  );
}

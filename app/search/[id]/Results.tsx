"use client";

/* eslint-disable @next/next/no-img-element -- product photos come from many stores' own servers */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { searchName, type SearchRow } from "@/lib/searches";
import { money, imageSource, type CandidateRow } from "@/lib/candidates";
import styles from "./results.module.css";
import ui from "../../ui.module.css";

const RUNNING = ["queued", "gathering", "screening", "enriching", "judging"];

const STATUS: Record<string, string> = {
  queued: "Starting the search…",
  gathering: "Looking on Google Lens, Google Shopping and Amazon…",
  screening: "Picking the closest matches…",
  enriching: "Reading the listings…",
  judging: "Checking each match…",
};

export default function Results({
  search,
  photoUrl,
  candidates,
}: {
  search: SearchRow;
  photoUrl: string | null;
  candidates: CandidateRow[];
}) {
  const router = useRouter();
  const running = RUNNING.includes(search.status);
  const [sort, setSort] = useState<"match" | "price">("match");

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
    const list = [...candidates];
    if (sort === "price") list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return list;
  }, [candidates, sort]);

  const name = searchName(search);
  const summary = [search.hem, search.neckline, search.composition || search.fabrics.join(", "), search.color_name || search.color]
    .filter(Boolean)
    .join(" · ");
  const countLabel = running
    ? candidates.length
      ? `${candidates.length} so far`
      : "Searching"
    : `${candidates.length} new dupe${candidates.length === 1 ? "" : "s"}`;

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

      {running && (
        <p className={styles.status} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {STATUS[search.status] ?? "Searching…"}
        </p>
      )}

      {search.status === "failed" && <p className={ui.error}>{search.error ?? "The search stopped partway. Try again in a minute."}</p>}

      {search.missing_sources?.length > 0 && (
        <p className={styles.note}>
          {search.missing_sources.join(" and ")} didn&rsquo;t answer this time, so these come from the other stores.
        </p>
      )}

      {candidates.length > 1 && (
        <div className={styles.toolbar}>
          <div className={styles.segmented} role="group" aria-label="Sort">
            <button aria-pressed={sort === "match"} onClick={() => setSort("match")}>
              Best match
            </button>
            <button aria-pressed={sort === "price"} onClick={() => setSort("price")}>
              Lowest price
            </button>
          </div>
          {search.budget != null && <span className={styles.budget}>Under {money(search.budget)}</span>}
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
          <p>We only show close matches, and none made the cut this time. Secondhand often has the real thing; it arrives in a later update.</p>
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
        <span className={styles.store}>{c.brand && c.brand.toLowerCase() !== c.store.toLowerCase() ? `${c.brand} · ${c.store}` : c.store}</span>
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
      </div>
    </Link>
  );
}

/* eslint-disable @next/next/no-img-element -- product photos come from many stores' own servers */

import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { signedPhotoUrls } from "@/lib/server/photos";
import { searchName, type SearchRow } from "@/lib/searches";
import { cleanTitle } from "@/lib/titles";
import { CANDIDATE_FIELDS, money, imageSource, ago, sizeStatus, type CandidateRow } from "@/lib/candidates";
import { breakdown, type AnchorDef } from "@/lib/search/score";
import { loadTaste } from "@/lib/server/taste";
import { tasteWeights } from "@/lib/taste";
import styles from "./detail.module.css";
import ui from "../../../../ui.module.css";

export const metadata = { title: "Item · Dupe Dupe" };

async function DetailLoader({ params }: { params: PageProps<"/search/[id]/item/[cid]">["params"] }) {
  const { id, cid } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [{ data: s }, { data: c }] = await Promise.all([
    session.supabase.from("searches").select("*").eq("id", id).maybeSingle(),
    session.supabase.from("candidates").select(CANDIDATE_FIELDS).eq("id", cid).eq("search_id", id).maybeSingle(),
  ]);
  if (!s || !c) notFound();
  const search = s as SearchRow;
  const item = c as CandidateRow;

  const urls = await signedPhotoUrls(session, search.photo_paths.slice(0, 1));
  const originalUrl = search.photo_paths[0] ? urls[search.photo_paths[0]] ?? null : null;

  const savings = search.retail_price != null && item.price != null ? search.retail_price - item.price : null;
  const onSale = item.old_price != null && item.price != null && item.old_price > item.price;
  const storeLabel = `Shop at ${item.store}`;
  const size = sizeStatus(item, search.sizes ?? []);
  const detailsSummary = [item.fabric_evidence ? "Fabric listed" : "Fabric not listed", size.short, item.delivery]
    .filter(Boolean)
    .join(" · ");
  const anchors = ((search.visual_brief?.anchors ?? []) as AnchorDef[]).filter((a) => a && a.id);
  const weights = tasteWeights(await loadTaste(session.supabase as never, session.userId));
  const b = item.checklist ? breakdown(item.checklist, anchors, weights) : null;

  return (
    <main className={`${ui.page} ${styles.page}`}>
      <header className={ui.topbar}>
        <Link href={`/search/${id}`} className={ui.iconBtn} aria-label="Back to results">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className={ui.screenTitle}>New dupe</span>
        <span style={{ width: 44 }} />
      </header>

      {/* Side by side with the original */}
      <section className={styles.pair}>
        <figure className={styles.side}>
          <div className={styles.tile}>{originalUrl ? <img src={originalUrl} alt="Your original" /> : <span className={styles.noPhoto}>No photo</span>}</div>
          <figcaption className={styles.caption}>Your original</figcaption>
        </figure>
        <figure className={styles.side}>
          <div className={styles.tile}>
            {item.photo_url || item.thumb_url ? (
              <img src={item.photo_url ?? item.thumb_url!} alt={cleanTitle(item.title, item.store)} referrerPolicy="no-referrer" />
            ) : (
              <span className={styles.noPhoto}>No photo</span>
            )}
            {item.color_match === "different" && <span className={styles.badgeInk}>Different color</span>}
            <span className={styles.imageLabel}>Image · {imageSource(item)}</span>
          </div>
          <figcaption className={styles.caption}>This dupe</figcaption>
        </figure>
      </section>

      <section className={styles.head}>
        <span className={styles.store}>{item.brand && item.brand.toLowerCase() !== item.store.toLowerCase() ? `${item.brand} · ${item.store}` : item.store}</span>
        <h1 className={styles.title}>{cleanTitle(item.title, item.store)}</h1>
        {item.price != null ? (
          <div className={styles.priceRow}>
            <span className={styles.price}>{money(item.price)}</span>
            {item.price_is_estimate && <span className={styles.est}>Est. · confirm at the store</span>}
            {onSale && <s className={styles.was}>{money(item.old_price)}</s>}
          </div>
        ) : (
          <span className={styles.est}>Price shown at the store</span>
        )}
        {savings != null && savings > 0 && (
          <span className={styles.savings}>
            {money(Math.round(savings))} less than {searchName(search)}
          </span>
        )}
        {item.price_checked_at && <span className={styles.meta}>Price checked {ago(item.price_checked_at)}</span>}
        {item.rating != null && (
          <span className={styles.meta}>
            ★ {item.rating}
            {item.reviews ? ` · ${item.reviews.toLocaleString("en-US")} reviews` : ""}
          </span>
        )}
      </section>

      {/* Verdict and caveat */}
      {item.verdict && (
        <section className={styles.verdictRow}>
          <span className={item.verdict === "approved" ? styles.pillInk : styles.pillOutline}>
            {item.verdict === "approved" ? "Approved" : item.verdict === "caveat" ? "Caveat" : "Not a true match"}
          </span>
          {item.verdict === "caveat" && item.caveat && <span className={styles.caveatText}>{item.caveat}</span>}
        </section>
      )}
      {!item.verdict && item.color_match === "different" && (
        <p className={styles.caveat}>
          <span aria-hidden="true">⚠</span> Different color from your original
        </p>
      )}

      {/* Why it matches: look and fit, always shown separately */}
      {b && item.look_score != null ? (
        <section className={styles.why}>
          <h2 className={styles.h2}>Why it matches</h2>
          <div className={styles.scoreTiles}>
            <div className={styles.scoreLook}>
              <span className={styles.scoreLabel}>Look</span>
              <span className={styles.scoreNum}>{item.look_score}%</span>
            </div>
            <div className={styles.scoreFit}>
              <span className={styles.scoreLabel}>Fit</span>
              <span className={styles.scoreNum}>{item.fit_score}%</span>
            </div>
          </div>
          <p className={styles.meta}>Look: how close it looks to your original. Fit: the fabric and your size.</p>
          {item.judge_note && (
            <p>
              <strong>Biggest difference:</strong> {item.judge_note}
            </p>
          )}
          {item.confidence != null && item.confidence < 0.5 && (
            <p className={styles.meta}>Less certain: the photo or listing didn&rsquo;t show much.</p>
          )}
          <details className={styles.seeWhy}>
            <summary>See why</summary>
            {(
              [
                ["Look", b.look.groups],
                ["Fit", b.fit.groups],
              ] as const
            ).map(([title, groups]) => (
              <div key={title} className={styles.barGroup}>
                <span className={styles.barTitle}>{title}</span>
                {Object.entries(groups).map(([label, v]) => (
                  <div key={label} className={styles.barRow}>
                    <span className={styles.barLabel}>{label}</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span style={{ width: `${v ?? 0}%` }} />
                    </span>
                    <span className={styles.barNum}>{v ?? "–"}</span>
                  </div>
                ))}
              </div>
            ))}
            <p className={styles.meta}>
              How we match: a checker compares this piece with your original, detail by detail, and reads its listing for
              the fabric. Look counts your signature details, shape, color, sheen and how high end it looks. Fit counts the
              fabric and your size. Scores are worked out from those answers the same way every time.
            </p>
          </details>
        </section>
      ) : (
        item.screen_note && (
          <section className={styles.why}>
            <h2 className={styles.h2}>Why it made the cut</h2>
            <p>{item.screen_note}</p>
          </section>
        )
      )}

      <details className={styles.collapse}>
        <summary>
          <span className={styles.h2}>Details</span>
          <span className={styles.summaryLine}>{detailsSummary}</span>
        </summary>
        <dl className={styles.rows}>
          <div>
            <dt>Fabric</dt>
            <dd>{item.fabric_evidence ? `“${item.fabric_evidence}”` : "Not listed by the store."}</dd>
          </div>
          <div>
            <dt>Stock</dt>
            <dd>{item.availability === "in_stock" ? "In stock when we checked." : "Not confirmed. Check at the store."}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{size.long}</dd>
          </div>
          {item.delivery && (
            <div>
              <dt>Shipping</dt>
              <dd>{item.delivery}</dd>
            </div>
          )}
          {item.store_details?.length > 0 && (
            <div>
              <dt>Store</dt>
              <dd>{item.store_details.join(" · ")}</dd>
            </div>
          )}
        </dl>
      </details>

      {/* Sticky buy bar */}
      <div className={styles.buyBar}>
        <div className={styles.buyPrice}>
          <span className={styles.price}>{item.price != null ? money(item.price) : ""}</span>
          {item.price_is_estimate && item.price != null && <span className={styles.est}>Est.</span>}
        </div>
        <a href={`/go/${item.id}`} className={ui.btn} target="_blank" rel="noopener">
          {storeLabel}
        </a>
      </div>
    </main>
  );
}

export default function ItemPage({ params }: PageProps<"/search/[id]/item/[cid]">) {
  return (
    <Suspense
      fallback={
        <main className={ui.page}>
          <p className={ui.eyebrow}>Loading…</p>
        </main>
      }
    >
      <DetailLoader params={params} />
    </Suspense>
  );
}

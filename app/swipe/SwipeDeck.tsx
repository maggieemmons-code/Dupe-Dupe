"use client";

/* eslint-disable @next/next/no-img-element -- product photos come from many stores' own servers */

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { rate, unrate } from "@/app/ratings/actions";
import styles from "./swipe.module.css";

export type SwipeCard = {
  id: string;
  searchId: string;
  original: string;
  title: string;
  brand: string;
  store: string;
  price: number | null;
  estimate: boolean;
  photo: string;
  look: number | null;
  fit: number | null;
  caveat: string | null;
  differentColor: boolean;
};

/** The design's three reasons each way, mapped to the rating reasons (lib/ratings.ts). */
const YES_REASONS = ["The shape", "The price", "The fabric"];
const NO_REASONS = ["Too pricey", "Fabric looks cheap", "Just not me"];
const SHORT: Record<string, string> = { "Too pricey": "Price", "Fabric looks cheap": "Fabric", "Just not me": "Not me", "The shape": "The shape", "The price": "The price", "The fabric": "Fabric" };
const THRESHOLD = 100;

const money = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;

/**
 * Swipe to train (DESIGN.md › Swipe; Main.dc.html). Right is yes, left is no; the frosted pop-up
 * asks why, then shrinks to "Nope · Fabric" with Change. Swiping is a rating; Info is not.
 */
export default function SwipeDeck({ cards, rated }: { cards: SwipeCard[]; rated: number }) {
  const [i, setI] = useState(0);
  const [count, setCount] = useState(rated);
  const [last, setLast] = useState<{ card: SwipeCard; dir: 1 | -1; reason: string | null } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [flyOut, setFlyOut] = useState<1 | -1 | 0>(0);
  const [error, setError] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  const [, startTransition] = useTransition();

  const cur = cards[i];
  const next = cards[i + 1];

  function commit(dir: 1 | -1) {
    if (!cur || flyOut) return;
    const card = cur;
    setFlyOut(dir);
    setTimeout(() => {
      setFlyOut(0);
      setDrag({ x: 0, y: 0, active: false });
      setI((n) => n + 1);
    }, 220);
    setLast({ card, dir, reason: null });
    setCount((n) => n + 1);
    startTransition(async () => {
      const r = await rate(card.id, { vote: dir > 0 ? "up" : "down", reason: "" }, "swipe");
      setError(r.ok ? "" : r.error);
    });
  }

  function pickReason(reason: string) {
    if (!last) return;
    setLast({ ...last, reason });
    startTransition(async () => {
      const r = await rate(last.card.id, { vote: last.dir > 0 ? "up" : "down", reason }, "swipe");
      setError(r.ok ? "" : r.error);
    });
  }

  function undo() {
    if (!last) return;
    const card = last.card;
    setI((n) => Math.max(0, n - 1));
    setCount((n) => Math.max(0, n - 1));
    setLast(null);
    startTransition(async () => {
      await unrate(card.id);
    });
  }

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.3, active: true });
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    if (drag.x > THRESHOLD) commit(1);
    else if (drag.x < -THRESHOLD) commit(-1);
    else setDrag({ x: 0, y: 0, active: false });
  };

  const x = flyOut ? flyOut * 600 : drag.x;
  const yesOp = Math.max(0, Math.min(x / 90, 1));
  const noOp = Math.max(0, Math.min(-x / 90, 1));

  return (
    <div className={styles.wrap}>
      <div className={styles.counter}>
        <span>Training your eye</span>
        <span>
          {count} swipe{count === 1 ? "" : "s"}
        </span>
      </div>

      {cur ? (
        <div className={styles.deck}>
          {next && (
            <div className={`${styles.card} ${styles.back}`} aria-hidden="true">
              <div className={styles.tile}>
                <img src={next.photo} alt="" referrerPolicy="no-referrer" />
              </div>
            </div>
          )}
          <div
            className={styles.card}
            style={{ transform: `translate(${x}px, ${drag.y}px) rotate(${x / 16}deg)`, transition: drag.active && !flyOut ? "none" : "transform 220ms ease" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div className={styles.tile}>
              <img src={cur.photo} alt={cur.title} referrerPolicy="no-referrer" draggable={false} />
              <span className={styles.stampYes} style={{ opacity: yesOp }} aria-hidden="true">
                YES
              </span>
              <span className={styles.stampNo} style={{ opacity: noOp }} aria-hidden="true">
                NOPE
              </span>
              {cur.differentColor && <span className={styles.badge}>Different color</span>}
            </div>
            <div className={styles.text}>
              <span className={styles.eyebrow}>For your {cur.original}</span>
              <span className={styles.store}>{cur.brand ? `${cur.brand} · ${cur.store}` : cur.store}</span>
              <span className={styles.title}>{cur.title}</span>
              <span className={styles.metaRow}>
                {cur.price != null && (
                  <span className={styles.price}>
                    {money(cur.price)}
                    {cur.estimate && <span className={styles.est}> Est.</span>}
                  </span>
                )}
                {cur.look != null && (
                  <span className={styles.scores}>
                    Look {cur.look}% · Fit {cur.fit}%
                  </span>
                )}
              </span>
              {cur.caveat && <span className={styles.caveat}>{cur.caveat}</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.done}>
          <h2>You&rsquo;re caught up.</h2>
          <p>Start a new search to get more.</p>
          <Link href="/" className={styles.primary}>
            Find a dupe
          </Link>
        </div>
      )}

      {cur && (
        <div className={styles.controls}>
          <button type="button" className={styles.round} aria-label="Not for me" onClick={() => commit(-1)}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <Link href={`/search/${cur.searchId}/item/${cur.id}`} className={styles.info}>
            See full details
          </Link>
          <button type="button" className={`${styles.round} ${styles.roundInk}`} aria-label="Yes, a good dupe" onClick={() => commit(1)}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.6 2.9 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.8 0 5.8 4.1 4.3 7.3C19.5 16.4 12 21 12 21z" />
            </svg>
          </button>
        </div>
      )}
      {cur && <p className={styles.hintLine}>← Swipe to pass · Swipe for yes →</p>}
      {last && (
        <button type="button" className={styles.undo} onClick={undo}>
          Undo last swipe
        </button>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {last && (
        <div className={styles.popup} role="status">
          <div className={styles.popThumb}>
            <img src={last.card.photo} alt="" referrerPolicy="no-referrer" />
            <span className={last.dir > 0 ? styles.popBadgeYes : styles.popBadgeNo} aria-hidden="true">
              {last.dir > 0 ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.6 2.9 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.8 0 5.8 4.1 4.3 7.3C19.5 16.4 12 21 12 21z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              )}
            </span>
          </div>
          {last.reason ? (
            <p className={styles.popSummary}>
              {last.dir > 0 ? "Yes" : "Nope"} · {SHORT[last.reason] ?? last.reason}{" "}
              <button type="button" className={styles.link} onClick={() => setLast({ ...last, reason: null })}>
                Change
              </button>
            </p>
          ) : (
            <div className={styles.popBody}>
              <span className={styles.popLabel}>{last.dir > 0 ? "You said yes · What hooked you?" : "You passed · What missed?"}</span>
              <div className={styles.popChips}>
                {(last.dir > 0 ? YES_REASONS : NO_REASONS).map((r) => (
                  <button key={r} type="button" className={styles.chip} onClick={() => pickReason(r)}>
                    {SHORT[r] ?? r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className={styles.popClose} aria-label="Close" onClick={() => setLast(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

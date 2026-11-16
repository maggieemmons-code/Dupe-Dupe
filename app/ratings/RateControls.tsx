"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rate, unrate, type Rating } from "./actions";
import { DOWN_REASONS, UP_REASONS, joinReasons, splitReasons, type Vote } from "@/lib/ratings";
import styles from "./ratings.module.css";

export type SavedRating = { vote: Vote; reason: string; scope: "taste" | "item"; bought: boolean };

const Thumb = ({ down = false }: { down?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={down ? { transform: "rotate(180deg)" } : undefined}>
    <path d="M7 10v11H4V10h3z" />
    <path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.4 21H7" />
  </svg>
);

/**
 * Thumbs up or down with one-tap reasons (PLAN.md › Learning loop). On cards ("row"): two thumbs,
 * reasons in a bottom sheet. On Item detail ("block"): a "Rate this match" box with "I bought this".
 * After saving, a one-line summary with Change; the search re-ranks at once.
 */
export default function RateControls({
  candidateId,
  initial,
  source,
  layout,
}: {
  candidateId: string;
  initial: SavedRating | null;
  source: "card" | "detail";
  layout: "row" | "block";
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedRating | null>(initial);
  const [sheet, setSheet] = useState<Vote | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [justThis, setJustThis] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const open = (vote: Vote) => {
    setPicked(saved?.vote === vote ? splitReasons(saved.reason) : []);
    setJustThis(saved?.vote === vote ? saved.scope === "item" : false);
    setNote("");
    setError("");
    setSheet(vote);
  };

  const save = (r: Rating) =>
    start(async () => {
      const res = await rate(candidateId, r, source);
      if (!res.ok) return setError(res.error);
      setSaved({ vote: r.vote, reason: r.reason, scope: r.scope ?? "taste", bought: !!r.bought });
      setSheet(null);
      router.refresh(); // re-ranks this search with the friend's nudged weights
    });

  const clear = () =>
    start(async () => {
      const res = await unrate(candidateId);
      if (!res.ok) return setError(res.error);
      setSaved(null);
      router.refresh();
    });

  const summary = saved
    ? `${saved.bought ? "Bought" : saved.vote === "up" ? "Good dupe" : "Nope"}${saved.reason ? ` · ${splitReasons(saved.reason).join(", ")}` : ""}${saved.scope === "item" ? " · just this piece" : ""}`
    : "";

  const sheetEl = sheet && (
    <div className={styles.scrim} onClick={() => setSheet(null)}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="rate-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="rate-title" className={styles.sheetTitle}>
          {sheet === "down" ? "What missed?" : "Good dupe. Close enough on…"}
        </h2>
        <p className={styles.hint}>{sheet === "down" ? "Pick all that apply." : "Optional: what's different but fine. Pick all that apply."}</p>
        <div className={styles.chips}>
          {(sheet === "down" ? DOWN_REASONS : UP_REASONS).map((r) => (
            <button
              key={r.label}
              type="button"
              className={picked.includes(r.label) ? styles.chipOn : styles.chip}
              aria-pressed={picked.includes(r.label)}
              onClick={() => setPicked(picked.includes(r.label) ? picked.filter((x) => x !== r.label) : [...picked, r.label])}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className={styles.switchRow}>
          <span>
            Just this piece
            <span className={styles.hint}> · don&rsquo;t learn from it</span>
          </span>
          <button type="button" role="switch" aria-checked={justThis} className={justThis ? styles.switchOn : styles.switch} onClick={() => setJustThis(!justThis)}>
            <span />
          </button>
        </label>
        <input className={styles.note} placeholder="Add a note (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.sheetBtns}>
          <button type="button" className={styles.secondary} onClick={() => setSheet(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={pending}
            onClick={() => save({ vote: sheet, reason: joinReasons(picked), note, scope: justThis ? "item" : "taste", bought: sheet === "up" && !!saved?.bought })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  if (layout === "row") {
    return (
      <div className={styles.row}>
        <button type="button" className={saved?.vote === "up" ? styles.thumbOn : styles.thumb} aria-pressed={saved?.vote === "up"} aria-label="Good dupe" onClick={() => (saved?.vote === "up" ? clear() : open("up"))} disabled={pending}>
          <Thumb />
        </button>
        <button type="button" className={saved?.vote === "down" ? styles.thumbOn : styles.thumb} aria-pressed={saved?.vote === "down"} aria-label="Not a good dupe" onClick={() => (saved?.vote === "down" ? clear() : open("down"))} disabled={pending}>
          <Thumb down />
        </button>
        {saved && (
          <span className={styles.summarySmall}>
            {summary}{" "}
            <button type="button" className={styles.link} onClick={() => open(saved.vote)}>
              Change
            </button>
          </span>
        )}
        {error && !sheet && <span className={styles.error}>{error}</span>}
        {sheetEl}
      </div>
    );
  }

  return (
    <section className={styles.block} aria-labelledby="rate-h">
      <h2 id="rate-h" className={styles.blockTitle}>
        Rate this match
      </h2>
      {saved ? (
        <p className={styles.summary} role="status">
          {summary}.{" "}
          <button type="button" className={styles.link} onClick={() => open(saved.vote)}>
            Change
          </button>{" "}
          ·{" "}
          <button type="button" className={styles.link} onClick={clear} disabled={pending}>
            Clear
          </button>
        </p>
      ) : (
        <>
          <p className={styles.hint}>Your ratings teach Dupe Dupe your eye. This search re-ranks as you rate.</p>
          <div className={styles.blockBtns}>
            <button type="button" className={styles.secondary} onClick={() => open("up")}>
              <Thumb /> Good dupe
            </button>
            <button type="button" className={styles.secondary} onClick={() => open("down")}>
              <Thumb down /> Not for me
            </button>
          </div>
        </>
      )}
      {!saved?.bought && (
        <button
          type="button"
          className={styles.link}
          disabled={pending}
          onClick={() => save({ vote: "up", reason: saved?.vote === "up" ? saved.reason : "", scope: saved?.scope ?? "taste", bought: true })}
        >
          I bought this
        </button>
      )}
      {error && !sheet && <p className={styles.error}>{error}</p>}
      {sheetEl}
    </section>
  );
}

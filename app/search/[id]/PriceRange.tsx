"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./priceRange.module.css";

/**
 * Two-handle price slider for new dupes (Maggie, Nov 15). The low handle starts
 * at the default floor; the high handle at the friend's budget, or at the top
 * of the scale, which means no limit. Saves a moment after the last move.
 */
export default function PriceRange({
  low,
  high,
  scaleMax,
  onSave,
}: {
  low: number;
  high: number | null;
  scaleMax: number;
  onSave: (low: number, high: number | null) => void;
}) {
  const step = scaleMax > 1000 ? 25 : 10;
  const [lo, setLo] = useState(Math.min(low, scaleMax - step));
  const [hi, setHi] = useState(high == null ? scaleMax : Math.min(high, scaleMax));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onSave(lo, hi >= scaleMax ? null : hi), 600);
    return () => clearTimeout(t);
  }, [lo, hi, scaleMax, onSave]);

  const pct = (v: number) => `${(v / scaleMax) * 100}%`;
  const money = (v: number) => `$${v.toLocaleString("en-US")}`;
  const label = `${lo > 0 ? money(lo) : "$0"} – ${hi >= scaleMax ? `${money(scaleMax)}+` : money(hi)}`;

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <span className={styles.label}>Price range · new dupes</span>
        <span className={styles.value} aria-live="polite">
          {label}
        </span>
      </div>
      <div className={styles.slider}>
        <div className={styles.track} />
        <div className={styles.fill} style={{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }} />
        <input
          type="range"
          aria-label="Lowest price"
          min={0}
          max={scaleMax}
          step={step}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi - step))}
        />
        <input
          type="range"
          aria-label="Highest price"
          min={0}
          max={scaleMax}
          step={step}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo + step))}
        />
      </div>
      <div className={styles.scale}>
        <span>$0</span>
        <span>{money(scaleMax)}+</span>
      </div>
      <span className={styles.hint}>Drag the low end up to skip very cheap pieces. Both ends start where you left them last time.</span>
    </div>
  );
}

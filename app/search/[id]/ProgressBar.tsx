"use client";

import styles from "./progress.module.css";

/** The progress bar on Results (searching) and Review (reading your piece), Maggie, Nov 15. */
export default function ProgressBar({ percent, line, note, label }: { percent: number; line: string; note?: string; label: string }) {
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={label}>
        <span className={styles.fill} style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} />
      </div>
      <div className={styles.line}>
        <span>{line}</span>
        {note && <span className={styles.note}>{note}</span>}
      </div>
    </div>
  );
}

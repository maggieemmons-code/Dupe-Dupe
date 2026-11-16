"use client";

import { useState, useTransition } from "react";
import { blockStoreOf, unblockStoreOf } from "@/app/stores/actions";
import styles from "./detail.module.css";

const REASONS = ["AliExpress dropship", "Poor quality", "Scam or fake store"];

/**
 * Maggie only (Nov 16): block this result's store for everyone, with a reason, starting with
 * "AliExpress dropship". It leaves every friend's results at once; Undo or Hidden stores brings it back.
 */
export default function AdminBlock({ candidateId, store, blocked: initial }: { candidateId: string; store: string; blocked: boolean }) {
  const [blocked, setBlocked] = useState<string | null>(initial ? "" : null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const block = (reason: string) =>
    start(async () => {
      const r = await blockStoreOf(candidateId, reason);
      if (!r.ok) return setError(r.error);
      setBlocked(reason);
      setOpen(false);
    });
  const undo = () =>
    start(async () => {
      const r = await unblockStoreOf(candidateId);
      if (!r.ok) return setError(r.error);
      setBlocked(null);
    });

  return (
    <div className={styles.admin}>
      <span className={styles.adminTag}>Admin · only you see this</span>
      {blocked !== null ? (
        <p role="status">
          {store} is blocked for everyone{blocked ? ` (${blocked})` : ""}.{" "}
          <button type="button" className={styles.linkBtn} disabled={pending} onClick={undo}>
            Undo
          </button>
        </p>
      ) : open ? (
        <div className={styles.adminReasons}>
          <span>Block {store} for everyone because:</span>
          {REASONS.map((r) => (
            <button key={r} type="button" className={styles.hideBtn} disabled={pending} onClick={() => block(r)}>
              {r}
            </button>
          ))}
          <button type="button" className={styles.linkBtn} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={styles.hideBtn} onClick={() => setOpen(true)}>
          Block for everyone
        </button>
      )}
      {error && <p className={styles.meta}>{error}</p>}
    </div>
  );
}

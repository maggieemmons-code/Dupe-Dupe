"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { hideStore, showStore } from "@/app/stores/actions";
import styles from "./detail.module.css";

/** "Don't show this store" (Maggie, Nov 15). After saving, a one-line summary with Undo. */
export default function HideStore({ candidateId, store, searchId, hidden: initial }: { candidateId: string; store: string; searchId: string; hidden: boolean }) {
  const [hidden, setHidden] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (hide: boolean) =>
    start(async () => {
      setError("");
      const r = hide ? await hideStore(candidateId) : await showStore({ candidateId });
      if (!r.ok) return setError(r.error);
      setHidden(hide);
    });

  return (
    <div className={styles.hideStore}>
      {hidden ? (
        <p role="status">
          Hidden: you won&rsquo;t see {store} in any search.{" "}
          <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => run(false)}>
            Undo
          </button>{" "}
          · <Link href={`/search/${searchId}`}>Back to results</Link>
        </p>
      ) : (
        <button type="button" className={styles.hideBtn} disabled={pending} onClick={() => run(true)}>
          Don&rsquo;t show {store}
        </button>
      )}
      {error && <p className={styles.meta}>{error}</p>}
    </div>
  );
}

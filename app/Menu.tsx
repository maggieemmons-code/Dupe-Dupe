"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./find.module.css";

/** The menu button on Find. Appearance (Light or Dark) joins it with Your eye in phase 7. */
export default function Menu() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <details className={styles.menu} ref={ref}>
      <summary aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 8h16M4 16h10" />
        </svg>
      </summary>
      <div className={styles.menuPanel}>
        <Link href="/swipe" className={styles.menuItem}>
          Swipe to train
        </Link>
        <Link href="/stores" className={styles.menuItem}>
          Hidden stores
        </Link>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className={styles.menuItem}>
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

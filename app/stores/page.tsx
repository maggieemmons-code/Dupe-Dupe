import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { hiddenStoresFor } from "@/lib/server/hiddenStores";
import ShowAgain from "./ShowAgain";
import ui from "../ui.module.css";
import styles from "./stores.module.css";

export const metadata = { title: "Hidden stores · Dupe Dupe" };

/** Stores the friend said not to show, each with Show again (Maggie, Nov 15). */
async function HiddenList() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const hidden = await hiddenStoresFor(session);
  if (!hidden.length) {
    return <p className={styles.empty}>None yet. On any result, tap &ldquo;Don&rsquo;t show&rdquo; under the store&rsquo;s name to hide that store from every search.</p>;
  }
  return (
    <ul className={styles.list}>
      {hidden.map((h) => (
        <li key={h.id} className={styles.row}>
          <span className={styles.name}>
            {h.name}
            {h.domain && <span className={styles.domain}>{h.domain}</span>}
          </span>
          <ShowAgain id={h.id} name={h.name} />
        </li>
      ))}
    </ul>
  );
}

export default function StoresPage() {
  return (
    <main className={ui.page}>
      <header className={ui.topbar}>
        <Link href="/" className={ui.iconBtn} aria-label="Back to Find">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className={ui.screenTitle}>Hidden stores</span>
        <span style={{ width: 44 }} aria-hidden="true" />
      </header>
      <p className={styles.note}>You won&rsquo;t see results from these stores in any search.</p>
      <Suspense fallback={<p className={ui.eyebrow}>Loading…</p>}>
        <HiddenList />
      </Suspense>
    </main>
  );
}

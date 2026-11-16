import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { hiddenStoresFor } from "@/lib/server/hiddenStores";
import { blockedStores, hiddenStoreCounts } from "@/lib/server/blockedStores";
import { isHiddenStore } from "@/lib/hiddenStores";
import ShowAgain from "./ShowAgain";
import StoreButton from "./StoreButton";

/** A store hidden by this many friends is offered to Maggie to block for everyone (she approves each, Nov 15). */
const FRIENDS_TO_SUGGEST = 3;
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

/**
 * Maggie only: stores several friends hid (counts, never who), each with Block for everyone,
 * and the stores already blocked for everyone, each with Unblock.
 */
async function ForEveryone() {
  const session = await getSession();
  if (!session) return null;
  const { data: me } = await session.supabase.from("profiles").select("is_admin").eq("id", session.userId).maybeSingle();
  if (!me?.is_admin) return null;
  const blocked = await blockedStores(session.supabase);
  const counts = (await hiddenStoreCounts(session.supabase)).filter(
    (c) => c.friends >= FRIENDS_TO_SUGGEST && !isHiddenStore({ store: c.name, store_domain: c.domain }, blocked),
  );
  return (
    <section className={styles.admin} aria-labelledby="everyone-h">
      <h2 id="everyone-h" className={styles.h2}>
        For everyone <span className={styles.only}>Only you see this</span>
      </h2>
      <p className={styles.note}>
        When {FRIENDS_TO_SUGGEST} or more friends hide the same store, it shows here. Blocking it removes it from every friend&rsquo;s results.
      </p>
      {counts.length ? (
        <ul className={styles.list}>
          {counts.map((c) => (
            <li key={c.name} className={styles.row}>
              <span className={styles.name}>
                {c.name}
                <span className={styles.domain}>Hidden by {c.friends} friends</span>
              </span>
              <StoreButton block={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No store has been hidden by {FRIENDS_TO_SUGGEST} friends yet.</p>
      )}
      {blocked.length > 0 && (
        <>
          <h3 className={styles.h3}>Blocked for everyone</h3>
          <ul className={styles.list}>
            {blocked.map((b) => (
              <li key={b.id} className={styles.row}>
                <span className={styles.name}>
                  {b.name}
                  <span className={styles.domain}>
                    {[b.domain, b.reason || (b.friends ? `Hidden by ${b.friends} friends` : "")].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <StoreButton unblock={{ id: b.id, name: b.name }} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
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
      <Suspense fallback={null}>
        <ForEveryone />
      </Suspense>
    </main>
  );
}

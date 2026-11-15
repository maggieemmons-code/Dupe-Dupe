import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

/** Reads the signed-in friend's profile; streamed in after the page shell. */
async function SignedInAs() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const { data: profile } = userId
    ? await supabase.from("profiles").select("name, email").eq("id", userId).single()
    : { data: null };

  return <strong className={styles.who}>{profile?.name || profile?.email || "friend"}</strong>;
}

export default function Home() {
  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <span className={styles.brand}>DUPE DUPE</span>
        <form action="/auth/sign-out" method="post">
          <button className={styles.ghost} type="submit">
            Sign out
          </button>
        </form>
      </header>
      <section className={styles.tag}>
        <p className={styles.eyebrow}>You&apos;re in</p>
        <h1 className={styles.title}>
          Hello <em>Dupe Dupe</em>
        </h1>
        <p className={styles.lede}>
          Signed in as{" "}
          <Suspense fallback={<span className={styles.who}>…</span>}>
            <SignedInAs />
          </Suspense>
          . Search arrives in the next phase.
        </p>
      </section>
    </main>
  );
}

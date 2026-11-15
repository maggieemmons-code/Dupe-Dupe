import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/server/session";
import { signedPhotoUrls } from "@/lib/server/photos";
import { searchName, type SearchRow } from "@/lib/searches";
import FindForm from "./FindForm";
import Menu from "./Menu";
import styles from "./find.module.css";
import ui from "./ui.module.css";

export const metadata = { title: "Find a dupe · Dupe Dupe" };

async function Avatar() {
  const session = await getSession();
  if (!session) return <div className={ui.avatar} aria-hidden="true" />;
  const { data: profile } = await session.supabase
    .from("profiles")
    .select("name, email")
    .eq("id", session.userId)
    .single();
  const who = profile?.name || profile?.email || "";
  return (
    <div className={ui.avatar} role="img" aria-label={who || "You"}>
      {(who.charAt(0) || "?").toUpperCase()}
    </div>
  );
}

const GownIcon = () => (
  <svg width="36" height="44" viewBox="0 0 120 140" fill="#FFFFFF" stroke="#0A0A0A" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M30 32 C45 26 75 26 90 32 L82 62 L106 130 H14 L38 62 Z" />
  </svg>
);

async function RecentSearches() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await session.supabase
    .from("searches")
    .select("id, status, brand, style_name, pasted_text, source_links, photo_paths, created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(8);

  const searches = (data ?? []) as Pick<
    SearchRow,
    "id" | "status" | "brand" | "style_name" | "pasted_text" | "source_links" | "photo_paths" | "created_at"
  >[];
  if (!searches.length) return null;

  const urls = await signedPhotoUrls(
    session,
    searches.map((s) => s.photo_paths[0]).filter(Boolean),
  );

  return (
    <section className={styles.recent}>
      <h2 className={ui.eyebrow}>Recent searches</h2>
      <div className={styles.recentRow}>
        {searches.map((s) => {
          const url = s.photo_paths[0] ? urls[s.photo_paths[0]] : undefined;
          return (
            <Link key={s.id} href={`/search/${s.id}`} className={styles.recentItem}>
              <div className={styles.recentTile}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" />
                ) : (
                  <GownIcon />
                )}
              </div>
              <div className={styles.recentName}>{searchName(s)}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Find() {
  return (
    <main className={ui.page}>
      <header className={ui.topbar}>
        <Menu />
        <div className={ui.wordmark}>DUPE DUPE</div>
        <Suspense fallback={<div className={ui.avatar} aria-hidden="true" />}>
          <Avatar />
        </Suspense>
      </header>

      <h1 className={styles.title}>Replicate the look.</h1>

      <FindForm />

      <Suspense fallback={null}>
        <RecentSearches />
      </Suspense>
    </main>
  );
}

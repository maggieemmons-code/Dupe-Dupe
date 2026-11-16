import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { hiddenStoresFor } from "@/lib/server/hiddenStores";
import { blockedStores } from "@/lib/server/blockedStores";
import { isHiddenStore } from "@/lib/hiddenStores";
import { cleanTitle } from "@/lib/titles";
import { searchName } from "@/lib/searches";
import SwipeDeck, { type SwipeCard } from "./SwipeDeck";
import ui from "../ui.module.css";

export const metadata = { title: "Swipe · Dupe Dupe" };

/** Swipe to train (DESIGN.md › Swipe): a deck from the friend's own results not yet rated, newest searches first. No search cost. */
async function Deck() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { supabase } = session;

  const { data: searches } = await supabase
    .from("searches")
    .select("id, brand, style_name, pasted_text, source_links, status")
    .eq("status", "done")
    .order("ran_at", { ascending: false })
    .limit(15);
  const ids = (searches ?? []).map((s) => s.id);
  if (!ids.length) return <SwipeDeck cards={[]} rated={0} />;

  const [{ data: rows }, { data: ratings, count }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, search_id, title, brand, store, store_domain, price, price_is_estimate, photo_url, thumb_url, look_score, fit_score, verdict, caveat, color_match")
      .in("search_id", ids)
      .eq("stage", "judged")
      .is("drop_reason", null)
      .neq("verdict", "rejected")
      .order("look_score", { ascending: false })
      .limit(400),
    supabase.from("ratings").select("candidate_id", { count: "exact" }),
  ]);
  const done = new Set((ratings ?? []).map((r) => r.candidate_id));
  const hidden = [...(await hiddenStoresFor(session)), ...(await blockedStores(supabase))];
  const order = new Map(ids.map((id, i) => [id, i]));
  const names = new Map((searches ?? []).map((s) => [s.id, searchName(s as never)]));

  const cards: SwipeCard[] = (rows ?? [])
    .filter((r) => !done.has(r.id) && !isHiddenStore(r, hidden) && (r.photo_url || r.thumb_url))
    // Newest search first, best look first within it.
    .sort((a, b) => (order.get(a.search_id)! - order.get(b.search_id)!) || (b.look_score ?? 0) - (a.look_score ?? 0))
    .slice(0, 60)
    .map((r) => ({
      id: r.id,
      searchId: r.search_id,
      original: names.get(r.search_id) ?? "",
      title: cleanTitle(r.title, r.store),
      brand: r.brand && r.brand.toLowerCase() !== r.store.toLowerCase() ? r.brand : "",
      store: r.store,
      price: r.price,
      estimate: r.price_is_estimate,
      photo: (r.photo_url ?? r.thumb_url)!,
      look: r.look_score,
      fit: r.fit_score,
      caveat: r.verdict === "caveat" ? r.caveat : null,
      differentColor: r.color_match === "different",
    }));

  return <SwipeDeck cards={cards} rated={count ?? 0} />;
}

export default function SwipePage() {
  return (
    <main className={ui.page}>
      <header className={ui.topbar}>
        <Link href="/" className={ui.iconBtn} aria-label="Back to Find">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className={ui.screenTitle}>Swipe</span>
        <span style={{ width: 44 }} aria-hidden="true" />
      </header>
      <Suspense fallback={<p className={ui.eyebrow}>Loading…</p>}>
        <Deck />
      </Suspense>
    </main>
  );
}

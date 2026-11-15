import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { signedPhotoUrls } from "@/lib/server/photos";
import { searchHasRun, type SearchRow } from "@/lib/searches";
import { CANDIDATE_FIELDS, type CandidateRow } from "@/lib/candidates";
import Review from "./Review";
import Results from "./Results";
import ui from "../../ui.module.css";

export const metadata = { title: "Dupe Dupe" };

async function SearchLoader({ params }: { params: PageProps<"/search/[id]">["params"] }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { data } = await session.supabase.from("searches").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const search = data as SearchRow;

  const urls = await signedPhotoUrls(session, search.photo_paths.slice(0, 1));
  const photoUrl = search.photo_paths[0] ? urls[search.photo_paths[0]] ?? null : null;

  if (!searchHasRun(search)) return <Review search={search} photoUrl={photoUrl} />;

  // Results: the judge's approved and caveat candidates. Searches run before the judge
  // existed (phase 3) have no judged rows, so they show what the screener picked.
  const { data: rows } = await session.supabase
    .from("candidates")
    .select(CANDIDATE_FIELDS)
    .eq("search_id", id)
    .in("stage", ["screened", "enriched", "judged"])
    .is("drop_reason", null)
    .order("screen_rank", { ascending: true });
  const all = (rows ?? []) as CandidateRow[];
  const judged = all.filter((c) => c.stage === "judged");
  const legacy = search.status === "done" && !judged.length && !all.some((c) => c.stage === "enriched");
  const shown = legacy ? all : judged.filter((c) => c.verdict !== "rejected");

  return <Results search={search} photoUrl={photoUrl} candidates={shown} />;
}

export default function SearchPage({ params }: PageProps<"/search/[id]">) {
  return (
    <Suspense
      fallback={
        <main className={ui.page}>
          <p className={ui.eyebrow}>Loading…</p>
        </main>
      }
    >
      <SearchLoader params={params} />
    </Suspense>
  );
}

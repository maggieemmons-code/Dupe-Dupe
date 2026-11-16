import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { signedPhotoUrls } from "@/lib/server/photos";
import { searchHasRun, type SearchRow } from "@/lib/searches";
import Review from "../Review";
import ui from "../../../ui.module.css";

export const metadata = { title: "Dupe Dupe" };

/** Edit details after a search has run (Maggie, Nov 15): the Review screen, with every field editable. */
async function EditLoader({ params }: { params: PageProps<"/search/[id]/edit">["params"] }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { data } = await session.supabase.from("searches").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const search = data as SearchRow;
  // Before its first run, a search is edited on Review itself.
  if (!searchHasRun(search)) redirect(`/search/${id}`);

  const urls = await signedPhotoUrls(session, search.photo_paths.slice(0, 1));
  const photoUrl = search.photo_paths[0] ? urls[search.photo_paths[0]] ?? null : null;
  return <Review search={search} photoUrl={photoUrl} mode="edit" />;
}

export default function EditPage({ params }: PageProps<"/search/[id]/edit">) {
  return (
    <Suspense
      fallback={
        <main className={ui.page}>
          <p className={ui.eyebrow}>Loading…</p>
        </main>
      }
    >
      <EditLoader params={params} />
    </Suspense>
  );
}

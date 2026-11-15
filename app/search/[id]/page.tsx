import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { signedPhotoUrls } from "@/lib/server/photos";
import type { SearchRow } from "@/lib/searches";
import Review from "./Review";
import ui from "../../ui.module.css";

export const metadata = { title: "Review · Dupe Dupe" };

async function ReviewLoader({ params }: { params: PageProps<"/search/[id]">["params"] }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { data } = await session.supabase.from("searches").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const search = data as SearchRow;

  const urls = await signedPhotoUrls(session, search.photo_paths.slice(0, 1));
  const photoUrl = search.photo_paths[0] ? urls[search.photo_paths[0]] ?? null : null;

  return <Review search={search} photoUrl={photoUrl} />;
}

export default function ReviewPage({ params }: PageProps<"/search/[id]">) {
  return (
    <Suspense
      fallback={
        <main className={ui.page}>
          <p className={ui.eyebrow}>Loading…</p>
        </main>
      }
    >
      <ReviewLoader params={params} />
    </Suspense>
  );
}

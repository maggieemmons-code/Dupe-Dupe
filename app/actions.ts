"use server";

import { redirect } from "next/navigation";
import { getSession, underDailyCap, DAILY_SEARCH_CAP } from "@/lib/server/session";
import { savePhoto, MAX_PHOTOS } from "@/lib/server/photos";

export type StartState = { error?: string };

const URL_RE = /https?:\/\/[^\s]+/gi;

/** Starts a search from photos, a link or a description, then opens Review. */
export async function startSearch(_prev: StartState, formData: FormData): Promise<StartState> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const linkInput = String(formData.get("link") ?? "").trim();
  const describe = String(formData.get("describe") ?? "").trim().slice(0, 2000);
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_PHOTOS);

  if (linkInput && !/^https?:\/\//i.test(linkInput)) {
    return { error: "Paste the full link, starting with https://" };
  }

  const links = [...new Set([...(linkInput.match(URL_RE) ?? []), ...(describe.match(URL_RE) ?? [])])].slice(0, 3);
  const notes = describe.replace(URL_RE, "").trim();

  if (!links.length && !notes && !photos.length) {
    return { error: "Add a photo, paste a link or describe the piece to start." };
  }

  if (!(await underDailyCap(session))) {
    return {
      error: `You've started ${DAILY_SEARCH_CAP} searches today, the daily limit while we test. It resets at midnight UTC.`,
    };
  }

  // Prefill from the friend's profile and their last search (DESIGN.md › Prefill on Review).
  const [{ data: profile }, { data: last }] = await Promise.all([
    session.supabase.from("profiles").select("default_sizes, default_view").eq("id", session.userId).single(),
    session.supabase
      .from("searches")
      .select("budget")
      .eq("user_id", session.userId)
      .not("budget", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: search, error } = await session.supabase
    .from("searches")
    .insert({
      user_id: session.userId,
      source_links: links,
      pasted_text: notes,
      sizes: profile?.default_sizes ?? [],
      view: profile?.default_view ?? "all",
      budget: last?.budget ?? null,
    })
    .select("id")
    .single();

  if (error || !search) {
    console.error("Search insert failed", error?.message);
    return { error: "We couldn't start that search. Try again in a moment." };
  }

  if (photos.length) {
    try {
      const paths: string[] = [];
      for (const [i, file] of photos.entries()) paths.push(await savePhoto(session, search.id, String(i + 1), file));
      await session.supabase.from("searches").update({ photo_paths: paths }).eq("id", search.id);
    } catch (e) {
      console.error(e);
      await session.supabase.from("searches").delete().eq("id", search.id);
      return { error: "One of the photos couldn't be read. Try a screenshot or a different photo." };
    }
  }

  redirect(`/search/${search.id}`);
}

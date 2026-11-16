"use server";

import { getSession } from "@/lib/server/session";

type Result = { ok: true } | { ok: false; error: string };

/** "Don't show this store": hides the store of one of the friend's results, in every search. */
export async function hideStore(candidateId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;
  // Read with the friend's own session: row-level security makes sure the result is theirs.
  const { data: c } = await supabase.from("candidates").select("store, store_domain").eq("id", candidateId).maybeSingle();
  if (!c?.store) return { ok: false, error: "This result wasn't found." };
  const { error } = await supabase
    .from("store_prefs")
    .upsert({ name: c.store.trim(), domain: (c.store_domain ?? "").replace(/^www\./, ""), kind: "hidden" }, { onConflict: "user_id,name,kind", ignoreDuplicates: true });
  if (error) return { ok: false, error: /store_prefs/.test(error.message) ? "Hiding stores isn't switched on yet." : "That didn't save. Try again." };
  return { ok: true };
}

/** Shows a hidden store again: by its saved row, or (for Undo) by the result it was hidden from. */
export async function showStore(target: { id?: string; candidateId?: string }): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase } = session;
  let query = supabase.from("store_prefs").delete().eq("kind", "hidden");
  if (target.id) query = query.eq("id", target.id);
  else if (target.candidateId) {
    const { data: c } = await supabase.from("candidates").select("store").eq("id", target.candidateId).maybeSingle();
    if (!c?.store) return { ok: false, error: "This result wasn't found." };
    query = query.eq("name", c.store.trim());
  } else return { ok: false, error: "Nothing to show again." };
  const { error } = await query;
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

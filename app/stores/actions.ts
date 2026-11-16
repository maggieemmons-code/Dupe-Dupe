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

/** Maggie only: whether the signed-in friend is the admin. */
async function isAdmin() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await session.supabase.from("profiles").select("is_admin").eq("id", session.userId).maybeSingle();
  return data?.is_admin ? session : null;
}

/** Maggie approves: block a store for everyone (several friends hid it). */
export async function blockForEveryone(store: { name: string; domain: string; friends: number }): Promise<Result> {
  const session = await isAdmin();
  if (!session) return { ok: false, error: "Only Maggie can block a store for everyone." };
  const { error } = await session.supabase
    .from("blocked_stores")
    .upsert({ name: store.name.trim(), domain: store.domain ?? "", friends: store.friends }, { onConflict: "name", ignoreDuplicates: true });
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

/** Maggie: unblock a store for everyone. */
export async function unblockForEveryone(id: string): Promise<Result> {
  const session = await isAdmin();
  if (!session) return { ok: false, error: "Only Maggie can unblock a store." };
  const { error } = await session.supabase.from("blocked_stores").delete().eq("id", id);
  return error ? { ok: false, error: "That didn't save. Try again." } : { ok: true };
}

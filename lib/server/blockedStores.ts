import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HiddenStore } from "@/lib/hiddenStores";

/** Stores Maggie blocked for everyone (migration 0012). None before that migration runs. */
export async function blockedStores(db: SupabaseClient): Promise<(HiddenStore & { id: string; friends: number })[]> {
  const { data, error } = await db.from("blocked_stores").select("id, name, domain, friends").order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "", domain: r.domain ?? "", friends: r.friends ?? 0 }));
}

/** Maggie only: how many friends hid each store (counts, never who). */
export async function hiddenStoreCounts(db: SupabaseClient): Promise<{ name: string; domain: string; friends: number }[]> {
  const { data, error } = await db.rpc("hidden_store_counts");
  if (error) return [];
  return ((data ?? []) as { name: string; domain: string; friends: number }[]).map((r) => ({ ...r, friends: Number(r.friends) }));
}

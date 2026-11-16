import "server-only";
import type { Session } from "./session";
import type { HiddenStore } from "@/lib/hiddenStores";

/** The signed-in friend's hidden stores (row-level security: only their own). None before migration 0011. */
export async function hiddenStoresFor(session: Session): Promise<(HiddenStore & { id: string })[]> {
  const { data, error } = await session.supabase.from("store_prefs").select("id, name, domain").eq("kind", "hidden").order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "", domain: r.domain ?? "" }));
}

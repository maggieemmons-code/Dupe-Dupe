import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasteProfile } from "@/lib/taste";

/** A friend's taste profile (rules and weights), or null if they have none yet. */
export async function loadTaste(db: SupabaseClient, userId: string): Promise<TasteProfile | null> {
  const { data } = await db.from("taste_profiles").select("rules, weights").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { rules: Array.isArray(data.rules) ? data.rules : [], weights: data.weights ?? {} };
}

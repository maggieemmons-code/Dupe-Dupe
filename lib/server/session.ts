import "server-only";
import { createClient } from "@/lib/supabase/server";

/** The signed-in friend, or null. Every server action starts here. */
export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  return { supabase, userId };
}

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export const DAILY_SEARCH_CAP = 5;

/**
 * True when this friend may start another paid search today (UTC day).
 * Maggie (is_admin) has no cap.
 */
export async function underDailyCap({ supabase, userId }: Session) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();
  if (profile?.is_admin) return true;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("searches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  return (count ?? 0) < DAILY_SEARCH_CAP;
}

/** Writes one row to api_calls for every outside call (CLAUDE.md rule). */
export async function logApiCall(
  { supabase, userId }: Session,
  call: {
    service: "claude" | "tinyfish" | "serpapi" | "ebay";
    stage: string;
    searchId?: string;
    units?: Record<string, unknown>;
    ok: boolean;
    error?: string;
  },
) {
  const { error } = await supabase.from("api_calls").insert({
    user_id: userId,
    search_id: call.searchId ?? null,
    service: call.service,
    stage: call.stage,
    units: call.units ?? {},
    ok: call.ok,
    error: call.error?.slice(0, 500) ?? null,
  });
  if (error) console.error("api_calls insert failed", error.message);
}

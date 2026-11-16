import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase with the server key, for the background search job only. It runs
 * without a signed-in friend, so it skips row-level security: every query here
 * must filter by the search's own user_id. Never import this from a page.
 */
let client: SupabaseClient | null = null;

export function adminClient() {
  if (client) return client;
  const key = process.env.SUPABASE_SECRET_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  // The publishable key would quietly change nothing (row-level security), so refuse it loudly.
  if (!key.startsWith("sb_secret_") && !key.startsWith("eyJ")) {
    throw new Error("SUPABASE_SECRET_KEY isn't Supabase's secret key (it should start with sb_secret_)");
  }
  client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** api_calls row written by the background job (CLAUDE.md: every external call is logged). */
export async function logJobCall(call: {
  userId: string;
  searchId: string;
  service: "claude" | "tinyfish" | "serpapi" | "ebay" | "shopify";
  stage: string;
  units?: Record<string, unknown>;
  estCost?: number;
  ok: boolean;
  error?: string;
}) {
  const { error } = await adminClient()
    .from("api_calls")
    .insert({
      user_id: call.userId,
      search_id: call.searchId,
      service: call.service,
      stage: call.stage,
      units: call.units ?? {},
      est_cost: call.estCost ?? null,
      ok: call.ok,
      error: call.error?.slice(0, 500) ?? null,
    });
  if (error) console.error("api_calls insert failed", error.message);
}

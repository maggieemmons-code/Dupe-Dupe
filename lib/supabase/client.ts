import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase in the friend's browser, signed in as them. Used only to listen for
 * live updates (Realtime); row-level security limits it to their own rows.
 * It carries the publishable key, never a secret one.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

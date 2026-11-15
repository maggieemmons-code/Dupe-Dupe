/**
 * Looks up the store's own page for one Google Shopping result of the latest search (1 SerpApi search).
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-store-link.ts
 */
import { createClient } from "@supabase/supabase-js";
import { storePage } from "../lib/server/serpapi";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), { auth: { persistSession: false } });

async function main() {
  const { data: c } = await db
    .from("candidates")
    .select("store, title, product_token")
    .eq("stage", "screened")
    .is("drop_reason", null)
    .not("product_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!c) throw new Error("No Shopping result to test");
  console.log(`${c.store} · ${c.title}`);
  console.log(await storePage(c.product_token, c.store));
}

main();

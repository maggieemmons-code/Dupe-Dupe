/**
 * Saves a taste file (rules and weights) to Maggie's taste profile in the database.
 * Run: npx tsx --env-file=.env.local scripts/save-taste.ts [tests/taste-maggie.json]
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false },
});

async function main() {
  const file = process.argv[2] ?? "tests/taste-maggie.json";
  const { rules, weights } = JSON.parse(readFileSync(file, "utf8"));
  const { data: me } = await db.from("profiles").select("id, email").eq("is_admin", true).limit(1).single();
  if (!me) throw new Error("No admin profile found");
  const { error } = await db.from("taste_profiles").upsert({ user_id: me.id, rules, weights }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  console.log(`Saved ${rules.length} rules and ${Object.keys(weights).length} weights for the admin profile.`);
}

main();

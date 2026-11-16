/**
 * Judge noise: shows the recent twice-weekly checks, or runs one now with --now
 * (about 4 judge calls). Run: npx tsx --conditions=react-server --env-file=.env.local scripts/judge-noise.ts [--now]
 */
import { createClient } from "@supabase/supabase-js";
import { measureJudgeNoise } from "../lib/server/judgeNoise";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), { auth: { persistSession: false } });

async function main() {
  if (process.argv.includes("--now")) {
    const r = await measureJudgeNoise();
    console.log(
      `Re-judged ${r.pieces} pieces: ${r.fields_changed} of ${r.fields_compared} answers changed (${(r.rate * 100).toFixed(0)}%), ${r.verdicts_changed} verdicts flipped.${r.recentAverage != null ? ` Recent average ${(r.recentAverage * 100).toFixed(0)}%.` : ""}${r.alert ? " ALERT: noise is up." : ""}`,
    );
    for (const d of r.details) console.log(`  ${d.verdict.padEnd(22)} ${d.title.slice(0, 50)}${d.changes.length ? ` · ${d.changes.join(", ")}` : ""}`);
    return;
  }
  const { data, error } = await db.from("judge_noise").select("created_at, pieces, fields_changed, fields_compared, verdicts_changed, rate, alert").order("created_at", { ascending: false }).limit(20);
  if (error) return console.log(`Couldn't read judge_noise: ${error.message} (has migration 0010 run?)`);
  for (const r of data ?? []) {
    console.log(`${r.created_at.slice(0, 10)} · ${(Number(r.rate) * 100).toFixed(0)}% of answers changed (${r.fields_changed}/${r.fields_compared}) · ${r.verdicts_changed} verdicts flipped · ${r.pieces} pieces${r.alert ? " · ALERT" : ""}`);
  }
  if (!data?.length) console.log("No checks yet.");
}

main();

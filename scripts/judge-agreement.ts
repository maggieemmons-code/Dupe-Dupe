/**
 * How often people agree with the judge (Maggie, Nov 16: learn from everyone's feedback to improve
 * what the app suggests). Reads every rating (counts only, never who) and reports:
 * - overall: thumbs up on pieces the judge passed, thumbs down on pieces it approved (too generous),
 *   thumbs up on pieces it rejected (too strict);
 * - by reason: how often the judge's own answer for that item disagreed ("wrong color" on a piece
 *   it called a color match), the list to work from when tuning the judge.
 * Read-only. Run: npx tsx --env-file=.env.local scripts/judge-agreement.ts [--since=2026-11-16]
 */
import { createClient } from "@supabase/supabase-js";
import { disagrees, judgeAnswers, splitReasons, type Vote } from "../lib/ratings";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), { auth: { persistSession: false } });
const out = (s: string) => process.stdout.write(`${s}\n`);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

async function main() {
  const since = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1] ?? "2000-01-01";
  const { data, error } = await db
    .from("ratings")
    .select("user_id, vote, reason, scope, source, bought, judge_verdict, judge_answer, created_at")
    .gte("created_at", since)
    .limit(10000);
  if (error) return out(`Couldn't read ratings: ${error.message} (has migration 0013 run?)`);
  const rows = data ?? [];
  const friends = new Set(rows.map((r) => r.user_id)).size;
  out(`${rows.length} ratings from ${friends} friend${friends === 1 ? "" : "s"} since ${since.slice(0, 10)} (${rows.filter((r) => r.bought).length} bought, ${rows.filter((r) => r.source === "swipe").length} by swipe)`);

  const passed = rows.filter((r) => r.judge_verdict === "approved" || r.judge_verdict === "caveat");
  const agreeUp = passed.filter((r) => r.vote === "up").length;
  const approvedDown = rows.filter((r) => r.judge_verdict === "approved" && r.vote === "down").length;
  const approved = rows.filter((r) => r.judge_verdict === "approved").length;
  const rejected = rows.filter((r) => r.judge_verdict === "rejected");
  const rejectedUp = rejected.filter((r) => r.vote === "up").length;
  out(`\nAgreement with the judge`);
  out(`  Pieces the judge passed that people liked: ${agreeUp} of ${passed.length} (${pct(agreeUp, passed.length)})`);
  out(`  Approved but thumbs down (judge too generous): ${approvedDown} of ${approved} (${pct(approvedDown, approved)})`);
  out(`  Rejected but thumbs up (judge too strict, from "Closest we found"): ${rejectedUp} of ${rejected.length} (${pct(rejectedUp, rejected.length)})`);

  const byReason = new Map<string, { n: number; checked: number; against: number }>();
  for (const r of rows) {
    // A rating can carry several reasons; each is counted on its own.
    const answers = new Map(judgeAnswers(r.judge_answer, r.reason));
    for (const reason of splitReasons(r.reason)) {
      const k = `${r.vote === "up" ? "close enough on" : "thumbs down:"} ${reason}`;
      const t = byReason.get(k) ?? { n: 0, checked: 0, against: 0 };
      t.n++;
      const d = disagrees(r.vote as Vote, answers.get(reason) ?? null);
      if (d != null) {
        t.checked++;
        if (d) t.against++;
      }
      byReason.set(k, t);
    }
  }
  out(`\nBy reason (where the judge's own answer disagreed with the person)`);
  for (const [k, t] of [...byReason].sort((a, b) => b[1].n - a[1].n)) {
    out(`  ${k}: ${t.n} rating${t.n === 1 ? "" : "s"}${t.checked ? ` · judge disagreed ${t.against} of ${t.checked} (${pct(t.against, t.checked)})` : ""}`);
  }
  if (!rows.length) out("  No ratings yet.");
}

main();

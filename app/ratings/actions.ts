"use server";

import { getSession, type Session } from "@/lib/server/session";
import { rescoreSearch } from "@/lib/server/rescore";
import { nudgeWeights, judgeAnswer, type Vote } from "@/lib/ratings";
import type { Checklist, Weights } from "@/lib/search/score";

export type Rating = { vote: Vote; reason: string; note?: string; scope?: "taste" | "item"; bought?: boolean };
type Result = { ok: true } | { ok: false; error: string };

/** Saves the friend's weights, keeping their rules (taste_profiles; one row per friend). */
async function saveWeights(session: Session, weights: Partial<Weights>) {
  const { supabase, userId } = session;
  const { data: row } = await supabase.from("taste_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (row) await supabase.from("taste_profiles").update({ weights }).eq("user_id", userId);
  else await supabase.from("taste_profiles").insert({ user_id: userId, rules: [], weights });
}

/**
 * Thumbs up or down, a swipe, or "I bought this" on one result. Saves the rating with what the
 * judge had said, nudges the friend's weights (unless "Just this piece"), and re-scores this
 * search in code so the cards re-rank at once. Rating the same piece again replaces the rating.
 */
export async function rate(candidateId: string, rating: Rating, source: "card" | "detail" | "swipe"): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase, userId } = session;
  // Read with the friend's own session: row-level security makes sure the result is theirs.
  const { data: c } = await supabase
    .from("candidates")
    .select("id, search_id, title, store, link, store_link, verdict, look_score, fit_score, checklist")
    .eq("id", candidateId)
    .maybeSingle();
  if (!c) return { ok: false, error: "This result wasn't found." };

  const scope = rating.scope === "item" ? "item" : "taste";
  const reason = (rating.reason ?? "").slice(0, 60);
  const { data: before } = await supabase.from("ratings").select("vote, reason, scope").eq("candidate_id", candidateId).maybeSingle();

  const { error } = await supabase.from("ratings").upsert(
    {
      user_id: userId,
      candidate_id: c.id,
      search_id: c.search_id,
      vote: rating.vote,
      reason,
      note: (rating.note ?? "").trim().slice(0, 300),
      scope,
      source,
      bought: !!rating.bought,
      title: c.title ?? "",
      store: c.store ?? "",
      link: c.store_link ?? c.link ?? "",
      judge_verdict: c.verdict,
      judge_look: c.look_score,
      judge_fit: c.fit_score,
      judge_answer: judgeAnswer(c.checklist as Checklist | null, rating.vote, reason),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,candidate_id" },
  );
  if (error) return { ok: false, error: /ratings/.test(error.message) ? "Ratings aren't switched on yet." : "That didn't save. Try again." };

  // Weights: take back the earlier rating's nudge, then apply this one.
  const { data: taste } = await supabase.from("taste_profiles").select("weights").eq("user_id", userId).maybeSingle();
  const was = (taste?.weights ?? {}) as Partial<Weights>;
  let next = before ? nudgeWeights(was, { vote: before.vote as Vote, reason: before.reason, scope: before.scope as "taste" | "item" }, -1) : was;
  next = nudgeWeights(next, { vote: rating.vote, reason, scope });
  if (JSON.stringify(next) !== JSON.stringify(was)) {
    await saveWeights(session, next);
    await rescoreSearch(c.search_id, userId);
  }

  await supabase.from("events").insert({ type: "rated", search_id: c.search_id, candidate_id: c.id, detail: { vote: rating.vote, reason, scope, source, bought: !!rating.bought } });
  return { ok: true };
}

/** Takes a rating back (Undo, or tapping the same thumb again), and its nudge with it. */
export async function unrate(candidateId: string): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again to continue." };
  const { supabase, userId } = session;
  const { data: before } = await supabase.from("ratings").select("vote, reason, scope, search_id").eq("candidate_id", candidateId).maybeSingle();
  if (!before) return { ok: true };
  const { error } = await supabase.from("ratings").delete().eq("candidate_id", candidateId);
  if (error) return { ok: false, error: "That didn't save. Try again." };
  const { data: taste } = await supabase.from("taste_profiles").select("weights").eq("user_id", userId).maybeSingle();
  const was = (taste?.weights ?? {}) as Partial<Weights>;
  const next = nudgeWeights(was, { vote: before.vote as Vote, reason: before.reason, scope: before.scope as "taste" | "item" }, -1);
  if (JSON.stringify(next) !== JSON.stringify(was)) {
    await saveWeights(session, next);
    await rescoreSearch(before.search_id, userId);
  }
  return { ok: true };
}

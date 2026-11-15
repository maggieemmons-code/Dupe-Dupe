/**
 * A friend's eye (taste_profiles): plain rules that the brief builder, screener and
 * judge read, and checklist weights that differ from the defaults. Plain module so
 * screens can show the rules too.
 */
import { WEIGHTS, type Weights } from "@/lib/search/score";

export type TasteRule = {
  rule: string;
  kind: "prefer" | "avoid" | "matters_more" | "matters_less";
  evidence?: number[];
  source?: string;
};

export type TasteProfile = { rules: TasteRule[]; weights: Partial<Weights> };

/** The rules as the agents' prompts read them; "None yet." when there are none. */
export function tasteText(t: TasteProfile | null) {
  if (!t?.rules?.length) return "None yet.";
  const label = { prefer: "Prefers", avoid: "Avoids", matters_more: "Weighs more", matters_less: "Weighs less" } as const;
  return t.rules.map((r) => `- ${label[r.kind] ?? "Note"}: ${r.rule}`).join("\n");
}

/** Default weights with the friend's changes, each kept between 0.5 and 3 (PLAN.md). */
export function tasteWeights(t: TasteProfile | null): Weights {
  const w = { ...WEIGHTS };
  for (const [k, v] of Object.entries(t?.weights ?? {})) {
    if (k in w && typeof v === "number") w[k as keyof Weights] = Math.min(3, Math.max(0.5, v));
  }
  return w;
}

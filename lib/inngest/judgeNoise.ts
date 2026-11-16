import "server-only";
import { inngest } from "./client";
import { measureJudgeNoise } from "@/lib/server/judgeNoise";

/**
 * Judge noise, twice a week (Monday and Thursday, 9am Pacific): judges 10 already-judged pieces twice
 * pieces and records how often the answers change (lib/server/judgeNoise.ts).
 */
export const judgeNoise = inngest.createFunction(
  { id: "judge-noise", name: "Measure judge noise", retries: 1, triggers: [{ cron: "TZ=America/Los_Angeles 0 9 * * 1,4" }] },
  async ({ step }) => step.run("measure", () => measureJudgeNoise()),
);

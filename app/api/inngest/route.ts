import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runSearch } from "@/lib/inngest/searchJob";
import { judgeNoise } from "@/lib/inngest/judgeNoise";

// Inngest calls this address to run each step. Its requests are signed with
// INNGEST_SIGNING_KEY, so it's open without a sign-in (proxy.ts lets it through).
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [runSearch, judgeNoise] });

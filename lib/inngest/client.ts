import { Inngest } from "inngest";

/**
 * Inngest runs each search in the background, one step per stage.
 * On Vercel, the Inngest integration sets INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 * On Maggie's Mac, INNGEST_DEV=1 in .env.local points it at the local Inngest Dev Server.
 */
export const inngest = new Inngest({ id: "dupe-dupe" });

/**
 * reuseGathered: redo cleaning, screening, enriching and judging on the items this
 * search already gathered, without new Lens or Shopping searches (for tuning and
 * re-checks; PLAN.md › Costs and guardrails › Caching).
 */
export type SearchConfirmed = { searchId: string; userId: string; reuseGathered?: boolean };
export const SEARCH_CONFIRMED = "search/confirmed";

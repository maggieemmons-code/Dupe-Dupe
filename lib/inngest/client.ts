import { Inngest } from "inngest";

/**
 * Inngest runs each search in the background, one step per stage.
 * On Vercel, the Inngest integration sets INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 * On Maggie's Mac, INNGEST_DEV=1 in .env.local points it at the local Inngest Dev Server.
 */
export const inngest = new Inngest({ id: "dupe-dupe" });

export type SearchConfirmed = { searchId: string; userId: string };
export const SEARCH_CONFIRMED = "search/confirmed";

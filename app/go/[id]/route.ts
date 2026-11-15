import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/session";
import { adminClient, logJobCall } from "@/lib/server/admin";
import { storePage } from "@/lib/server/serpapi";

/** Store lookups (1 SerpApi search each) a friend may trigger per day; after that, Google's page. */
const DAILY_STORE_LOOKUPS = 30;

/**
 * Every "Shop" button points here (PLAN.md › Affiliate links). It logs the
 * click, then forwards to the store. For a Google Shopping result, the first
 * tap looks up the store's own page (Maggie, Nov 14) and saves it; if that
 * fails, it falls back to Google's product page. Before affiliates exist it
 * changes nothing about the link. Affiliate code, when it comes, lives in one
 * module that only this route may import.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url));
  const { supabase, userId } = session;

  // Row-level security: a friend can only open their own results.
  const { data: c } = await supabase
    .from("candidates")
    .select("id, search_id, link, link_is_google, product_token, store_link, store, source")
    .eq("id", id)
    .maybeSingle();
  if (!c || !/^https:\/\//.test(c.link)) return NextResponse.redirect(new URL("/", request.url));

  let target: string = c.store_link ?? c.link;
  let looked = false;
  if (c.link_is_google && !c.store_link && c.product_token && (await lookupsToday(userId)) < DAILY_STORE_LOOKUPS) {
    looked = true;
    try {
      const page = await storePage(c.product_token, c.store);
      await logJobCall({ userId, searchId: c.search_id, service: "serpapi", stage: "store-link", units: { searches: 1, found: !!page }, ok: true });
      if (page) {
        target = page.url;
        // Friends can't write candidates; the server key saves it, scoped to this friend's row.
        await adminClient()
          .from("candidates")
          .update({ store_link: page.url, store_details: page.details })
          .eq("id", c.id)
          .eq("user_id", userId);
      }
    } catch (e) {
      await logJobCall({ userId, searchId: c.search_id, service: "serpapi", stage: "store-link", ok: false, error: String(e) });
    }
  }

  const { error } = await supabase.from("events").insert({
    type: "result_clicked",
    search_id: c.search_id,
    candidate_id: c.id,
    detail: { store: c.store, source: c.source, to_store: target !== c.link, looked_up: looked },
  });
  if (error) console.error("Click log failed", error.message);

  return NextResponse.redirect(target, 302);
}

async function lookupsToday(userId: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await adminClient()
    .from("api_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("stage", "store-link")
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/session";

/**
 * Every "Shop" button points here (PLAN.md › Affiliate links). It logs the
 * click, then forwards to the link the source gave. Before affiliates exist it
 * changes nothing about the link. Affiliate code, when it comes, lives in one
 * module that only this route may import.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[id]">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url));

  // Row-level security: a friend can only open their own results.
  const { data: c } = await session.supabase
    .from("candidates")
    .select("id, search_id, link, store, source")
    .eq("id", id)
    .maybeSingle();
  if (!c || !/^https:\/\//.test(c.link)) return NextResponse.redirect(new URL("/", request.url));

  const { error } = await session.supabase.from("events").insert({
    type: "result_clicked",
    search_id: c.search_id,
    candidate_id: c.id,
    detail: { store: c.store, source: c.source },
  });
  if (error) console.error("Click log failed", error.message);

  return NextResponse.redirect(c.link, 302);
}

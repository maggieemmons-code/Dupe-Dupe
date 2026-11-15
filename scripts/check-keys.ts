/**
 * Checks that the Phase 3 keys in .env.local work, without printing them.
 * Run: npx tsx --env-file=.env.local scripts/check-keys.ts
 */
async function main() {
  const serp = process.env.SERPAPI_API_KEY?.trim();
  if (!serp) console.log("SerpApi: SERPAPI_API_KEY is missing");
  else {
    // The Account API is free and doesn't count toward the monthly searches.
    const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(serp)}`);
    const d = await res.json().catch(() => ({}));
    console.log(
      res.ok
        ? `SerpApi: works · plan ${d.plan_name} · ${d.plan_searches_left} of ${d.searches_per_month} searches left this month`
        : `SerpApi: rejected (${res.status}) ${d.error ?? ""}`,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) console.log("Supabase: SUPABASE_SECRET_KEY is missing");
  else {
    const res = await fetch(`${url}/rest/v1/searches?select=id&limit=1`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    });
    console.log(
      res.ok
        ? `Supabase server key: works (${secret.startsWith("sb_secret_") ? "secret key" : "check it's the secret key, not the publishable one"})`
        : `Supabase server key: rejected (${res.status})`,
    );
  }
}

main();

export {};

# Notes

Decisions and gotchas, so later sessions don't repeat mistakes.

## Phase 0

- Git comes from Apple's Command Line Tools. The `xcode-select --install` pop-up didn't finish on this Mac; the manual download from developer.apple.com/download/all worked. EasyGit (a separate app) does not include git.
- The app was made with `create-next-app` (Next.js 16, TypeScript, App Router, plain CSS, no `src/` folder). Next.js 16 adds an `AGENTS.md` that points to its bundled docs in `node_modules/next/dist/docs/`.
- Fonts load through `next/font/google` (Oswald, Work Sans, JetBrains Mono). Colors are CSS variables in `app/globals.css`, copied from `prototype.html`.

## Phase 1

- Next.js 16 renamed `middleware.ts` to `proxy.ts` (export `function proxy`). Ours refreshes the Supabase session and sends signed-out visitors to `/sign-in`.
- `next.config.ts` has `cacheComponents: true`: any part of a page that reads cookies, headers or `searchParams` must sit inside `<Suspense>`, or the build fails with "blocking-prerender-dynamic".
- Sign-in links use `token_hash` + `verifyOtp` at `/auth/confirm` (not the PKCE `code` flow), so a link requested on a laptop works when opened on a phone. This needs Supabase's email templates changed to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`.
- Uninvited emails are blocked in the database by the "Before User Created" auth hook (`public.hook_before_user_created`), not just in app code.
- Database changes live in `supabase/migrations/`; Maggie pastes them into Supabase's SQL Editor. `supabase/tests/privacy_check.sql` checks row-level security and changes nothing.
- Keys: `.env.local` (git-ignored) and Vercel's Environment Variables. `.env.example` is the blank template. Maggie pastes key values herself; they never go through chat.
- DNS check on 2026-11-14: Resend's DKIM record (`resend._domainkey`) is live. `send.dupedupe.studio` points at `send.forge.rmta.net` and DMARC is `p=reject` with strict alignment; confirm both against what Resend's dashboard asks for.

## Design (Nov 14)

- The swing-tag look (cream, sage and clay, Oswald) is retired. The new look is black and white, Inter Tight, Inter and JetBrains Mono, with pill buttons. `DESIGN.md` is the reference; `prototype.html` still is for prompts and behavior. The Phase 0 note about Oswald and Work Sans is out of date.
- Why: product photos come from many sites and can't be made to match, so the app stays neutral and lets the clothes carry the color. Photos sit in a light gray tile with `mix-blend-mode: multiply`.
- Light is the default. Dark mode is an option in the menu, saved in `profiles.theme`, not taken from the phone's setting. Image tiles stay light in dark mode so the blend trick still works.
- Swipe cards come from the friend's own results, so the deck adds no search cost.
- Fields like returns, delivery date and size in stock show only when a source states them (`DESIGN.md` › Data on screen).
- The `design/screens/*.dc.html` files run only in the design canvas. They are for reading, not for copying into the app.


## Phase 2

- **Claude Sonnet 5.5 rejects forced tool use** (`tool_choice: {type: "tool"}` → 400). The brief schema is also too big for structured outputs (`output_config.format`: "too many optional parameters", then "compiled grammar is too large") and so for `strict: true`. What works: the plan's `submit_brief` tool as written, `tool_choice: "auto"`, the prompt says "Call submit_brief exactly once", and the code checks the call came back and asks once more if not (`lib/agents/briefBuilder.ts`). Expect the same for the judge in Phase 4.
- Requests use Anthropic's server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`), so a rare safety decline is retried on another model.
- Brief builder addition to the plan's prompt: a `sources` list (link, photo, typed, guess) per filled field, for Review's tags. Guesses are allowed only for stretch, fit style, length, sleeves, closure and care; code drops any other guess and shows a field with no stated source as "Guess · Source not stated".
- Prompt tune after the first Sau Lee run: "Each anchor names one detail, in 2 to 5 words. Name the color in the plain words a shopper would search." Before it, the third anchor lumped color, shape and slit together.
- Sau Lee test link: https://www.sau-lee.com/products/joanna-gown-red-date (the prototype's `joanna-jacquard-gown` URL doesn't exist). Run `npx tsx --conditions=react-server --env-file=.env.local scripts/test-brief.ts <link>` to test the brief builder alone.
- Photos are shrunk to 1600px in the browser (also turns iPhone HEIC into JPEG and keeps uploads under Vercel's 4.5MB request limit), then to 1,024px by `sharp` on the server, which also strips metadata such as GPS.
- `lib/fields.ts` holds lists the screens share; anything importing `server-only` (agents, `lib/server/*`) must never be imported by a `"use client"` file.
- **No free typing (Maggie, Nov 15).** Every detail field is a pick from a list in `lib/fields.ts`; the brief builder's schema uses the same lists (enums) and `cleanBrief` drops anything off-list. Only brand, item name and retail price are typed; the fabric tag (`composition`) is read-only, copied word for word from the source. New columns in `0003_detail_lists.sql`: `color_name` (the store's shade name; `color` is now the family), `weave`, `sizing`, `details`. `features` is unused.
- Stretch: if the listing doesn't say, the brief builder infers it from the shell fabric (woven jacquard etc. with no elastane → None) and marks it Guess with the reason.
- Product photos from the link: TinyFish `image_links: true` lists every image on the page. `lib/server/linkPhotos.ts` skips site chrome (logo, nav, banner…), scores file names by product words weighted by how rare they are among the page's images ("joanna" beats "gown"; names are matched inside the file name because stores write "JoannaGown-RedDate"), keeps up to 3, downloads them (https only, no IP or local hosts, ≤ 8 MB, ≥ 300 px) and shrinks them with sharp. If the friend gave no photos, they're saved as `link-1.jpg`… and become the search's photos (Review, Recent searches, and Lens in Phase 3). First version wrongly picked another product's gown; fixed by the rarity weighting.
- Brief builder: "fabrics lists the fibers of the shell, not the lining" (it had added the lining's spandex).
- Anchors still vary a little between runs (e.g. "Structured corset bodice" vs "Fitted column with structured bodice"). Judge against the test set before tuning further.
- **Gotcha, Nov 15:** on Vercel the TinyFish key was rejected (401 "Invalid or expired API key") while the same key worked locally, so live briefs had no page text, no product photos and no price. Cause: the value pasted into Vercel's settings was off. Fix: re-paste it from `.env.local`; changes to Vercel settings only apply to the next deployment. The code now trims spaces and quotes from both keys, and Review says so when a product page couldn't be opened (`searches.error`) instead of quietly guessing. To diagnose a live search, run `supabase/tests/last_searches.sql` (read-only; shows each search's fields and its `api_calls`).
- Review order (Maggie, Nov 15, second pass): original → Search for (view, size, budget) → The details, whose first item is Signature details. Each signature detail can be reworded (tap it; the old wording is selected so typing replaces it).


## Phase 3

- **Keys:** the background job runs without a signed-in friend, so it uses Supabase's server key (`SUPABASE_SECRET_KEY`, starts `sb_secret_`; `lib/server/admin.ts`). Every query with it filters by the search's `user_id`. Pasting keys went wrong twice: the SerpApi key was pasted three times in a row (nothing shows while pasting in Terminal), and the Supabase *publishable* key (top box on the API Keys page) was pasted instead of the secret one. `scripts/check-keys.ts` checks both without printing them.
- **Inngest:** on Vercel the Marketplace integration sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`. On the Mac, `.env.local` has `INNGEST_DEV=1`; run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest --no-discovery` next to `npm run dev` (dashboard at http://localhost:8288). `/api/inngest` is in `proxy.ts`'s public paths; Inngest signs its requests. `scripts/run-search.ts [search id | link]` re-runs a search through the local job and prints the results (4 SerpApi searches).
- **SerpApi shapes (checked Nov 14):** Lens `visual_matches` have the store's own link, a store photo (`image`) and a price on about half; Lens prices carry Google's "*" (not live), so they're saved with `price_is_estimate` and shown as "Est.". Shopping results have live prices but only `product_link` to Google's page. Amazon (`engine=amazon`, Maggie asked Nov 14) has `link_clean`, photo, live price, brand and ratings; its price filter is applied in code.
- **Store links (Maggie, Nov 14):** Shopping results save `immersive_product_page_token`; the first tap on Shop calls `google_immersive_product` (1 search), takes the matching store, follows Google's `/goto` redirect to the store's own page, and saves it in `candidates.store_link` with details like "Free lifetime returns". Falls back to Google's page if the lookup fails or the friend has used 30 lookups today.
- **SerpApi has no usage-alert setting** (pricing, FAQ and account pages checked). Automatic Early Renewal stays off; the job pauses searches under 30 left, using the free Account API.
- **Cleaning** drops non-stores (Instagram, TikTok…), rentals, the original itself (brand and style name in the title), new items with no price or over budget, and merges duplicates by link, photo or near-identical titles, keeping the cheapest. Secondhand finds are kept with "Secondhand comes in a later phase" until phase 5.
- **Screener:** Haiku with 256px thumbnails and the original's photo, 20 at a time, up to 6 picks a batch and 10 in all; it also says whether the color is the same, close or different (shown as the "Different color" badge). About 4,300 input tokens a batch. `scripts/test-screen.ts <folder>` runs cleaning and the screener on saved SerpApi JSON, no database.
- **First local run, Nov 14:** the Sau Lee search took 32 seconds: 187 gathered, 119 kept by cleaning, 60 screened, 9 shown, all with photos, 7 with live prices. Some picks are loose (a strapless maxi, a $13 mesh bodycon in a different color); the judge in phase 4 is what tightens this.
- Results and Item detail show no look or fit scores until the judge exists, rather than placeholders. Size shows "Size not checked" and fabric "Fabric not listed" until enrichment.

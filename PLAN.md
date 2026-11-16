# Dupe Dupe Build Plan

Nov 13, 2026 · @Maggie Emmons

Build Dupe Dupe as a private web app for 20 invited friends, built by Maggie in Claude Code, running for about $67 a month. It keeps every feature of the Claude prototype and adds the ones the prototype can't have: product photos, Google Lens search, real resale prices and sign-up without connectors.

## Goals

The first version proves one thing: do 20 friends come back to search again. Everything else (affiliate income, a public launch) waits on that answer.

- **Who it's for:** Maggie plus up to 20 invited friends who shop for higher-end looks and would buy secondhand.
- **The job:** drop in a piece you love, get new dupes under budget and secondhand matches, judged on look and fit.
- **Second goal:** Maggie learns to build and ship an app in Claude Code.

| Measure after 6 weeks | Target |
| --- | --- |
| Friends who search more than once | At least half |
| Searches per active friend per month | 5 or more |
| Searches where someone clicks through to a listing | 30% or more |
| Results rated thumbs up | 50% or more |
| Monthly running cost | Under $75 |

If fewer than a third of friends return after 8 weeks, pause and decide whether to change the product or stop paying for it.

## Scope

Version 1 is the prototype rebuilt as a real website, plus photos and Google Lens. Money-making features wait until the friends test shows people come back.

| Feature | Version 1 | Later |
| --- | --- | --- |
| Invite-only sign-in by email link | Yes |  |
| Start a search from a link, typed text or photos | Yes |  |
| Brief builder fills in fabric, fit and details, then writes visual and composition briefs; review card | Yes |  |
| Size, fit and stretch as multi-select; measurements as dropdowns | Yes |  |
| Google Lens visual matches with product photos | Yes |  |
| New dupes with live prices (Google Shopping) | Yes |  |
| Secondhand listings: eBay API plus resale pages read by TinyFish, with peer-brand searches | Yes |  |
| Thumbnail screening before anything is judged | Yes |  |
| Enrichment: reads the top listings for fabric, measurements and seller notes | Yes |  |
| Judge sees both photos and checks anchors and fabric tiers; verdicts approved, caveat or rejected | Yes |  |
| One automatic retry when fewer than 4 results pass | Yes |  |
| Views: All by price, New only, Secondhand only; sort by look, fit or price | Yes |  |
| Brand, color and size on every card; Different color tag | Yes |  |
| Thumbs up or down with one-tap reasons, scoped to taste or one item; a taste profile and "Your dupe rules" that learn from them | Yes |  |
| Swipe to train: a card deck built from the friend's own results; right is yes, left is no, with a "why?" pop-up for the reason | Yes |  |
| Item detail page: the original side by side with the dupe, verdict and caveat, look and fit breakdown, sizes, and shipping and returns when the source states them | Yes |  |
| Your eye screen: sizes for dresses, tops, bottoms (letter, number and jean waist) and shoes; rules shown as "You go for" and "You pass on" tags a friend can add or remove | Yes |  |
| Save items with a bookmark; a Saved tab | Yes |  |
| Dark mode as an option (light by default) | Yes |  |
| Favorite and hidden stores and brands | Yes |  |
| Saved searches list; several searches running at once | Yes |  |
| Edit details and rerun, with an out-of-date notice | Yes |  |
| Usage view for Maggie (searches, clicks, ratings, cost) | Yes |  |
| Daily search cap per friend and a monthly budget stop | Yes |  |
| Affiliate links and disclosure |  | After the test |
| New-listing alerts by email; price-drop and restock alerts on saved items |  | After the test |
| Weekly learning report for Maggie (where good matches are lost, by source and stage) |  | After the test |
| Paid plan, public sign-up |  | Only if the test succeeds |

Not in scope: a phone app. The website works on phones, and friends can add it to their home screen.

## Architecture

&#91;embedded content: Dupe Dupe architecture · phone, app, services, database\]

The phone only shows screens. The search job on the server calls every outside service with keys the phone never sees, then saves results to Supabase, which pushes new cards to the phone as they're judged.

## Stack and accounts

One Next.js app on Vercel, with Supabase for logins, data and photos. Every API key lives on the server, never in the browser.

| Piece | Choice | Why | Monthly cost for 20 friends |
| --- | --- | --- | --- |
| App framework | Next.js (TypeScript) | Claude Code knows it well; one codebase for pages and server code | $0 |
| Hosting | Vercel Pro | One-click deploys from GitHub; functions can run up to 30 minutes | $20 |
| Background jobs | Inngest | Runs each search stage as its own step; a failed step retries alone, so a TinyFish hiccup never repeats a paid Lens search; works natively with Next.js | $0 on its free plan (confirm limits) |
| Logins, database, photo storage | Supabase | Email-link sign-in, Postgres with per-user security rules, file storage, live updates | $0 on Free (pauses after 7 idle days) or $25 on Pro |
| Sign-in emails | Resend, on Maggie's domain | Supabase's built-in sender is heavily rate-limited and often lands in spam, so invites would silently fail | $0 on its free plan |
| Visual search | SerpApi: Google Lens (visual matches) and Google Shopping | Photo-to-product matches with thumbnails, prices and condition | $25 (Starter, 1,000 searches) |
| Resale page reading | TinyFish Fetch API | Reads resale search pages and the top listings' pages | $0 today |
| eBay listings | eBay Browse API | Official listing data with prices, sizes, photos and full descriptions | $0 (developer account) |
| AI agents | Claude API: Haiku 5.5 for the screeners and the taste summarizer, Sonnet 5.5 for the brief builder and the judge | About $0.11 a search with the briefs, thumbnails and enriched judging | About $21 |
| Code storage | GitHub (private repo) | Backups, history, and Vercel deploys from it | $0 |
| Error alerts | Sentry free plan | Emails Maggie when something breaks | $0 |
| Domain | Any registrar | A short name friends remember; also needed for Resend | About $1.25 |

Total: about $67 a month, or about $47 while Vercel's free plan is allowed (before affiliate links make the site commercial).

**Accounts to open before building:** GitHub, Vercel, Supabase, Inngest, Resend, SerpApi, TinyFish, eBay Developers, Anthropic Console (API key, separate from a Claude subscription), Sentry, and a domain registrar.

## Search pipeline

A search runs as a background job in six stages: brief, gather, clean, screen, enrich, judge. Inngest runs each stage as its own step, so a failed step retries alone and never repeats a paid search. A full search should finish in 60 to 90 seconds, with cards appearing as they're judged.

1. **Build the brief** (Brief builder, Sonnet 5.5). TinyFish fetches any product link. Claude reads the page, typed notes and up to 4 photos, and fills the plain item fields the friend sees on the review card. Those fields stay the source of truth. From them and the friend's taste profile, the brief builder writes three things, rebuilt whenever a friend edits a detail:
   - **Visual brief:** silhouette and structure (boned bodice, column, A-line), drape, waist and hem; primary color with acceptable sister shades and dealbreaker undertones; sheen (matte, satin, metallic, jacquard); pattern scale; and 2 or 3 **signature anchors**, the details that make the piece.
   - **Composition brief:** fabric tiers (target fabrics, acceptable swaps, dealbreakers), lining, stretch tolerance, closure and the friend's sizes.
   - **Query matrix:** exact queries (brand plus style name), look-alike queries (construction, fabric, silhouette) and 3 or 4 peer-brand queries for resale sites. Peer brands are labels similar in style and price, never described as made in the same factory.

   **The friend confirms the anchors.** The review card shows them as editable chips under "What makes this piece?", each with a dealbreaker toggle. A wrong anchor makes every later stage wrong, so this is the one check a person makes before the search runs.
2. **Gather** (no AI, all at once).
   - Google Lens through SerpApi, visual matches, the most important source (Maggie, Nov 15): the first two photos go by 10-minute signed links from Supabase Storage, the first with a short description in `q`, the second alone. Lens sometimes answers with nothing and SerpApi caches that for an hour, so an empty answer is retried with the cache off. Lens matches without a price are kept; the price is read from the store's page before judging, or the card says "Price at store".
   - Google Shopping through SerpApi: the first look-alike query, and the same words plus "revolve", which brings back Revolve's own listings (Maggie, Nov 15), filtered to the budget.
   - Amazon through SerpApi: the first look-alike query, filtered to the budget (Maggie, Nov 14).
   - Above the friend's limit, up to the original's price (Maggie, Nov 15: the Results price slider reveals them without a new search): one Google Shopping search with the first look-alike phrasing, and Shopify's catalog by the first photo and two detail phrasings. Lens and Amazon matches above the limit are kept rather than dropped. Pieces in range are screened and judged first; 40 screening places are kept for pieces above the limit, and the best 8 of them are judged after the in-range ones. The stock check only looks at pieces in range.
   - Shopify's Global Catalog (free, no key; Maggie, Nov 15): the first two photos (visual search), one phrasing per signature detail (shade, detail, garment word) and the first two look-alike phrasings, 50 results each, filtered to the price range and US shipping. It reaches small Shopify brands Google rarely shows; plain phrasings drown in cheap results, so the detail phrasings matter. Each call names the app's public agent profile (`/ucp/agent.json`). Shopify's terms: results only for friends' searches, attribution kept on links, prices re-checked at Shop.
   - eBay Browse API: exact, look-alike and peer-brand queries.
   - TinyFish resale search pages: look-alike and peer-brand queries on every site the friend has on, exact queries on the top 3.

   Every item gathered is saved to the `candidates` table, and each later stage records how far it got and why it was dropped.
3. **Clean** (code, no AI). Every candidate becomes one shape: source, link, title, brand, price, condition, size, color, photo link, store. Then code, not an agent:
   - allows every store except blocked ones (`lib/stores.ts`: ultra-cheap fast fashion and scam-prone marketplaces such as Shein, Temu, AliExpress, Fashion Nova; doubtful sites seen in results; marketplace sellers; sites that aren't stores), and shows Amazon items only with 4 stars or more from at least 100 reviews. An approved-only list was tried first and hid most of Maggie's own good test-set dupes, so it was flipped (Maggie, Nov 15: "exclude sites rather than rule everything out");
   - drops hidden stores, new items outside the friend's price range and items already rated thumbs down. The budget is a range set with a two-handle slider on Review: the friend sets both ends, and each starts where they left it on their last search. A floor worked out from the original's price was tried and dropped, because a very expensive original skews it (Maggie, Nov 15);
   - filters secondhand listings to the friend's sizes, keeping listings whose size is unknown;
   - merges the same product sold by several stores into one candidate, showing the cheapest.
4. **Screen** (two pickers, Haiku 5.5). Each picker sees titles, prices and small thumbnails, 20 at a time, checks them against the visual brief and passes up to 10 new and 10 secondhand candidates. Thumbnails keep it from picking blind when titles say little, which is common on Poshmark.
5. **Enrich** (no AI). For each survivor, eBay's item call or a TinyFish read of the listing page pulls the full description, fabric content, measurements and seller notes. Price, size and availability are re-read here by code, and a listing that is sold or unavailable is dropped. A page that fails is skipped, and its fabric is marked unknown.
6. **Judge** (QA agent, Sonnet 5.5). It sees the original photo, each candidate's photo and its enriched text, 5 at a time, and answers a fixed checklist instead of inventing a score:
   - each signature anchor: pass, partial or fail;
   - color, silhouette, neckline, sleeves, length and sheen: match, close or different;
   - fabric tier: target, acceptable swap, dealbreaker or unknown. **Unknown is a caveat, not a failure.** It shows as "Ask the seller for the fabric tag," so well-made vintage pieces with thin listings survive;
   - whether the listing seems to use the original brand's own product photo;
   - one sentence naming the biggest difference, and its confidence.

   **Code turns the checklist into the look score, the fit score and the verdict**, using fixed weights that the friend's taste profile adjusts. A failed dealbreaker anchor or a dealbreaker fabric is **rejected** and hidden; anything short of a clean pass is **approved with caveat** ("Poly blend, not silk", "Different color"); the rest is **approved**. The same checklist always gives the same score, and changing a weight re-scores saved candidates with no new search.

**One automatic retry:** if fewer than 4 candidates are approved, the job runs one more gather with the planner's alternative phrases and peer brands, then screens, enriches and judges those. It never retries a second time.

**How the screen keeps up:** starting a search saves a row with status `queued`. Each stage updates that row. The results screen listens through Supabase Realtime, so cards appear as soon as they're judged.

**How agents answer:** every agent uses Claude's tool use with a fixed JSON schema, so replies are always valid data. Model IDs come from the settings `ANTHROPIC_FAST_MODEL` and `ANTHROPIC_JUDGE_MODEL`, never typed into code. The prompts start from the prototype's, which already carry taste notes, store preferences, the strict judging scale and the rule never to invent a price or a link.

**The planner agent** runs in the automatic retry, and when a friend opens "More ideas" for older labels, reseller phrases and a vetting checklist.

## Learning loop

Dupe Dupe learns from what a friend does, not from forms: every tap is tied to a checklist item, so it can change that friend's weights and briefs directly. Learning happens at three speeds.

| What the friend does | What it teaches | Where it feeds back |
| --- | --- | --- |
| Taps thumbs down, then a one-tap reason: wrong color, wrong shape, wrong neckline, wrong length, fabric looks cheap, too pricey, not my size (a typed note is optional) | That checklist item matters more to this friend | This search re-ranks at once; the item's weight rises in the taste profile |
| Taps thumbs up, with an optional "close enough on" reason | Which differences are acceptable | That item's weight falls; the match joins the friend's liked examples |
| Swipes a card right (yes) or left (no), then picks a reason in the pop-up | The same as thumbs up or down with a reason | The same as thumbs up or down |
| Adds or removes a "You go for" or "You pass on" tag on Your eye | A rule the friend stated outright | Becomes a rule at once, marked "You added"; removing a tag deletes the rule |
| Edits or removes an anchor chip, or flips a dealbreaker toggle | What makes a piece for this friend | This search's brief; repeated edits become defaults the brief builder proposes next time |
| Corrects a plain field on the review card | Where the brief builder misreads | The brief for this search; Maggie's weekly report |
| Clicks through to a listing, or doesn't | Interest without a rating | A weak signal, counted at a quarter of a rating |
| Saves an item with the bookmark | Interest without a rating | A weak signal, counted like a click |
| Marks "I bought this" | The strongest yes | Counted as three thumbs up; added to liked examples |
| Favorites or hides a store or brand | Where to look and where not to | Query matrix and the cleaning step |

**Now, inside one search.** Scores are computed in code from the saved checklist, so a rating re-ranks the cards on screen in under a second, with no new search and no cost. Tap "wrong color" twice and other off-color results sink.

**Over time, per friend.** Each friend has a taste profile with two parts. The weights are numbers per checklist item, nudged by every signal. The rules are short sentences a summarizer agent (Haiku 5.5) rewrites after every 5 new ratings, split into dealbreakers and preferences, such as "Neckline must match" or "A shade off is fine." A pattern becomes a rule only after 2 or more signals agree, and "just this item" notes never generalize. The profile feeds the top of the next search: the brief builder proposes anchors and dealbreakers from it, the query matrix uses liked brands and stores, the screener reads the rules, and the scoring code uses the weights.

**Across everyone, for Maggie.** A weekly report built from the `candidates` table shows, for each source and stage, how many candidates came in, how many survived and how many ended up liked. It shows where good matches are lost and which sources earn their cost. Maggie changes prompts and sources by hand from it; nothing rewrites prompts automatically. Liked matches are added to the test set, so it grows from real use.

**Keeping it visible and safe**

- The Your eye screen shows every rule as a "You go for" or "You pass on" tag, with the ratings behind it a tap away. A friend can add, edit or delete any rule.
- When a new rule forms, the app says so once: "Learned: neckline must match. Undo?"
- New friends start from neutral weights and a 3-question setup: how literal should a dupe be, which matters more between look and fabric, and sizes (set with the size dials on Your eye).
- One friend's taste never changes another friend's results. Only the anonymous source counts in Maggie's report are shared.
- Weights are capped, so no item can drop to zero or outweigh everything else.
- Commission data never enters any of it.

## Data model

Ten Postgres tables in Supabase. Every table except `invites` carries a `user_id`, and row-level security lets each friend read and write only their own rows. Maggie reads totals through an admin-only usage view, never through another friend's rows.

| Table | One row is | Key fields |
| --- | --- | --- |
| `profiles` | A friend | name, sizes (json: dress and top each with letter and number; bottom with letter, number and jean waist; shoe US size), theme (light or dark, light by default), default view, default sort, daily search count, is\_admin |
| `invites` | An allowed email | email, invited\_by, accepted\_at |
| `searches` | One search | status (queued, briefing, gathering, screening, enriching, judging, done, failed), plain item fields the friend edits (brand, style, category, color, composition, fabrics, care, fit, stretch, neckline, sleeve, hem, closure, features, retail price, budget, sizes, measurements), source links, pasted text, photo paths, view, `visual_brief` (json, with confirmed anchors and dealbreaker flags), `composition_brief` (json), `search_queries` (json), brief\_built\_at, retried (yes or no), ran\_at, changed\_at, cost estimate |
| `candidates` | Every item gathered for a search, shown or not | search\_id, kind (new or secondhand), source, query used, title, brand, store, link, photo link, price, condition, size, color, duplicate\_of, stage reached (gathered, cleaned, screened, enriched, judged), drop reason, `composition_raw`, availability, `checklist` (json: the judge's answers), `fabric_tier`, stock\_photo\_flag, judge note, confidence, look score, fit score, `verdict` (approved, caveat, rejected), caveat text |
| `ratings` | A thumbs up or down, from a card or a swipe | candidate\_id, search\_id, vote, reason (the one-tap choice), note, scope (taste or item), source (card or swipe), bought (yes or no), snapshot of title, store and original item |
| `saved_items` | A bookmarked result | candidate\_id, search\_id, snapshot of title, store, price, color, size and link, saved\_at |
| `taste_profiles` | One friend's learned taste | weights (json: one number per checklist item), rules (json: dealbreakers and preferences, each with the ratings behind it or marked "You added"), liked examples, updated\_at |
| `store_prefs` | A favorite or hidden store or brand | name (normalized), kind (favorite or hidden) |
| `events` | Something a friend did | type (search\_started, result\_clicked, rated, anchor\_edited, field\_corrected, view\_changed), search\_id, candidate\_id, timestamp |
| `api_calls` | One paid or external call | service (serpapi, claude, tinyfish, ebay), stage, search\_id, units, estimated cost, ok or error |

**Results are candidates that passed.** The results screen shows candidates whose verdict is approved or caveat. Keeping every candidate, with the stage it reached, is what makes it possible to see where a good match was lost, to re-score without a new search and to rerun the judge on saved data.

**The briefs follow the plain fields.** A friend edits the plain fields on the Details screen; saving them marks the briefs out of date, and the next run rebuilds them first. Agents read the briefs; people read and edit the fields.

**Photos** go in a private Supabase Storage bucket at `photos/<user_id>/<search_id>/`. The server shrinks each one to 1,024 pixels before storing it. Friends can delete a search, which deletes its photos.

**Carrying over Maggie's prototype data:** before building the ratings feature, export her taste notes, favorites and hidden stores from the prototype and import them into her account, so the new app starts tuned.

## Screens

Ten screens. The look and the full spec for each are in `DESIGN.md` (black and white, light by default with a dark option), and the screens themselves are in `design/screens/`. The prototype is still the reference for prompts and behavior. Lay out every screen for phones first.

| Screen | What a friend does there | Phase |
| --- | --- | --- |
| Sign in | Enters email, taps the link in the email | 1, restyled in 2 |
| Find (home) | Starts a search three equal ways: photo or screenshot, product link, or describe it; sees recent searches | 2 |
| Review | Checks what the reader found (plain fields with edit buttons); confirms signature details, each with a Must match switch (the dealbreaker toggle); adds or removes details; picks view (All by price, New only, Secondhand), sees size and budget; "Looks right, search" or "Fix details" | 2 |
| Results | Live cards appear as judged; filters for In my size and the three views; sort by look, fit or price; each card shows photo, brand, look and fit scores, name, price, color with a Different color tag, size, store, fabric, verdict and caveat (such as "Poly blend, not silk"); empty state suggests secondhand | 3 and 4 |
| Item detail | The original side by side with the dupe; Save; favorite brand; verdict and caveat; sizes; facts (fabric, shipping, returns, care); look and fit breakdown; anchor checks and judge note; sticky buy bar through `/go`. Secondhand items show condition, measurements, seller and final sale instead. | 3 to 6 |
| Swipe | A deck of cards from the friend's own approved and caveat results not yet rated; right is yes, left is no, with a pop-up for the reason; info opens Item detail; Save bookmarks | 7 |
| Saved | Bookmarked items, newest first | 7 (price-drop and restock badges after the test) |
| Your eye | Sizes for dresses, tops, bottoms and shoes, set with scrolling dials; "You go for" and "You pass on" tags (the dupe rules) to add or remove; price sweet spot; Appearance (light or dark) in the menu | 7 |
| Details | Five sections: sources, item info, sizing and fit, fabric, design; buttons say "Save, next" and "Save, back to results"; Rerun search stays a separate, smaller button | 7 |
| Usage (Maggie only) | Searches, returning friends, click-through, ratings, spend this month against the budget | 8 |

**Lessons from the prototype to keep:**

- A save button never also runs a search.
- Feedback boxes close after Save and show a one-line summary with a Change link. The swipe pop-up follows this: after a reason it shrinks to "Nope · Price" with Change.
- Every card shows brand, color and size together, and flags a different color.
- Prices that aren't live are labeled as estimates, or left out.
- Look and fit scores are always shown separately.
- A field with no source is hidden or says it wasn't found (see `DESIGN.md` › Data on screen).

## Privacy, security and legal

The main risks are a leaked API key and reading sites whose terms forbid it. The rules below keep both small at 20 friends.

**Security**

- All API keys stay in Vercel's environment variables and a local `.env.local` file that git ignores. No key ever reaches the browser.
- Supabase row-level security is on for every table before any friend is invited. A test confirms one friend can't read another's searches.
- Only invited emails can sign in. Maggie adds and removes invites from the usage screen.
- Every server route checks who is signed in and their daily cap before calling any paid service.

**Friends' data**

- Photos, sizes and measurements are personal. They stay in a private bucket and are only used for that friend's searches.
- A friend can delete a search, which removes its photos, or delete their account, which removes everything.
- A one-paragraph privacy note on the sign-in screen says what is stored, why, which services see photos (SerpApi and Google Lens, Anthropic) and how to delete it.

**Terms of service**

- SerpApi returns Google's results by scraping Google. That is SerpApi's business and risk, but Google could block it, so Lens could stop working without warning.
- TinyFish reads resale sites' search pages and the top listings' pages. Most resale sites' terms restrict automated access. At 20 friends the volume is tiny, but the risk isn't zero. Read Poshmark's, Depop's and ThredUp's terms before launch, and drop any site that clearly forbids it.
- eBay's Browse API is the approved way to search eBay. Production access for Buy APIs needs approval through the eBay Partner Network, which can take up to 10 business days and isn't guaranteed. Apply in week one. Until then, TinyFish reads eBay's search page like the other sites.

**Disclosures, for later**

- When affiliate links go on, show the FTC disclosure on every results screen, and mark links `rel="sponsored"`.
- Talk to a lawyer before any public launch, especially about scraping and affiliate terms.

## AliExpress (opt-in)

Maggie, Nov 15: "the user can opt into AliExpress… but we need specific rules written for AliExpress and what it serves up." AliExpress has real finds, but also counterfeits, stolen product photos and unverified fabric claims, so it follows its own rules.

**Turning it on**
- Off by default. Each friend turns it on in the menu (Settings › Show AliExpress finds); saved in `profiles.allow_aliexpress`. When off, AliExpress stays on the block list for them.
- When on, each search adds one Google Shopping search for the shortest look-alike phrasing plus "aliexpress", and Lens's AliExpress matches are kept.

**Checks before showing anything (code, from the listing page)**
- Every AliExpress pick is looked up: its AliExpress page is found through Google's product lookup (1 SerpApi search) and read (TinyFish, free) for the review count and rating, units sold, store name, store positive-feedback rate, followers, store age when shown, and the listing's photos.
- **No reviews: hidden.** Rated under 4.5 stars with 10 or more reviews: hidden. Store positive feedback under 90%: hidden.
- **Few reviews (under 10): shown with the caveat "Only N reviews".** A new store (open under a year) is shown, flagged "New store, open since …". Store age not found: "Store age not checked".
- A page that can't be read is hidden (its reviews can't be checked).

**What the judge checks extra (checklist, then code decides)**
- `brand_copy`: the title, photo or listing uses the original's brand name, another designer's name, a logo, or "inspired by". **Always rejected**, never shown (no counterfeits).
- `stock_photo_suspected` (already in the checklist): for AliExpress this **rejects** rather than cautions, since stolen designer photos are a common bait.
- `real_photos`: the listing (or its reviews) includes photos of the actual item, such as on a mannequin, in the factory, flat, or close-ups of details, not only model shots. If only model shots: caveat "Only model photos, no photos of the real item".
- The judge sees up to 5 of the listing's own photos for this.

**Fabric and fit**
- AliExpress fabric claims aren't trusted: the fabric tier is at most "acceptable swap", with the caveat "Fabric claim not verified".
- Made-to-order or "customized" listings are shown with the caveat "Made to order: longer wait, usually no returns".

**On screen**
- An "AliExpress" badge on the card, and on Item detail the standing note: "Ships in about 2–4 weeks · Sizes often run small · Returns can be hard."
- At most 4 AliExpress results per search (the best by look score), so they don't crowd out other stores.

## Affiliate links

Affiliate links earn on purchases but never decide what a friend sees. Results, verdicts and their order are fixed before any link is checked for a commission, and the code is built so it can't be otherwise.

**How a click works**

1. Every "View item" button points to the app's own link, `/go/<result id>`, from phase 3 on. Before affiliates exist, it only logs the click and forwards to the store, which is how click-through is measured in the friends test. Google Shopping only gives a link to Google's product page, so the first tap on one of its results looks up the store's own page (1 SerpApi search, at most 30 per friend a day), saves it and forwards there (Maggie, Nov 14).
2. Once programs are approved, the same route decides per link at the moment of the click: eBay links get eBay Partner Network tracking, stores a link-wrapping network covers (Skimlinks or Sovrn Commerce) get wrapped, and every other link goes through unchanged.
3. Each tracked link carries the result's ID, so network reports show which searches and which kinds of match actually lead to purchases.

**Integrity rules**

- **Agents never see commission data.** No affiliate field, rate or program name reaches the brief builder, screeners, judge or planner.
- **Only the click route knows about affiliates.** Affiliate settings live in one separate module that only `/go` may import. An automated test fails the build if any search, screening, judging or sorting code imports it.
- **Every result looks the same.** No badge, color or position marks a paying store.
- **No paid placement gets in.** Only unpaid listings are read: Google Shopping's organic results (paid Shopping ads come in separate blocks that are never read) and Amazon's organic results; anything marked sponsored is skipped. A source's own ranking only decides which items get screened first; what friends see, and its order, comes from the screener and judge (Maggie, Nov 15).
- **No source is dropped for not paying.** Poshmark, Depop and other resale sites stay in every search whether or not they have a program.
- **Favorites and hidden stores stay the friend's choice.** The app never favorites a store on its own.
- **A monthly check:** compare how often paying stores appear in the top 3 against how often they appear overall. A widening gap means something is leaking and gets fixed before anything else.

**Disclosure:** one line on every results screen, "Some links earn Dupe Dupe a small commission. It never changes which results you see or their order," and every outbound link marked `rel="sponsored"`.

**When:** the click route ships in phase 3. Applications go in after the friends test, once Dupe Dupe has a public page explaining what it is and a privacy policy, since networks review the site before approving it. eBay Partner Network starts in phase 0 for the search API. Resale sites may pay little or nothing, so expect most commission to come from new dupes.

## Build phases

Ten phases, each small enough for one or two Claude Code sessions and each ending with something Maggie can open on her phone. The judge comes before secondhand, so the whole flow works end to end on clean Google data before the messier resale sites. Don't start a phase until the one before passes its check.

| Phase | What gets built | Done when |
| --- | --- | --- |
| 0. Setup | Accounts opened, domain bought, eBay Partner Network application sent, empty Next.js app in a private GitHub repo, deployed to Vercel, `CLAUDE.md` written | A "Hello Dupe Dupe" page loads at the Vercel link |
| 1. Sign-in | Supabase project, Resend connected to the domain and set as Supabase's email sender, email-link sign-in, `invites` and `profiles` tables, row-level security | 5 test invites all land in the inbox, not spam, within 2 minutes; an uninvited email is turned away |
| 2. Start and brief | New look's fonts and colors from `DESIGN.md`, Sign in restyled, Find screen (home) with photo, link and describe-it starts, photo upload and shrink, `searches` table, brief builder (plain fields, both briefs, query matrix), Review screen with editable signature details and Must match switches | The Sau Lee Joanna gown link fills in 100% polyester jacquard and true to size, and its anchors include the off-shoulder neckline, burnt red jacquard and boned bodice |
| 3. Lens and new dupes | Inngest job with a step per stage and status updates, SerpApi Lens and Shopping, the candidates table with stage tracking, cleaning step with size filter and duplicate merging, new-items screener with thumbnails, result cards with photos in the `DESIGN.md` card style, Item detail page, the /go click route that logs every outbound click | A Sau Lee search shows at least 6 new candidates with photos and real prices |
| 4. Judge | Listing page reads for the top new picks before judging, so the judge sees the real fabric tag (moved up from phase 6, Maggie, Nov 15); judge with both photos and both briefs, the fixed checklist including how polished the piece looks, look and fit scores and the three verdicts computed in code from it, caveats, sort, the three views | On the test set, Maggie agrees with the judge's top 3 at least 7 times in 10, and no rejected item breaks a stated dealbreaker |
| 5. Secondhand | eBay (API or page reading), TinyFish resale pages with peer-brand queries, secondhand screener | At least 6 real secondhand listings with working links; no invented prices |
| 6. Enrich and retry | Listing page reads extended to secondhand and the top 20, sold-listing check, fabric tiers, unknown fabric as a caveat, stock-photo flag, one automatic retry | Fabric tier shows on at least 70% of approved results; a search built to come back thin retries exactly once |
| 7. Taste | Ratings with one-tap reasons and scope, Swipe deck with the reason pop-up, instant re-rank, taste profile with weights and rules, Your eye screen (rules as tags, size dials, appearance setting), 3-question setup, store and brand favorites and hidden, saved searches, Saved tab, edit and rerun with out-of-date notice and brief rebuild, prototype data import | Tapping "wrong color" re-ranks the screen in under a second; after 2 matching ratings a rule appears on Your eye and changes the next search's brief |
| 8. Guardrails | Daily caps, monthly budget stop, caching, `api_calls` logging, Sentry, usage screen, privacy note, account deletion | Hitting the cap shows a friendly message; spend on the usage screen matches the services' own dashboards within 10% |
| 9. Friends | Invite 5 friends, fix what they hit, then invite the rest | 20 friends signed in; Goals measures tracking |

After phase 9, run the 6-week test. Affiliate links, alerts and Maggie's weekly learning report come after it, if the numbers say so.

## Working in Claude Code

Treat Claude Code like a skilled builder you direct: give it this plan, one phase at a time, and check its work on your phone before moving on. You don't need to write code, but you do need to read what it plans and test what it ships.

**Before the first session**

1. Install Claude Code by following Anthropic's [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview), or use it in the Claude desktop app.
2. Make an empty folder called `dupe-dupe` and start Claude Code there.
3. Save this plan as `PLAN.md` in that folder, and save the prototype's page file as `prototype.html` for reference.
4. Ask Claude Code to write a `CLAUDE.md` from the plan. That file is what Claude Code reads at the start of every session, so it should hold the stack, the rules below and the current phase.

**Rules to put in `CLAUDE.md`**

- Work one phase at a time, and stop when the phase's check passes.
- Plan before writing code, and wait for Maggie's yes. Read Claude model IDs from settings; never type them into code.
- Never put an API key in code or in a commit. Keys go in `.env.local` and in Vercel.
- Commit to GitHub after each working step, with a plain-English message.
- Explain what changed in plain words at the end of each step, and how to test it.
- Use the prototype's prompts and behavior and `DESIGN.md`'s look, unless the plan says otherwise.

**Habits for a first-time builder**

- Start each session by saying which phase you're on and pasting its "Done when" line.
- When something breaks, paste the exact error message. Don't describe it.
- Test on your phone after every phase. Most bugs show up there first.
- If a session goes in circles, stop and start a fresh one with a short summary. Long sessions drift.
- Keep a `NOTES.md` of decisions and gotchas, so later sessions don't repeat mistakes.
- Expect phases 3 and 4 to take the longest. They connect to four outside services, and each has its own quirks.

## Testing

Quality is judged against a fixed set of 10 items that Maggie knows well, rerun after every change to an agent or a search source. Without a fixed set, changes feel better or worse by mood.

**The test set:** 10 items Maggie picks, spread across categories and price levels. Start with the Sau Lee Joanna Jacquard Gown (burnt red). For the others, mix a knit, a blazer, denim, a handbag, a casual dress, a silk piece, a mall-brand item, a vintage-style piece and one item with a loud print. For each, save the link, 2 photos and Maggie's own short list of 3 matches she'd consider good.

**What to check on each run**

| Check | Pass |
| --- | --- |
| Reader fills fabric and fit correctly | 9 of 10 items |
| Links that open the right product or listing | 95% or more |
| Prices shown that match the page | 95% or more; no invented prices |
| Maggie agrees with the judge's top 3 | 7 of 10 items |
| At least one of Maggie's own good matches appears | 6 of 10 items |
| Time to first card / to finished | Under 20 seconds / under 90 seconds |
| Cost per search on the usage screen | Under $0.15 |

**Automated checks Claude Code should write:** row-level security (one friend can't read another's rows), the daily cap, the cleaning step (no hidden stores, no over-budget new items, no duplicates) and a test that every result link came from a source, not from an agent.

**Where matches are lost:** for each test item, look up Maggie's 3 known good matches in the `candidates` table and note the stage each one reached. A match that never appears is a gathering problem, one cut at screening is a screener problem, and one rejected is a judge or brief problem. Fix the stage that loses the most. Because candidates are saved, the judge and the scoring weights can be rerun on old searches without paying for new ones.

## Costs and guardrails

At 20 friends doing 10 searches a month, the app uses about 600 of SerpApi's 1,000 monthly searches and about $21 of Claude. The briefs, thumbnail screening and enriched judging raise Claude's cost from about $0.05 to about $0.11 a search; the guardrails keep a busy week or a bug from costing more than the plan.

| Per search | Uses | Estimated cost |
| --- | --- | --- |
| SerpApi | 1 Lens search, 2 Shopping searches (one scoped to Revolve), 1 Amazon search (3 more in a retry), plus 1 store lookup per first tap on a Shopping result | Covered by the $25 plan up to about 200 searches a month |
| Claude | Brief builder and judge with both photos and listing text (Sonnet 5.5), 2 screeners (Haiku 5.5) | About $0.11; the judge and the brief are most of it. Re-ranking after a rating costs nothing |
| TinyFish | About 9 search pages plus up to 20 listing pages | $0 today |
| Shopify catalog | About 7 searches (2 by photo, 5 by words) | $0 |
| eBay | About 6 searches and up to 10 item calls | $0, well under 5,000 a day |

**Guardrails**

- **Daily cap:** 5 searches per friend per day; Maggie unlimited. A friendly message explains the limit.
- **Monthly stop:** searches pause for everyone at 900 SerpApi searches or $35 of Claude spend in a month, and Maggie gets an email.
- **Provider limits:** set a monthly spend limit in the Anthropic Console. SerpApi has no usage alerts, so keep its Automatic Early Renewal off; the search job checks SerpApi's free account endpoint first and pauses searches under 30 left.
- **One retry, never two:** the automatic retry runs at most once per search, so a weak search can't loop.
- **Caching:** save gathered candidates with each search. Editing details and rerunning reuses them unless the photo or links changed, so a rerun costs only Claude.
- **Lens cache:** the same photo (matched by file fingerprint) within 7 days reuses the earlier Lens results.
- **Failure handling:** Inngest retries a failed step once. If a source still fails, the search continues without it, and the results say which source was missing.
- **Logging:** every external call writes a row to `api_calls`, which feeds the usage screen.

The [Dupe Dupe Cost Model](https://claude.ai/artifact/DfhDFDJQnVTeAcHGuFcPhz) has the full numbers, updated for these steps.

## Risks

The biggest risk is the product, not the code: friends may try it once and not come back. The other risks are outside services changing under the app, each with a fallback.

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| Friends don't come back after one search | Medium | Ask the first 5 friends why after week 2; fix the top reason before inviting the rest |
| Google Lens through SerpApi stops working or changes | Low to medium | Keep Shopping, eBay and TinyFish sources working on their own; consider Google Cloud Vision web detection as a backup |
| eBay Partner Network rejects the Browse API application | Medium | Read eBay search pages with TinyFish, like other sites |
| A resale site blocks TinyFish or changes its page layout | High over time | The finder reads page text, not fixed layouts; a source that returns nothing is skipped and logged; a listing page that can't be read gets its fabric marked unknown |
| TinyFish starts charging | Medium | About 9 reads a search; even a few cents each is affordable at 20 friends; cut to the top 3 sites |
| Look scores are confidently wrong | Medium | Judge sees both photos; Maggie checks against the test set; friends' ratings steer it |
| Costs spike from a bug or a loop | Low | Daily caps, monthly stop, provider spend limits |
| Supabase Free project pauses after 7 idle days | Medium | Move to Pro ($25) once friends are invited |
| Maggie gets stuck mid-build | Medium | Phases are small; a fresh session with the error and `NOTES.md` usually unblocks it |

## Review decisions and open questions

The first review settled six questions, and four remain open for the next one.

| Question | Decision |
| --- | --- |
| Background jobs | Inngest from phase 3, one step per stage, with per-step retries |
| Phase order | Judge before secondhand |
| Lens photo input | A 10-minute signed link from Supabase Storage (the review suggested 2 minutes; 10 allows for SerpApi delays) |
| Email | Resend on Maggie's domain as Supabase's sender, set up in phase 1 |
| Judging | Visual and composition briefs, signature anchors, fabric tiers, three verdicts, one automatic retry |
| Missing listing details | An enrichment step reads the top 20 listings before judging; unknown fabric is a caveat, not a rejection |
| Design | Black and white redesign on Nov 14, light by default with a dark option; `DESIGN.md` is the look reference and replaces the swing-tag look; swipe cards come from a friend's own results, so they add no search cost |

**Still open**

1. **Stack size:** is Next.js, Supabase and Inngest the simplest stack a first-time builder can manage, or is there a lighter option that still covers sign-in, storage and background jobs?
2. **Terms of service:** which resale sites should be left out of the friends test, given their terms, now that the app also reads individual listing pages?
3. **Shop catalog:** is there a developer API for Shop's catalog that would add live new-item prices beyond Google Shopping?
4. **Measures:** are the 6-week targets in Goals realistic for 20 friends, and are they the right ones to decide whether to continue?

## Appendix: brief builder and judge

These are the starting schemas, prompts and scoring rules for the two agents everything else depends on. Claude Code should copy them into `lib/agents/` as written, then tune them against the test set. Each agent answers through one tool call whose input must match its schema, so a reply is always valid data.

### Brief builder

Runs once per search on `ANTHROPIC_JUDGE_MODEL` (Sonnet 5.5), and again whenever a friend saves an edit to the item fields.

**Inputs:** the listing page text (if any), the friend's typed notes, up to 4 photos, the friend's taste rules, and, on a rebuild, the friend's edited plain fields, which override anything the agent reads.

**Tool:** `submit_brief`

```json
{
  "type": "object",
  "required": ["item", "visual_brief", "composition_brief", "search_queries"],
  "properties": {
    "item": {
      "type": "object",
      "description": "Plain fields shown to the friend. Empty string or [] when unknown.",
      "properties": {
        "brand": {"type": "string"},
        "style_name": {"type": "string"},
        "category": {"enum": ["Dress", "Top / Blouse", "Sweater / Knit", "Outerwear", "Bottoms", "Denim", "Activewear", "Shoes", "Bag / Accessory", ""]},
        "color": {"type": "string"},
        "composition": {"type": "string", "description": "Exact text from the source, e.g. 100% Polyester. Never estimated."},
        "fabrics": {"type": "array", "items": {"type": "string"}},
        "care": {"type": "array", "items": {"type": "string"}},
        "fit_style": {"type": "array", "items": {"enum": ["Slim", "Relaxed", "Oversized", "Tailored", "Cropped", "Bodycon"]}},
        "stretch": {"type": "array", "items": {"enum": ["None", "Slight", "Moderate", "Very stretchy"]}},
        "neckline": {"type": "string"},
        "sleeve": {"type": "string"},
        "hem": {"type": "string"},
        "closure": {"type": "string"},
        "features": {"type": "string"},
        "retail_price": {"type": ["number", "null"]},
        "fit_notes": {"type": "string", "description": "Model size, true-to-size notes, as stated."}
      }
    },
    "visual_brief": {
      "type": "object",
      "required": ["silhouette", "color", "sheen", "pattern", "anchors"],
      "properties": {
        "silhouette": {"type": "object", "properties": {
          "shape": {"type": "string", "description": "e.g. column, A-line, fit and flare"},
          "structure": {"type": "string", "description": "e.g. boned bodice, unstructured"},
          "drape": {"enum": ["rigid", "soft", "fluid"]},
          "waist": {"type": "string"},
          "length": {"type": "string"}}},
        "color": {"type": "object", "properties": {
          "primary": {"type": "string"},
          "acceptable_shades": {"type": "array", "items": {"type": "string"}},
          "dealbreaker_shades": {"type": "array", "items": {"type": "string"}}}},
        "sheen": {"enum": ["matte", "soft sheen", "satin", "metallic", "textured"]},
        "pattern": {"type": "object", "properties": {
          "kind": {"type": "string", "description": "solid, jacquard, floral print, and so on"},
          "scale": {"enum": ["none", "small", "medium", "large"]}}},
        "anchors": {
          "type": "array", "minItems": 2, "maxItems": 3,
          "items": {"type": "object", "required": ["id", "label", "dealbreaker"], "properties": {
            "id": {"type": "string", "description": "short slug, e.g. off-shoulder"},
            "label": {"type": "string", "description": "plain words a friend recognizes"},
            "dealbreaker": {"type": "boolean"}}}
        }
      }
    },
    "composition_brief": {
      "type": "object",
      "required": ["target_fabrics", "acceptable_swaps", "dealbreakers"],
      "properties": {
        "target_fabrics": {"type": "array", "items": {"type": "string"}},
        "acceptable_swaps": {"type": "array", "items": {"type": "string"}},
        "dealbreakers": {"type": "array", "items": {"type": "string"}},
        "lining": {"enum": ["required", "preferred", "not needed"]},
        "stretch_tolerance": {"type": "string", "description": "e.g. rigid only, up to 5% elastane"},
        "closure": {"type": "string"}
      }
    },
    "search_queries": {
      "type": "object",
      "required": ["exact", "look_alike", "peer_brands"],
      "properties": {
        "exact": {"type": "array", "maxItems": 3, "items": {"type": "string"}},
        "look_alike": {"type": "array", "maxItems": 4, "items": {"type": "string"}},
        "lens_hint": {"type": "string", "description": "3 to 6 words sent with the photo to Google Lens"},
        "peer_brands": {"type": "array", "maxItems": 4, "items": {"type": "object", "properties": {
          "brand": {"type": "string"},
          "query": {"type": "string"}}}}
      }
    }
  }
}
```

**System prompt:**

```text
You write the search brief for Dupe Dupe, which finds affordable dupes and secondhand matches for a higher-end garment.

Read every source you are given: listing text, the shopper's notes, photos and, if present, the shopper's edited fields. Edited fields are final; never contradict them.

Rules for item fields:
- Report only what a source states or a photo clearly shows. Use "" or [] when unknown.
- Copy composition exactly as written. Never estimate a fiber percentage.
- Use only the allowed values for category, fit_style and stretch.

Rules for the visual brief:
- Anchors are the 2 or 3 details that make this piece recognizable. A dupe that misses them is a generic garment, not this one. Prefer specific construction ("fold-over off-shoulder band", "boned bodice") over general traits ("red", "long").
- Mark an anchor as a dealbreaker only if the piece would read as a different garment without it.
- List sister shades a shopper would accept, and undertones that would read as a different color.

Rules for the composition brief:
- Target fabrics: the original's fiber and weave, or fabrics that drape and wear the same way.
- Acceptable swaps: cheaper fabrics that keep the look and structure.
- Dealbreakers: fabrics that would make it look or wear cheap for this piece, such as thin jersey for a structured gown.

Rules for search queries:
- Write queries the way resale sellers title listings: 2 to 6 words, brand first when known.
- exact: brand plus style name, and brand plus color and fabric.
- look_alike: construction, fabric and silhouette words, no brand.
- peer_brands: labels similar in style and price. Never claim they share a factory or made this item.

Apply the shopper's taste rules below when choosing anchors and dealbreakers. A rule marked dealbreaker becomes a dealbreaker anchor or fabric where it applies.

Shopper's taste rules:
{{taste_rules}}

Call submit_brief exactly once.
```

### Judge

Runs on `ANTHROPIC_JUDGE_MODEL` (Sonnet 5.5), 5 candidates per call. The judge fills a checklist; **it never gives scores or verdicts.** Code computes those.

**Inputs:** the original photo, the visual and composition briefs, the friend's taste rules, and for each candidate: its photo, title, source, price, size, color and enriched listing text.

**Tool:** `submit_checklists`

```json
{
  "type": "object",
  "required": ["checklists"],
  "properties": {
    "checklists": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["candidate_id", "anchors", "color", "silhouette", "neckline", "sleeves", "length", "sheen", "fabric_tier", "biggest_difference", "confidence"],
        "properties": {
          "candidate_id": {"type": "string"},
          "anchors": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "string"},
            "result": {"enum": ["pass", "partial", "fail", "cannot_see"]}}}},
          "color": {"enum": ["match", "close", "different"]},
          "silhouette": {"enum": ["match", "close", "different"]},
          "neckline": {"enum": ["match", "close", "different", "not_applicable"]},
          "sleeves": {"enum": ["match", "close", "different", "not_applicable"]},
          "length": {"enum": ["match", "close", "different", "not_applicable"]},
          "sheen": {"enum": ["match", "close", "different"]},
          "polish": {"enum": ["as_polished", "slightly_less", "looks_cheap"], "description": "Would it pass for the original's quality: fabric weight and drape, finish, construction"},
          "fabric_tier": {"enum": ["target", "acceptable_swap", "dealbreaker", "unknown"]},
          "fabric_evidence": {"type": "string", "description": "The exact words from the listing, or empty"},
          "size_available": {"enum": ["yes", "no", "unknown"]},
          "stock_photo_suspected": {"type": "boolean"},
          "biggest_difference": {"type": "string", "description": "One plain sentence"},
          "confidence": {"enum": ["high", "medium", "low"]}
        }
      }
    }
  }
}
```

**System prompt:**

```text
You are the strict, independent quality checker for Dupe Dupe. Another agent chose these candidates and tends to be generous. Your job is to protect the shopper from weak matches by answering a checklist honestly. You do not score or approve anything.

The first image is the ORIGINAL. Each later image belongs to the candidate named beside it. Compare each candidate to the original and to the briefs.

For every candidate:
- anchors: judge each anchor in the visual brief. pass = clearly present; partial = present but changed; fail = absent; cannot_see = the photo doesn't show that part.
- color, silhouette, neckline, sleeves, length, sheen: match, close or different. "close" means a shopper would accept it without being told. Use the brief's acceptable and dealbreaker shades for color.
- fabric_tier: place the fabric using ONLY words in the listing text. Quote them in fabric_evidence. If the listing doesn't state the fabric, answer unknown. Never infer fabric from the photo alone.
- size_available: from the listing's sizes, compared with the shopper's sizes.
- polish: would a shopper believe it cost about what the original did? Judge fabric weight and drape, finish (seams, lining, hardware) and construction from the photo and listing. as_polished, slightly_less, or looks_cheap.
- stock_photo_suspected: true if the candidate's photo appears to be the original brand's own product image rather than a photo of this item.
- biggest_difference: one plain sentence a shopper would understand.
- confidence: low when the photo is small, cropped or unclear, or the listing says little.

Apply the shopper's taste rules below when deciding what counts as close.

Shopper's taste rules:
{{taste_rules}}

Call submit_checklists exactly once, with one checklist per candidate.
```

### Scoring and verdicts (code, not AI)

Starting weights, before a friend's taste profile adjusts them. Each weight stays between 0.5 and 3.

| Checklist item | Counts toward | Starting weight |
| --- | --- | --- |
| Each anchor | Look | 3 |
| Color | Look | 2 |
| Silhouette | Look | 2 |
| Neckline | Look | 1.5 |
| Length | Look | 1 |
| Sleeves | Look | 1 |
| Sheen | Look and fit | 1 |
| Polish (looks as high end as the original; Maggie, Nov 15) | Look | 2 |
| Fabric tier | Fit | 3 |
| Size available | Fit | 1.5 |

Points per answer: match or pass = 1, close or partial = 0.5, different or fail = 0. Fabric tier: target = 1, acceptable swap = 0.6, unknown = 0.5, dealbreaker = 0. Size: yes = 1, unknown = 0.5, no = 0. `not_applicable` and `cannot_see` are left out of the total. **Look score** and **fit score** = weighted points ÷ weighted maximum × 100, rounded.

**Verdict rules, in order:**

1. **Rejected** if any dealbreaker anchor is `fail`, the fabric tier is `dealbreaker`, or the look score is under 40.
2. **Approved with caveat** if any anchor is `partial`, color is `close` or `different`, the fabric tier is `acceptable_swap` or `unknown`, size is `unknown`, or a stock photo is suspected. The caveat text names each one in a few words: "Neckline differs", "Poly blend, not silk", "Ask the seller for the fabric tag", "Different color", "Confirm it's the actual item".
3. **Approved** otherwise.

Low confidence never changes the verdict, but it shows on the card. These rules run on saved checklists, so changing a weight re-scores old searches without calling the judge again.

### Still to write

The two screeners and the taste summarizer follow the same pattern: one tool, a fixed schema, and a prompt that ends with the friend's taste rules. Write them in phases 3 and 7, starting from the prototype's prompts.

## Sources

- [Dupe Dupe prototype](https://claude.ai/artifact/H3QkMj1mQk95LN9ZvfmxxU), the prompts and behavior reference
- [Dupe Dupe design canvas](https://claude.ai/artifact/2aw46RbpRht5RgvvCBLHid), the look reference (copied into `design/screens/`)
- [Dupe Dupe Cost Model](https://claude.ai/artifact/DfhDFDJQnVTeAcHGuFcPhz)
- [SerpApi Google Lens API](https://serpapi.com/google-lens-api): parameters, image upload, visual matches fields, products type discontinued
- [SerpApi plans, CostBench](https://www.costbench.com/software/web-scraping/serpapi/)
- [Claude API pricing, BenchLM](https://benchlm.ai/anthropic/api-pricing)
- [TinyFish free Search and Fetch](https://www.testingcatalog.com/tinyfish-makes-search-and-fetch-apis-free-for-all-developers/)
- [Vercel functions can now run up to 30 minutes](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes)
- [Vercel pricing](https://vercel.com/pricing)
- [Supabase pricing, Budgetforge](https://www.budgetforge.dev/tools/supabase-pricing-2026)
- [eBay Browse API overview](https://www.developer.ebay.com/api-docs/buy/browse/static/overview.html) and [Free eBay API in 2026](https://apiserpent.com/blog/free-ebay-api): 5,000 calls a day, production access through partner approval
- [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview)

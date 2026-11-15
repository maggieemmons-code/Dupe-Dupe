# Dupe Dupe

A private, invite-only web app for Maggie and up to 20 friends. A friend drops in a piece they love (link, typed text or photos) and gets new dupes under budget plus secondhand matches, judged on look and fit.

- **`PLAN.md` is the source of truth** for scope, pipeline, data model, screens, guardrails and the agent prompts. Read the relevant section before starting any phase.
- **`DESIGN.md` is the look reference** (black and white, light by default with a dark option). The screens it describes are in `design/screens/`; read the matching file before building a screen.
- **`prototype.html` is the prompts and behavior reference.** Reuse its prompts and interaction details unless `PLAN.md` or `DESIGN.md` says otherwise. Its swing-tag look is retired.
- Maggie is a first-time builder. She doesn't write code; she reads plans and tests on her phone.

## Current phase: 3 (Lens and new dupes)

**Builds:** Inngest job with a step per stage and status updates, SerpApi Lens and Shopping, the `candidates` table with stage tracking, cleaning step with size filter and duplicate merging, new-items screener with thumbnails (Haiku, `ANTHROPIC_FAST_MODEL`), result cards with photos (`design/screens/Results.dc.html`, `Card.dc.html`), and the `/go` click route that logs every outbound click.

**Done when:** a Sau Lee search shows at least 6 new candidates with photos and real prices.

**Needs before coding:** an Inngest account and its keys (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, plus connecting Inngest to the Vercel project), and a SerpApi key (`SERPAPI_API_KEY`) with usage alerts on. Maggie pastes key values into `.env.local` and Vercel herself; Vercel only picks up changed settings on the next deployment.

**Status (Nov 14):** built and passing on Maggie's Mac (Sau Lee: 9 shown, 7 with live prices, all with photos). Added at her request: Amazon as a source, and Shop buttons that look up the store's own page for Google Shopping results. Waiting on the live-site check after push. Details in `NOTES.md` › Phase 3.

**Watch for:** Claude Sonnet 5.5 and Haiku 5.5 behavior with tools is in `NOTES.md` › Phase 2 (no forced `tool_choice`; large schemas can't use strict mode). Lens takes the search's first photo by a 10-minute signed link; link-only searches now have product photos saved from the page.

**Phase 2 passed on 2026-11-15:** on the live site, the Sau Lee link (https://www.sau-lee.com/products/joanna-gown-red-date) fills in 100% polyester jacquard, true to size, $750, the product photos, and anchors covering the off-shoulder neckline, red jacquard and the structured (boned) bodice. Changes Maggie asked for along the way: every detail is a pick from a list (`lib/fields.ts`), stretch is inferred from fabric, product photos on the link are read, Review order is original → Search for → The details (Signature details first, each rewordable). Details in `NOTES.md` › Phase 2.

**Phase 1 passed on 2026-11-14:** 5 test invites (Gmail `+test1`–`+test5`) arrived in the inbox fast, and an uninvited email was turned away by the database's "Before User Created" hook. Supabase sends email through Resend as `login@dupedupe.studio` ("Dupe Dupe"). Invites are added in Supabase's SQL Editor for now (`insert into public.invites (email) values (...)`); the usage screen for invites comes in Phase 8. Database changes go in `supabase/migrations/` as numbered files that Maggie pastes into the SQL Editor.

**Phase 0 passed on 2026-11-14:** "Hello Dupe Dupe" loads at https://dupe-dupe.vercel.app. Repo: https://github.com/maggieemmons-code/Dupe-Dupe (Vercel deploys from `main` on every push). Domain: **dupedupe.studio**, registered at Squarespace (DNS on Squarespace's nameservers), so Resend's DNS records and any Vercel domain records are added in Squarespace's DNS settings. Still open from Phase 0: send the eBay Partner Network application, open the other accounts in `PLAN.md` › Stack and accounts.

**Uploading:** `gh` lives at `~/.local/bin/gh` (not on PATH). Claude's auto mode has blocked `git push`, so Maggie runs `cd ~/Documents/"Dupe Dupe" && git push` in Terminal unless she adds a permission for it.

Update this section when a phase's check passes. Phases and their "Done when" checks are in `PLAN.md` › Build phases. Don't start a phase until the one before passes.

## Rules

- Work one phase at a time, and stop when the phase's check passes.
- Plan before writing code, and wait for Maggie's yes.
- Read Claude model IDs from settings (`ANTHROPIC_FAST_MODEL`, `ANTHROPIC_JUDGE_MODEL`); never type them into code.
- Never put an API key in code or in a commit. Keys go in `.env.local` (git-ignored) and in Vercel's environment variables. No key ever reaches the browser.
- Commit to GitHub after each working step, with a plain-English message.
- At the end of each step, explain what changed in plain words and how to test it (on her phone where it applies).
- Use the prototype's prompts and behavior and `DESIGN.md`'s look, unless the plan says otherwise.
- When Maggie has to do something in GitHub, Vercel, Supabase or any other website, give exact click-by-click steps. Look up the exact page or direct download link yourself and give it to her, name the button or file to expect, and say what to ignore. Her Mac has an Apple chip (arm64).
- Record decisions and gotchas in `NOTES.md` so later sessions don't repeat mistakes.

## Stack

| Piece | Choice |
| --- | --- |
| App | Next.js 16 (TypeScript), App Router, plain CSS (no Tailwind), no `src/` folder; pages and server code in one codebase. Check `node_modules/next/dist/docs/` (see `AGENTS.md`) before using an unfamiliar Next.js API |
| Hosting | Vercel (deploys from GitHub) |
| Background jobs | Inngest, one step per search stage (from phase 3) |
| Logins, database, photos | Supabase: email-link sign-in, Postgres with row-level security, private Storage, Realtime |
| Sign-in emails | Resend on Maggie's domain, set as Supabase's sender (phase 1) |
| Visual search, new items | SerpApi: Google Lens and Google Shopping |
| Resale page reading | TinyFish Fetch API |
| eBay | eBay Browse API (TinyFish reads eBay pages until approved) |
| AI agents | Claude API with tool use and fixed JSON schemas: Haiku 5.5 (screeners, taste summarizer), Sonnet 5.5 (brief builder, judge) |
| Errors | Sentry free plan |
| Code | Private GitHub repo |

## Architecture rules that hold in every phase

- The browser only shows screens. All calls to outside services run on the server with server-side keys.
- Every server route checks who is signed in, and their daily cap, before calling any paid service.
- Row-level security is on for every table; each friend reads and writes only their own rows.
- Agents answer through one tool call matching a fixed schema. Agents fill checklists; **code** computes scores and verdicts.
- Never invent a price or a link. Every result link must come from a source, not from an agent.
- Affiliate code lives in one module that only the `/go` route may import. Agents never see commission data.
- Every external call writes a row to `api_calls`.

## Look and feel (from `DESIGN.md`)

- Phones first (designed at 390px wide). Black and white; color comes only from product photos and color dots.
- Light by default; dark is a friend's choice in the menu, saved in `profiles.theme`, not taken from the phone's setting.
- Fonts: Inter Tight (display, titles, wordmark), Inter (body), JetBrains Mono (labels, eyebrows, prices, scores, sizes).
- Pill buttons, chips and inputs; 22–28px card corners; 44px minimum tap targets; bottom nav with Swipe, Find, Saved and Your eye.
- Product photos sit in a light gray tile with `mix-blend-mode: multiply` so photos from different sites look like one catalog.
- Show only data a source provides; `DESIGN.md` › Data on screen lists each field and what to show when it's missing.
- Behavior lessons to keep: a save button never also runs a search; feedback boxes close after Save and show a one-line summary with a Change link; every card shows brand, color and size together and flags a different color; prices that aren't live are labeled estimates or left out; look and fit scores are always shown separately.

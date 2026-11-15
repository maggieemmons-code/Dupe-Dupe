# Dupe Dupe

A private, invite-only web app for Maggie and up to 20 friends. A friend drops in a piece they love (link, typed text or photos) and gets new dupes under budget plus secondhand matches, judged on look and fit.

- **`PLAN.md` is the source of truth** for scope, pipeline, data model, screens, guardrails and the agent prompts. Read the relevant section before starting any phase.
- **`prototype.html` is the look and behavior reference.** Reuse its prompts, palette, type, swing-tag look and interaction details unless `PLAN.md` says otherwise.
- Maggie is a first-time builder. She doesn't write code; she reads plans and tests on her phone.

## Current phase: 0 (Setup)

**Builds:** accounts opened, domain bought, eBay Partner Network application sent, empty Next.js app in a private GitHub repo, deployed to Vercel, `CLAUDE.md` written.

**Done when:** a "Hello Dupe Dupe" page loads at the Vercel link.

Update this section when a phase's check passes. Phases and their "Done when" checks are in `PLAN.md` › Build phases. Don't start a phase until the one before passes.

## Rules

- Work one phase at a time, and stop when the phase's check passes.
- Plan before writing code, and wait for Maggie's yes.
- Read Claude model IDs from settings (`ANTHROPIC_FAST_MODEL`, `ANTHROPIC_JUDGE_MODEL`); never type them into code.
- Never put an API key in code or in a commit. Keys go in `.env.local` (git-ignored) and in Vercel's environment variables. No key ever reaches the browser.
- Commit to GitHub after each working step, with a plain-English message.
- At the end of each step, explain what changed in plain words and how to test it (on her phone where it applies).
- Use the prototype's prompts, look and behavior unless the plan says otherwise.
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

## Look and feel (from `prototype.html`)

- Phones first. Swing-tag cards, ticket-stub stepper, dashed borders, 3–4px radii.
- Fonts: Oswald (display, uppercase headings and buttons), Work Sans (body), JetBrains Mono (labels, eyebrows, prices).
- Light palette: paper `#F6F4EF`, card `#FFFFFF`, ink `#1D1C1A`, muted `#857E74`, line `#E2DCD1`, sage `#6F7E61` / `#EBEFE6`, clay `#B8653F` / `#F5E9E1`, warn `#9A3B2B`. Dark palette is in the prototype's `:root` rules; support both.
- Behavior lessons to keep: a save button never also runs a search; feedback boxes close after Save and show a one-line summary with a Change link; every card shows brand, color and size together and flags a different color; prices that aren't live are labeled estimates or left out.

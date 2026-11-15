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

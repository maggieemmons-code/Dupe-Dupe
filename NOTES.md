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


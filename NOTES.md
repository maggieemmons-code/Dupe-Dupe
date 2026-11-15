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

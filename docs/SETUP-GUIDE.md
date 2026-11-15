# How Dupe Dupe was set up, and how to set up the next app

Written Nov 15, 2026, from what actually happened building Dupe Dupe (phases 0 to 4). Part 1 is the map: which tools we used and how they connect. Part 2 is the step-by-step order for a new app. Part 3 is the mistakes we made, so the next app skips them.

You don't need to write code for any of this. Claude Code writes and changes the code; you open accounts, paste keys, paste database files and test on your phone.

---

## Part 1: The map

### What each tool does

| Tool | What it does for the app | Cost for Dupe Dupe | Where to manage it |
| --- | --- | --- | --- |
| **GitHub** | Keeps the code and its full history. Every change is a "commit"; "push" uploads commits. | Free | https://github.com/maggieemmons-code/Dupe-Dupe |
| **Vercel** | Turns the code into the live website. Every push to GitHub's `main` branch makes a new version go live in about 2 minutes. Holds the server's secret keys. | Free (Pro $20/month once the app earns money) | https://vercel.com/dashboard |
| **Supabase** | The database (searches, results, profiles), email-link sign-in, private photo storage, and the live updates that make result cards pop in. | Free (Pro $25/month if it needs to stay awake) | https://supabase.com/dashboard |
| **Resend** | Sends the sign-in emails from your own domain, so they reach the inbox, not spam. Supabase sends through it. | Free | https://resend.com |
| **Domain** (dupedupe.studio at Squarespace) | Your address. Needed for Resend; can also be the website's address. DNS records are set at the registrar. | About $15/year | Squarespace › Domains |
| **Anthropic Console** | The Claude API key the app uses for its AI helpers (reading a product, screening, judging). Separate from a Claude subscription. | Pay as you go, about $0.10–0.15 a search | https://platform.claude.com |
| **TinyFish** | Reads web pages (product pages for the brief builder). | Free tier | https://agent.tinyfish.ai |
| **SerpApi** | Google Lens, Google Shopping and Amazon results, and product lookups. | Starter $25/month (1,000 searches) | https://serpapi.com/dashboard |
| **Inngest** | Runs each search in the background, one step at a time, retrying a failed step without repeating paid ones. | Free | https://app.inngest.com |
| **Claude Code** | Writes the code, runs tests on your Mac, commits, and tells you what to click. | Your Claude plan | This app |

Still to come for Dupe Dupe: eBay Developers (phase 5), Sentry for error emails (phase 8).

### How they connect

```
Your phone ──► Vercel (the website + server code) ──► Supabase (database, sign-in, photos)
                    │                                     ▲
                    │ starts a search                     │ live updates to the phone
                    ▼                                     │
                 Inngest ──► runs each step on Vercel ────┘
                                  │
                                  ├─► SerpApi (Lens, Shopping, Amazon, lookups)
                                  ├─► TinyFish (reads pages)
                                  └─► Anthropic (Claude: brief builder, screener, judge)

Supabase ──► Resend ──► sign-in emails from your domain
GitHub ──► Vercel (every push to main goes live) ──► GitHub automation re-registers with Inngest
```

### Where keys live (and never live)

- **Keys go in two places only:** `.env.local` on your Mac (for testing; git never uploads it) and Vercel › Settings › Environment Variables (for the live site).
- **Never in chat, never in code, never in a commit.** You paste them yourself.
- **Never in the browser.** Only names starting with `NEXT_PUBLIC_` reach the phone, and only harmless ones (the Supabase address and its *publishable* key) start that way.
- **Vercel only picks up a changed key on the next deployment.** Pushing new code makes one; so does Deployments › ⋯ › Redeploy.
- `.env.example` in the project lists every key name with no values: a checklist for a new setup.

Dupe Dupe's keys:

| Name | From | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Connect › App Frameworks › Next.js | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same place (starts `sb_publishable_`) | No |
| `SUPABASE_SECRET_KEY` | Supabase › Project Settings › API Keys › **Secret keys** box (starts `sb_secret_`) | **Yes** |
| `ANTHROPIC_API_KEY` | https://platform.claude.com/settings/keys | **Yes** |
| `ANTHROPIC_FAST_MODEL`, `ANTHROPIC_JUDGE_MODEL` | Model names (not secret) | No |
| `TINYFISH_API_KEY` | https://agent.tinyfish.ai/api-keys | **Yes** |
| `SERPAPI_API_KEY` | https://serpapi.com/dashboard | **Yes** |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Set in Vercel automatically by the Inngest integration | **Yes** |
| `INNGEST_DEV=1` | On your Mac only, so tests use Inngest's practice server | No |

### The project's own guide files

| File | What it's for |
| --- | --- |
| `PLAN.md` | The source of truth: goals, the build phases and their "done when" checks, the data model, guardrails |
| `CLAUDE.md` | Rules and the current phase, which every Claude Code session reads first |
| `DESIGN.md` + `design/screens/` | The look |
| `NOTES.md` | Decisions and gotchas, so later sessions don't repeat mistakes |
| `supabase/migrations/` | Numbered database files you paste into Supabase, in order |
| `docs/SETUP-GUIDE.md` | This guide |

---

## Part 2: Setting up a new app, step by step

Do these in order. Each phase ends with something you can open on your phone. Don't start the next one until the last one works.

### Step 0. Write the plan first (before any accounts)

1. In a Claude chat, describe the app: who it's for, what a person does, what "working" looks like.
2. Ask for a `PLAN.md` with: goals, scope, the screens, the data it stores, the outside services and their monthly cost, guardrails (daily limits, spending stops), and **build phases, each with a "done when" check you can test on your phone**.
3. Ask for a `CLAUDE.md` with the rules from Dupe Dupe's (one phase at a time, plan before code and wait for your yes, keys never in code, commit after each working step, explain each step in plain words with exact clicks).
4. If the look matters, make a `DESIGN.md` and screen mockups before building screens.

### Step 1. Get your Mac ready (once; already done on this Mac)

1. **Git.** Apple's Command Line Tools. The `xcode-select --install` pop-up didn't finish for us; the manual download worked: https://developer.apple.com/download/all (search "Command Line Tools", pick the newest, run the installer).
2. **Node.js.** The LTS installer for macOS from https://nodejs.org (your Mac has an Apple chip, so pick the arm64 or "macOS Installer" option).
3. **GitHub's command-line tool** is at `~/.local/bin/gh` on this Mac.
4. **Pushing:** Claude Code's auto mode blocks `git push`, so you run it in Terminal: `cd ~/Documents/"Your App" && git push`.

### Step 2. Open the accounts

Open them all at the start, so building isn't stuck waiting. For each, use the same email and turn on two-factor sign-in where offered.

1. **GitHub:** https://github.com/signup
2. **Vercel:** https://vercel.com/signup → choose **Continue with GitHub** so the two are connected.
3. **Supabase:** https://supabase.com/dashboard/sign-up (sign in with GitHub works).
4. **Domain:** any registrar. We used Squarespace. Pick a short name friends remember.
5. **Resend:** https://resend.com/signup
6. **Anthropic Console:** https://platform.claude.com → set a **monthly spend limit** under Billing straight away.
7. Any data services the plan needs (for Dupe Dupe: TinyFish, SerpApi, eBay Developers). For SerpApi, start on **Free** and upgrade when testing needs it; keep **Automatic Early Renewal** off at https://serpapi.com/plan so running out never charges you.

### Step 3. Phase 0: an empty app that's live

Claude Code does most of this; your part:

1. In GitHub, create an empty **private** repository: https://github.com/new → name it → **Private** → **Create repository**.
2. Claude Code makes the empty Next.js app with a "Hello" page, connects it to the repository, commits, and gives you the push line. Run it in Terminal.
3. In Vercel: https://vercel.com/new → find the repository under **Import Git Repository** → **Import** → leave the settings as they are → **Deploy**.
4. **Done when:** the Hello page opens at the `.vercel.app` address on your phone.

### Step 4. Phase 1: sign-in

1. **Supabase project:** https://supabase.com/dashboard/new → name it, choose a strong database password (save it in your password manager), pick the region nearest you → **Create new project**.
2. **Keys to `.env.local` and Vercel:** Supabase's **Connect** button (top of the project) › **App Frameworks** › **Next.js** shows the URL and publishable key. Paste both into `.env.local` and into Vercel › your project › **Settings** › **Environment Variables**.
3. **Database:** Claude Code writes `supabase/migrations/0001_….sql`. Copy it with `pbcopy < ~/Documents/"Your App"/supabase/migrations/0001_….sql` **in Terminal**, then open https://supabase.com/dashboard/project/_/sql/new, press ⌘V and click **Run**.
4. **Emails from your domain (Resend):**
   1. https://resend.com/domains → **Add Domain** → your domain.
   2. Resend shows DNS records (DKIM, SPF on a `send.` subdomain, optionally DMARC). Add each one exactly at your registrar's DNS settings (for us: Squarespace › Domains › the domain › DNS). Wait for Resend to say **Verified**.
   3. https://resend.com/api-keys → **Create API Key** (sending access). This is the SMTP password in the next step; paste it straight into Supabase, not into chat.
   4. In Supabase: **Authentication** › **Emails** › **SMTP Settings** → turn on custom SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = the Resend key, sender `login@yourdomain` with your app's name.
5. **Sign-in links that work across devices:** in Supabase **Authentication** › **Emails**, change the sign-in template's link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` (Claude Code gives the exact text). In **Authentication** › **URL Configuration**, set the Site URL to the live address and add it under Redirect URLs.
6. **Invite-only:** the database file adds a "Before User Created" function; turn it on in **Authentication** › **Hooks** (Claude Code names the function). Add invites with `insert into public.invites (email) values ('friend@example.com');` in the SQL Editor.
7. **Done when:** test invites (Gmail lets you use `you+test1@gmail.com`, `+test2`…) arrive in the inbox within 2 minutes, and an uninvited email is turned away.

### Step 5. Each later phase

The same loop every time:

1. Claude Code reads the phase in `PLAN.md`, lists which accounts and keys it needs, and gives you a plain plan. **Say yes or change it.**
2. You open any new accounts and paste keys (see "Adding a key" below).
3. Claude Code builds, runs the tests, and tries it on your Mac. It writes numbered database files when tables change; you paste them into Supabase **before** pushing.
4. You push. Vercel deploys in about 2 minutes (Deployments tab says **Ready**).
5. You test on your phone. When the phase's "done when" check passes, Claude Code marks it done in `CLAUDE.md` and records decisions in `NOTES.md`.

### Adding a key (the safe way)

1. Copy the key from the service's page.
2. In Terminal, run the line Claude Code gives you. It looks like this (with the key's name):

   ```bash
   cd ~/Documents/"Your App" && read -rs "K?Paste the key, then press Return: " && sed -i '' '/^KEY_NAME=/d' .env.local && echo "KEY_NAME=$K" >> .env.local && unset K && echo && echo "Saved."
   ```

   **Press ⌘V once.** Nothing appears while you paste; that's normal. Then Return.
3. In Vercel: **Settings** › **Environment Variables** › **Add New** → name, paste, all environments → **Save**. To fix one: **⋯** › **Edit**.
4. Ask Claude Code to check it. It has a script that tests keys without showing them.

### Background jobs (Inngest), when the app needs them

1. https://vercel.com/marketplace/inngest → **Install** → free plan → connect only your project. This puts `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Vercel for you.
2. Make sure the app is listed at https://app.inngest.com › **Apps** after the first deploy. If not, Claude Code registers it (`curl -X PUT https://your-app.vercel.app/api/inngest`).
3. Copy Dupe Dupe's `.github/workflows/inngest-sync.yml` into the new project: it re-registers the app after every deploy, which the Vercel integration didn't do on its own.

---

## Part 3: Mistakes we made, so you don't

- **Pasting a key three times.** Nothing shows while pasting in Terminal, so it's easy to press ⌘V again. Press it once.
- **Copying the wrong Supabase key.** The API Keys page has the *publishable* key in the top box; the *secret* key is in the **Secret keys** box below it and starts with `sb_secret_`. With the wrong one, background searches quietly did nothing.
- **A key that works on the Mac but not live.** Twice the value in Vercel was off. If something works on your Mac but not on the site, re-paste the key in Vercel, then redeploy.
- **Pasting a Terminal command into Supabase.** Commands starting with `cd` or `pbcopy` go in Terminal; only the file's contents go in the SQL Editor.
- **Pushing before the database file.** New code that expects a new table breaks the live site until the file is run. Paste database files first, then push.
- **Forgetting Vercel needs a new deployment** to pick up a changed key.
- **The Vercel–Inngest connection didn't re-register new versions.** Fixed with the GitHub automation above.
- **Free page readers are blocked by big stores** (Revolve, Nordstrom, Google). Paid lookups (SerpApi) worked where free reads didn't; check this early for any app that reads other sites.
- **Costs creep with quality.** Each extra search source or lookup is a paid call. Decide on purpose, write the per-search cost in `PLAN.md`, and set spend limits and alerts on every paid service on day one.

---

## Quick reference: Dupe Dupe's addresses

- Live site: https://dupe-dupe.vercel.app
- Code: https://github.com/maggieemmons-code/Dupe-Dupe
- Domain: dupedupe.studio (DNS at Squarespace)
- Sign-in emails: `login@dupedupe.studio` through Resend
- Database files to paste: `supabase/migrations/0001` to `0007` (all run as of Nov 15)

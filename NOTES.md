# Notes

Decisions and gotchas, so later sessions don't repeat mistakes.

## Phase 0

- Git comes from Apple's Command Line Tools. The `xcode-select --install` pop-up didn't finish on this Mac; the manual download from developer.apple.com/download/all worked. EasyGit (a separate app) does not include git.
- The app was made with `create-next-app` (Next.js 16, TypeScript, App Router, plain CSS, no `src/` folder). Next.js 16 adds an `AGENTS.md` that points to its bundled docs in `node_modules/next/dist/docs/`.
- Fonts load through `next/font/google` (Oswald, Work Sans, JetBrains Mono). Colors are CSS variables in `app/globals.css`, copied from `prototype.html`.

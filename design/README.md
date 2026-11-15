# Design reference files

These are the screens from the Dupe Dupe design canvas (https://claude.ai/artifact/2aw46RbpRht5RgvvCBLHid), copied here so Claude Code can read them. They are reference only: they run inside the canvas's own design tool, not in the app. Read them for layout, sizes, colors, copy and behavior, then build the real screens in Next.js with plain CSS as `DESIGN.md` describes.

Each file is one phone screen (390 pixels wide). Markup and inline styles show the layout; the `<script>` block at the bottom shows the behavior (what each tap does). All product names, prices, sizes and reviews in them are sample data.

| File | Screen | Built in phase |
| --- | --- | --- |
| `screens/SignIn.dc.html` | Sign in | Restyle in 2 |
| `screens/Find.dc.html` | Find (the home screen) | 2 |
| `screens/Review.dc.html` | Review (full scroll) | 2 |
| `screens/Results.dc.html` | Results | 3 and 4 |
| `screens/Detail.dc.html` | Item detail, new item (full scroll) | 3 and 4 |
| `screens/DetailUsed.dc.html` | Item detail, secondhand (shows `Detail.dc.html` with `variant="used"`) | 5 and 6 |
| `screens/Main.dc.html` | Swipe to train | 7 |
| `screens/Saved.dc.html` | Saved | 7 |
| `screens/Taste.dc.html` | Your eye (rules and sizes) | 7 |
| `screens/Card.dc.html` | The swipe card component | 7 |

If the canvas changes, copy the changed screen files here again so the two stay in step.

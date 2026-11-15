# Dupe Dupe Design

Nov 14, 2026 · the look and feel for every screen. It replaces the prototype's swing-tag look. `prototype.html` is still the reference for prompts and behavior.

- **Canvas:** https://claude.ai/artifact/2aw46RbpRht5RgvvCBLHid (Maggie can open it; Claude Code can't)
- **Screen files Claude Code can read:** `design/screens/` (see `design/README.md`)

## Principles

- **Black and white, so the clothes bring the color.** Color appears only in product photos and in the small color dots that name a shade.
- **Product photos come from other sites, so every photo sits in the same light gray tile.** The tile makes mismatched retailer photos look like one catalog (see Image tile).
- **Phones first.** Every screen is designed at 390 pixels wide and must also work on a laptop.
- **Each screen answers one question.** Swipe: gut check. Results: compare. Item detail: decide.
- **Never show what we don't know.** A field with no source stays hidden or says it wasn't found (see Data on screen).

## Theme

Light is the default. Dark is an option a friend turns on in the menu (Appearance: Light or Dark). It does not follow the phone's setting on its own. Save the choice per friend in `profiles.theme`.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#FFFFFF` | `#0A0A0A` | Page background, cards |
| `--ink` | `#0A0A0A` | `#F5F5F5` | Text, primary buttons, active states, icons |
| `--on-ink` | `#FFFFFF` | `#0A0A0A` | Text and icons on `--ink` fills |
| `--surface` | `#F2F2F2` | `#1C1C1C` | Segmented control track, input fields, caveat boxes, size tiles |
| `--surface-2` | `#F6F6F6` | `#161616` | Grouped sections (size block, alert row) |
| `--tile` | `#F3F3F3` | `#F3F3F3` | Image tiles: stays light in dark mode so photos still blend |
| `--line` | `#EDEDED` | `#262626` | Dividers between rows |
| `--border` | `#E5E5E5` | `#2E2E2E` | Icon buttons, inactive chips, cards |
| `--muted` | `#6B6B6B` | `#A3A3A3` | Secondary text, eyebrows, labels |
| `--muted-strong` | `#4A4A4A` | `#C4C4C4` | Meta text that must stay readable |
| `--disabled` | `#9A9A9A` | `#6B6B6B` | Sold-out sizes (also struck through) |
| `--switch-off` | `#D4D4D4` | `#3A3A3A` | Switch track when off |

Every text color must pass 4.5:1 contrast on its background. Never use a gray lighter than `--muted` for text.

## Type

Load all three with `next/font/google`.

| Role | Font | Style |
| --- | --- | --- |
| Display (page titles, card titles, wordmark) | Inter Tight | 700 or 800, tight letter-spacing (-0.03em on big titles) |
| Body (everything else) | Inter | 400, 500, 600 |
| Labels, eyebrows, prices, scores, sizes | JetBrains Mono | 400, 500 |

| Use | Size |
| --- | --- |
| Page title (Find, Your eye, Saved) | 40px, line height 1.02 |
| Review and Sign in titles | 32px and 44px |
| Wordmark "DUPE DUPE" | 15px, 800, letter-spacing 0.34em |
| Screen title in the top bar | 16px, 600 |
| Card title | 21px Inter Tight 700 (swipe), 14px Inter 600 (grid) |
| Body | 14 to 15px |
| Small and meta | 12 to 13px |
| Eyebrow | 11px JetBrains Mono, uppercase, letter-spacing 0.08em |
| Price | JetBrains Mono 500: 24 to 26px on swipe and detail, 15px in grids |

## Shape and spacing

- Page side padding: 20px.
- Corners: pills (fully round) for buttons, chips, inputs and the nav; 22 to 28px for cards and big tiles; 16 to 20px for small tiles; 12px for size chips.
- Spacing steps: 4, 6, 8, 10, 12, 16, 20, 24px.
- Every tap target is at least 44 by 44px.
- Icons: 24px grid, 1.8px stroke, round caps. No emoji anywhere.

## Components

**Buttons.** Primary: black pill, white text, 52 to 56px tall. Secondary: white pill with a 1px black border. Icon button: 44px circle with a `--border` outline. Dashed-border pill for "Add" actions.

**Segmented control.** A `--surface` pill track with a black active segment. Used for New dupes / Secondhand, Side by side / Photos, and All by price / New only / Secondhand.

**Chips.**
- Filter chip: white with a `--border` outline; turns black when active.
- "You go for" tag: black fill, white text, small x to remove.
- "You pass on" tag: white with a light gray border, x to remove.
- Add chip: dashed black border with a plus; tapping turns it into an input. Enter saves, Escape cancels.

**Switch.** 52 by 32px. Black track when on, `--switch-off` when off. Use `role="switch"`.

**Image tile.** A `--tile` box with rounded corners. The product photo sits inside it with `object-fit: contain`, at most 86% of the tile's height, and `mix-blend-mode: multiply`, so white photo backgrounds melt into the gray. A small mono label in a bottom corner names the source: "Image · mango.com".

**Badges on tiles.** "Pre-owned": white with a black border. "Sale": black. "Different color": black, shown whenever the item's color differs from the original. The color pill (white, with a dot and the color name) sits top right on swipe cards.

**Scores.** Always show look and fit separately: "Look 92 · Fit 88" on swipe cards, "L92 · F88" in grids. On the detail page they get two big tiles side by side (Look on black, Fit on `--surface`, the number at 40px JetBrains Mono) and a "See why" button that opens the breakdown: Look into Shape, Color and Details, Fit into Fabric and Size and fit, each a thin black bar out of 100, plus "How we match."

**Verdict and caveat.** "Approved" is a black pill. "Caveat" is a white pill with a black border, followed by the caveat in plain words ("Poly blend, not 100% wool"). In grids, the caveat sits in a `--surface` box with a small warning triangle.

**Size line.** A filled black dot means "Size M · In stock". A hollow dot with muted text means it isn't available in your size ("M sold out · L available").

**Bottom nav.** A black pill floating 20px above the bottom edge, with four icons: Swipe, Find, Saved and Your eye. The active one sits in a white circle. Item detail, Review and Sign in have no nav.

**Frosted pop-up (after a swipe).** White at 78% opacity with a 16px background blur and a soft drop shadow, floating over the bottom of the deck. It shows a thumbnail of the card just swiped with a heart or X badge, then "You passed · What missed?" or "You said yes · What hooked you?", then three reason chips. Picking a reason shrinks it to a one-line summary ("Nope · Price") with a **Change** link, which follows the rule that feedback boxes close after saving and show a summary. The X skips it. The next swipe replaces it.

**Bottom sheet with size dials.** Opens from a size tile over a dimmed page. Each dial is a vertical scroll-snap list with 40px rows and an outlined band in the middle; the size in the band is the one chosen. Dresses and tops get Letter and Number dials, bottoms add Jean waist, shoes get one US size dial with half sizes. Each dial starts with "None". Tapping a size scrolls to it.

**Collapsible section.** A full-width row with a bold 18px title, a one-line summary under it and a chevron that turns when open. Closed by default. The summary must carry anything that changes the decision, such as "Final sale" or the look and fit scores, so nothing important hides behind a tap.

**Sticky buy bar.** On item detail, pinned to the bottom of the screen while the page scrolls: total with shipping on the left, the black "Shop at [store]" button on the right.

## Screens

Ten screens. The canvas shows them in this order.

| Screen | What a friend does there | Phase |
| --- | --- | --- |
| Sign in | Enters email, gets a "Check your inbox" confirmation | Restyle in 2 |
| Find (home) | Three equal ways to start, with an OR divider between each: photo or screenshot, product link, or describe it. Recent searches below. | 2 |
| Review | Order, top to bottom (Maggie, Nov 15): the original; Search for (view, size, budget); then The details, whose first item is the optional, collapsed Signature details section (closed by default; the brief builder's picks apply either way) with Must match switches (the dealbreaker toggle), a tap to reword each one, remove, and Add a detail (a dropdown, with Something else… as a last resort). **Every detail is a pick from a list, never typed** (`lib/fields.ts`): single-choice rows open the phone's own scroll wheel when tapped anywhere on the row, pick-any rows open a bottom sheet of checkable rows. Only brand and item name are typed, retail price uses the number keypad, and the fabric tag is read-only (copied from the source). "Looks right, search" or "Fix details". | 2 |
| Results | The original in a black strip at the top; filters (In my size, All, New, Secondhand, a price cap); sort by look, fit or price; a two-column grid of cards with photo, brand, look and fit, name, price, color, fabric, rating, size line, returns, caveat; an empty state that suggests secondhand | 3 and 4 |
| Item detail, new | Side by side with the original, Save, favorite brand, price and savings, verdict and caveat, sizes, a collapsible Details section (fabric, shipping, returns, care, length, then fit and reviews), Why it matches with big Look and Fit score tiles and a See why button that opens the breakdown and "How we match", sticky buy bar | 3 and 4 |
| Item detail, secondhand | Same layout, with condition, measurements, authenticity, seller, "Final sale" and the seller's fit notes inside Details | 5 and 6 |
| Swipe | A deck of cards from the friend's own results. Right is yes, left is no, info opens the detail page, Save bookmarks. The frosted pop-up asks why. New dupes / Secondhand toggle. | 7 |
| Saved | Bookmarked items with badges (price dropped, back in your size, only 1) and an alerts switch | 7 (alerts after the test) |
| Your eye | Sizes for dresses, tops, bottoms and shoes; "You go for" and "You pass on" rules as tags a friend can add or remove; price sweet spot | 7 |
| Details | The five sections of item fields, edited after a search. Not designed yet: reuse Review's field rows. | 7 |
| Usage (Maggie only) | Searches, returning friends, click-through, ratings, spend. Not designed yet. | 8 |

## Prefill on Review

Every field on Review arrives filled in as well as the app can manage, so most friends only need to glance and tap "Looks right, search."

- **Item fields** come from the brief builder reading the link, the photos and any typed text.
- **Sizes** come from the friend's saved sizes for that category (a gown uses their dress size).
- **Price range** is a two-handle slider from $0 to the original's price (Maggie, Nov 15). The high end starts at the top of the friend's price sweet spot from Your eye, or their last budget; the low end starts at the friend's last floor ($0 the first time); it's never worked out from the original's price, since an expensive original would skew it. Either end can be dragged; the top of the scale means no limit.
- **View** starts at the friend's default view.
- Each field shows a small source tag under its value: **Link**, **Photo**, **Profile**, **Guess** (black, with "Please check" or the reason) or **Missing** (with what adding it would do). A guess is never shown as if it were read from the source.

## Data on screen

The design shows every field a shopper would want, but the app shows only what a source provides. Never fill a gap with a guess.

| Field | Where it comes from | When it's missing |
| --- | --- | --- |
| Price | Google Shopping or the listing | Hide, or label it "Est." if it isn't live |
| "Price checked 2 hrs ago" | Time the price was fetched | Always available |
| Size in stock | Enrichment reads of the top 20 listings (phase 6) | "Size not checked" |
| Fabric | Listing or enrichment | Caveat "Fabric not listed" |
| Rating and review count | Google Shopping, when it has them | Hide |
| Fit notes from reviews | Not in the version 1 pipeline | Hide the fit section |
| Shipping cost and delivery date | Google Shopping or the listing, when stated | Hide |
| Return policy and "Final sale" | The listing, when stated | Hide |
| Condition, measurements, seller, authenticity | Resale page reads (phases 5 and 6) | Hide that row |
| Photo count | The source | Hide |

## Behavior rules

- A save button never also runs a search.
- Feedback boxes close after saving and show a one-line summary with a Change link.
- Every card shows brand, color and size together, and flags a different color.
- Prices that aren't live are labeled estimates, or left out.
- Swiping right or left is a rating. Tapping the info button or Save is not.
- Save is a bookmark, shown as a bookmark icon everywhere. The heart appears only on the swipe deck's "yes" button.
- The affiliate disclosure line appears only once affiliate links are turned on, after the friends test.
- When the swipe deck runs out: "You're caught up. Start a new search to get more."

# AI Deadlines design system

The rules for how the site looks and sounds. Read this before you change `site/style.css`, `site/share.js` (share cards), `functions/og.js` or `lib/deadline.js` (link previews), and update it when a rule changes.

The values below come from `site/style.css` as of 2026-10-14.

**Contrast rule:** text needs at least **4.5:1** against its background (3:1 for text 24 px and up, or 19 px bold and up). Icons and control borders need **3:1**. Check both themes.

## 1. The idea

**A departures board for papers** (chosen 2026-10-14): a sturdy grotesque for words, every countdown, time and count in mono, and a **black board with amber digits** at the top of the page, like the flight-times board at an airport.

- **Palette: Signal** (chosen 2026-10-14). An off-white page and a black hero card. The countdown digits sit on dark tiles, amber normally and orange-red in the last week. In dark mode the page goes near-black and the hero stays a black board.
- `design/palettes.html` is the comparison we chose from (Now, Ink & Paper, Signal, Campus). It's a standalone file, so open it directly in a browser. `design/palettes.css` keeps all three candidates, rebuilt to pass contrast, in case the look is ever revisited.
- The lesson from the palette rounds: changing only the tints made three versions that looked the same. What made them different was giving the **hero card** its own character.

What doesn't change, whatever the look:
- **Glanceable first.** The next deadline and its countdown come before everything else.
- **Colour means a milestone** (section 2), never decoration. Amber is the one exception: it's the board, not a milestone.
- **Honest about certainty.** Estimated, assumed and tentative dates always say so.

## 2. Colour

Design tokens are the CSS variables in `:root`. Always use a token, never a raw hex, so dark mode keeps working. All text tokens below are at least 4.6:1 on `--bg`, `--surface` and `--surface-2` in their theme.

### Base

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--bg` | `#f1efe9` | `#0a0b0d` | Page background (off-white paper / near-black) |
| `--surface` | `#ffffff` | `#131418` | Cards, rows, dialogs |
| `--surface-2` | `#e8e5dd` | `#1b1d22` | Wells: countdown boxes, segmented controls, chips |
| `--text` | `#111111` | `#f5f2ea` | Main text |
| `--muted` | `#57544d` | `#a7a39a` | Secondary text, placeholders |
| `--faint` | `#68645e` | `#8a867c` | Quiet text and icons |
| `--line` | `#dcd8ce` | `#26282e` | Borders and dividers |

### Accent and status

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--accent` | `#e0421b` | `#ff5b2e` | The logo, dots, focus rings. **Too light for small text in light mode.** |
| `--accent-ink` | `#b93716` | `#ff5b2e` | Red-orange **text**, and fills that carry text (Today in the calendar, the primary button, the filter count) |
| `--on-accent` | `#ffffff` | `#0a0b0d` | Text on an `--accent-ink` fill |
| `--warn` | `#855c00` | `#ffb81c` | Estimated, Tentative, "sources differ", closing soon |
| `--ok` | `#1a733f` | `#4cd08a` | Confirmed by two sources |
| `--star` | `#d99a00` | `#ffb81c` | Starred venues. A fill or an icon, never small text |

### Milestone colours

Each milestone group has one colour everywhere: row dots, the calendar, the map, share cards and link previews.

| Group | Token | Light | Dark |
|---|---|---|---|
| Submission | `--g-submission` | `#e0421b` | `#ff5b2e` |
| Reviews / rebuttal | `--g-reviews` | `#b58900` | `#f5c542` |
| Decision | `--g-decision` | `#0a74b8` | `#4cc3ff` |
| Camera-ready | `--g-camera` | `#1f8a4c` | `#4cd08a` |
| Conference | `--g-conference` | `#4a4740` | `#f5f2ea` |
| Other | `--g-other` | `#a29e95` | `#6b6860` |

These are made for **dots and fills**. When one has to be **text** (the day counts in the hero's "Next" chips), mix it 75% with the text colour: `color-mix(in srgb, var(--c) 75%, var(--hero-fg))`.

### Hero (the board)

The hero is black in both themes, so it has its own tokens, and its **own milestone colours** (set on `.hero`) that read on black:

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--hero-bg` | `#0b0c0e` | `#000000` | The board |
| `--hero-fg` | `#f5f2ea` | `#f5f2ea` | Text on the board |
| `--hero-muted` | `#9d998f` | `#9d998f` | Labels on the board |
| `--hero-chip` | `#17191d` | `#131418` | The "Next" chips |
| `--hero-glow` | `#ffb81c` | `#ffb81c` | The soft glow in the top corner |
| `--clock` | `#ffb81c` | `#ffb81c` | Countdown digits |
| `--clock-hot` | `#ff5b2e` | `#ff5b2e` | Countdown digits in the last week (`.hero.urgent`) |
| `--clock-tile` | `#17191d` | `#15161a` | The tile behind each digit pair |

Hero milestone colours: light `--g-submission` #e0421b, `--g-reviews` #b58900, `--g-decision` #0a74b8, `--g-camera` #1f8a4c, `--g-conference` #625f50; dark `--g-submission` #ff5b2e, `--g-reviews` #f5c542, `--g-decision` #4cc3ff, `--g-camera` #4cd08a, `--g-conference` #f5f2ea.

## 3. Type

**Fonts (chosen 2026-10-14):** **Chivo** for words and **Chivo Mono** for numbers. Both are variable fonts (weights 100–900), OFL, and self-hosted in `site/fonts/`. `design/font-options.html` is the comparison we chose from (Inter; Newsreader + Source Sans 3; Chivo + Chivo Mono; Archivo). It's a standalone file, so open it directly in a browser.

| Token | Use for |
|---|---|
| `--sans` | Everything by default |
| `--mono` | The hero clock, row countdown boxes, "Next" chip counts, timeline dates and time-left, calendar day numbers, row times, bucket counts |

**Mono spaces are a full character wide**, so in mono write short units without a space: `2d`, not `2 d`.

Fonts are set in three places. Change all three together, or the share cards and link previews won't match the site:
1. `site/style.css`: the `@font-face` rules and `--sans` / `--mono`, plus the `<link rel="preload">` lines in `site/index.html`.
2. `site/share.js`: `FONT` and `MONO`. Share cards are drawn on a canvas, which only uses fonts that are already loaded, so `refreshCard` loads every weight it draws first.
3. `functions/og.js`: the TTF files it loads (resvg can't read woff2) and the width estimate. There's no text measuring there; Chivo measures at most about 0.6 em per character at 500 and 800 on venue names, and Chivo Mono is exactly 0.6 em.

Numbers that tick or line up use `font-variant-numeric: tabular-nums` (the list is near the top of `style.css`).

### Sizes and weights in use

| Role | Size | Weight |
|---|---|---|
| Hero countdown | `clamp(48px, 13vw, 96px)` | 800 |
| Hero venue name | `clamp(30px, 6vw, 46px)` | 800 |
| Row countdown | 26 | 800 |
| Calendar month | 20 | 750 |
| Brand | 16 | 750 |
| Body | 15 | 400 |
| Small text | 13–14 | 400–600 |
| Labels, badges, ALL-CAPS headings | 11–12.5 | 600–700 |

The CSS uses 22 font sizes and 8 weights, some only half a pixel or 50 weight units apart. When the font changes, settle on a short scale (for example 11, 13, 15, 17, 20, 26 and the two clamps) and four weights (400, 600, 700, 800).

### Countdowns

One unit leads at each stage, and the next smaller unit joins only when it matters. The row box (`cdParts` in `app.js`) stacks the number, its unit under it, then the remainder in small mono below a thin rule:

| Time left | Row box | Compact (timeline) |
|---|---|---|
| 7 days or more | 28 / days | 28d |
| 1 to 7 days | 5 / days / 7h | 5d 7h |
| 1 to 24 hours | 17 / hours / 45m | 17h 45m |
| 1 to 60 minutes | 45 / min / 12s | 45m 12s |
| Under a minute | 42 / sec | 42s |
| Estimated, 60 days or more | ~3 / months | ~3 mo |
| Estimated, 45–60 days | ~50 / days | ~50 d |
| Estimated, under 45 days | TBA / due soon | TBA, due soon |

- **TBA** ("to be announced") means the venue hasn't published the date yet. Not TBD, which would suggest nobody has decided.
- The hero clock always shows all four units (days, hours, min, sec) with full-word labels under the digits.
- Share cards and link previews are still images, so they show one number: days until under a day is left, then hours, then minutes.

## 4. Shape and space

- **Corner radius:** 6 for badges, 8–12 for controls, 14–18 for cards and dialogs, 22 for the hero, pill (999px) for chips.
- **Page width:** 960 px max, 16 px gutter.
- **Breakpoints:** 720, 640 (phone layout: the toolbar stacks and the calendar becomes an agenda list), 480.
- **Shadows:** one soft `--shadow` on cards in light mode, none in dark mode. `--pop-shadow` for popovers.

## 5. Components

- **Hero:** your next deadline. Eyebrow, venue, place, the big clock, the exact time in your zone and in AoE, and a "Next" runway of the following three.
- **Deadline gaps:** a strip that shows how close your starred deadlines are to each other.
- **Toolbar:** milestone focus (segmented), List / Map / Calendar, search, Starred, Areas, Filters.
- **Row:** countdown box, venue and next milestone, badges, star and share. Tap to open the timeline, quick links (template, portal, guidelines) and sources.
- **Badges:** `est` (dashed, Estimated or Assumed), `tent` (Tentative), `ok` (two sources agree), `warn` (sources differ).
- **Calendar:** a month grid with chips on wide screens, an agenda list on phones. Venues with no announced date yet appear under "Expected" as dashed chips.
- **Map:** Leaflet with a Natural Earth basemap, plus a "To be announced" list below it.
- **Dialogs:** Filters, Areas, About, Credits and Share. Each is a bottom sheet on phones.
- **Share cards** (`CARD_THEMES` in `share.js`): **Signal** (default: the black board with amber digits, from `num`), **Paper**, **Aurora** and **Sunset**, in Story (9:16), Square and Wide. Story cards keep content out of the top 14% and bottom 20%, where Stories put their buttons.
- **Link previews** (`/og`, 1200 × 630): the Signal card colours, from `COLORS` in `lib/deadline.js`. The big number is amber (`num`); the glow is the milestone colour on a venue preview and amber on the home and list previews.
- **Browser colours:** `theme-color` in `index.html` and `manifest.webmanifest` use `--bg`. The SVG favicon uses `--accent`. The PNG icons in `site/icons/` still use the older red `#e5484d`, which is close enough that nobody has re-exported them.

## 6. Voice

- **Plain and exact.** "Abstract · Oct 19, 8:59 PM", "Oct 18, 11:59 PM AoE". Show both your time and AoE when they differ.
- **Say how sure we are.** "Estimated", "Assumed", "Tentative", "last held in Seoul". Never guess a location.
- **Credit sources.** Hugging Face's ai-deadlines data and each venue's official page, with a "Report a wrong date" link per source.
- **No hype.** No "never miss a deadline again!", no exclamation marks, no emoji in the interface.

## 7. Accessibility

Researchers check this site on their phones, so these rules matter. They came from an audit on 2026-10-14, which also fixed every problem it found.

### Tap targets

- Every control must have a hit area of at least **44 × 44 px** (Apple's guideline).
- A control can *look* smaller. The "Tap targets" block near the top of `style.css` gives the listed controls an invisible 44 px area centred on them. Add new small controls to that list.
- Keep at least 44 px between the centres of neighbouring controls, so their areas don't overlap. That's why the row's star and share buttons are 40 px with a 4 px gap, and why the calendar header has a 14 px row gap.
- **Rows that scroll sideways clip the hit areas.** Their controls must be 44 px tall themselves (segmented controls: 38 px buttons plus padding), or the row needs padding above and below (the hero's "Next" runway, and the quick links on phones).
- In the map's "To be announced" list, the whole card is the tap target, not just the venue name.
- **Exceptions:** links inside a sentence (WCAG allows these), and the chips inside desktop month-grid cells, which are dense by design. Phones get the agenda list instead, which passes. Tablets wider than 640 px still see the grid.

### Contrast fixes made on 2026-10-14

The first five rows were fixed on the earlier neutral palette, and the same tokens carried over to Signal with new values (section 2). The rest were found after Signal, by the design-brief scripts.

| Problem | Fix |
|---|---|
| Red text in `--accent` (3.4–3.9:1): "Next 7 days", hot row labels, "Not refreshed for N days" | New `--accent-ink` `#bf2a2f` (5.4:1 on `--bg`) |
| White text on `--accent`: Today in the calendar, the primary button, the filter count (3.9:1; 2.9:1 in dark mode) | `--accent-ink` fill with `--on-accent` text (5.9:1 light, 6.6:1 dark) |
| `--warn` `#b8730a` text (3.3–3.8:1): Estimated, Tentative, sources differ | `#8f5600` (5.2–6.0:1) |
| `--ok` `#2b8a3e` text (3.8–4.4:1) | `#1f7535` (5.0–5.8:1) |
| Milestone colours as text in the hero's "Next" chips (3.4–4.5:1) | 75% mix with the text colour (5.1–6.6:1) |
| The search placeholder used the browser default `#757575` (4.0:1 on dark) | `.search input::placeholder` uses `--muted` |
| Past days in the desktop calendar faded chips to 50% opacity (3.5:1) | 70% (4.5:1 or better) |
| The "Sources & corrections" menu opened 6 px below its toggle, covering the toggle's tap area | Opens 13 px below |
| Map "To be announced" cards were 44 px including their 1 px borders, so 42–43 px to tap | 46 px tall |
| "Copy link" is 19.5 px tall, so its 44 px area rounded to 43 | Its hit area is 46 px tall |

### How to check

Use the design-brief skill's scripts (`~/.claude/skills/design-brief/references/contrast-check.js` and `tap-target-check.js`). They also measure placeholders, small icons and the real tappable area via `elementFromPoint`.

**2026-10-14, after Signal:** both themes; List, Calendar and Map; the Filters, Areas, About and Share dialogs; every `<details>` and one row open. At 375 px: 3,022 text elements and 244 controls. At 1100 px: 3,294 text elements and 240 controls. Result: 0 contrast failures, 0 controls under 44 px, 0 overlaps, apart from the exceptions above. Re-run after you add a new colour, component or dialog.

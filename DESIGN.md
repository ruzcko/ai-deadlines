# AI Deadlines design system

The rules for how the site looks and sounds. Read this before you change `site/style.css`, `site/share.js` (share cards), `functions/og.js` or `lib/deadline.js` (link previews), and update it when a rule changes.

The values below come from `site/style.css` as of 2026-10-14.

**Contrast rule:** text needs at least **4.5:1** against its background (3:1 for text 24 px and up, or 19 px bold and up). Icons and control borders need **3:1**. Check both themes.

## 1. The idea

**A departures board for papers** (type chosen 2026-10-14): a sturdy grotesque for words, with every countdown, time and count in mono, like flight times ticking down.

**The palette is still open.** On 2026-10-10 the colours felt like default "vibe-coding" colours. Three candidate palettes are saved in commit `e5b6504` (`palettes.html`). **Signal** suits the departures-board type best:

- **Ink & Paper:** an ink hero on cream, with a vermilion accent.
- **Signal:** a black departures-board hero with amber digit tiles.
- **Campus:** a forest-green hero on cream, with a brick accent.

The lesson from that round: changing only the tints looked the same. What made the candidates different was giving the **hero card** its own character. The hero already reads `--hero-*` and `--clock*` tokens, so a theme is mostly a set of variables.

What doesn't change, whatever the look:
- **Glanceable first.** The next deadline and its countdown come before everything else.
- **Colour means a milestone** (section 2), never decoration.
- **Honest about certainty.** Estimated, assumed and tentative dates always say so.

## 2. Colour

Design tokens are the CSS variables in `:root`. Always use a token, never a raw hex, so dark mode keeps working.

### Base

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--bg` | `#f6f6f3` | `#0d0f13` | Page background |
| `--surface` | `#ffffff` | `#15181d` | Cards, rows, dialogs |
| `--surface-2` | `#efefea` | `#1d2027` | Wells: countdown boxes, segmented controls, chips |
| `--text` | `#121418` | `#eceef2` | Main text |
| `--muted` | `#5f636b` | `#a0a5ae` | Secondary text |
| `--faint` | `#646873` | `#848994` | Quiet text and icons (4.6:1 or better as text, in both themes) |
| `--line` | `#e3e3dd` | `#262a32` | Borders and dividers |

### Accent and status

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--accent` | `#e5484d` | `#ff6369` | The logo, dots, the urgent big countdown, focus rings. **Too light for small text in light mode** (3.6:1). |
| `--accent-ink` | `#bf2a2f` | `#ff6369` | Red **text**, and red fills that carry text (Today in the calendar, the primary button, the filter count) |
| `--on-accent` | `#fff` | `#0d0f13` | Text on an `--accent-ink` fill |
| `--warn` | `#8f5600` | `#f1a10d` | Estimated, Tentative, "sources differ", closing soon |
| `--ok` | `#1f7535` | `#3dd68c` | Confirmed by two sources |
| `--star` | `#f5a524` | same | Starred venues. A fill or an icon, never small text |

### Milestone colours

Each milestone group has one colour everywhere: the hero, row dots, the calendar, the map, share cards and link previews.

| Group | Token | Light | Dark |
|---|---|---|---|
| Submission | `--g-submission` | `#e5484d` | `#ff6369` |
| Reviews / rebuttal | `--g-reviews` | `#8e4ec6` | `#b98cf0` |
| Decision | `--g-decision` | `#0b68cb` | `#52a9ff` |
| Camera-ready | `--g-camera` | `#2b8a3e` | `#3dd68c` |
| Conference | `--g-conference` | `#6f7480` | `#9aa0aa` |
| Other | `--g-other` | `#a8acb3` | `#5c616b` |

These are made for **dots and fills**. When one has to be **text** (the day counts in the hero's "Next" chips), mix it 75% with the text colour: `color-mix(in srgb, var(--c) 75%, var(--hero-fg))`. That darkens it in light mode and lightens it in dark mode, and it passes in both.

### Hero

By default the hero follows the page (`--hero-bg: var(--surface)` and so on). A palette can give it its own character through `--hero-bg`, `--hero-fg`, `--hero-muted`, `--hero-line`, `--hero-chip`, `--hero-glow`, `--clock`, `--clock-hot` and `--clock-tile`.

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
- **Share cards** (`CARD_THEMES` in `share.js`): **Midnight** (default), **Paper**, **Aurora** and **Sunset**, in Story (9:16), Square and Wide. Story cards keep content out of the top 14% and bottom 20%, where Stories put their buttons.
- **Link previews** (`/og`, 1200 × 630): the Midnight colours from `COLORS` in `lib/deadline.js`.

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

| Problem | Fix |
|---|---|
| Red text in `--accent` (3.4–3.9:1): "Next 7 days", hot row labels, "Not refreshed for N days" | New `--accent-ink` `#bf2a2f` (5.4:1 on `--bg`) |
| White text on `--accent`: Today in the calendar, the primary button, the filter count (3.9:1; 2.9:1 in dark mode) | `--accent-ink` fill with `--on-accent` text (5.9:1 light, 6.6:1 dark) |
| `--warn` `#b8730a` text (3.3–3.8:1): Estimated, Tentative, sources differ | `#8f5600` (5.2–6.0:1) |
| `--ok` `#2b8a3e` text (3.8–4.4:1) | `#1f7535` (5.0–5.8:1) |
| Milestone colours as text in the hero's "Next" chips (3.4–4.5:1) | 75% mix with the text colour (5.1–6.6:1) |

### How to check

The audit ran a script in the browser on every visible piece of text: both themes, all three views, every dialog, with every `<details>` and one row open. That's 1,650 elements and 0 failures. It also measured every control's hit area at 375 px and 1100 px, including inside dialogs, clipped by any scrolling row: 0 under 44 px and 0 overlaps, apart from the exceptions above. Re-run checks like these after you add a new colour or component.

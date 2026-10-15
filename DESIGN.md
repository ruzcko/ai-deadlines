# AI Deadlines design system

The rules for how the site looks and sounds. Read this before you change `site/style.css`, `site/share.js` (share cards), `functions/og.js` or `lib/deadline.js` (link previews), and update it when a rule changes.

**Status (2026-10-15):** **Apollo console** is built on the `preview` branch (values below come from `site/style.css` as of 2026-10-15). Section 8's rules and fixes carry over from the Signal build.

**Contrast rule:** text needs at least **4.5:1** against its background (3:1 for text 24 px and up, or 19 px bold and up). Icons and control borders need **3:1**. Check both themes.

## 1. The idea

**The 1969 mission control room** (chosen 2026-10-15). Grey consoles, black screens with plain white characters, and small coloured indicator lamps as the only colour. Your next deadline is a **countdown readout** on a black screen, and each milestone is a **lamp** that lights amber when it's next. It should feel calm, serious and exact, like people who are counting down to something that will happen whether they're ready or not. It should **not** feel like a hacker terminal (no green-on-black), a sci-fi film (no glows, no cyan) or an AI-built dashboard (no purple, no gradients, no cream page).

- **Signature detail:** the row of milestone lamps under the hero readout. (A `T–` prefix was tried in the directions and dropped on 2026-10-15: it read as jargon.)
- **Colour is rationed to lamps.** Pages, cards and screens are grey, white and black. Colour appears only as a lamp, a milestone dot, a status word or the urgent readout. There is no brand accent hue.
- **Colour always means something:** the milestone colours follow the indicator-lamp convention (IEC 60073): red = act now, amber = attention, blue = action needed, green = done, white = neutral. Never add colour for decoration.
- **Deliberate exceptions to Claude's defaults:** ALL-CAPS for small labels, eyebrows and buttons, because console labels are engraved in capitals. **Venue names are never uppercased**: "NeurIPS" and "ICLR" keep their own casing.
- How we got here: `design/directions.html` (round one: Badge, Mission control, Signal) and `design/directions-2.html` (round two: Amber board, **Apollo console**, Phosphor). Both are standalone files; open them directly in a browser.

What doesn't change, whatever the look:
- **Glanceable first.** The next deadline and its countdown come before everything else.
- **Honest about certainty.** Estimated, assumed and tentative dates always say so.

## 2. Colour

Design tokens are the CSS variables in `:root`. Always use a token, never a raw hex, so dark mode keeps working. All values below are in `site/style.css` (2026-10-15) and pass the browser checks in section 8.

### Base

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--bg` | `#d8dde0` | `#070a0c` | Page background: console grey / a dark room |
| `--surface` | `#f4f6f6` | `#10161a` | Cards, rows, inputs, dialogs (console panels) |
| `--surface-2` | `#e6eaeb` | `#172026` | Wells inside a surface: segmented controls, chips |
| `--text` | `#12171a` | `#e6ecee` | Main text (13.2:1 or better) |
| `--muted` | `#455055` | `#95a3aa` | Secondary text, placeholders (6.1:1 or better) |
| `--faint` | `#4f5a60` | `#83919a` | Quiet text and icons (5.1:1 or better, so it can be text) |
| `--line` | `#bcc5ca` | `#23303a` | Borders and dividers |
| `--focus` | `#c62a20` | `#ff6b5c` | Keyboard focus ring (3.4:1 or better on every background, the hero's black included) |
| `--scrim` | `rgb(0 0 0 / .5)` | same | The shade behind every dialog |
| `--tint` | `rgb(0 0 0 / .12)` | same | A slight darkening on a fill |

### Keys, lamps and status

There's no accent hue. The primary button is a **dark key** (a black console key in light mode, a white one in dark mode). Red is the "act now" lamp.

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--key` | `#12171a` | `#e6ecee` | Primary button fill (one per view) |
| `--on-key` | `#f4f6f6` | `#070a0c` | Text on `--key` (16.6:1) |
| `--accent` | `#c62a20` | `#ff6b5c` | The red lamp: logo, urgent dots, "Next 7 days" marker |
| `--accent-ink` | `#b3261e` | `#ff6b5c` | Red **text**: "This week", "Not refreshed", hot labels (4.8:1 or better) |
| `--on-accent` | `#ffffff` | `#070a0c` | Text on an `--accent-ink` fill: Today in the calendar, the filter count |
| `--lamp` | `#ffb000` | `#ffb000` | A lit lamp (the next milestone) on the black screen (10.5:1) |
| `--warn` | `#7a5000` | `#ffb000` | Estimated, Tentative, "sources differ", closing soon |
| `--ok` | `#1a6b3c` | `#45d17f` | Confirmed by two sources |
| `--star` | `#ffb000` | `#ffb000` | Starred venues, as a **fill** only (the pressed Starred button). Too light for an icon on grey |
| `--star-ink` | `#7a5400` | `#ffb000` | The ★ glyph on a row when starred (5.0:1 or better) |
| `--on-star` | `#1b1300` | `#1b1300` | Text on a `--star` fill (10.1:1) |

### The screen (hero)

The hero is a black screen in both themes, so it has its own tokens and uses the **dark** milestone colours in both themes.

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--hero-bg` | `#0b0f12` | `#000000` | The screen |
| `--hero-fg` | `#eef2f3` | `#eef2f3` | Text on the screen |
| `--hero-muted` | `#97a3a9` | `#97a3a9` | Labels on the screen, unlit lamp rings (7.5:1) |
| `--hero-line` | `#24313a` | `#1f2a31` | Borders and dividers on the screen |
| `--hero-chip` | `#121a1f` | `#0d1317` | The "Next" chips |
| `--clock` | `#f4f1e6` | `#f4f1e6` | Readout digits: warm white, like an incandescent display (15.6:1) |
| `--clock-hot` | `#ff6b5c` | `#ff6b5c` | Readout digits in the last week (`.hero.urgent`) |
| `--clock-tile` | `#121a1f` | `#0d1317` | The readout panel behind the digits |

No glow, no gradient on the screen. (Signal's corner glow, `--hero-glow`, goes.)

### Milestone colours (lamp caps)

Each milestone group has one colour everywhere: row dots, lamps, the calendar, the map, share cards and link previews. Every one is at least 3:1 on `--bg`, `--surface` and `--surface-2`.

| Group | Lamp | Token | Light | Dark (and on the screen) |
|---|---|---|---|---|
| Submission | red, act now | `--g-submission` | `#c62a20` | `#ff6b5c` |
| Reviews / rebuttal | amber, attention | `--g-reviews` | `#9a6500` | `#ffb000` |
| Decision | blue, action needed | `--g-decision` | `#1f62b8` | `#5aa7ff` |
| Camera-ready | green, done | `--g-camera` | `#1d7f45` | `#45d17f` |
| Conference | white, neutral | `--g-conference` | `#5d676d` | `#e6ecee` |
| Other (side events) | unlit | `--g-other` | `#687176` | `#7f8a90` |

These are for **dots, lamps and fills**. When one has to be **text** (the day counts in the hero's "Next" chips), mix it 75% with the text colour: `color-mix(in srgb, var(--c) 75%, var(--hero-fg))`.

### Map

| Token | Light | Dark |
|---|---|---|
| `--map-sea` | `#c9d0d4` | `#05080a` |
| `--map-land` | `#f4f6f6` | `#172026` |
| `--map-border` | `#aab4ba` | `#2a3740` |

## 3. Type

**Fonts (chosen 2026-10-15):** **IBM Plex Sans Condensed** for words and **IBM Plex Mono** for numbers. IBM built the computers in the Apollo mission control centre, and Plex is IBM's own typeface; the condensed width fits long venue names and dates on one line on a phone. Licence: OFL 1.1. Self-hosted in `site/fonts/`: Latin-subset woff2 files for the page (Plex Sans Condensed 400, 600, 700; Plex Mono 500, 600; about 110 KB) and TTFs for link previews (Sans Condensed SemiBold and Bold, Mono SemiBold). Licence in `site/licenses/ibm-plex-OFL-1.1.txt`.

| Token | Use for |
|---|---|
| `--sans` | Everything by default |
| `--mono` | The hero readout, row countdown boxes, "Next" chip counts, timeline dates and time-left, calendar day numbers, row times, bucket counts |

**Mono spaces are a full character wide**, so in mono write short units without a space: `2d`, not `2 d`.

Fonts are set in three places. Change all three together, or the share cards and link previews won't match the site:
1. `site/style.css`: the `@font-face` rules and `--sans` / `--mono`, plus the `<link rel="preload">` lines in `site/index.html`.
2. `site/share.js`: `FONT` and `MONO`. Canvas only draws fonts that are already loaded, so `refreshCard` loads every weight it draws first.
3. `functions/og.js`: the TTF files (resvg can't read woff2) and the width estimate (Plex Sans Condensed measures up to 0.63 em per character on venue names; Plex Mono is exactly 0.6), plus `lib/deadline.js` colours. Text below 700 names `IBM Plex Sans Condensed SemiBold` first, in case resvg registers the SemiBold file under its legacy family name.

Numbers that tick or line up use `font-variant-numeric: tabular-nums` (Plex Mono is tabular by nature).

### Sizes

A **type scale** is a short, fixed list of sizes, so the page looks planned. The Signal build used 22 sizes and 8 weights; Apollo uses 8 sizes (11, 12, 13, 14, 15, 17, 20, 26) plus the two hero clamps, and 3 + 2 weights:

| Role | Size | Weight |
|---|---|---|
| Hero readout digits | `clamp(36px, 11vw, 76px)` | Mono 600 |
| Hero venue name | `clamp(30px, 6vw, 44px)` | 700 |
| Row countdown | 26 | Mono 600 |
| Section title, calendar month | 20 | 700 |
| Venue name in a row | 17 | 700 |
| Body | 15 | 400 |
| Secondary text (row details, popover text) | 14 | 400 or 600 |
| Small text | 13 | 400 or 600 |
| Labels, eyebrows, buttons, segmented controls (ALL CAPS) | 12, `letter-spacing: .04em` to `.08em` | 600 |
| Lamp labels, badges | 11, `letter-spacing: .06em` | 600 |

**Weights:** Plex Sans Condensed 400 (body), 600 (labels, emphasis), 700 (headings); Plex Mono 500 (times) and 600 (readouts). Plex Sans Condensed has no 800: never ask for it.

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

- **TBA** ("to be announced") means the venue hasn't published the date yet.
- The hero readout always shows all four units (days, hours, min, sec) on one panel, with labels under the digits. No `T–` prefix.
- Share cards and link previews are still images, so they show one number: days until under a day is left, then hours, then minutes.

## 4. Shape and space

| | Value |
|---|---|
| Corner radius | 2 for small tags · 3 for controls, chips, badges and buttons · 4 for cards, the hero and dialogs · 6 at the top of phone bottom sheets · 50% for lamps and dots. **No pill shapes.** |
| Spacing | Steps of 4: 4, 8, 12, 16, 24, 32 |
| Page width | 960 px max, 16 px side gutter |
| Breakpoints | 720, 640 (phone layout: the toolbar stacks and the calendar becomes an agenda), 480; plus `pointer: coarse` wider than 640 (tablets get the phone calendar and gaps) |
| Shadow | None. Panels are separated by `--line` borders, like console panels. Popovers keep `--pop-shadow` so they lift off the page |

## 5. Components

- **Hero (the screen):** eyebrow (milestone, ALL CAPS), venue name (own casing), place, the readout panel, the lamp row (Submit · Reviews · Decision · Camera · Conf; the next one lit in `--lamp`, done ones in their milestone colour, future ones as unlit rings), the exact time in your zone and in AoE, then the "Next" runway of the following three.
- **Deadline gaps:** a strip that shows how close your starred deadlines are to each other.
- **Shared or starred list bar:** a plain panel with a 4 px `--star` edge on the left (an amber lamp edge, not a tint).
- **Toolbar:** milestone focus (segmented), List / Map / Calendar, search, Starred, Areas, Filters.
- **Row:** a small black screen on the left with the countdown in `--clock` (red in the last week), venue and next milestone, badges, star and share. Tap to open the timeline, quick links and sources.
- **Buttons:** primary = `--key` fill with `--on-key` text, ALL CAPS, one per view. Secondary = `--surface` with a `--line` border. Corners 3 px.
- **Chips and segmented controls:** 3 px corners, the selected one is `--text` fill with `--bg` text (a pressed key).
- **Badges:** `est` (dashed, Estimated or Assumed), `tent` (Tentative), `ok` (two sources agree), `warn` (sources differ, with the Tabler alert-triangle).
- **Calendar:** a month grid with chips for mouse users, an agenda list on phones and touch tablets.
- **Map:** Leaflet with a Natural Earth basemap in console greys, plus a "To be announced" list.
- **Dialogs:** Filters, Areas, About, Credits and Share. Bottom sheet on phones, 4 px corners on desktop.
- **Icons:** **Tabler Icons** (MIT, via Iconify), 2 px stroke, round caps, inline SVG with `stroke="currentColor"`, kept in the `ICON` object at the top of `app.js` (and inline in `index.html`). Disclosure chevrons are Tabler paths used as CSS masks (`--chev-right`, `--chev-down`). Outlook has no Tabler mark, so its calendar button uses `mail`. New icons come from Tabler only; never hand-drawn.
- **Logo:** a lamp: a filled `--accent` circle inside a `--faint` ring. Two circles, so it's geometry rather than a drawn icon.
- **Browser colours:** `theme-color` in `index.html` uses `--bg` per theme; `manifest.webmanifest` uses the dark `--bg`. The SVG favicon and the PNG icons in `site/icons/` (made with PIL on 2026-10-15) show the red lamp in a grey ring on the black screen; the maskable icon keeps it inside the safe circle.

## 6. Share cards and link previews

- **Share cards** (`CARD_THEMES` in `share.js`): **Console** is the default (the black screen, warm-white digits, lamp-cap milestone colours, no glow). **Daylight** is the console panel in light grey and replaces Paper (cream). Aurora and Sunset stay as extra options (decided 2026-10-15; dropping one is a one-line change). A saved `signal` or `midnight` choice falls back to Console, and `paper` to Daylight.
- Formats: Story (9:16), Square and Wide. Story cards keep content out of the top 14% and bottom 20%, where Stories put their buttons.
- Every theme's text colours are 4.5:1 and milestone colours 3:1 against both ends and the middle of its background (the lint and browser checks don't see canvas colours, so check these by hand).
- **Link previews** (`/og`, 1200 × 630): the Console colours, from `COLORS` in `lib/deadline.js`, Plex TTFs in `functions/og.js`, no glow.
- **README images** (`docs/banner.png`, `docs/screenshot*.png`) still show the Signal look; re-make them after Apollo is live.

## 7. Voice

- **Plain and exact.** "Abstract · Oct 19, 8:59 PM", "Oct 18, 11:59 PM AoE". Show both your time and AoE when they differ.
- **Console labels are short and in capitals:** "SUBMIT", "REVIEWS", "ADD TO CALENDAR". Full sentences stay in normal case.
- **Say how sure we are.** "Estimated", "Assumed", "Tentative", "last held in Seoul". Never guess a location.
- **Credit sources.** Hugging Face's ai-deadlines data and each venue's official page, with a "Report a wrong date" link per source.
- **No space-race puns or hype.** No "Houston", "liftoff", "blast off", "never miss a deadline again!", no exclamation marks, no emoji in the interface. The concept lives in the look, not in jokes.

## 8. Accessibility

Researchers check this site on their phones, so these rules matter. They came from audits on 2026-10-14, which fixed every problem found. They hold in the current code and carry over to the Apollo rebuild; re-run the checks after it.

### Tap targets

- Every control must have a hit area of at least **44 × 44 px** (Apple's guideline).
- A control can *look* smaller. The "Tap targets" block near the top of `style.css` gives the listed controls an invisible 44 px area centred on them. Add new small controls to that list.
- Keep at least 44 px between the centres of neighbouring controls, so their areas don't overlap. That's why the row's star and share buttons are 40 px with a 4 px gap, and why the calendar header has a 14 px row gap.
- **Rows that scroll sideways clip the hit areas.** Their controls must be 44 px tall themselves (segmented controls: 38 px buttons plus padding), or the row needs padding above and below (the hero's "Next" runway, and the quick links on phones).
- In the map's "To be announced" list, the whole card is the tap target, not just the venue name.
- **Map controls:** Leaflet's zoom buttons (30 px) and popup close button (24 px) are overridden to 44 px with a `.map.leaflet-container` selector, which beats Leaflet's own rules even though its stylesheet loads later. Each marker dot (12–24 px) sits on an invisible 44 px circle that opens the same popup.
- **Deadline gaps:** the header toggle is 44 px tall; each timeline dot is a 44 px wide button. Two dots closer than 44 px overlap, which is accepted on mouse screens (below).
- **Touch screens wider than a phone** (`pointer: coarse`, tablets) get the phone calendar (dots plus the agenda list) and the phone gaps card (chain only), so the dense month-grid chips and timeline dots are only ever shown to mouse users.
- Links that stand alone in a Credits card ("Repository · Full licence text") get a 44 px hit area; links inside a sentence don't need one.
- The hero's lamps are a display, not controls. If they ever become tappable, they need 44 px areas.
- **Exceptions:** links inside a sentence (WCAG allows these), and the chips inside the month-grid cells and the gap-timeline dots, which are dense by design and shown only to mouse users.

### Contrast fixes made on 2026-10-14 (Signal palette)

These were fixed on the Signal palette. The **tokens** they created (`--accent-ink`, `--on-accent`, `--focus`, `--star-ink`, `--on-star`, `--scrim`, `--tint`) carry over to Apollo with the new values in section 2.

| Problem | Fix |
|---|---|
| Red text in `--accent` (3.4–3.9:1): "Next 7 days", hot row labels, "Not refreshed for N days" | New `--accent-ink` (5.4:1 on `--bg`) |
| White text on `--accent`: Today in the calendar, the primary button, the filter count (3.9:1; 2.9:1 in dark mode) | `--accent-ink` fill with `--on-accent` text |
| `--warn` text (3.3–3.8:1): Estimated, Tentative, sources differ | Darker `--warn` (5.2–6.0:1) |
| `--ok` text (3.8–4.4:1) | Darker `--ok` (5.0–5.8:1) |
| Milestone colours as text in the hero's "Next" chips (3.4–4.5:1) | 75% mix with the text colour |
| The search placeholder used the browser default `#757575` (4.0:1 on dark) | `.search input::placeholder` uses `--muted` |
| The "Sources & corrections" menu opened 6 px below its toggle, covering the toggle's tap area | Opens 13 px below |
| Map "To be announced" cards were 44 px including their 1 px borders, so 42–43 px to tap | 46 px tall |
| "Copy link" is 19.5 px tall, so its 44 px area rounded to 43 | Its hit area is 46 px tall |
| Hero "Nothing coming up" / "Could not load" in page grey on the black hero (2.6:1) | `--hero-muted` |
| Focus ring was 70% `--accent`, 2.6:1 on some backgrounds | New `--focus` token, 3:1 on every background |
| Pressed ★ on a row in `--star` (2.45:1); the checker treats the glyph as 20 px text | New `--star-ink`; fills keep `--star` |
| Side-events dot `--g-other` (2.7:1 light, 3.0:1 dark) | Darker / lighter `--g-other` (3.3:1 or better) |
| Past days in the phone agenda at 55% opacity (2.45–4.3:1) and past calendar chips at 70% | No opacity: `--muted` text, `--faint` dates, a dashed border and an 8% tint |
| Past dots on the row's lifecycle track at 40% opacity | A 45% mix of the milestone colour into `--surface` |
| Share cards: Paper, Aurora and Sunset small text under 4.5:1 | Darker/lighter text colours; Sunset's bottom end darkened to `#9c2e14` |
| "Your deadline gaps" toggle about 20 px tall | `min-height: 44px` on the summary |
| Map zoom buttons 30 px, popup close 24 px, markers 12–24 px | 44 px controls; an invisible 44 px circle under each marker |
| Gap-timeline dots 14 px; month-grid chips shown to touch tablets | 44 px wide dot buttons; `pointer: coarse` screens get the phone layouts |
| Phone "Next" chips 43.75 px (the runway clipped their hit area) | 8 px bottom padding on the runway |
| Raw colours outside tokens (pressed Starred text, two backdrop shades, two tints) | `--on-star`, one `--scrim`, `--tint`, `--line` |
| ⚠ could render as a colour emoji | Inline Tabler `alert-triangle` |
| Credits links standing alone in a card were 16 px tall | 44 px hit areas |
| The Filters/Areas/About popover opened below the screen on a short window | `openPop` opens above the button when there's no room below |

### How to check

Use the design-brief skill's scripts (`~/.claude/skills/design-brief/references/contrast-check.js` and `tap-target-check.js`). They also measure placeholders, small icons and the real tappable area via `elementFromPoint`.

**2026-10-14, second pass (Signal):** both themes, at 375 px (touch) and 1100 px (mouse), eight states each: List with a row, its sources menu and the gaps card open; the Filters, Areas, About, Credits and Share dialogs; Map with a popup open; Calendar. At 375 px: 3,576 text elements and 258 controls. At 1100 px: 3,826 text elements and 430 controls. Result: 0 contrast failures, 0 controls under 44 px, 0 overlaps. Design lint: 0 errors, 2 warnings (the off-white `--bg` and the round `.pill`; both go away with Apollo).

**2026-10-15, Apollo build:** both themes, at 375 px (touch) and 1100 px (mouse), eight states each: List with a row, its sources menu and the gaps card open; the Filters, Areas, About, Credits and Share dialogs; Map with a popup open; Calendar. At 375 px: 3,676 text elements and 261 controls per theme. At 1100 px: 3,918 text elements and 414 controls per theme. Result: 0 contrast failures, 0 controls under 44 px, 0 overlaps (the only "covered" controls were page controls behind an open dialog or popover). Design lint: 0 errors, 0 warnings. Share-card themes Console and Daylight checked by maths along their gradients: worst pairs 5.4:1 (Console `other`) and 3.6:1 (Daylight `reviews`, a 3:1 dot colour). Link previews can only be checked on a Pages deploy.

## History

- **2026-10-14: Signal**, "a departures board for papers": an off-white page, a black hero with amber digits on split-flap tiles, Chivo + Chivo Mono. Comparisons: `design/palettes.html`, `design/font-options.html`; `design/palettes.css` keeps the candidates.
- **2026-10-15: Apollo console** replaces it, after a full design brief (researchers on phones; the countdown first; concepts considered: a conference badge, mission control, the departures board). Signal's off-white page and orange-red accent were close to Claude's own look, and green-on-black (Phosphor) is the terminal cliché, so both were set aside.

# AI Conference Deadlines

Live countdowns to AI/ML conference milestones (submission, reviews, decision,
camera-ready, conference) with per-milestone calendar feeds.
Planned home: https://ai-deadlines.ruzcko.com

Dates come from [huggingface/ai-deadlines](https://github.com/huggingface/ai-deadlines)
(MIT). [PaperRush](https://github.com/awsaf49/paperrush) (Apache-2.0) is a second
source: its announced dates and host cities fill gaps, and dates both sources list
are cross-checked ("✓ 2 sources" / "⚠ Sources differ"). PaperRush's own estimates
are never used. Fix wrong dates upstream; this site picks them up on the next sync.

## How it works

- `pipeline/sync.py` pulls the upstream YAML, normalizes milestone types into
  groups and all timezones to UTC, projects **estimated** next editions for
  venues whose dates aren't announced yet, and writes:
  - `site/data/conferences.json` for the page
  - `site/cal/{all,submission,reviews,decision,camera,conference}.ics` feeds
    (estimated dates are never put in the feeds)
- `site/` is a static page (no build step, no dependencies).

## Run locally

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe pipeline/sync.py
.venv/Scripts/python.exe -m http.server 8773 --directory site
```

## Deploy (Cloudflare Pages)

- Pages project `ai-deadlines`, connected to this repo (branch `main`).
- Build command: `python3 -m pip install -r requirements.txt && python3 pipeline/sync.py`
- Output directory: `site`
- `.github/workflows/refresh.yml` checks upstream every 6 hours and pushes
  `data/upstream.lock` when it changed (and weekly). The push triggers a rebuild,
  so no deploy hook or API token is needed.
- `data/geocode.json` caches city coordinates (OpenStreetMap Nominatim); commit
  it after a local sync adds new cities.

## Credits

See [site/credits.html](site/credits.html) (served at `/credits.html`) for every source and licence:
Hugging Face ai-deadlines (MIT) and PaperRush (Apache-2.0) data, with our changes described;
OpenStreetMap/Nominatim (ODbL) coordinates; Natural Earth (public domain); Leaflet (BSD-2);
Inter (OFL); resvg-wasm (MPL-2.0). Full licence texts live in `site/licenses/`.

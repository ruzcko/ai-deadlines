"""Read each venue's official pages and extract its dates with Claude.

Runs weekly in GitHub Actions (needs ANTHROPIC_API_KEY). For every venue in
data/official_sources.json it fetches the listed pages, strips them to text,
asks Claude for the dates as JSON, and writes data/official/<venue>.json.
sync.py then merges those files as the "Official site" source.

Pages that fail to load keep their previous extraction. Venues whose pages
haven't changed since the last run are skipped (content hash), so a normal
week costs only the venues that actually updated something.

    python pipeline/scrape_official.py            # all venues
    python pipeline/scrape_official.py cvpr iclr  # just these
    python pipeline/scrape_official.py --force    # ignore the hash check
"""

import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import requests

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "official_sources.json"
OUT = ROOT / "data" / "official"
MODEL = "claude-opus-5-5"
UA = "ai-deadlines/1.0 (+https://ai-deadlines.ruzcko.com; weekly check of published dates)"
MAX_CHARS = 60_000  # per page, after stripping to text
MAX_FOLLOW = 2      # extra pages the model may ask for (a dates page it spotted)

SCHEMA = {
    "type": "object",
    "properties": {
        "found_dates": {"type": "boolean", "description": "True if the pages contain concrete dates for an edition."},
        "year": {"type": ["integer", "null"], "description": "The edition year these dates belong to, e.g. 2027."},
        "city": {"type": ["string", "null"]},
        "country": {"type": ["string", "null"]},
        "venue": {"type": ["string", "null"], "description": "Building or centre, if stated."},
        "conference_start": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "conference_end": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "milestones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "description": "As written on the page, e.g. 'Paper submission deadline'."},
                    "type": {"type": "string", "enum": ["abstract", "paper", "supplementary", "review_release", "rebuttal_start", "rebuttal_end", "notification", "camera_ready", "registration", "workshop", "tutorial", "other"]},
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "time": {"type": ["string", "null"], "description": "HH:MM (24h) if a time is given, else null."},
                    "timezone": {"type": ["string", "null"], "description": "As stated: 'AoE', 'UTC', 'PST', 'UTC+2', 'Europe/London', or null if not stated."},
                    "tentative": {"type": "boolean", "description": "True if marked tentative, TBD, approximate, or 'subject to change'."},
                },
                "required": ["label", "type", "date", "time", "timezone", "tentative"],
                "additionalProperties": False,
            },
        },
        "tracks_note": {"type": ["string", "null"], "description": "One sentence if the dates are for a specific track or cycle, else null."},
        "follow_url": {"type": ["string", "null"], "description": "If the pages say the dates live on another page (an 'important dates' or 'call for papers' link) that was NOT provided, its absolute URL. Otherwise null."},
    },
    "required": ["found_dates", "year", "city", "country", "venue", "conference_start", "conference_end", "milestones", "tracks_note", "follow_url"],
    "additionalProperties": False,
}

SYSTEM = """You extract the published important dates of one academic conference from the text of its official web pages.

Rules:
- Only report what the pages state. Never infer a date from a previous year, and never guess a time or timezone that is not written. Use null for anything not stated.
- Report the main research-track dates. Include workshop or tutorial *proposal* deadlines only when clearly labelled, with type "workshop" or "tutorial".
- A conference with several submission cycles or rounds: report every cycle's dates and mention the cycles in tracks_note.
- If the pages are for a past edition only (every date is before today), still report them with the correct year.
- "Anywhere on Earth", "AoE", "UTC-12" all mean timezone "AoE". "23:59 AoE" style times go in time + timezone.
- If the pages say the dates are on another page that you were not given, put that page's absolute URL in follow_url and still report whatever dates you did find.
- Dates must be YYYY-MM-DD. Resolve relative wording like "mid-March" to null rather than inventing a day."""


def load_sources():
    return json.loads(SOURCES.read_text(encoding="utf-8"))


def fetch(url, timeout=25):
    r = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html,*/*;q=0.8"}, timeout=timeout, allow_redirects=True)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "")
    if "html" not in ctype and "text" not in ctype:
        raise ValueError(f"not a text page: {ctype}")
    return r.text


def to_text(page_html):
    """HTML to readable text: drop scripts and styles, keep line breaks at block boundaries."""
    s = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer)[^>]*>.*?</\1>", " ", page_html)
    s = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h[1-6]|section|article|table|dt|dd)>", "\n", s)
    s = re.sub(r"(?i)</t[dh]>", " | ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def pages_text(urls):
    """Fetch each URL; return (text blob, fetched urls, errors)."""
    parts, got, errors = [], [], []
    for u in urls:
        try:
            t = to_text(fetch(u))
            if len(t) > MAX_CHARS:
                t = t[:MAX_CHARS] + "\n[page truncated]"
            parts.append(f"### PAGE: {u}\n{t}")
            got.append(u)
        except (requests.RequestException, ValueError) as exc:
            errors.append(f"{u}: {exc}")
    return "\n\n".join(parts), got, errors


def extract(client, title, text, today):
    """One structured-output call. Returns the parsed JSON object."""
    user = f"Conference: {title}\nToday: {today}\n\n{text}"
    kwargs = dict(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
    )
    try:
        # Server-side fallback: if a safeguard declines (unlikely for conference pages), the same request is
        # re-run on a fallback model inside this call instead of coming back empty.
        res = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
    except anthropic.BadRequestError as exc:
        if "fallback" not in str(exc).lower():
            raise
        res = client.messages.create(**kwargs)
    if res.stop_reason == "refusal":
        raise RuntimeError(f"model declined ({getattr(res.stop_details, 'category', None)})")
    if res.stop_reason == "max_tokens":
        raise RuntimeError("output cut off at max_tokens")
    text_out = next(b.text for b in res.content if b.type == "text")
    data = json.loads(text_out)
    data["_usage"] = {"input": res.usage.input_tokens, "output": res.usage.output_tokens}
    return data


def run(keys=None, force=False):
    client = anthropic.Anthropic()
    sources = load_sources()
    OUT.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).date().isoformat()
    todo = [(k, v) for k, v in sources.items() if not keys or k in keys]
    tokens_in = tokens_out = 0
    changed = skipped = failed = 0
    for key, src in todo:
        out_path = OUT / f"{key}.json"
        prev = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else None
        text, got, errors = pages_text(src["urls"])
        if not got:
            failed += 1
            print(f"  {key}: no page loaded ({'; '.join(errors)[:160]})")
            continue
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        if prev and prev.get("content_hash") == digest and not force:
            skipped += 1
            continue
        try:
            data = extract(client, src["title"], text, today)
            # One optional hop: the model found the real dates page.
            follow = data.get("follow_url")
            hops = 0
            while follow and follow not in got and hops < MAX_FOLLOW and urllib.parse.urlparse(follow).scheme in ("http", "https"):
                hops += 1
                more, got2, err2 = pages_text([follow])
                errors += err2
                if not got2:
                    break
                got += got2
                data = extract(client, src["title"], text + "\n\n" + more, today)
                tokens_in += data["_usage"]["input"]; tokens_out += data["_usage"]["output"]
                follow = data.get("follow_url")
        except (anthropic.APIError, RuntimeError, json.JSONDecodeError, StopIteration) as exc:
            failed += 1
            print(f"  {key}: extraction failed: {exc}")
            continue
        tokens_in += data["_usage"]["input"]; tokens_out += data["_usage"]["output"]
        usage = data.pop("_usage")
        record = {
            "key": key, "title": src["title"], "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "urls": got, "errors": errors, "content_hash": digest, "model": MODEL, "usage": usage, **data,
        }
        out_path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
        changed += 1
        n = len(data.get("milestones") or [])
        print(f"  {key}: {n} dates, year {data.get('year')}, {data.get('city') or '-'}{' (follow-up page read)' if hops else ''}")
        time.sleep(0.5)
    print(f"{changed} updated, {skipped} unchanged, {failed} failed · tokens in {tokens_in:,} out {tokens_out:,}")
    return failed == 0 or changed > 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ok = run(keys=set(args) or None, force="--force" in sys.argv)
    sys.exit(0 if ok else 1)

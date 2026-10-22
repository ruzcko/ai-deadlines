"""Second source: the venues' own pages, read daily by pipeline/scrape_official.py.

Each data/official/<venue>.json holds the dates scrape_official.py extracted from the
official site. Here it is merged into the series the same way PaperRush used to be:
  - fill gaps the Hugging Face data has (host city, conference dates, deadlines
    of editions not listed yet),
  - cross-check dates both list, so the page can say whether they agree.
Only announced dates are involved; estimates are never read from here.
"""

import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OFFICIAL_DIR = ROOT / "data" / "official"
SRC = "of"
MAX_AGE_DAYS = 120  # an extraction older than this is stale; keep using it but say so

# Our milestone types for the scraper's enum.
TYPE_MAP = {
    "abstract": "abstract", "paper": "paper", "supplementary": "supplementary",
    "review_release": "review_release", "rebuttal_start": "rebuttal_start", "rebuttal_end": "rebuttal_end",
    "notification": "notification", "camera_ready": "camera_ready", "registration": "registration",
    "workshop": "event", "tutorial": "event", "other": "event",
}
TOLERANCE = timedelta(hours=1)


def load():
    out = {}
    for p in sorted(OFFICIAL_DIR.glob("*.json")) if OFFICIAL_DIR.exists() else []:
        try:
            rec = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if rec.get("found_dates") and rec.get("year"):
            out[rec["key"]] = rec
    return out


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _milestones(rec, group_of, to_utc):
    """Extracted dates in our milestone format (src='of')."""
    out = []
    for m in rec.get("milestones") or []:
        try:
            date.fromisoformat(m["date"])
        except (KeyError, ValueError):
            continue
        kind = TYPE_MAP.get(m.get("type"), "event")
        label = m.get("label") or kind
        group = group_of(kind, label)
        if kind == "event" and group == "submission":
            group = "other"
        notime = not m.get("time")
        tz = m.get("timezone") or "AoE"
        stamp = f"{m['date']} {m.get('time') or '23:59'}:00"
        try:
            when, tz_label = to_utc(stamp, tz)
        except (ValueError, KeyError):
            continue
        entry = {"label": label, "type": kind, "group": group, "at": _iso(when), "tz": tz_label, "src": SRC}
        if notime:
            entry["notime"] = True
        if m.get("tentative"):
            entry["tentative"] = True
        out.append(entry)
    for key, label in (("conference_start", "Conference starts"), ("conference_end", "Conference ends")):
        v = rec.get(key)
        if not v:
            continue
        try:
            day = date.fromisoformat(v)
        except ValueError:
            continue
        out.append({"label": label, "type": "start" if key == "conference_start" else "end", "group": "conference",
                    "day": day.isoformat(), "at": _iso(datetime(day.year, day.month, day.day, tzinfo=timezone.utc)), "src": SRC})
    out.sort(key=lambda m: m["at"])
    return out


def _main_paper(m):
    return m["group"] == "submission" and m["type"] in ("paper", "submission")


def _cross_check(ed, of_ms):
    """Compare the official paper deadline(s) and conference start with the HF ones."""
    def t_of(m):
        return datetime.fromisoformat(m["at"].replace("Z", "+00:00"))

    checks = []
    ours = [m for m in ed["milestones"] if _main_paper(m) and not m.get("est") and m.get("src") != SRC]
    theirs = [m for m in of_ms if _main_paper(m)]
    free = list(theirs)
    unmatched = []
    for o in ours:
        hit = next((t for t in free if abs(t_of(o) - t_of(t)) <= (timedelta(hours=36) if t.get("notime") else TOLERANCE)), None)
        if hit:
            free.remove(hit)
            checks.append({"what": o["label"], "hf": o["at"], "hf_tz": o.get("tz"), "pr": hit["at"], "pr_tz": hit.get("tz"),
                           "pr_notime": bool(hit.get("notime")), "agree": True})
        else:
            unmatched.append(o)
    for o in unmatched:
        near = [t for t in free if abs(t_of(o) - t_of(t)) <= timedelta(days=21)]
        if near:
            t = min(near, key=lambda t: abs(t_of(o) - t_of(t)))
            free.remove(t)
            checks.append({"what": o["label"], "hf": o["at"], "hf_tz": o.get("tz"), "pr": t["at"], "pr_tz": t.get("tz"),
                           "pr_notime": bool(t.get("notime")), "agree": False})
    ours_start = next((m for m in ed["milestones"] if m["type"] == "start" and not m.get("est") and m.get("src") != SRC), None)
    theirs_start = next((m for m in of_ms if m["type"] == "start"), None)
    if ours_start and theirs_start:
        checks.append({"what": "Conference starts", "hf": ours_start["day"], "pr": theirs_start["day"],
                       "agree": ours_start["day"] == theirs_start["day"]})
    return checks


def merge(series, records, *, group_of, to_utc, geocode, now):
    """Merge official extractions into `series` (dict keyed by title) in place. Returns a log."""
    by_key = {s["key"]: s for s in series.values()}
    filled = []
    for key, rec in records.items():
        s = by_key.get(key)
        if not s:
            continue
        of_ms = _milestones(rec, group_of, to_utc)
        if not of_ms:
            continue
        fetched = datetime.fromisoformat(rec["fetched_at"].replace("Z", "+00:00"))
        stale = (now - fetched).days > MAX_AGE_DAYS
        s["official"] = {"url": (rec.get("urls") or [None])[0], "fetched_at": rec["fetched_at"], "stale": stale}

        year = rec["year"]
        ed = next((e for e in s["editions"] if e["year"] == year), None)
        place = (rec.get("city"), rec.get("country"), rec.get("venue")) if rec.get("city") else None
        if ed is None:
            ed = {"id": f"{key}{str(year)[2:]}-of", "year": year, "dates": None,
                  "city": place[0] if place else None, "country": place[1] if place else None, "venue": place[2] if place else None,
                  "link": s["official"]["url"], "note": rec.get("tracks_note"), "note_link": None,
                  "tentative": any(m.get("tentative") for m in of_ms), "estimated": False,
                  "milestones": of_ms, "sources": [SRC], "checks": [], "links": [], "place_src": SRC if place else None}
            ed["lat"], ed["lng"] = geocode(ed["city"], ed["country"]) or (None, None)
            s["editions"].append(ed)
            filled.append(f"{s['title']} {year} (new edition, {len(of_ms)} dates)")
            continue

        if SRC not in ed["sources"]:
            ed["sources"].append(SRC)
        ed["checks"] = _cross_check(ed, of_ms)
        what = []
        if place and not ed.get("city"):
            ed["city"], ed["country"] = place[0], place[1]
            ed["venue"] = ed.get("venue") or place[2]
            ed["lat"], ed["lng"] = geocode(ed["city"], ed["country"]) or (None, None)
            ed["place_src"] = SRC
            what.append("location")
        covered = {m["group"] for m in ed["milestones"] if not m.get("est")}
        extra = [m for m in of_ms if m["group"] not in covered]
        if extra:
            ed["milestones"] = sorted(ed["milestones"] + extra, key=lambda m: m["at"])
            if any(m["group"] == "submission" for m in extra) and ed.get("note") and re.search(r"to be announced|TBA|TBD", ed["note"], re.I):
                ed["note"] = None
                ed["tentative"] = False
            what.append("/".join(sorted({m["group"] for m in extra})))
        if not ed.get("link") and s["official"]["url"]:
            ed["link"] = s["official"]["url"]
        if what:
            filled.append(f"{s['title']} {year} ({', '.join(what)})")
    return filled

"""Second source: PaperRush (awsaf49/paperrush, Apache-2.0).

PaperRush's data is refreshed weekly by an LLM-assisted scraper. We use only
the items it marks as announced (never its own estimates) to:
  - fill gaps the Hugging Face data has (host city, conference dates,
    deadlines of editions not listed yet, venues not covered at all), and
  - cross-check dates both sources list, so the page can say whether they agree.
"""

import json
import re
import urllib.request
from datetime import date, datetime, timedelta, timezone

DATA_URL = "https://raw.githubusercontent.com/awsaf49/paperrush/main/js/data.js"
REPO_URL = "https://github.com/awsaf49/paperrush"
SOURCE_URL = f"{REPO_URL}/blob/main/js/data.js"

# PaperRush deadline type -> our milestone type (group comes from sync.group_of).
TYPE_MAP = {
    "abstract": "abstract", "paper": "paper", "supplementary": "supplementary",
    "rebuttal": "rebuttal", "notification": "notification", "camera": "camera_ready",
    "event": "event", "workshop": "event", "tutorial": "event",
}
AREA_MAP = {"ml": "ml", "cv": "cv", "nlp": "nlp", "speech": "speech", "robotics": "robotics"}
SIDE = re.compile(r"journal|special session|show & tell|workshop|tutorial|(?<!paper )registration", re.I)
TOLERANCE = timedelta(hours=1)


def fetch():
    """Return (conferences, last_updated) or ([], None) if PaperRush is unreachable."""
    try:
        req = urllib.request.Request(DATA_URL, headers={"User-Agent": "ai-deadlines"})
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8")
        start = raw.index("{", raw.index("CONFERENCES_DATA"))
        data, _ = json.JSONDecoder().raw_decode(raw[start:])
        return data.get("conferences") or [], data.get("lastUpdated")
    except (OSError, ValueError) as exc:
        print(f"  PaperRush unavailable, continuing without it: {exc}")
        return [], None


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _offset_label(off):
    if off == timedelta(hours=-12):
        return "AoE"
    if not off:
        return "UTC"
    hours = off.total_seconds() / 3600
    return f"UTC{'+' if hours > 0 else '-'}{abs(hours):g}"


def _milestones(conf, group_of):
    """Announced PaperRush deadlines in our milestone format (src='pr')."""
    out = []
    for d in conf.get("deadlines") or []:
        if d.get("estimated") or not d.get("date"):
            continue
        if d["type"] == "conference":
            start = date.fromisoformat(d["date"][:10])
            end = date.fromisoformat((d.get("endDate") or d["date"])[:10])
            for kind, day, label in (("start", start, "Conference starts"), ("end", end, "Conference ends")):
                out.append({"label": label, "type": kind, "group": "conference", "day": day.isoformat(),
                            "at": _iso(datetime(day.year, day.month, day.day, tzinfo=timezone.utc)), "src": "pr"})
            continue
        kind = TYPE_MAP.get(d["type"], "event")
        label = d.get("label") or kind
        group = "other" if SIDE.search(label) else group_of(kind, label)
        if len(d["date"]) <= 10 or d.get("timeUnknown"):
            # No time given: assume end of day, Anywhere on Earth.
            day = date.fromisoformat(d["date"][:10])
            at = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone(timedelta(hours=-12)))
            m = {"tz": "AoE", "notime": True}
        else:
            at = datetime.fromisoformat(d["date"])
            m = {"tz": _offset_label(at.utcoffset())}
        out.append({"label": label, "type": kind, "group": group, "at": _iso(at.astimezone(timezone.utc)),
                    "src": "pr", **m})
    out.sort(key=lambda m: m["at"])
    return out


def _place(conf):
    loc = conf.get("location") or {}
    city, country = loc.get("city"), loc.get("country")
    if not city or city.upper() == "TBD":
        return None
    return city, (country if country and country.upper() != "TBD" else None), loc.get("venue")


def _main_paper(m):
    return m["group"] == "submission" and m["type"] in ("paper", "submission")


def _cross_check(ed, pr_ms):
    checks = []
    ours = [m for m in ed["milestones"] if _main_paper(m) and not m.get("est") and m.get("src") != "pr"]
    theirs = [m for m in pr_ms if _main_paper(m)]
    # PaperRush tags side tracks as "paper" too, so pair each of our deadlines with
    # at most one of theirs: exact matches first, then near misses (likely the
    # same deadline reported differently). Far-apart dates are different tracks.
    def t_of(m):
        return datetime.fromisoformat(m["at"].replace("Z", "+00:00"))

    def close(o, t):
        return abs(t_of(o) - t_of(t)) <= (timedelta(hours=36) if t.get("notime") else TOLERANCE)

    free = list(theirs)
    unmatched = []
    for o in ours:
        hit = next((t for t in free if close(o, t)), None)
        if hit:
            free.remove(hit)
            checks.append({"what": o["label"], "hf": o["at"], "hf_tz": o.get("tz"), "pr": hit["at"],
                           "pr_tz": hit.get("tz"), "pr_notime": bool(hit.get("notime")), "agree": True})
        else:
            unmatched.append(o)
    for o in unmatched:
        near = [t for t in free if abs(t_of(o) - t_of(t)) <= timedelta(days=21)]
        if near:
            t = min(near, key=lambda t: abs(t_of(o) - t_of(t)))
            free.remove(t)
            checks.append({"what": o["label"], "hf": o["at"], "hf_tz": o.get("tz"), "pr": t["at"],
                           "pr_tz": t.get("tz"), "pr_notime": bool(t.get("notime")), "agree": False})
    ours_start = next((m for m in ed["milestones"] if m["type"] == "start" and not m.get("est")
                       and m.get("src") != "pr"), None)
    theirs_start = next((m for m in pr_ms if m["type"] == "start"), None)
    if ours_start and theirs_start:
        checks.append({"what": "Conference starts", "hf": ours_start["day"], "pr": theirs_start["day"],
                       "agree": ours_start["day"] == theirs_start["day"]})
    return checks


def merge(series, conferences, *, group_of, geocode, series_key_of, last_updated):
    """Merge PaperRush editions into `series` (dict keyed by title) in place."""
    by_upper = {title.upper(): s for title, s in series.items()}
    added, filled = [], []
    for conf in conferences:
        if conf.get("isEstimated") and not any(not d.get("estimated") for d in conf.get("deadlines") or []):
            continue
        pr_ms = _milestones(conf, group_of)
        place = _place(conf)
        s = by_upper.get(conf["name"].upper())
        if s is None:
            s = {
                "key": series_key_of(conf["name"]),
                "title": conf["name"],
                "full_name": conf.get("fullName"),
                "areas": [AREA_MAP.get(conf.get("category"), "ml")],
                "tags": [],
                "rank": None,
                "source": SOURCE_URL,
                "updated": last_updated or "",
                "editions": [],
            }
            series[conf["name"]] = by_upper[conf["name"].upper()] = s
            added.append(conf["name"])
        s.setdefault("also", SOURCE_URL)

        ed = next((e for e in s["editions"] if e["year"] == conf["year"]), None)
        if ed is None:
            if not pr_ms and not place:
                continue
            city, country, venue = place or (None, None, None)
            ed = {"id": conf["id"], "year": conf["year"], "dates": None, "city": city, "country": country,
                  "venue": venue, "link": conf.get("website") or (conf.get("links") or {}).get("official"),
                  "note": None, "note_link": (conf.get("links") or {}).get("dates"), "tentative": False,
                  "estimated": False, "milestones": pr_ms, "sources": ["pr"], "checks": []}
            if place:
                ed["place_src"] = "pr"
            ed["lat"], ed["lng"] = geocode(city, country) or (None, None)
            s["editions"].append(ed)
            filled.append(f"{conf['name']} {conf['year']} (new edition)")
            continue

        if "pr" not in ed["sources"]:
            ed["sources"].append("pr")
        ed["checks"] = _cross_check(ed, pr_ms)

        what = []
        if place and not ed.get("city"):
            ed["city"], ed["country"] = place[0], place[1]
            ed["venue"] = ed.get("venue") or place[2]
            ed["lat"], ed["lng"] = geocode(ed["city"], ed["country"]) or (None, None)
            ed["place_src"] = "pr"
            what.append("location")
        # Add PaperRush milestones for whole groups the HF data doesn't cover.
        covered = {m["group"] for m in ed["milestones"] if not m.get("est")}
        extra = [m for m in pr_ms if m["group"] not in covered]
        if extra:
            ed["milestones"] = sorted(ed["milestones"] + extra, key=lambda m: m["at"])
            if any(m["group"] == "submission" for m in extra):
                # "Deadlines to be announced" no longer holds once PaperRush has them.
                if ed.get("note") and re.search(r"to be announced|TBA|TBD", ed["note"], re.I):
                    ed["note"] = None
                    ed["tentative"] = False
            what.append("/".join(sorted({m["group"] for m in extra})))
        if not ed.get("link") and conf.get("website"):
            ed["link"] = conf["website"]
        if what:
            filled.append(f"{conf['name']} {conf['year']} ({', '.join(what)})")
    return added, filled

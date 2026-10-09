"""Pull conference data from huggingface/ai-deadlines (plus PaperRush) and export it.

Writes site/data/conferences.json (one entry per venue series, with every
edition's milestones in UTC) and site/cal/*.ics (one subscribable feed per
milestone group). Estimated editions are added for series whose next
deadlines are not published yet; they go to the JSON but never to the feeds.
"""

import html
import json
import re
import subprocess
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

import paperrush

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / "data" / "upstream"
UPSTREAM_URL = "https://github.com/huggingface/ai-deadlines"
CONF_DIR = "src/data/conferences"
SITE = ROOT / "site"

GROUPS = ["submission", "reviews", "decision", "camera", "conference", "other"]
GROUP_NAMES = {
    "submission": "Submission",
    "reviews": "Reviews & rebuttal",
    "decision": "Decision",
    "camera": "Camera-ready",
    "conference": "Conference",
    "other": "Other",
}
TYPE_GROUP = {
    "abstract": "submission", "paper": "submission", "submission": "submission",
    "supplementary": "submission", "commitment_deadline": "submission",
    "review_release": "reviews", "rebuttal_start": "reviews", "rebuttal_end": "reviews",
    "rebuttal": "reviews", "author_response": "reviews",
    "rebuttal_and_revision": "reviews", "revision-deadline": "reviews",
    "notification": "decision", "first-notification": "decision",
    "final-notification": "decision",
    "camera_ready": "camera", "camera-ready": "camera",
}
# Side tracks and logistics that share the "submission"/"registration" types.
SIDE_TRACK = re.compile(
    r"workshop|tutorial|art |art papers|gallery|volunteer|poster|festival|talks|"
    r"rising stars|appy|real-time|student|demo|frontiers|spotlight|reproducibility",
    re.I,
)

AREAS = {
    "ml": "Machine learning", "cv": "Computer vision", "nlp": "NLP",
    "robotics": "Robotics", "data": "Data mining & IR", "speech": "Speech & signal",
    "graphics": "Graphics", "hci": "HCI",
}
TAG_AREA = {
    "machine-learning": "ml", "machine learning": "ml", "representation-learning": "ml",
    "optimization-methods": "ml", "reinforcement-learning": "ml", "lifelong-learning": "ml",
    "large-language-models": "nlp", "deep learning": "ml", "mathematics": "ml",
    "fairness": "ml", "reasoning": "ml", "knowledge representation": "ml",
    "computer-vision": "cv", "computer vision": "cv", "image processing": "cv",
    "image-processing": "cv", "visual information processing": "cv",
    "pattern-recognition": "cv",
    "natural-language-processing": "nlp", "semantics and knowledge": "nlp",
    "robotics": "robotics",
    "data-mining": "data", "web-search": "data", "retrieval": "data", "web mining": "data",
    "recommendation": "data", "information-retrieval": "data", "information-systems": "data",
    "knowledge-graphs": "data", "content analysis": "data",
    "speech": "speech", "signal-processing": "speech", "signal processing": "speech",
    "computer-graphics": "graphics",
    "human-computer-interaction": "hci",
}
MAIN_SUBMISSION = {"abstract", "paper", "submission"}
WARNINGS = []  # upstream data issues worth reporting
SOURCES = {"pr_updated": None}
TENTATIVE = re.compile(r"proposed|tentative|subject to change|to be announced|\bTBA\b|\bTBD\b", re.I)


def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout


def fetch_upstream():
    # Full history without blobs, so per-file "last changed" dates are cheap.
    if not (UPSTREAM / ".git").exists():
        run("git", "clone", "-q", "--filter=blob:none", "--sparse", UPSTREAM_URL, str(UPSTREAM))
        run("git", "sparse-checkout", "set", CONF_DIR, cwd=UPSTREAM)
    else:
        if run("git", "rev-parse", "--is-shallow-repository", cwd=UPSTREAM).strip() == "true":
            run("git", "fetch", "-q", "--unshallow", "--filter=blob:none", "origin", cwd=UPSTREAM)
        run("git", "pull", "-q", "--ff-only", cwd=UPSTREAM)
    sha, when = run("git", "log", "-1", "--format=%H %cI", cwd=UPSTREAM).split()
    return sha, when


def file_updated(name):
    return run("git", "log", "-1", "--format=%cI", "--", f"{CONF_DIR}/{name}", cwd=UPSTREAM).strip()


def parse_tz(tz):
    tz = (tz or "AoE").strip()
    if tz.lower() in ("aoe", "anywhere on earth"):
        return timezone(timedelta(hours=-12)), "AoE"
    if tz.upper() in ("PST", "PDT", "PT"):
        return ZoneInfo("America/Los_Angeles"), "Pacific"
    m = re.fullmatch(r"(?:UTC|GMT)\s*([+-])?\s*(\d{1,2})(?::?(\d{2}))?", tz, re.I)
    if m:
        sign = -1 if m.group(1) == "-" else 1
        off = timedelta(hours=int(m.group(2) or 0), minutes=int(m.group(3) or 0)) * sign
        label = "UTC" if not off else f"UTC{'+' if sign > 0 else '-'}{int(m.group(2))}"
        return timezone(off), label
    if tz.upper() in ("UTC", "GMT", "Z"):
        return timezone.utc, "UTC"
    return ZoneInfo(tz), tz


def to_utc(value, tz):
    zone, label = parse_tz(tz)
    s = str(value).strip()
    fmt = "%Y-%m-%d %H:%M:%S" if len(s) > 10 else "%Y-%m-%d"
    dt = datetime.strptime(s[:19], fmt)
    if len(s) <= 10:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt.replace(tzinfo=zone).astimezone(timezone.utc), label


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def group_of(kind, label):
    if kind == "registration":
        return "submission" if "paper" in label.lower() else "other"
    group = TYPE_GROUP.get(kind, "other")
    if group == "submission" and SIDE_TRACK.search(label):
        return "other"
    return group


def clean_note(note):
    if not note:
        return None, None
    link = re.search(r"href=['\"]([^'\"]+)", note)
    text = html.unescape(re.sub(r"<[^>]+>", "", note))
    text = re.sub(r"\s*More info\s*(can be found\s*)?here\.?", "", text, flags=re.I)
    text = re.sub(r"\s*All (important dates|info) can be found here\.?", "", text, flags=re.I)
    return (text.strip() or None), (link.group(1) if link else None)


def core_rank(entry):
    m = re.search(r"CORE:\s*([A-C]\*?)", entry.get("rankings") or "")
    if m:
        return {"system": "CORE", "value": m.group(1)}
    era = entry.get("era_rating")
    return {"system": "ERA", "value": era.upper()} if era else None


def milestones(entry):
    raw = list(entry.get("deadlines") or [])
    if not raw:  # older entries use flat fields
        tz = entry.get("timezone")
        if entry.get("abstract_deadline"):
            raw.append({"type": "abstract", "label": "Abstract deadline",
                        "date": entry["abstract_deadline"], "timezone": tz})
        if entry.get("deadline"):
            raw.append({"type": "paper", "label": "Paper deadline",
                        "date": entry["deadline"], "timezone": tz})
    out = []
    for d in raw:
        try:
            when, tz_label = to_utc(d["date"], d.get("timezone") or entry.get("timezone"))
        except (ValueError, KeyError) as exc:
            print(f"  skip {entry['id']} {d.get('label')}: {exc}")
            continue
        out.append({
            "label": d.get("label") or d["type"],
            "type": d["type"],
            "group": group_of(d["type"], d.get("label") or ""),
            "at": iso(when),
            "tz": tz_label,
        })
    last_sub = max((m["at"] for m in out if m["group"] == "submission"), default=None)
    for key, label in (("start", "Conference starts"), ("end", "Conference ends")):
        if entry.get(key):
            day = date.fromisoformat(str(entry[key]))
            # Upstream typo guard: a conference can't happen before its own deadline.
            if last_sub and day.isoformat() < last_sub[:10] and day.year == entry["year"] - 1:
                fixed = day.replace(year=entry["year"])
                WARNINGS.append(f"{entry['id']}: {key} {day} looks like a typo, using {fixed}")
                day = fixed
            out.append({"label": label, "type": key, "group": "conference",
                        "day": day.isoformat(), "at": iso(datetime(day.year, day.month, day.day,
                                                                    tzinfo=timezone.utc))})
    out.sort(key=lambda m: m["at"])
    return out


def edition(entry):
    note, note_link = clean_note(entry.get("note"))
    ms = milestones(entry)
    return {
        "id": entry["id"],
        "year": entry["year"],
        "dates": entry.get("date"),
        "city": entry.get("city"),
        "country": entry.get("country"),
        "venue": entry.get("venue"),
        "link": entry.get("link"),
        "note": note,
        "note_link": note_link,
        "tentative": bool(entry.get("note") and TENTATIVE.search(entry["note"])),
        "estimated": False,
        "milestones": ms,
        "sources": ["hf"],
        "checks": [],
        "links": [],
    }


def shift_years(ms, years):
    out = []
    for m in ms:
        dt = datetime.strptime(m["at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        try:
            dt = dt.replace(year=dt.year + years)
        except ValueError:  # Feb 29
            dt = dt.replace(year=dt.year + years, day=28)
        moved = {**m, "at": iso(dt)}
        if "day" in m:
            moved["day"] = dt.date().isoformat()
        out.append(moved)
    return out


# Venues that don't run every year, for when upstream lists only one edition.
BIENNIAL = {"ICCV", "ECCV"}


def series_cycle(title, series_editions):
    """Years between editions, or None if it can't be told from the data."""
    if title in BIENNIAL:
        return 2
    years = sorted({e["year"] for e in series_editions if not e["estimated"]})
    gaps = [b - a for a, b in zip(years, years[1:])]
    return min(gaps) if gaps else None


def estimate_next(series_editions, now, cycle):
    """Project the next edition from the latest one that has deadlines."""
    dated = [e for e in series_editions if any(m["group"] == "submission" for m in e["milestones"])]
    if not dated:
        return None
    last = max(dated, key=lambda e: e["year"])
    cycle = cycle or 1
    # Skip ahead until the projected submission deadline is in the future.
    step = cycle
    while True:
        # Project only the main cycle; side events and source labels don't carry over.
        ms = [{k: v for k, v in m.items() if k not in ("src", "notime")}
              for m in shift_years(last["milestones"], step) if m["group"] != "other"]
        if any(m["type"] in MAIN_SUBMISSION and m["group"] == "submission" and m["at"] > iso(now)
               for m in ms):
            break
        step += cycle
    year = last["year"] + step
    existing = next((e for e in series_editions if e["year"] == year), None)
    if existing:
        # Keep what is announced (often venue and conference dates); project the rest.
        known = {m["type"] for m in existing["milestones"]}
        merged = existing["milestones"] + [{**m, "est": True} for m in ms if m["type"] not in known]
        return {**existing, "milestones": sorted(merged, key=lambda m: m["at"]),
                "estimated": True, "estimated_from": last["year"]}
    return {**last, "id": f"{last['id']}-est{year}", "year": year,
            "milestones": [{**m, "est": True} for m in ms],
            "estimated": True, "estimated_from": last["year"],
            "dates": None, "city": None, "country": None, "venue": None, "lat": None, "lng": None,
            "last_place": ", ".join(x for x in (last.get("city"), last.get("country")) if x) or None,
            "note": None, "note_link": None, "tentative": False, "checks": [], "place_src": None,
            "links": []}


def estimate_gap_conference(series_editions, now, cycle):
    """An edition whose deadlines passed unrecorded can still have its conference ahead.

    Example: ICASSP 2027's deadline passed before upstream listed it, so the
    deadline estimate jumps to 2028, but the 2027 conference itself is still to
    come. Project just its conference dates so the map and list can show it.
    """
    held = [e for e in series_editions if not e["estimated"]
            and any(m["type"] == "start" for m in e["milestones"])]
    if not held:
        return None
    last = max(held, key=lambda e: e["year"])
    if not cycle:
        return None
    if any(m["type"] == "end" and m["at"] >= iso(now - timedelta(days=1))
           for e in series_editions for m in e["milestones"] if e["year"] <= last["year"] + cycle):
        return None  # a conference is already known or projected for the near term
    if not cycle:
        return None  # only one edition known; don't guess the rhythm
    year = last["year"] + cycle
    if any(e["year"] == year for e in series_editions):
        return None
    conf = [m for m in last["milestones"] if m["group"] == "conference"]
    ms = [{**m, "est": True} for m in shift_years(conf, cycle)]
    if not ms or max(m["at"] for m in ms) < iso(now):
        return None
    return {**last, "id": f"{last['id']}-conf{year}", "year": year, "milestones": ms,
            "estimated": True, "estimated_from": last["year"],
            "dates": None, "city": None, "country": None, "venue": None, "lat": None, "lng": None,
            "last_place": ", ".join(x for x in (last.get("city"), last.get("country")) if x) or None,
            "note": None, "note_link": None, "tentative": False, "checks": [], "place_src": None,
            "links": []}


def series_key(entry):
    return re.sub(r"\s+\d{4}$", "", entry["title"]).strip()


GEOCODE_CACHE = ROOT / "data" / "geocode.json"


def geocoder():
    """City lookups via OpenStreetMap Nominatim, cached in the repo (1 req/s policy)."""
    try:
        cache = json.loads(GEOCODE_CACHE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        cache = {}
    last_call = [0.0]

    def lookup(city, country):
        if not city:
            return None
        key = f"{city}, {country}" if country else city
        if key in cache:
            return cache[key]
        wait = 1.1 - (time.monotonic() - last_call[0])
        if wait > 0:
            time.sleep(wait)
        last_call[0] = time.monotonic()
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": key, "format": "jsonv2", "limit": 1})
        req = urllib.request.Request(url, headers={"User-Agent": "ai-deadlines (https://ai-deadlines.ruzcko.com)"})
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                hits = json.load(res)
        except OSError as exc:
            print(f"  geocode failed for {key}: {exc}")
            return None  # not cached, so it is retried next sync
        cache[key] = [round(float(hits[0]["lat"]), 4), round(float(hits[0]["lon"]), 4)] if hits else None
        GEOCODE_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True),
                                 encoding="utf-8")
        return cache[key]

    return lookup


def build(now):
    geocode = geocoder()
    series = {}
    for path in sorted((UPSTREAM / CONF_DIR).glob("*.yml")):
        entries = yaml.safe_load(path.read_text(encoding="utf-8")) or []
        updated = file_updated(path.name)
        for entry in entries:
            key = series_key(entry)
            s = series.setdefault(key, {
                "key": re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-"),
                "title": key,
                "full_name": entry.get("full_name"),
                "areas": [],
                "tags": [],
                "rank": None,
                "source": f"{UPSTREAM_URL}/blob/main/{CONF_DIR}/{path.name}",
                "updated": updated,
                "editions": [],
            })
            s["updated"] = max(s["updated"], updated)
            s["full_name"] = entry.get("full_name") or s["full_name"]
            s["rank"] = core_rank(entry) or s["rank"]
            for tag in entry.get("tags") or []:
                area = TAG_AREA.get(tag.strip().lower())
                if area and area not in s["areas"]:
                    s["areas"].append(area)
                if tag not in s["tags"]:
                    s["tags"].append(tag)
            ed = edition(entry)
            ed["lat"], ed["lng"] = geocode(ed["city"], ed["country"]) or (None, None)
            s["editions"].append(ed)

    conferences, SOURCES["pr_updated"] = paperrush.fetch()
    added, filled = paperrush.merge(
        series, conferences, group_of=group_of, geocode=geocode, last_updated=SOURCES["pr_updated"],
        series_key_of=lambda name: re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"))
    print(f"PaperRush: {len(conferences)} editions; new venues {added or 'none'}")
    for f in filled:
        print("  filled from PaperRush:", f)

    out = []
    for s in series.values():
        s["editions"].sort(key=lambda e: e["year"])
        has_future_submission = any(
            m["type"] in MAIN_SUBMISSION and m["group"] == "submission" and m["at"] > iso(now)
            for e in s["editions"] for m in e["milestones"])
        if not has_future_submission:
            est = estimate_next(s["editions"], now, series_cycle(s["title"], s["editions"]))
            if est:
                s["editions"] = [e for e in s["editions"] if e["year"] != est["year"]] + [est]
        gap = estimate_gap_conference(s["editions"], now, series_cycle(s["title"], s["editions"]))
        if gap:
            s["editions"] = sorted(s["editions"] + [gap], key=lambda e: e["year"])
        # Keep the last past edition for context; drop older ones.
        live = [e for e in s["editions"] if any(m["at"] > iso(now - timedelta(days=60))
                                                for m in e["milestones"])]
        s["editions"] = live or s["editions"][-1:]
        if not s["areas"]:
            s["areas"] = ["ml"]
        out.append(s)
    out.sort(key=lambda s: s["title"].lower())
    return out


# --- iCalendar -------------------------------------------------------------

def ics_escape(text):
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not parts else 74):
            parts.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    parts.append(cur.decode("utf-8"))
    return "\r\n ".join(parts)


def ics(series, groups, name, stamp):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ruzcko//ai-deadlines//EN",
             "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{ics_escape(name)}",
             "X-PUBLISHED-TTL:PT12H", "REFRESH-INTERVAL;VALUE=DURATION:PT12H"]
    for s in series:
        for e in s["editions"]:
            title = f"{s['title']} {e['year']}"
            for m in e["milestones"]:
                if m.get("est") or m["group"] not in groups or m["type"] == "end":
                    continue
                uid = f"{e['id']}-{m['type']}-{m['at'][:10]}@ai-deadlines.ruzcko.com"
                desc = f"{s['full_name'] or title}\n{m['label']}"
                if m.get("tz"):
                    desc += f" ({m['tz']})"
                if m.get("src") == "pr":
                    desc += "\nSource: PaperRush"
                desc += f"\nAlways confirm on the official site: {e['link'] or ''}"
                ev = ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp}"]
                if m["type"] == "start":
                    end = next((x for x in e["milestones"] if x["type"] == "end"), m)
                    last = date.fromisoformat(end["day"]) + timedelta(days=1)
                    place = ", ".join(x for x in (e.get("city"), e.get("country")) if x)
                    ev += [f"DTSTART;VALUE=DATE:{m['day'].replace('-', '')}",
                           f"DTEND;VALUE=DATE:{last.strftime('%Y%m%d')}",
                           f"SUMMARY:{ics_escape(title)}"]
                    if place:
                        ev.append(f"LOCATION:{ics_escape(place)}")
                else:
                    at = datetime.strptime(m["at"], "%Y-%m-%dT%H:%M:%SZ")
                    ev += [f"DTSTART:{(at - timedelta(hours=1)).strftime('%Y%m%dT%H%M%SZ')}",
                           f"DTEND:{at.strftime('%Y%m%dT%H%M%SZ')}",
                           f"SUMMARY:{ics_escape(f'{title} · {m['label']}')}"]
                ev += [f"DESCRIPTION:{ics_escape(desc)}"]
                if e.get("link"):
                    ev.append(f"URL:{e['link']}")
                ev.append("END:VEVENT")
                lines += ev
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(line) for line in lines) + "\r\n"


def main():
    now = datetime.now(timezone.utc)
    sha, upstream_when = fetch_upstream()
    series = build(now)
    payload = {
        "synced_at": iso(now),
        "upstream": {"repo": UPSTREAM_URL, "commit": sha, "updated": upstream_when},
        "paperrush": {"repo": paperrush.REPO_URL, "updated": SOURCES["pr_updated"]},
        "groups": {g: GROUP_NAMES[g] for g in GROUPS},
        "areas": AREAS,
        "series": series,
    }
    (SITE / "data").mkdir(parents=True, exist_ok=True)
    (SITE / "data" / "conferences.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    cal = SITE / "cal"
    cal.mkdir(exist_ok=True)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    feeds = {g: [g] for g in GROUPS if g != "other"}
    feeds["all"] = [g for g in GROUPS if g != "other"]
    for name, groups in feeds.items():
        label = "AI deadlines" if name == "all" else f"AI deadlines · {GROUP_NAMES[name]}"
        (cal / f"{name}.ics").write_text(ics(series, groups, label, stamp), encoding="utf-8",
                                         newline="")

    n_ed = sum(len(s["editions"]) for s in series)
    n_est = sum(e["estimated"] for s in series for e in s["editions"])
    print(f"{len(series)} series, {n_ed} editions ({n_est} estimated), upstream {sha[:7]}")
    for w in WARNINGS:
        print("  upstream data:", w)


if __name__ == "__main__":
    main()

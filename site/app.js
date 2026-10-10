"use strict";

const STORE = "ai-deadlines:v1";
const TOP_RANKS = new Set(["A*", "A"]);
const MAIN_GROUPS = ["submission", "reviews", "decision", "camera", "conference"];
const FOCUS = [["submission", "Submissions"], ["reviews", "Reviews"], ["decision", "Decisions"], ["camera", "Camera-ready"], ["conference", "Conferences"], ["all", "All"]];
const $ = (id) => document.getElementById(id);

const state = {
  q: "",
  focus: "submission",
  side: false, // workshops, tutorials, registration
  groups: new Set(["submission"]), // derived from focus + side
  areas: new Set(),
  starred: new Set(),
  starredOnly: false,
  top: false,
  hideEst: false,
  tz: "local", // or "aoe"
  clock: null, // "12" or "24"; null follows the device
  theme: "auto",
  open: new Set(),
  view: "list",
  span: "all",
  watch: null, // Set of venue keys from a shared ?watch= link
  allEst: false, // show every "not announced yet" tile, not just the first few
};
const EST_TILES = 12;
let DATA = null;

function syncGroups() {
  state.groups = new Set(state.focus === "all" ? MAIN_GROUPS : [state.focus]);
  if (state.side) state.groups.add("other");
}

// ---- persistence (per-viewer convenience only) ----
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (FOCUS.some(([k]) => k === s.focus)) state.focus = s.focus;
    else if (Array.isArray(s.groups) && s.groups.length === 1 && FOCUS.some(([k]) => k === s.groups[0])) state.focus = s.groups[0];
    if (Array.isArray(s.areas)) state.areas = new Set(s.areas);
    if (Array.isArray(s.starred)) state.starred = new Set(s.starred);
    state.starredOnly = !!s.starredOnly;
    state.top = !!s.top;
    state.hideEst = !!s.hideEst;
    state.side = !!s.side;
    if (s.tz === "aoe") state.tz = "aoe";
    if (s.clock === "12" || s.clock === "24") state.clock = s.clock;
    if (["light", "dark"].includes(s.theme)) state.theme = s.theme;
    const qt = new URLSearchParams(location.search).get("theme"); // temporary: palette comparison frames
    if (qt === "light" || qt === "dark") state.theme = qt;
    if (["map", "calendar"].includes(s.view)) state.view = s.view;
    if (["6", "12", "all"].includes(s.span)) state.span = s.span;
  } catch (_) { /* storage unavailable */ }
  syncGroups();
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      focus: state.focus, side: state.side, areas: [...state.areas], starred: [...state.starred],
      starredOnly: state.starredOnly, top: state.top, hideEst: state.hideEst, tz: state.tz, clock: state.clock, theme: state.theme,
      view: state.view, span: state.span,
    }));
  } catch (_) { /* storage unavailable */ }
}

// ---- formatting ----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const AOE = "Etc/GMT+12";

// 12- or 24-hour clock: the viewer's pick, else whatever their device uses.
const DEVICE_24H = (() => {
  try { return !new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12; } catch (_) { return false; }
})();
const use24 = () => (state.clock ? state.clock === "24" : DEVICE_24H);
const hourOpts = () => (use24() ? { hourCycle: "h23" } : { hour12: true });

// Instants follow the "Times in" switch: your local time, or Anywhere on Earth (UTC-12).
const fmtCache = {};
function fmtIn(kind) {
  const tz = state.tz === "aoe" ? AOE : undefined;
  const key = kind + (tz || "") + (use24() ? "24" : "12");
  if (!fmtCache[key]) {
    const opts = {
      dt: { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
      dts: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
      t: { hour: "numeric", minute: "2-digit" },
    }[kind];
    fmtCache[key] = new Intl.DateTimeFormat(undefined, { ...opts, ...(opts.hour ? hourOpts() : {}), timeZone: tz });
  }
  return fmtCache[key];
}
const tzTag = () => (state.tz === "aoe" ? " AoE" : "");
const fmtDT = (t) => fmtIn("dt").format(t) + tzTag();
// Kept for calendar.js/share.js: formats an instant per the switch.
const fmtDateTime = { format: (t) => fmtDT(t) };

// Calendar day (YYYY-MM-DD) of an instant, in the chosen zone.
function zoneDayKey(t) {
  if (state.tz !== "aoe") return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: AOE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(t).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function zoneFor(label) {
  if (!label) return null;
  if (label === "AoE") return AOE;
  if (label === "UTC") return "UTC";
  if (label === "Pacific") return "America/Los_Angeles";
  const m = /^UTC([+-])(\d+)$/.exec(label);
  if (m) return `Etc/GMT${m[1] === "+" ? "-" : "+"}${m[2]}`; // Etc/ signs are inverted
  return label;
}
function inZone(date, label) {
  const tz = zoneFor(label);
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...hourOpts(), timeZone: tz }).format(date) + " " + label;
  } catch (_) { return label; }
}
// Row dates: drop the year (and weekday) when it's within the coming year, to keep rows on one line.
function whenShort(item) {
  if (item.m.est) return "around " + fmtMonth.format(item.t);
  const soon = item.t - Date.now() < 300 * 86400000;
  if (item.m.day) return new Intl.DateTimeFormat(undefined, soon ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(new Date(item.m.day + "T12:00:00"));
  return soon ? fmtIn("dts").format(item.t) + tzTag() : fmtDT(item.t);
}
function whenText(item) {
  if (item.m.est) return "around " + fmtMonth.format(item.t);
  if (item.m.day) return fmtDate.format(new Date(item.m.day + "T12:00:00"));
  return fmtDT(item.t);
}
// The official-zone time, shown next to ours unless they're the same thing.
function officialAlt(item) {
  const { m, t } = item;
  if (m.est || m.day || !m.tz || m.notime) return "";
  if (state.tz === "aoe" && m.tz === "AoE") return "";
  return inZone(t, m.tz);
}

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}
function compact(ms, estimated) {
  const p = parts(ms);
  if (estimated) return p.d < 45 ? "Due soon?" : p.d >= 60 ? `~${Math.round(p.d / 30.4)} mo` : `~${p.d} d`;
  if (p.d >= 2) return `${p.d}d ${p.h}h`;
  const h = p.d * 24 + p.h;
  return h ? `${h}h ${String(p.m).padStart(2, "0")}m` : `${p.m}m ${String(p.s).padStart(2, "0")}s`;
}
// Departures-board countdown: one big number, a small unit line.
function cdParts(ms, est) {
  const p = parts(ms);
  if (est) {
    if (p.d < 45) return ["Soon?", "not announced"];
    return p.d >= 60 ? [`~${Math.round(p.d / 30.4)}`, "months"] : [`~${p.d}`, "days"];
  }
  if (p.d >= 2) return [String(p.d), p.d < 14 ? `days ${p.h}h` : "days"];
  const h = p.d * 24 + p.h;
  if (h >= 1) return [String(h), `${h === 1 ? "hour" : "hours"} ${p.m}m`]; // big number's unit as a word, remainder compact
  return [String(p.m), `min ${p.s}s`];
}
// Single-unit countdown for tight spots: "32d", "17h", "45m".
function shortCd(ms) {
  const p = parts(ms);
  if (p.d >= 1) return `${p.d}d`;
  return p.h ? `${p.h}h` : `${p.m}m`;
}
// Hero clock labels: "1 day", "1 hour"; min and sec are abbreviations, fine for any number.
function clockLabel(k, n) {
  return { d: n === 1 ? "day" : "days", h: n === 1 ? "hour" : "hours", m: "min", s: "sec" }[k];
}
function ago(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}
function urgency(ms) {
  const d = ms / 86400000;
  return d < 7 ? "u-hot" : d < 30 ? "u-warm" : "";
}

// ---- sources, cross-checks, reports ----
const SRC_NAME = { hf: "Hugging Face", pr: "PaperRush" };
const PAPERRUSH_SITE = "https://awsaf49.github.io/paperrush/";
const REPORT_REPO = { hf: "https://github.com/huggingface/ai-deadlines", pr: "https://github.com/awsaf49/paperrush" };
const SITE_URL = "https://ai-deadlines.ruzcko.com";

function milestoneValue(m) {
  if (m.day) return m.day;
  return `${m.at.slice(0, 10)} ${m.at.slice(11, 16)} UTC` + (m.tz && m.tz !== "UTC" ? ` (listed as ${m.tz})` : "");
}

// Prefilled GitHub issue on the source that supplied the dates; the viewer reviews and submits it.
function reportUrl(s, e, src) {
  const listed = e.milestones.filter((m) => !m.est && (m.src || "hf") === src && m.type !== "end");
  if (!listed.length) return null;
  const file = src === "pr" ? `${REPORT_REPO.pr}/blob/main/js/data.js` : (s.source.includes("huggingface") ? s.source : REPORT_REPO.hf);
  const body = [
    `**Venue:** ${s.title} ${e.year}`,
    `**Data:** ${file}`,
    e.link ? `**Official site:** ${e.link}` : "",
    "",
    `Dates currently listed:`,
    ...listed.map((m) => `- ${m.label}: ${milestoneValue(m)}`),
    "",
    `**What's wrong, and the correct date (with a link to the official source):**`,
    "",
    "",
    `_Spotted via ${SITE_URL}/?v=${s.key}_`,
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  const title = `Wrong date: ${s.title} ${e.year}`;
  return `${REPORT_REPO[src]}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

function checkBadge(e) {
  const checks = e.checks || [];
  if (!checks.length) return "";
  return checks.some((c) => !c.agree)
    ? `<span class="badge warn" title="Hugging Face and PaperRush list different dates">⚠ Sources differ</span>`
    : `<span class="badge ok" title="Hugging Face and PaperRush list the same dates">✓ 2 sources</span>`;
}

function checkWhen(v, tz, notime) {
  if (!v) return "";
  if (v.length === 10) return fmtDate.format(new Date(v + "T12:00:00"));
  const d = new Date(v);
  return notime ? fmtDate.format(d) + " (no time given)" : fmtDT(d);
}

function checksBlock(e) {
  const checks = e.checks || [];
  if (!checks.length) return "";
  const items = checks.map((c) => c.agree
    ? `<li class="agree">✓ <b>${esc(c.what)}</b>: both sources say ${esc(checkWhen(c.hf, c.hf_tz))}</li>`
    : `<li class="differ">⚠ <b>${esc(c.what)}</b>: Hugging Face says ${esc(checkWhen(c.hf, c.hf_tz))}, PaperRush says ${esc(checkWhen(c.pr, c.pr_tz, c.pr_notime))}. Check the official site.</li>`).join("");
  return `<ul class="checks">${items}</ul>`;
}

// ---- model ----
function itemsOf(series) {
  const out = [];
  for (const e of series.editions) {
    for (const m of e.milestones) out.push({ series, edition: e, m, t: new Date(m.at) });
  }
  return out;
}
function nextFor(series, now) {
  let best = null;
  for (const it of itemsOf(series)) {
    if (it.t <= now || !state.groups.has(it.m.group) || it.m.type === "end") continue;
    if (state.hideEst && it.m.est) continue;
    if (!best || it.t < best.t) best = it;
  }
  return best;
}
function matches(s) {
  if (state.watch) return state.watch.has(s.key) && matchesQuery(s);
  if (state.starredOnly && !state.starred.has(s.key)) return false;
  if (state.top && !(s.rank && TOP_RANKS.has(s.rank.value))) return false;
  if (state.areas.size && !s.areas.some((a) => state.areas.has(a))) return false;
  return matchesQuery(s);
}
function matchesQuery(s) {
  if (state.q) {
    const hay = [s.title, s.full_name, ...s.tags, ...s.editions.flatMap((e) => [e.city, e.country, e.year])].join(" ").toLowerCase();
    if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
function upcomingRows(filter = matches) {
  const now = new Date();
  const rows = [];
  let nothing = 0;
  for (const s of DATA.series) {
    if (!filter(s)) continue;
    const next = nextFor(s, now);
    if (next) rows.push({ s, next }); else nothing++;
  }
  rows.sort((a, b) => a.next.t - b.next.t);
  return { rows, nothing, now };
}

// ---- toolbar ----
function renderToolbar() {
  $("focus").innerHTML = FOCUS.map(([k, name]) => `<button type="button" role="radio" data-focus="${k}" aria-checked="${state.focus === k}">${k !== "all" ? `<span class="sw" style="background:var(--g-${k})"></span>` : ""}${esc(name)}</button>`).join("");
  const n = state.starred.size;
  $("starPill").innerHTML = `★ Starred${n ? ` <span>${n}</span>` : ""}`;
  $("starPill").setAttribute("aria-pressed", state.starredOnly);
  const picked = Object.entries(DATA.areas).filter(([a]) => state.areas.has(a)).map(([, name]) => name);
  $("areaLabel").textContent = !picked.length ? "All areas" : picked.length === 1 ? picked[0] : `${picked[0]} +${picked.length - 1}`;
  $("areaBtn").classList.toggle("on", picked.length > 0);
  $("areaList").innerHTML = Object.entries(DATA.areas).map(([a, name]) => {
    const count = DATA.series.filter((s) => s.areas.includes(a)).length;
    return `<label class="opt"><input type="checkbox" data-area="${a}" ${state.areas.has(a) ? "checked" : ""}><span><b>${esc(name)}</b><small>${count} venue${count === 1 ? "" : "s"}</small></span></label>`;
  }).join("");
  $("top").checked = state.top;
  $("hideEst").checked = state.hideEst;
  $("side").checked = state.side;
  const active = [state.top, state.hideEst, state.side].filter(Boolean).length;
  $("filterCount").hidden = !active;
  $("filterCount").textContent = active;
  for (const b of document.querySelectorAll("[data-tz]")) b.setAttribute("aria-checked", b.dataset.tz === state.tz);
  for (const b of document.querySelectorAll("[data-clock]")) b.setAttribute("aria-checked", b.dataset.clock === (use24() ? "24" : "12"));
  for (const b of document.querySelectorAll("[data-theme-set]")) b.setAttribute("aria-checked", b.dataset.themeSet === state.theme);
  renderThemeBtn();
}

const THEME_ICON = {
  auto: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13Z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor"/><path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M4.2 15.8l1.7-1.7M14.1 5.9l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" fill="currentColor"/></svg>',
};
function renderThemeBtn() {
  const b = $("themeBtn");
  b.innerHTML = THEME_ICON[state.theme];
  b.setAttribute("aria-label", `Theme: ${state.theme}. Click to change.`);
  b.title = `Theme: ${state.theme}`;
}
function applyTheme() {
  if (state.theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
  if (map) { map.remove(); map = null; } // the vector basemap reads theme colors when built
}

// ---- hero ----
function renderHero() {
  const hero = $("hero");
  // Personal first: with starred venues, the hero is "your next deadline".
  const mine = state.starred.size && !state.watch ? upcomingRows((s) => state.starred.has(s.key) && matchesQuery(s)).rows.filter((r) => !r.next.m.est) : [];
  const pool = mine.length ? mine : upcomingRows().rows.filter((r) => !r.next.m.est);
  const now = new Date();
  const pick = pool[0];
  if (!pick) {
    hero.className = "hero";
    delete hero.dataset.at;
    hero.innerHTML = `<p class="empty">Nothing coming up for these filters.</p>`;
    return;
  }
  const { series: s, edition: e, m, t } = pick.next;
  const ms = t - now;
  hero.className = "hero" + (ms < 7 * 86400000 ? " urgent" : "");
  const p = parts(ms);
  const unit = (n, k) => `<div class="unit"><span class="n" data-k="${k}">${String(n).padStart(2, "0")}</span><span class="l" data-l="${k}">${clockLabel(k, n)}</span></div>`;
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const alt = officialAlt(pick.next);
  const runway = pool.slice(1, 4).map((r) => `<button class="run" type="button" data-open="${esc(r.s.key)}" style="--c:var(--g-${r.next.m.group})">
      <b>${esc(r.s.title)}</b><span>${esc(shortLabel(r.next.m))}</span><em data-at="${esc(r.next.m.at)}">${esc(shortCd(r.next.t - now))}</em></button>`).join("");
  hero.dataset.at = m.at;
  hero.innerHTML = `
    <div class="hero-top">
      <div class="eyebrow"><span class="sw" style="background:var(--g-${m.group})"></span><span class="eb-text">${mine.length ? `<span class="eb-star" aria-hidden="true">★</span>` : ""}<span class="eb-pre">${mine.length ? "Your next deadline" : "Next up"} · </span>${esc(m.label)}</span></div>
      <button class="pill hero-share" type="button" data-sharecard="${esc(s.key)}">Share card</button>
    </div>
    <h1><button class="linklike" type="button" data-open="${esc(s.key)}">${esc(s.title)} ${e.year}</button></h1>
    <p class="what">${esc(s.full_name || "")}${place ? ` · ${esc(place)}` : ""}</p>
    <div class="clock" role="timer" aria-label="Time left">${unit(p.d, "d")}${unit(p.h, "h")}${unit(p.m, "m")}${unit(p.s, "s")}</div>
    <div class="when"><span>${esc(whenText(pick.next))}</span>${alt ? `<span class="muted">${esc(alt)}</span>` : ""}${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">Official site ↗</a>` : ""}</div>
    ${runway ? `<div class="runway"><span class="run-label">Next</span>${runway}</div>` : ""}`;
}

// ---- list ----
function track(next) {
  const ms = next.edition.milestones.filter((m) => m.group !== "other" || state.side);
  if (ms.length < 2) return "";
  const t0 = Date.parse(ms[0].at), t1 = Date.parse(ms[ms.length - 1].at);
  const span = Math.max(1, t1 - t0);
  const now = Date.now();
  const pos = (t) => Math.min(100, Math.max(0, ((t - t0) / span) * 100));
  const dots = ms.map((m) => {
    const t = Date.parse(m.at);
    const cls = ["m", t <= now ? "past" : "", m === next.m ? "is-next" : "", m.est ? "est" : ""].join(" ");
    return `<span class="${cls}" style="left:${pos(t)}%;--c:var(--g-${m.group})" title="${esc(m.label)}"></span>`;
  }).join("");
  const nowMark = now > t0 && now < t1 ? `<span class="done" style="width:${pos(now)}%"></span>` : "";
  return `<div class="track" aria-hidden="true">${nowMark}${dots}</div>`;
}

function details(s, next, now) {
  const e = next.edition;
  const shown = state.side ? e.milestones : e.milestones.filter((m) => m.group !== "other");
  const hidden = e.milestones.length - shown.length;
  const rows = shown.map((m) => {
    const t = new Date(m.at);
    const past = t <= now;
    const when = m.est ? "~" + fmtMonth.format(t) : m.day ? fmtDate.format(new Date(m.day + "T12:00:00")) : fmtDT(t);
    const alt = officialAlt({ m, t });
    const tz = m.est ? "" : m.notime ? `<div class="tz">no time given · assuming end of day AoE</div>` : alt ? `<div class="tz">${esc(alt)}</div>` : "";
    const src = m.src === "pr" ? ` <span class="src" title="This date comes from PaperRush">PaperRush</span>` : "";
    const left = past ? "done" : compact(t - now, m.est);
    return `<tr class="${past ? "past" : ""}${m === next.m ? " is-next" : ""}"><td><span class="sw" style="background:var(--g-${m.group})"></span>${esc(m.label)}${src}</td><td class="when">${esc(when)}${tz}</td><td class="left">${esc(left)}</td></tr>`;
  }).join("");
  const estNote = e.estimated
    ? `<p class="est-note">Not all dates are announced yet. Dates marked ~ are projected from ${esc(s.title)} ${e.estimated_from}, so treat them as a rough plan, not a deadline.${e.last_place ? ` Location not announced; last held in ${esc(e.last_place)}.` : ""}</p>` : "";
  const tent = e.tentative ? `<p class="est-note">The organizers marked these dates as tentative.</p>` : "";
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const seen = new Set();
  const quick = [
    e.link && { label: "Official site", url: e.link },
    e.note_link && { label: "Call for papers", url: e.note_link },
    ...(e.links || []),
  ].filter((l) => l && !seen.has(l.url) && seen.add(l.url))
    .map((l) => `<a class="ql" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("");
  const reports = (e.sources || ["hf"]).map((src) => {
    const url = reportUrl(s, e, src);
    return url && `<a href="${esc(url)}" target="_blank" rel="noopener">${(e.sources || []).length > 1 ? `Report a wrong date (${SRC_NAME[src]})` : "Report a wrong date"} ↗</a>`;
  });
  const links = [
    `<button class="linkbtn" type="button" data-sharecard="${esc(s.key)}">Share card</button>`,
    `<button class="linkbtn" type="button" data-copylink="${esc(s.key)}">Copy link</button>`,
    `<a href="${esc(s.source)}" target="_blank" rel="noopener">Data source ↗</a>`,
    s.also && s.source !== s.also && `<a href="${PAPERRUSH_SITE}" target="_blank" rel="noopener">Also on PaperRush ↗</a>`,
    ...reports,
  ].filter(Boolean).join("");
  const more = hidden ? `<p class="more">+${hidden} side date${hidden === 1 ? "" : "s"} (workshops, tutorials, registration). Turn on <b>Show side events</b> in Filters to see them.</p>` : "";
  return `<div class="details">${estNote}${tent}${checksBlock(e)}<table>${rows}</table>${more}
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ""}
    ${quick ? `<div class="quick">${quick}</div>` : ""}
    <div class="links">${links}</div>
    <div class="meta">${place ? esc(place) + (e.dates ? " · " + esc(e.dates) : "") + " · " : ""}${e.place_src === "pr" ? "Location via PaperRush · " : ""}Sources: ${esc((e.sources || ["hf"]).map((x) => SRC_NAME[x]).join(" + "))}${s.updated ? ` · data last changed ${esc(ago(s.updated))}` : ""}</div></div>`;
}

const BUCKETS = [
  ["week", "Next 7 days"], ["month", "Next 30 days"], ["quarter", "Next 3 months"], ["later", "Later"],
  ["est", "Not announced yet", "Projected from last year's dates"],
];
function bucketOf(next, now) {
  if (next.m.est) return "est";
  const d = (next.t - now) / 86400000;
  return d < 7 ? "week" : d < 30 ? "month" : d < 92 ? "quarter" : "later";
}

function rowHtml({ s, next }, now) {
  const e = next.edition;
  const ms = next.t - now;
  const [big, small] = cdParts(ms, next.m.est);
  const rank = s.rank ? `<span class="rank" title="${esc(s.rank.system)} ranking">${esc(s.rank.value)}</span>` : "";
  const flags = (e.tentative && !next.m.est ? `<span class="badge tent">Tentative</span>` : "") + checkBadge(e);
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const open = state.open.has(s.key);
  const starred = state.starred.has(s.key);
  return `<li class="row ${next.m.est ? "est-row" : urgency(ms)}${open ? " open" : ""}" id="${esc(s.key)}" data-key="${esc(s.key)}">
    <div class="row-main" role="button" tabindex="0" aria-expanded="${open}">
      <div class="cdbox" data-at="${esc(next.m.at)}" data-est="${next.m.est ? 1 : ""}"><span class="big">${esc(big)}</span><span class="small">${esc(small)}</span></div>
      <div class="info">
        <div class="t"><span class="name">${esc(s.title)} ${e.year}</span>${rank}${flags}</div>
        <div class="what"><span class="sw" style="background:var(--g-${next.m.group})"></span><b class="lab-full" title="${esc(next.m.label)}">${esc(next.m.label)}</b><b class="lab-short" title="${esc(next.m.label)}">${esc(shortLabel(next.m))}</b><span class="dot">·</span><span class="when">${esc(whenShort(next))}</span></div>
        <div class="sub">${esc(s.full_name || "")}${place ? ` · ${esc(place)}` : ""}</div>
      </div>
      <button class="star" type="button" data-star="${esc(s.key)}" aria-pressed="${starred}" aria-label="${starred ? "Unstar" : "Star"} ${esc(s.title)}">${starred ? "★" : "☆"}</button>
      ${track(next)}
    </div>
    ${details(s, next, now)}
  </li>`;
}

function renderRows() {
  const { rows, nothing, now } = upcomingRows();
  const list = $("list");
  if (!rows.length) {
    const emptyStars = state.starredOnly && !state.starred.size;
    list.innerHTML = `<div class="empty-state">${emptyStars
      ? `<h3>Your list is empty</h3><p>Tap ☆ on any venue to keep it here. Your list stays on this device.</p><button class="btn" type="button" data-reset="stars">Show all venues</button>`
      : `<h3>Nothing matches</h3><p>No upcoming ${state.focus === "all" ? "dates" : esc(FOCUS.find(([k]) => k === state.focus)[1].toLowerCase())} for these filters${nothing ? ` (${nothing} venue${nothing === 1 ? " has" : "s have"} nothing ahead)` : ""}.</p><button class="btn" type="button" data-reset="all">Reset filters</button>`}</div>`;
    return;
  }
  const groups = new Map(BUCKETS.map(([k]) => [k, []]));
  for (const r of rows) groups.get(bucketOf(r.next, now)).push(r);
  list.innerHTML = BUCKETS.filter(([k]) => groups.get(k).length).map(([k, title, note]) => `
    <section class="bucket b-${k}">
      <h3>${esc(title)} <span class="n">${groups.get(k).length}</span>${note ? `<span class="note">${esc(note)}</span>` : ""}</h3>
      ${k === "est" ? estSection(groups.get(k), now) : `<ol class="list">${groups.get(k).map((r) => rowHtml(r, now)).join("")}</ol>`}
    </section>`).join("") +
    (nothing ? `<p class="count">${nothing} more venue${nothing === 1 ? " has" : "s have"} nothing upcoming for this view.</p>` : "");
}

// Estimated venues are guesses, so they get small tiles instead of full rows. A tile opens into a row;
// starred venues always get the full row.
function estSection(rows, now) {
  const full = rows.filter((r) => state.open.has(r.s.key) || state.starred.has(r.s.key));
  const tiles = rows.filter((r) => !full.includes(r));
  // Collapsed, the few tiles shown favour top-tier venues (A*/A); either way they read in date order.
  const isTop = (r) => (r.s.rank && TOP_RANKS.has(r.s.rank.value) ? 1 : 0);
  const shown = state.allEst ? tiles
    : [...tiles].sort((a, b) => isTop(b) - isTop(a) || a.next.t - b.next.t).slice(0, EST_TILES).sort((a, b) => a.next.t - b.next.t);
  const month = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
  return (full.length ? `<ol class="list">${full.map((r) => rowHtml(r, now)).join("")}</ol>` : "") +
    (shown.length ? `<div class="est-grid">${shown.map(({ s, next }) => `<button class="est-tile" type="button" data-open="${esc(s.key)}" style="--c:var(--g-${next.m.group})">
        <b>${esc(s.title)} ${next.edition.year}</b><span><i class="sw"></i>${esc(shortLabel(next.m))} · ~${esc(month.format(next.t))}</span></button>`).join("")}</div>` : "") +
    (tiles.length > EST_TILES ? `<button class="pill est-more" type="button" data-allest>${state.allEst ? "Show fewer" : `Show all ${tiles.length}`}</button>` : "");
}

const SHORT_LABEL = { submission: "Paper", reviews: "Reviews", decision: "Decision", camera: "Camera-ready", conference: "Conference", other: "Event" };
function shortLabel(m) {
  const l = m.label.toLowerCase();
  if (m.group === "submission") {
    if (m.type === "abstract" || l.includes("abstract")) return "Abstract";
    if (m.type === "supplementary" || l.includes("supplement")) return "Supp.";
    if (l.includes("registration")) return "Registration";
  }
  if (m.group === "reviews" && /rebuttal|response|discussion/.test(l)) return l.includes("end") ? "Rebuttal ends" : "Rebuttal";
  return SHORT_LABEL[m.group] || m.label;
}

function renderFeeds() {
  const host = location.host;
  const feeds = [["all", "Everything"], ...Object.entries(DATA.groups).filter(([g]) => g !== "other")];
  $("feeds").innerHTML = feeds.map(([g, name]) => {
    const https = `${location.protocol}//${host}/cal/${g}.ics`;
    const webcal = `webcal://${host}/cal/${g}.ics`;
    const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
    const sw = g === "all" ? "var(--text)" : `var(--g-${g})`;
    return `<div class="feed"><span class="fn"><span class="sw" style="background:${sw}"></span>${esc(name)}</span>
      <span class="fl"><a href="${esc(webcal)}">Apple/Outlook</a><a href="${esc(google)}" target="_blank" rel="noopener">Google</a><a href="#" data-copy="${esc(https)}">Copy URL</a></span></div>`;
  }).join("");
}

function renderSynced() {
  $("synced").textContent = `Dates updated ${ago(DATA.upstream.updated)}`;
  $("synced").title = `Last checked ${ago(DATA.synced_at)} · upstream ${DATA.upstream.commit.slice(0, 7)}`;
}

function watchLink(keys) {
  return `${location.origin}/?watch=${[...keys].map(encodeURIComponent).join(",")}`;
}

// The bar above the list for a shared list (?watch=) or your own starred list.
function renderListbar() {
  const bar = $("watchbar");
  if (state.watch) {
    const names = DATA.series.filter((s) => state.watch.has(s.key)).map((s) => s.title);
    const allSaved = names.length && [...state.watch].every((k) => state.starred.has(k));
    bar.hidden = false;
    bar.innerHTML = `<span><b>Shared list</b> · ${esc(names.join(", "))}</span>
      <span class="lb-actions"><button class="pill" type="button" data-sharecard="list">Share card</button>${allSaved ? `<span class="muted">All starred</span>` : `<button class="pill" type="button" data-watch="save">★ Star all</button>`}
      <button class="pill" type="button" data-watch="exit">Show everything</button></span>`;
    return;
  }
  if (state.starredOnly && state.starred.size) {
    bar.hidden = false;
    bar.innerHTML = `<span><b>★ Your list</b> · ${state.starred.size} venue${state.starred.size === 1 ? "" : "s"}, kept on this device</span>
      <span class="lb-actions"><button class="pill" type="button" data-copywatch>Copy link</button><button class="pill" type="button" data-sharecard="list">Share card</button></span>`;
    return;
  }
  bar.hidden = true;
}

// ---- deadline gaps: the time between your starred (or shared) venues' next paper deadlines ----
const GAP_WINDOW = 365 * 86400000;
function gapPoint(s, now) {
  // The deadline people plan around: the next paper/submission date, else the abstract.
  let paper = null, abstract = null;
  for (const it of itemsOf(s)) {
    const m = it.m;
    if (it.t <= now || m.group !== "submission" || (state.hideEst && m.est)) continue;
    if (m.type === "paper" || m.type === "submission") { if (!paper || it.t < paper.t) paper = it; }
    else if (m.type === "abstract" && (!abstract || it.t < abstract.t)) abstract = it;
  }
  return paper || abstract;
}
const gapClass = (days) => (days < 14 ? "tight" : days < 30 ? "close" : "");
function gapText(days) {
  if (days < 1) return "same day";
  if (days < 60) return `${Math.round(days)} days`;
  return `${(days / 30.44).toFixed(1).replace(/\.0$/, "")} months`;
}

function renderGaps() {
  const box = $("gaps");
  const keys = state.watch || state.starred;
  const now = new Date();
  const pts = DATA.series.filter((s) => keys.has(s.key)).map((s) => gapPoint(s, now)).filter(Boolean).sort((a, b) => a.t - b.t);
  const inWin = pts.filter((p) => p.t - now <= GAP_WINDOW);
  if (inWin.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  const span = Math.max(inWin[inWin.length - 1].t - now, 30 * 86400000);
  const pos = (t) => ((t - now) / span) * 100;
  const month = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const tight = inWin.slice(1).filter((p, i) => (p.t - inWin[i].t) / 86400000 < 14).length;
  // Labels go above or below the line, whichever has room; with neither, the name stays in the tooltip.
  const lastEnd = { up: -Infinity, down: -Infinity };
  const dots = inWin.map((p) => {
    const x = pos(p.t), half = p.series.title.length * 0.55; // rough label half-width, in % of the track
    const lane = ["up", "down"].find((l) => x - half > lastEnd[l] + 1);
    if (lane) lastEnd[lane] = x + half;
    return `<button class="gp${p.m.est ? " est" : ""}" type="button" data-open="${esc(p.series.key)}" style="left:${x.toFixed(2)}%;--c:var(--g-${p.m.group})" title="${esc(`${p.series.title} ${p.edition.year} · ${p.m.label} · ${whenText(p)}`)}"><i></i>${lane ? `<span class="${lane}">${esc(p.series.title)}</span>` : ""}</button>`;
  }).join("");
  const segs = inWin.slice(1).map((p, i) => {
    const cls = gapClass((p.t - inWin[i].t) / 86400000);
    return cls ? `<span class="gseg ${cls}" style="left:${pos(inWin[i].t).toFixed(2)}%;width:${(pos(p.t) - pos(inWin[i].t)).toFixed(2)}%"></span>` : "";
  }).join("");
  const chain = inWin.map((p, i) => {
    const card = `<button class="gcard${p.m.est ? " est" : ""}" type="button" data-open="${esc(p.series.key)}" style="--c:var(--g-${p.m.group})"><b>${esc(p.series.title)}</b><span>${esc(shortLabel(p.m))} · ${p.m.est ? "~" : ""}${esc(month.format(p.t))}</span></button>`;
    if (!i) return card;
    const days = (p.t - inWin[i - 1].t) / 86400000;
    const cls = gapClass(days);
    return `<span class="garrow ${cls}">${cls === "tight" ? "⚠ " : ""}${esc(gapText(days))}<i>→</i></span>${card}`;
  }).join("");
  const later = pts.length - inWin.length;
  const wasOpen = box.dataset.ready ? box.open : true;
  box.innerHTML = `<summary><span class="g-title">${state.watch ? "Gaps in this list" : "Your deadline gaps"}</span>
      <span class="g-meta">${inWin.length} deadlines · next 12 months${tight ? ` · <b class="tight">${tight} tight gap${tight === 1 ? "" : "s"}</b>` : ""}${later ? ` · +${later} later` : ""}</span></summary>
    <div class="gtrack"><span class="gnow" title="Today"></span>${segs}${dots}</div>
    <div class="gchain">${chain}</div>
    <p class="g-note">Time between each venue's next paper deadline (abstract if there's no paper date). Under 2 weeks is tight. ~ marks estimates.</p>`;
  box.open = wasOpen;
  box.dataset.ready = "1";
}

function renderList() {
  renderListbar();
  renderHero();
  renderGaps();
  renderRows();
  if (state.view === "map") renderMap();
  if (state.view === "calendar") renderCalendar();
}

function render() {
  renderToolbar();
  renderList();
  renderSynced();
}

// ---- map view ----
let map = null, mapLayer = null, leafletLoading = null;
const markers = new Map();

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletLoading) {
    leafletLoading = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "vendor/leaflet/leaflet.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = "vendor/leaflet/leaflet.js";
      js.onload = resolve;
      js.onerror = reject;
      document.head.appendChild(js);
    });
  }
  return leafletLoading;
}

const dayOf = (m) => new Date(m.day + "T12:00:00");

function fmtRange(e) {
  const a = e.milestones.find((m) => m.type === "start");
  const b = e.milestones.find((m) => m.type === "end");
  if (!a) return e.dates || "";
  if (a.est) return "around " + fmtMonth.format(dayOf(a));
  const f = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  return b ? f.formatRange(dayOf(a), dayOf(b)) : f.format(dayOf(a));
}

// Next conference edition per venue, split by whether its city is announced.
function upcomingConferences() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = state.span === "all" ? Infinity : Date.now() + Number(state.span) * 30.44 * 86400000;
  const placed = [], unplaced = [];
  for (const s of DATA.series) {
    if (!matches(s)) continue;
    for (const e of s.editions) {
      const start = e.milestones.find((m) => m.type === "start");
      const end = e.milestones.find((m) => m.type === "end") || start;
      if (!start || new Date(end.day + "T23:59:59") < today) continue;
      const t = dayOf(start);
      if (t <= limit) (e.lat != null ? placed : unplaced).push({ s, e, t, assumed: !!start.est });
      break;
    }
  }
  placed.sort((a, b) => a.t - b.t);
  unplaced.sort((a, b) => a.t - b.t);
  return { placed, unplaced };
}

function nextDeadlineText(s) {
  const now = new Date();
  let best = null;
  for (const it of itemsOf(s)) {
    if (it.t > now && it.m.group === "submission" && (!best || it.t < best.t)) best = it;
  }
  if (!best) return "";
  const when = best.m.est ? "~" + fmtMonth.format(best.t) : compact(best.t - now, false);
  return `Next: ${esc(best.m.label)} · ${esc(when)}`;
}

async function renderMap() {
  const { placed, unplaced } = upcomingConferences();
  $("mapcount").textContent = `${placed.length} on the map` +
    (unplaced.length ? ` · ${unplaced.length} with location not announced` : "");
  $("onmap").innerHTML = placed.length ? `<h3>Where they are</h3><ul>${placed.map(({ s, e, assumed }) => `
    <li><button class="linklike" data-fly="${esc(s.key)}">${esc(s.title)} ${e.year}</button>
      <span>${esc(fmtRange(e))}${assumed ? ` <span class="badge est">Dates assumed</span>` : ""}</span>
      <span class="muted">${esc([e.city, e.country].filter(Boolean).join(", "))}</span></li>`).join("")}</ul>` : "";
  $("tba").innerHTML = unplaced.length ? `<h3>Location not announced yet</h3><ul>${unplaced.map(({ s, e, assumed }) => `
    <li><a href="#${esc(s.key)}">${esc(s.title)} ${e.year}</a>
      <span>${esc(fmtRange(e))}${assumed ? ` <span class="badge est">Assumed</span>` : ""}</span>
      ${e.last_place ? `<span class="muted">last held in ${esc(e.last_place)}</span>` : ""}</li>`).join("")}</ul>` : "";

  try { await loadLeaflet(); } catch (_) {
    $("map").innerHTML = `<p class="empty">The map could not load.</p>`;
    return;
  }
  const css = getComputedStyle(document.documentElement);
  if (!map) {
    // Plain vector basemap (Natural Earth, public domain): no tile provider, follows the theme.
    map = L.map("map", { minZoom: 0.5, maxZoom: 7, zoomSnap: 0.5, maxBounds: [[-75, -220], [85, 220]], attributionControl: false });
    map.setView([25, 10], 1.5);
    const toggleLabels = () => $("map").classList.toggle("labels-on", map.getZoom() >= 3);
    map.on("zoomend", toggleLabels);
    toggleLabels();
    mapLayer = L.layerGroup().addTo(map);
    fetch("vendor/world-110m.geojson").then((r) => r.json()).then((world) => {
      if (!map) return;
      L.geoJSON(world, {
        interactive: false,
        style: { color: css.getPropertyValue("--map-border").trim(), weight: 0.75, fillColor: css.getPropertyValue("--map-land").trim(), fillOpacity: 1 },
      }).addTo(map).bringToBack();
    }).catch(() => {});
  }
  mapLayer.clearLayers();
  markers.clear();
  const byPlace = new Map();
  for (const it of placed) {
    const k = `${it.e.lat},${it.e.lng}`;
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(it);
  }
  const soon = Date.now() + 90 * 86400000;
  const hotColor = css.getPropertyValue("--accent").trim();
  const laterColor = css.getPropertyValue("--g-decision").trim();
  const bounds = [];
  for (const items of byPlace.values()) {
    const { e } = items[0];
    const place = [e.city, e.country].filter(Boolean).join(", ");
    const color = items.some((it) => it.t < soon) ? hotColor : laterColor;
    const marker = L.circleMarker([e.lat, e.lng], {
      radius: 6 + 2 * Math.min(items.length - 1, 3), weight: 2, color, fillColor: color, fillOpacity: 0.55,
    });
    marker.bindTooltip(items.map((it) => `${esc(it.s.title)} ’${String(it.e.year).slice(2)}`).join(" · "), {
      permanent: true, direction: "right", offset: [8, 0], className: "map-label",
    });
    marker.bindPopup(`<div class="pop"><div class="pop-place">${esc(place)}</div>${items.map(({ s, e: ed, assumed }) => `
      <div class="pop-item"><a href="#${esc(s.key)}"><b>${esc(s.title)} ${ed.year}</b></a>
      <div>${esc(fmtRange(ed))}${assumed ? ` <span class="badge est">Dates assumed</span>` : ""}</div>
      ${(ed.checks || []).some((c) => !c.agree && c.what === "Conference starts") ? `<div class="warn-text">⚠ Sources differ on the dates</div>` : ""}
      <div class="muted">${nextDeadlineText(s)}</div></div>`).join("")}</div>`);
    marker.addTo(mapLayer);
    for (const it of items) markers.set(it.s.key, marker);
    bounds.push([e.lat, e.lng]);
  }
  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 4 });
    else if (bounds.length === 1) map.setView(bounds[0], 4);
  }, 0);
}

function setView(v) {
  state.view = v;
  save();
  document.body.dataset.view = v;
  for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-selected", b.dataset.view === v);
  if (v === "map") renderMap();
  if (v === "calendar") renderCalendar();
}

// ---- live ticking ----
function tick() {
  const now = Date.now();
  let expired = false;
  for (const el of document.querySelectorAll(".cdbox[data-at]")) {
    const ms = Date.parse(el.dataset.at) - now;
    if (ms <= 0) { expired = true; break; }
    const [big, small] = cdParts(ms, !!el.dataset.est);
    el.firstElementChild.textContent = big;
    el.lastElementChild.textContent = small;
  }
  for (const el of document.querySelectorAll(".run em[data-at]")) {
    const ms = Date.parse(el.dataset.at) - now;
    if (ms > 0) el.textContent = shortCd(ms);
  }
  const hero = $("hero");
  if (hero.dataset.at) {
    const ms = Date.parse(hero.dataset.at) - now;
    if (ms <= 0) expired = true;
    const p = parts(ms);
    for (const k of ["d", "h", "m", "s"]) {
      const el = hero.querySelector(`[data-k="${k}"]`);
      if (el) el.textContent = String(p[k]).padStart(2, "0");
      const lab = hero.querySelector(`[data-l="${k}"]`);
      if (lab) lab.textContent = clockLabel(k, p[k]);
    }
  }
  if (expired) render();
}

// ---- popovers (Areas, Filters): anchored under their button; a bottom sheet on phones ----
const POPS = [["areadlg", "areaBtn"], ["filterdlg", "filterBtn"]];
function openPop(dlgId, btnId) {
  const dlg = $(dlgId), btn = $(btnId);
  const wasOpen = dlg.open;
  closePops();
  if (wasOpen) return;
  if (matchMedia("(max-width: 640px)").matches) dlg.showModal();
  else {
    const r = btn.getBoundingClientRect();
    dlg.style.top = `${Math.round(r.bottom + 8)}px`;
    dlg.style.right = `${Math.max(16, Math.round(document.documentElement.clientWidth - r.right))}px`;
    dlg.style.maxHeight = `${Math.max(240, Math.round(innerHeight - r.bottom - 24))}px`;
    dlg.show();
  }
  btn.setAttribute("aria-expanded", "true");
}
function closePops() {
  for (const [d, b] of POPS) {
    if ($(d).open) $(d).close();
    $(b).setAttribute("aria-expanded", "false");
  }
}
const openFilters = () => openPop("filterdlg", "filterBtn");
const closeFilters = closePops;

async function copyText(text, btn, done = "Copied") {
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = done;
    setTimeout(() => { btn.textContent = label; }, 1500);
  } catch (_) { window.prompt("Copy this link", text); }
}

function resetFilters() {
  Object.assign(state, { q: "", focus: "submission", side: false, starredOnly: false, top: false, hideEst: false });
  state.areas.clear();
  $("q").value = "";
  syncGroups();
  save();
  render();
}

// ---- events ----
function bind() {
  $("q").addEventListener("input", (ev) => { state.q = ev.target.value.trim(); renderList(); });
  $("focus").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-focus]");
    if (!b) return;
    state.focus = b.dataset.focus;
    syncGroups(); save(); render();
  });
  $("starPill").addEventListener("click", () => { state.starredOnly = !state.starredOnly; save(); render(); });
  $("areaBtn").addEventListener("click", () => openPop("areadlg", "areaBtn"));
  $("areaList").addEventListener("change", (ev) => {
    const a = ev.target.dataset.area;
    if (!a) return;
    if (ev.target.checked) state.areas.add(a); else state.areas.delete(a);
    save(); render();
  });
  $("clearAreas").addEventListener("click", () => { state.areas.clear(); save(); render(); closePops(); });
  $("areadlg").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-close]") || ev.target === $("areadlg")) closePops();
  });
  for (const [id, key] of [["top", "top"], ["hideEst", "hideEst"], ["side", "side"]]) {
    $(id).addEventListener("change", (ev) => {
      state[key] = ev.target.checked;
      syncGroups(); save(); render();
    });
  }
  $("tzSeg").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tz]");
    if (!b) return;
    state.tz = b.dataset.tz;
    save(); render();
  });
  $("clockSeg").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-clock]");
    if (!b) return;
    state.clock = b.dataset.clock;
    save(); render();
  });
  const setTheme = (t) => { state.theme = t; applyTheme(); save(); render(); };
  $("themeSeg").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-theme-set]");
    if (b) setTheme(b.dataset.themeSet);
  });
  $("themeBtn").addEventListener("click", () => setTheme({ auto: "light", light: "dark", dark: "auto" }[state.theme]));
  $("filterBtn").addEventListener("click", openFilters);
  $("filterdlg").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-close]") || ev.target === $("filterdlg")) closeFilters();
  });
  $("resetFilters").addEventListener("click", () => { resetFilters(); closeFilters(); });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest("#filterBtn, #areaBtn, .popover")) return;
    closePops();
  });

  // Everything inside rendered content (list, hero, list bar).
  document.addEventListener("click", (ev) => {
    const star = ev.target.closest("[data-star]");
    if (star) {
      const k = star.dataset.star;
      if (state.starred.has(k)) state.starred.delete(k); else state.starred.add(k);
      save(); render();
      return;
    }
    const open = ev.target.closest("[data-open]");
    if (open) { openVenue(open.dataset.open); return; }
    if (ev.target.closest("[data-allest]")) { state.allEst = !state.allEst; renderRows(); return; }
    const reset = ev.target.closest("[data-reset]");
    if (reset) { resetFilters(); return; }
    const cl = ev.target.closest("[data-copylink]");
    if (cl) { copyText(venueUrl(cl.dataset.copylink), cl, "Link copied"); return; }
    const cw = ev.target.closest("[data-copywatch]");
    if (cw) { copyText(watchLink(state.starred), cw, "Link copied"); return; }
    const w = ev.target.closest("[data-watch]");
    if (w) {
      if (w.dataset.watch === "save") { for (const k of state.watch) state.starred.add(k); save(); }
      else {
        state.watch = null;
        const url = new URL(location.href);
        url.searchParams.delete("watch");
        history.replaceState(null, "", url);
      }
      render();
    }
  });
  $("list").addEventListener("click", (ev) => {
    if (ev.target.closest("a, button, .details")) return;
    const row = ev.target.closest(".row");
    if (!row) return;
    const k = row.dataset.key;
    if (state.open.has(k)) state.open.delete(k); else state.open.add(k);
    row.classList.toggle("open");
    row.querySelector(".row-main").setAttribute("aria-expanded", state.open.has(k));
  });
  $("list").addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList.contains("row-main")) {
      ev.preventDefault();
      ev.target.click();
    }
  });
  $("feeds").addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-copy]");
    if (!a) return;
    ev.preventDefault();
    copyText(a.dataset.copy, a);
  });
  for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => setView(b.dataset.view));
  $("span").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-span]");
    if (!b) return;
    state.span = b.dataset.span;
    for (const x of $("span").querySelectorAll("[data-span]")) x.setAttribute("aria-checked", x === b);
    save(); renderMap();
  });
  $("onmap").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-fly]");
    const m = b && markers.get(b.dataset.fly);
    if (!m) return;
    $("map").scrollIntoView({ behavior: "smooth", block: "center" });
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 4), { duration: 0.6 });
    map.once("moveend", () => m.openPopup());
  });
  // "/" or Ctrl/⌘-K to search, Escape to leave it.
  document.addEventListener("keydown", (ev) => {
    const typing = ev.target.closest("input, textarea, [contenteditable]");
    if ((ev.key === "/" && !typing) || (ev.key.toLowerCase() === "k" && (ev.metaKey || ev.ctrlKey))) {
      ev.preventDefault();
      $("q").focus();
      $("q").select();
    } else if (ev.key === "Escape" && ev.target === $("q")) {
      $("q").blur();
    } else if (ev.key === "Escape") {
      closePops();
    }
  });
  window.addEventListener("hashchange", () => openVenue(decodeURIComponent(location.hash.slice(1))));
}

// Shareable venue link: /?v=key works in link previews (servers never see "#"); #key works in-page.
const venueUrl = (key) => `${location.origin}/?v=${encodeURIComponent(key)}`;

function openVenue(k) {
  const s = DATA.series.find((x) => x.key === k);
  if (!s) return;
  state.open.add(k);
  if (state.view !== "list") setView("list");
  // Make sure the venue is visible regardless of current filters.
  if (!nextFor(s, new Date()) || !matches(s)) {
    if (state.watch && !state.watch.has(k)) state.watch = null;
    state.q = ""; $("q").value = "";
    state.starredOnly = false; state.top = false; state.areas.clear();
    if (!nextFor(s, new Date())) { state.focus = "all"; state.hideEst = false; }
    syncGroups();
    render();
  } else renderList();
  const el = document.getElementById(k);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); // html scroll-padding clears the sticky bars
}

// Star count on the GitHub button; quietly hidden if the API can't tell us.
async function loadStars() {
  try {
    const cached = JSON.parse(sessionStorage.getItem("ai-deadlines:stars") || "null");
    let n = cached && Date.now() - cached.at < 3600e3 ? cached.n : null;
    if (n == null) {
      const res = await fetch("https://api.github.com/repos/ruzcko/ai-deadlines");
      if (!res.ok) return;
      n = (await res.json()).stargazers_count;
      try { sessionStorage.setItem("ai-deadlines:stars", JSON.stringify({ n, at: Date.now() })); } catch (_) { /* fine */ }
    }
    if (typeof n === "number") { $("ghStars").textContent = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n; $("ghStars").hidden = false; }
  } catch (_) { /* offline or rate-limited */ }
}

async function main() {
  load();
  loadStars();
  applyTheme();
  $("tzname").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone + " (your local time), or AoE if you pick it in Filters";
  try {
    const res = await fetch("data/conferences.json", { cache: "no-cache" });
    DATA = await res.json();
    const watch = new URLSearchParams(location.search).get("watch");
    if (watch) {
      const keys = new Set(DATA.series.map((s) => s.key));
      const list = watch.split(",").map((k) => k.trim().toLowerCase()).filter((k) => keys.has(k));
      if (list.length) state.watch = new Set(list);
    }
  } catch (err) {
    $("hero").innerHTML = `<p class="empty">Could not load deadlines. Try reloading.</p>`;
    return;
  }
  renderFeeds();
  for (const x of $("span").querySelectorAll("[data-span]")) x.setAttribute("aria-checked", x.dataset.span === state.span);
  bind();
  bindCalendar();
  bindShare();
  render();
  setView(state.view);
  const v = new URLSearchParams(location.search).get("v");
  if (v) openVenue(v.toLowerCase());
  else if (location.hash) openVenue(decodeURIComponent(location.hash.slice(1)));
  setInterval(tick, 1000);
  setInterval(render, 60000);
}

main();

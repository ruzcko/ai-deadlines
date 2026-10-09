"use strict";

const STORE = "ai-deadlines:v1";
const TOP_RANKS = new Set(["A*", "A"]);
const $ = (id) => document.getElementById(id);

const state = {
  q: "",
  groups: new Set(["submission"]),
  areas: new Set(),
  starred: new Set(),
  starredOnly: false,
  top: false,
  hideEst: false,
  open: new Set(),
  view: "list",
  span: "all",
};
let DATA = null;

// ---- persistence (per-viewer convenience only) ----
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (Array.isArray(s.groups) && s.groups.length) state.groups = new Set(s.groups);
    if (Array.isArray(s.areas)) state.areas = new Set(s.areas);
    if (Array.isArray(s.starred)) state.starred = new Set(s.starred);
    state.starredOnly = !!s.starredOnly;
    state.top = !!s.top;
    state.hideEst = !!s.hideEst;
    if (s.view === "map") state.view = "map";
    if (["6", "12", "all"].includes(s.span)) state.span = s.span;
  } catch (_) { /* storage unavailable */ }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      groups: [...state.groups], areas: [...state.areas], starred: [...state.starred],
      starredOnly: state.starredOnly, top: state.top, hideEst: state.hideEst,
      view: state.view, span: state.span,
    }));
  } catch (_) { /* storage unavailable */ }
}

// ---- formatting ----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDateTime = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function zoneFor(label) {
  if (!label) return null;
  if (label === "AoE") return "Etc/GMT+12";
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
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).format(date) + " " + label;
  } catch (_) { return label; }
}
function whenText(item) {
  if (item.m.est) return "around " + fmtMonth.format(item.t);
  if (item.m.day) return fmtDate.format(new Date(item.m.day + "T12:00:00"));
  return fmtDateTime.format(item.t);
}

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}
function compact(ms, estimated) {
  const p = parts(ms);
  // Projected dates are rough; near ones mean "probably being announced now".
  if (estimated) return p.d < 45 ? "Due soon?" : p.d >= 60 ? `~${Math.round(p.d / 30.4)} mo` : `~${p.d} d`;
  if (p.d >= 2) return `${p.d}d ${p.h}h`;
  const h = p.d * 24 + p.h;
  return h ? `${h}h ${String(p.m).padStart(2, "0")}m` : `${p.m}m ${String(p.s).padStart(2, "0")}s`;
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
  if (state.starredOnly && !state.starred.has(s.key)) return false;
  if (state.top && !(s.rank && TOP_RANKS.has(s.rank.value))) return false;
  if (state.areas.size && !s.areas.some((a) => state.areas.has(a))) return false;
  if (state.q) {
    const hay = [s.title, s.full_name, ...s.tags, ...s.editions.flatMap((e) => [e.city, e.country, e.year])].join(" ").toLowerCase();
    if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

// ---- rendering ----
function renderChips() {
  $("groups").innerHTML = Object.entries(DATA.groups).map(([g, name]) =>
    `<button class="chip" data-group="${g}" aria-pressed="${state.groups.has(g)}"><span class="sw" style="background:var(--g-${g})"></span>${esc(name)}</button>`).join("");
  $("areas").innerHTML = `<button class="chip" data-area="" aria-pressed="${state.areas.size === 0}">All areas</button>` +
    Object.entries(DATA.areas).map(([a, name]) =>
      `<button class="chip" data-area="${a}" aria-pressed="${state.areas.has(a)}">${esc(name)}</button>`).join("");
  $("starred").checked = state.starredOnly;
  $("top").checked = state.top;
  $("hideEst").checked = state.hideEst;
}

function renderHero(rows, now) {
  const hero = $("hero");
  const pick = rows.find((r) => !r.next.m.est) || rows[0];
  if (!pick) {
    hero.className = "hero";
    hero.innerHTML = `<p class="empty">Nothing upcoming for these filters.</p>`;
    return;
  }
  const { series: s, edition: e, m, t } = pick.next;
  const ms = t - now;
  hero.className = "hero" + (ms < 7 * 86400000 ? " urgent" : "");
  const p = parts(ms);
  const unit = (n, l, k) => `<div class="unit"><span class="n" data-k="${k}">${String(n).padStart(2, "0")}</span><span class="l">${l}</span></div>`;
  const est = m.est ? ` <span class="badge est">Estimated</span>` : "";
  hero.dataset.at = m.at;
  hero.innerHTML = `
    <div class="eyebrow">Next up</div>
    <h1>${esc(s.title)} ${e.year}${est}</h1>
    <p class="what"><b>${esc(m.label)}</b> · ${esc(s.full_name || "")}</p>
    <div class="clock">${unit(p.d, "days", "d")}${unit(p.h, "hours", "h")}${unit(p.m, "min", "m")}${unit(p.s, "sec", "s")}</div>
    <div class="when"><span>${esc(whenText(pick.next))}</span>${m.tz && !m.est ? `<span>${esc(inZone(t, m.tz))}</span>` : ""}${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">Official site ↗</a>` : ""}</div>`;
}

function track(next) {
  const ms = next.edition.milestones;
  const t0 = Date.parse(ms[0].at), t1 = Date.parse(ms[ms.length - 1].at);
  const span = Math.max(1, t1 - t0);
  const now = Date.now();
  const pos = (t) => Math.min(100, Math.max(0, ((t - t0) / span) * 100));
  const dots = ms.map((m) => {
    const t = Date.parse(m.at);
    const cls = ["m", t <= now ? "past" : "", m === next.m ? "is-next" : ""].join(" ");
    return `<span class="${cls}" style="left:${pos(t)}%;--c:var(--g-${m.group})" title="${esc(m.label)}"></span>`;
  }).join("");
  const nowMark = now > t0 && now < t1 ? `<span class="done" style="width:${pos(now)}%"></span><span class="now" style="left:${pos(now)}%" title="Now"></span>` : "";
  return `<div class="track" aria-hidden="true">${nowMark}${dots}</div>`;
}

function details(s, next, now) {
  const e = next.edition;
  const rows = e.milestones.map((m) => {
    const t = new Date(m.at);
    const past = t <= now;
    const when = m.est ? "~" + fmtMonth.format(t) : m.day ? fmtDate.format(new Date(m.day + "T12:00:00")) : fmtDateTime.format(t);
    const tz = !m.est && m.tz ? `<div class="tz">${esc(inZone(t, m.tz))}</div>` : "";
    const left = past ? "done" : compact(t - now, m.est);
    return `<tr class="${past ? "past" : ""}"><td><span class="sw" style="background:var(--g-${m.group})"></span>${esc(m.label)}</td><td class="when">${esc(when)}${tz}</td><td class="left">${esc(left)}</td></tr>`;
  }).join("");
  const estNote = e.estimated
    ? `<p class="est-note">Not all dates are announced yet. Dates marked ~ are projected from ${esc(s.title)} ${e.estimated_from}, so treat them as a rough plan, not a deadline.${e.last_place ? ` Location not announced; last held in ${esc(e.last_place)}.` : ""}</p>` : "";
  const tent = e.tentative ? `<p class="est-note">The organizers marked these dates as tentative.</p>` : "";
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const links = [
    e.link && `<a href="${esc(e.link)}" target="_blank" rel="noopener">Official site ↗</a>`,
    e.note_link && e.note_link !== e.link && `<a href="${esc(e.note_link)}" target="_blank" rel="noopener">Call for papers ↗</a>`,
    `<a href="${esc(s.source)}" target="_blank" rel="noopener">Data source ↗</a>`,
    `<a href="#${esc(s.key)}">Link to ${esc(s.title)}</a>`,
  ].filter(Boolean).join("");
  return `<div class="details">${estNote}${tent}<table>${rows}</table>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ""}
    <div class="links">${links}</div>
    <div class="meta">${place ? esc(place) + (e.dates ? " · " + esc(e.dates) : "") + " · " : ""}Data for ${esc(s.title)} last changed upstream ${esc(ago(s.updated))}</div></div>`;
}

function renderRows() {
  const now = new Date();
  const rows = [];
  let nothing = 0;
  for (const s of DATA.series) {
    if (!matches(s)) continue;
    const next = nextFor(s, now);
    if (next) rows.push({ s, next }); else nothing++;
  }
  rows.sort((a, b) => a.next.t - b.next.t);
  renderHero(rows, now);

  $("count").textContent = `${rows.length} venue${rows.length === 1 ? "" : "s"}` +
    (nothing ? ` · ${nothing} more with nothing upcoming for these milestones` : "");

  $("list").innerHTML = rows.map(({ s, next }) => {
    const e = next.edition;
    const ms = next.t - now;
    const rank = s.rank ? `<span class="badge" title="${esc(s.rank.system)} ranking">${esc(s.rank.system)} ${esc(s.rank.value)}</span>` : "";
    const est = next.m.est ? `<span class="badge est">Estimated</span>` : e.tentative ? `<span class="badge tent">Tentative</span>` : "";
    const place = [e.city, e.country].filter(Boolean).join(", ");
    const open = state.open.has(s.key);
    return `<li class="row ${open ? "open" : ""}" id="${esc(s.key)}" data-key="${esc(s.key)}">
      <div class="row-main" role="button" tabindex="0" aria-expanded="${open}">
        <button class="star" data-star="${esc(s.key)}" aria-pressed="${state.starred.has(s.key)}" aria-label="Star ${esc(s.title)}">★</button>
        <div class="name">
          <div class="t">${esc(s.title)} ${e.year} ${rank} ${est}</div>
          <div class="sub">${esc(s.full_name || "")}${place ? " · " + esc(place) : ""}</div>
        </div>
        <div class="next ${next.m.est ? "est-row" : urgency(ms)}">
          <div class="cd" data-at="${esc(next.m.at)}" data-est="${next.m.est ? 1 : ""}">${esc(compact(ms, next.m.est))}</div>
          <div class="lbl"><span class="sw" style="background:var(--g-${next.m.group})"></span>${esc(next.m.label)}</div>
        </div>
        ${track(next)}
      </div>
      ${details(s, next, now)}
    </li>`;
  }).join("");
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

function renderList() {
  renderRows();
  if (state.view === "map") renderMap();
}

function render() {
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
      <div class="muted">${nextDeadlineText(s)}</div></div>`).join("")}</div>`);
    marker.addTo(mapLayer);
    for (const it of items) markers.set(it.s.key, marker);
    bounds.push([e.lat, e.lng]);
  }
  setTimeout(() => {
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
}

// ---- live ticking ----
function tick() {
  const now = Date.now();
  let expired = false;
  for (const el of document.querySelectorAll(".cd[data-at]")) {
    const ms = Date.parse(el.dataset.at) - now;
    if (ms <= 0) { expired = true; break; }
    el.textContent = compact(ms, !!el.dataset.est);
  }
  const hero = $("hero");
  if (hero.dataset.at) {
    const ms = Date.parse(hero.dataset.at) - now;
    if (ms <= 0) expired = true;
    const p = parts(ms);
    for (const k of ["d", "h", "m", "s"]) {
      const el = hero.querySelector(`[data-k="${k}"]`);
      if (el) el.textContent = String(p[k]).padStart(2, "0");
    }
  }
  if (expired) render();
}

// ---- events ----
function bind() {
  $("q").addEventListener("input", (ev) => { state.q = ev.target.value.trim(); renderList(); });
  for (const id of ["starred", "top", "hideEst"]) {
    $(id).addEventListener("change", (ev) => {
      state[id === "starred" ? "starredOnly" : id] = ev.target.checked;
      save(); renderList();
    });
  }
  $("groups").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-group]");
    if (!b) return;
    const g = b.dataset.group;
    if (state.groups.has(g) && state.groups.size > 1) state.groups.delete(g); else state.groups.add(g);
    save(); renderChips(); renderList();
  });
  $("areas").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-area]");
    if (!b) return;
    const a = b.dataset.area;
    if (!a) state.areas.clear();
    else if (state.areas.has(a)) state.areas.delete(a); else state.areas.add(a);
    save(); renderChips(); renderList();
  });
  $("list").addEventListener("click", (ev) => {
    const star = ev.target.closest("[data-star]");
    if (star) {
      const k = star.dataset.star;
      if (state.starred.has(k)) state.starred.delete(k); else state.starred.add(k);
      save(); renderList();
      return;
    }
    if (ev.target.closest("a, .details")) return;
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
  $("feeds").addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-copy]");
    if (!a) return;
    ev.preventDefault();
    try {
      await navigator.clipboard.writeText(a.dataset.copy);
      a.textContent = "Copied";
      a.classList.add("copied");
      setTimeout(() => { a.textContent = "Copy URL"; a.classList.remove("copied"); }, 1500);
    } catch (_) { window.prompt("Copy this feed URL", a.dataset.copy); }
  });
  for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => setView(b.dataset.view));
  $("span").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-span]");
    if (!b) return;
    state.span = b.dataset.span;
    for (const x of $("span").querySelectorAll("[data-span]")) x.setAttribute("aria-pressed", x === b);
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
  window.addEventListener("hashchange", openFromHash);
}

function openFromHash() {
  const k = decodeURIComponent(location.hash.slice(1));
  const s = DATA.series.find((x) => x.key === k);
  if (!s) return;
  state.open.add(k);
  if (state.view !== "list") setView("list");
  // Make sure the venue is visible regardless of current filters.
  if (!nextFor(s, new Date()) || !matches(s)) {
    state.q = s.title; $("q").value = s.title;
    state.starredOnly = false; state.top = false; state.areas.clear();
    for (const g of Object.keys(DATA.groups)) state.groups.add(g);
    renderChips();
  }
  renderList();
  document.getElementById(k)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function main() {
  load();
  $("tzname").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone + " (your local time)";
  try {
    const res = await fetch("data/conferences.json", { cache: "no-cache" });
    DATA = await res.json();
  } catch (err) {
    $("hero").innerHTML = `<p class="empty">Could not load deadlines. Try reloading.</p>`;
    return;
  }
  renderChips();
  renderFeeds();
  for (const x of $("span").querySelectorAll("[data-span]")) x.setAttribute("aria-pressed", x.dataset.span === state.span);
  bind();
  render();
  setView(state.view);
  if (location.hash) openFromHash();
  setInterval(tick, 1000);
  setInterval(render, 60000);
}

main();

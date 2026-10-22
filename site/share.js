"use strict";
// Share cards: a PNG drawn on a canvas, for one venue's next date or for a list of venues.
// Story (9:16) keeps everything between 14% and 80% of the height, 8% in from the sides and out of the
// lower-right corner, which Instagram/Facebook Stories cover. The background still runs edge to edge.

const CARD_FORMATS = {
  story: { w: 1080, h: 1920, label: "Story" },
  square: { w: 1080, h: 1080, label: "Square" },
  wide: { w: 1200, h: 630, label: "Wide" },
};
// Card themes. Every color is a 6-digit hex (the glow and dots append alpha to it), except `line`.
// Text colours are 4.5:1 and milestone colours 3:1 against bg1, bg2 and the midpoint between them (checked 2026-10-14).
// Milestone colors are tuned per theme so they stay readable on its background.
const CARD_THEMES = {
  // The site's own look at night: the slate panel. A saved "signal", "midnight", "aurora" or "sunset" falls back to it.
  console: {
    name: "Slate", bg1: "#182026", bg2: "#0e1316", glow: 0x00, glowColor: "#182026", text: "#eef2f3", muted: "#9aa8b0", faint: "#8d9aa2", line: "#2a353d",
    accent: "#3cc9b0", num: "#eef2f3", submission: "#3cc9b0", reviews: "#ffb000", decision: "#5aa7ff", camera: "#8d9aa2", conference: "#eef2f3", other: "#b08d68",
  },
  // The white instrument panel. A saved "paper" falls back to it.
  daylight: {
    name: "Daylight", bg1: "#ffffff", bg2: "#e4e8ea", glow: 0x00, glowColor: "#ffffff", text: "#12181c", muted: "#4a565d", faint: "#56626a", line: "#c5cdd2",
    accent: "#08695c", num: "#12181c", submission: "#0b7a6b", reviews: "#c95a0c", decision: "#1f62b8", camera: "#6b767d", conference: "#12181c", other: "#8a6a4a",
  },
  // Object themes: each one draws its own layout (`style` picks the drawers in OBJECT_DRAWERS).
  // `swatch` is the picker's CSS background and `dot` its optional dot. Contrast checked 2026-10-22.
  pass: {
    name: "Boarding", style: "pass", swatch: "linear-gradient(#0b7a6b 0 9px, #ffffff 9px)",
    page: "#e4e8ea", paper: "#ffffff", band: "#0b7a6b", onBand: "#ffffff", text: "#12181c", muted: "#4a565d", tear: "#6b767d", line: "#c5cdd2",
  },
  nixie: {
    name: "Nixie", style: "nixie", swatch: "#141008", dot: "#ff9a3c",
    page: "#141008", text: "#f3e6d6", muted: "#a3896c", line: "#3d2f22", tube: "#2a2016", digit: "#ff9a3c", glowColor: "#ff7a1a", estDigit: "#c98a52",
  },
  receipt: {
    name: "Receipt", style: "receipt", swatch: "linear-gradient(90deg, #12181c 50%, transparent 0) center / 8px 2px repeat-x, #fbfbf8",
    page: "#d9dee1", paper: "#fbfbf8", text: "#12181c", muted: "#4a565d",
  },
  graph: {
    name: "Graph", style: "graph",
    swatch: "linear-gradient(#d5dcdf 1px, transparent 1px) 0 0 / 7px 7px, linear-gradient(90deg, #d5dcdf 1px, transparent 1px) 0 0 / 7px 7px, #ffffff",
    page: "#ffffff", minor: "#f0f3f4", major: "#e7ecee", caption: "#08695c", text: "#12181c", muted: "#4a565d", accent: "#0b7a6b",
  },
};
const CARD_COLORS = { ...CARD_THEMES.console }; // the theme being drawn
const FONT = '"IBM Plex Sans Condensed", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace'; // countdown numbers, as on the site
const CARD_STORE = "ai-deadlines:card";
const shareState = { kind: null, payload: null, format: "story", theme: "console", blob: null, url: null };
try {
  const saved = JSON.parse(localStorage.getItem(CARD_STORE) || "{}");
  const theme = { signal: "console", midnight: "console", aurora: "console", sunset: "console", paper: "daylight" }[saved.theme] || saved.theme; // retired themes
  if (CARD_THEMES[theme]) shareState.theme = theme;
  if (CARD_FORMATS[saved.format]) shareState.format = saved.format;
} catch (_) { /* storage unavailable */ }
function saveCardPrefs() {
  try { localStorage.setItem(CARD_STORE, JSON.stringify({ theme: shareState.theme, format: shareState.format })); } catch (_) { /* fine */ }
}

// ---- text helpers ----
function font(g, size, weight = 600, face = FONT) { g.font = `${weight} ${Math.round(size)}px ${face}`; }
function fit(g, text, maxW, size, weight, min = 0.4, face = FONT) {
  let s = size;
  font(g, s, weight, face);
  while (g.measureText(text).width > maxW && s > size * min) { s *= 0.94; font(g, s, weight, face); }
  return s;
}
function wrap(g, text, maxW, maxLines) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (g.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (g.measureText(last + "…").width > maxW && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/\s+$/, "") + "…";
  }
  return lines;
}

// ---- what a card says ----
function cardCount(ms, est) {
  const d = ms / 86400000;
  if (est) return d >= 60 ? [`~${Math.round(d / 30.44)}`, "months away · estimated"] : [`~${Math.max(1, Math.round(d))}`, "days away · estimated"];
  // Same switch points as the site: days until under a day is left, then hours, then minutes.
  if (d >= 1) return [String(Math.floor(d)), Math.floor(d) === 1 ? "day to go" : "days to go"];
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return [String(h), h === 1 ? "hour to go" : "hours to go"];
  return [String(Math.max(1, Math.floor(ms / 60000))), "minutes to go"];
}

// The date in the venue's own timezone, so the card reads the same wherever it's seen.
function officialWhen(e, m) {
  const t = new Date(m.at);
  if (m.est) return "around " + fmtMonth.format(t);
  if (m.day) {
    const endM = m.type === "start" && e.milestones.find((x) => x.type === "end");
    const f = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
    const a = new Date(m.day + "T12:00:00");
    return endM ? f.formatRange(a, new Date(endM.day + "T12:00:00")) : f.format(a);
  }
  const tz = zoneFor(m.tz) || "UTC";
  try {
    const opts = m.notime ? { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: tz }
      : { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", ...hourOpts(), timeZone: tz };
    return new Intl.DateTimeFormat(undefined, opts).format(t) + " " + (m.tz || "UTC");
  } catch (_) { return fmtDateTime.format(t); }
}

function asOf() {
  return "as of " + new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date());
}

function siteHost() { return location.host.includes("localhost") ? "ai-deadlines.ruzcko.com" : location.host; }

// ---- drawing ----
function background(g, W, H, color) {
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, CARD_COLORS.bg1);
  bg.addColorStop(1, CARD_COLORS.bg2);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.9, H * 0.08, 0, W * 0.9, H * 0.08, Math.max(W, H) * 0.7);
  const gc = CARD_COLORS.glowColor || color;
  glow.addColorStop(0, gc + CARD_COLORS.glow.toString(16).padStart(2, "0"));
  glow.addColorStop(1, gc + "00");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
}

function safeBox(fmt, W, H) {
  if (fmt === "story") return { x: W * 0.08, y: H * 0.14, w: W * 0.84, h: H * 0.66 };
  if (fmt === "wide") return { x: W * 0.06, y: H * 0.1, w: W * 0.88, h: H * 0.8 };
  return { x: W * 0.08, y: H * 0.08, w: W * 0.84, h: H * 0.84 };
}

function brand(g, x, y, size) {
  g.fillStyle = CARD_COLORS.accent;
  g.beginPath();
  g.arc(x + size * 0.35, y + size * 0.5, size * 0.3, 0, Math.PI * 2);
  g.fill();
  font(g, size * 0.82, 600);
  g.fillStyle = CARD_COLORS.muted;
  g.textBaseline = "middle";
  g.fillText("AI Conference Deadlines", x + size * 0.9, y + size * 0.52);
  g.textBaseline = "alphabetic";
}

function drawTrack(g, e, next, x, y, w, size) {
  const ms = e.milestones.filter((m) => m.group !== "other");
  if (ms.length < 2) return;
  // Inset both ends by the next milestone's halo radius, so the halo stays inside x..x + w.
  const halo = size * 0.62 * 1.7;
  x += halo; w -= 2 * halo;
  const t0 = Date.parse(ms[0].at), t1 = Date.parse(ms[ms.length - 1].at), now = Date.now();
  const pos = (t) => x + Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0))) * w;
  g.strokeStyle = CARD_COLORS.line;
  g.lineWidth = size * 0.18;
  g.lineCap = "round";
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke();
  if (now > t0) {
    g.strokeStyle = CARD_COLORS.faint;
    g.beginPath(); g.moveTo(x, y); g.lineTo(pos(Math.min(now, t1)), y); g.stroke();
  }
  for (const m of ms) {
    const t = Date.parse(m.at), cx = pos(t), c = CARD_COLORS[m.group] || CARD_COLORS.other;
    const r = m === next ? size * 0.62 : size * 0.4;
    if (m === next) {
      g.fillStyle = c + "44";
      g.beginPath(); g.arc(cx, y, r * 1.7, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.arc(cx, y, r, 0, Math.PI * 2);
    if (t <= now) { g.fillStyle = c + "88"; g.fill(); }
    else { g.fillStyle = CARD_COLORS.bg2; g.fill(); g.strokeStyle = c; g.lineWidth = size * 0.16; g.stroke(); }
  }
}

function drawVenue(g, W, H, fmt, { s, e, m }) {
  const color = CARD_COLORS[m.group] || CARD_COLORS.accent;
  const numColor = m.est ? CARD_COLORS.muted : CARD_COLORS.num || (m.group === "conference" ? CARD_COLORS.text : color);
  background(g, W, H, color);
  const b = safeBox(fmt, W, H);
  const [num, unit] = cardCount(Date.parse(m.at) - Date.now(), m.est);
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const url = `${siteHost()}/?v=${s.key}`;

  if (fmt === "wide") {
    const colW = b.w * 0.56;
    brand(g, b.x, b.y, 30);
    font(g, 24, 700); g.fillStyle = color;
    g.fillText(m.label.toUpperCase().slice(0, 48), b.x, b.y + 100);
    const ts = fit(g, `${s.title} ${e.year}`, colW, 84, 700);
    g.fillStyle = CARD_COLORS.text; g.fillText(`${s.title} ${e.year}`, b.x, b.y + 100 + ts * 1.05);
    font(g, 26, 400); g.fillStyle = CARD_COLORS.muted;
    let yy = b.y + 100 + ts * 1.05 + 46;
    for (const line of wrap(g, s.full_name || "", colW, 2)) { g.fillText(line, b.x, yy); yy += 34; }
    font(g, 28, 600); g.fillStyle = CARD_COLORS.text;
    g.fillText(fitLine(g, officialWhen(e, m), colW), b.x, yy + 20);
    if (place) { font(g, 26, 400); g.fillStyle = CARD_COLORS.muted; g.fillText(fitLine(g, place, colW), b.x, yy + 58); }
    // Right column: the number.
    const rx = b.x + b.w * 0.62, rw = b.w * 0.38;
    const ns = fit(g, num, rw, 230, 600, 0.4, MONO);
    g.fillStyle = numColor; g.fillText(num, rx, b.y + 60 + ns * 0.95);
    font(g, 30, 600); g.fillStyle = CARD_COLORS.text; g.fillText(unit, rx, b.y + 60 + ns * 0.95 + 50);
    drawTrack(g, e, m, b.x, b.y + b.h - 80, b.w, 22);
    font(g, 22, 400); g.fillStyle = CARD_COLORS.faint;
    g.fillText(fitLine(g, `${url}  ·  ${GH}  ·  ${asOf()}`, b.w), b.x, b.y + b.h - 6);
    return;
  }

  // Story and square: one column, laid out top to bottom, then scaled to fit the safe box.
  const blocks = [];
  const add = (h, draw) => blocks.push({ h, draw });
  add(44, (y, k) => brand(g, b.x, y, 44 * k));
  add(fmt === "story" ? 110 : 70, () => {});
  add(44, (y, k) => { font(g, 36 * k, 700); g.fillStyle = color; g.fillText(fitLine(g, m.label.toUpperCase(), b.w), b.x, y + 36 * k); });
  add(20, () => {});
  add(140, (y, k) => { const ts = fit(g, `${s.title} ${e.year}`, b.w, 132 * k, 700); g.fillStyle = CARD_COLORS.text; g.fillText(`${s.title} ${e.year}`, b.x, y + ts * 0.92); });
  add(96, (y, k) => {
    font(g, 36 * k, 400); g.fillStyle = CARD_COLORS.muted;
    wrap(g, s.full_name || "", b.w, 2).forEach((line, i) => g.fillText(line, b.x, y + 40 * k + i * 46 * k));
  });
  add(fmt === "story" ? 90 : 40, () => {});
  add(fmt === "story" ? 330 : 250, (y, k, hh) => { const ns = fit(g, num, b.w, hh * 1.05, 600, 0.4, MONO); g.fillStyle = numColor; g.fillText(num, b.x - ns * 0.03, y + hh * 0.86); });
  add(64, (y, k) => { font(g, 50 * k, 600); g.fillStyle = CARD_COLORS.text; g.fillText(unit, b.x, y + 50 * k); });
  add(fmt === "story" ? 80 : 40, () => {});
  add(52, (y, k) => { font(g, 40 * k, 600); g.fillStyle = CARD_COLORS.text; g.fillText(fitLine(g, officialWhen(e, m), b.w), b.x, y + 40 * k); });
  if (place) add(50, (y, k) => { font(g, 36 * k, 400); g.fillStyle = CARD_COLORS.muted; g.fillText(fitLine(g, place, b.w), b.x, y + 36 * k); });
  add(fmt === "story" ? 90 : 50, () => {});
  // In Stories the right edge of the lower half is covered, so the timeline stops short there.
  add(40, (y, k) => drawTrack(g, e, m, b.x + 14 * k, y + 20 * k, (fmt === "story" ? b.w * 0.82 : b.w) - 28 * k, 30 * k));
  add(fmt === "story" ? 60 : 34, () => {});
  // The link sits bottom-left: Stories put their reply/like controls on the right.
  add(40, (y, k) => { font(g, 30 * k, 600); g.fillStyle = CARD_COLORS.muted; g.fillText(fitLine(g, url, b.w * 0.72), b.x, y + 30 * k); });
  add(34, (y, k) => { font(g, 26 * k, 400); g.fillStyle = CARD_COLORS.muted; g.fillText(GH, b.x, y + 28 * k); });
  add(36, (y, k) => { font(g, 26 * k, 400); g.fillStyle = CARD_COLORS.faint; g.fillText(asOf(), b.x, y + 28 * k); });
  layout(blocks, b);
}

function drawList(g, W, H, fmt, { rows, title }) {
  background(g, W, H, CARD_COLORS.accent);
  const b = safeBox(fmt, W, H);
  const max = fmt === "story" ? 7 : fmt === "square" ? 5 : 4;
  const shown = rows.slice(0, max);
  // Story rows stop at ~78% of the width: the right edge of a Story's lower half is covered.
  const rowW = fmt === "story" ? b.w * 0.84 : b.w;
  const blocks = [];
  const add = (h, draw) => blocks.push({ h, draw });
  add(44, (y, k) => brand(g, b.x, y, 44 * k));
  add(fmt === "story" ? 90 : 50, () => {});
  add(120, (y, k) => { const ts = fit(g, title, b.w, 104 * k, 700); g.fillStyle = CARD_COLORS.text; g.fillText(title, b.x, y + ts * 0.9); });
  add(fmt === "wide" ? 20 : 40, () => {});
  for (const r of shown) {
    add(fmt === "wide" ? 100 : 132, (y, k, hh) => {
      const c = CARD_COLORS[r.m.group] || CARD_COLORS.accent;
      g.strokeStyle = CARD_COLORS.line; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(b.x, y + 2); g.lineTo(b.x + rowW, y + 2); g.stroke();
      g.fillStyle = c;
      g.beginPath(); g.arc(b.x + 12 * k, y + hh * 0.4, 10 * k, 0, Math.PI * 2); g.fill();
      const [num, unit] = cardCount(Date.parse(r.m.at) - Date.now(), r.m.est);
      const right = `${num}${unit.split(" ")[0].replace("months", "mo").replace("days", "d").replace("day", "d").replace("hours", "h").replace("hour", "h").replace("minutes", "min")}`;
      font(g, 50 * k, 600, MONO);
      const rw = g.measureText(right).width;
      g.fillStyle = r.m.est ? CARD_COLORS.muted : c;
      g.fillText(right, b.x + rowW - rw, y + hh * 0.52);
      const leftW = rowW - rw - 60 * k;
      const ts = fit(g, `${r.s.title} ${r.e.year}`, leftW, 46 * k, 700);
      // Wide rows are shorter, so both lines sit at fixed fractions of the row and the next divider stays clear.
      const wide = fmt === "wide", nameY = wide ? y + hh * 0.55 : y + hh * 0.4 + ts * 0.32;
      g.fillStyle = CARD_COLORS.text; g.fillText(`${r.s.title} ${r.e.year}`, b.x + 40 * k, nameY);
      font(g, (wide ? 24 : 30) * k, 400); g.fillStyle = CARD_COLORS.muted;
      g.fillText(fitLine(g, `${r.m.label} · ${officialWhen(r.e, r.m)}`, leftW), b.x + 40 * k, wide ? y + hh * 0.84 : nameY + 42 * k);
    });
  }
  if (rows.length > shown.length) add(50, (y, k) => { font(g, 30 * k, 600); g.fillStyle = CARD_COLORS.faint; g.fillText(`+${rows.length - shown.length} more`, b.x + 40 * k, y + 36 * k); });
  add(fmt === "story" ? 40 : 20, () => {});
  add(40, (y, k) => { font(g, 30 * k, 600); g.fillStyle = CARD_COLORS.muted; g.fillText(siteHost(), b.x, y + 30 * k); });
  add(34, (y, k) => { font(g, 26 * k, 400); g.fillStyle = CARD_COLORS.muted; g.fillText(GH, b.x, y + 28 * k); });
  add(36, (y, k) => { font(g, 26 * k, 400); g.fillStyle = CARD_COLORS.faint; g.fillText(asOf(), b.x, y + 28 * k); });
  layout(blocks, b);
}

function fitLine(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length && g.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// Stack blocks from the top of the safe box; shrink everything evenly if they don't fit.
function layout(blocks, b) {
  const total = blocks.reduce((a, x) => a + x.h, 0);
  const k = Math.min(1, b.h / total) * Math.min(1, b.w / 864);
  let y = b.y;
  for (const blk of blocks) {
    blk.draw(y, k, blk.h * k);
    y += blk.h * k;
  }
}

// ---- object themes: a boarding pass, nixie tubes, a receipt and a graph-paper figure ----
const GH = "github.com/ruzcko/ai-deadlines";

// Stack blocks from y down: `grow` gaps share the spare room, and everything shrinks evenly if it doesn't fit in h.
function flow(blocks, y, h) {
  const fixed = blocks.reduce((a, x) => a + x.h, 0);
  const grow = blocks.reduce((a, x) => a + (x.grow || 0), 0);
  const k = Math.min(1, h / fixed);
  const spare = h - fixed * k;
  for (const blk of blocks) {
    const hh = blk.h * k + (grow ? spare * (blk.grow || 0) / grow : 0);
    if (blk.draw) blk.draw(y, k, hh);
    y += hh;
  }
}
function stack() {
  const blocks = [];
  const add = (h, draw) => blocks.push({ h, draw });
  const gap = (h = 0, grow = 1) => blocks.push({ h, grow });
  return { blocks, add, gap };
}

// Letter-spaced caps, one character at a time (canvas letterSpacing isn't in every browser). Shrinks to fit maxW.
function tracked(g, text, x, y, size, weight, maxW, align = "left", face = FONT) {
  const chars = [...text];
  let s = size, w;
  for (;;) {
    font(g, s, weight, face);
    w = chars.reduce((a, c) => a + g.measureText(c).width, 0) + s * 0.12 * (chars.length - 1);
    if (w <= maxW || s < size * 0.5) break;
    s *= 0.94;
  }
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  for (const c of chars) { g.fillText(c, cx, y); cx += g.measureText(c).width + s * 0.12; }
  return w;
}
function textRight(g, text, right, y) { g.fillText(text, right - g.measureText(text).width, y); }
function textCenter(g, text, cx, y) { g.fillText(text, cx - g.measureText(text).width / 2, y); }

function countFor(m) { return cardCount(Date.parse(m.at) - Date.now(), m.est); }
function unitWord(m) { return countFor(m)[1].split(" ")[0]; } // "days", "months", "hours"...
function compactCount(m) {
  const [num, unit] = countFor(m);
  return num + { months: "mo", days: "d", day: "d", hours: "h", hour: "h", minutes: "min" }[unit.split(" ")[0]];
}
// What the count runs to: "the Paper deadline", "Decision", "the Conference".
function goal(m) {
  const l = shortLabel(m);
  return m.group === "submission" ? `the ${l} deadline` : m.group === "conference" ? `the ${l}` : l;
}
function cityCode(e) {
  const c = (e.city || "").normalize("NFD").replace(/[^A-Za-z]/g, "");
  return c ? c.slice(0, 3).toUpperCase() : "TBA";
}
function placeOf(e) { return [e.city, e.country].filter(Boolean).join(", "); }
function today() { return asOf().replace(/^as of /, ""); }
// "NOV 10" in the venue's own timezone; "~NOV" for an estimate.
function shortDate(m) {
  const opts = m.est ? { month: "short" } : { month: "short", day: "numeric" };
  const t = m.day ? new Date(m.day + "T12:00:00") : new Date(m.at);
  let out;
  try { out = new Intl.DateTimeFormat(undefined, m.day ? opts : { ...opts, timeZone: zoneFor(m.tz) || "UTC" }).format(t); }
  catch (_) { out = new Intl.DateTimeFormat(undefined, opts).format(t); }
  return (m.est ? "~" : "") + out.toUpperCase();
}

function rrect(g, x, y, w, h, r) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  g.beginPath();
  g.moveTo(x + a, y);
  g.arcTo(x + w, y, x + w, y + h, b);
  g.arcTo(x + w, y + h, x, y + h, c);
  g.arcTo(x, y + h, x, y, d);
  g.arcTo(x, y, x + w, y, a);
  g.closePath();
}
function dashed(g, x1, y1, x2, y2, color, lw, dash) {
  g.save();
  g.strokeStyle = color; g.lineWidth = lw; g.setLineDash(dash);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.restore();
}
function arrow(g, x1, x2, y, size, color) {
  g.save();
  g.strokeStyle = color; g.lineWidth = Math.max(2, size * 0.14); g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x1, y); g.lineTo(x2, y);
  g.moveTo(x2 - size * 0.42, y - size * 0.42); g.lineTo(x2, y); g.lineTo(x2 - size * 0.42, y + size * 0.42);
  g.stroke();
  g.restore();
}
// Barcode-like stripes, the same for a given venue every time.
function barcode(g, key, x, y, w, h) {
  let seed = 2166136261;
  for (const ch of String(key)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const bars = [];
  let units = 0;
  while (units < 110) {
    const bw = 1 + Math.floor(rnd() * 4);
    bars.push([units, bw]);
    units += bw + 1 + Math.floor(rnd() * 3);
  }
  const [lastAt, lastW] = bars[bars.length - 1];
  const u = w / (lastAt + lastW); // the last bar ends exactly at x + w
  g.fillStyle = CARD_COLORS.text;
  for (const [at, bw] of bars) g.fillRect(x + at * u, y, bw * u, h);
}

// ---- 1. Boarding pass ----
// The pass sits on the page colour. In a Story it is centred and narrow enough that its right edge stays left
// of 78% of the width, out of the corner Stories cover.
function passFrame(g, W, H, fmt, want = Infinity) {
  const C = CARD_COLORS;
  g.fillStyle = C.page; g.fillRect(0, 0, W, H);
  const b = safeBox(fmt, W, H);
  const w = fmt === "story" ? W * 0.56 : b.w, h = Math.min(b.h, want);
  const p = { x: (W - w) / 2, y: b.y + (b.h - h) / 2, w, h, r: W / 90 };
  g.fillStyle = C.paper; rrect(g, p.x, p.y, p.w, p.h, p.r); g.fill();
  return p;
}
function passBand(g, p, y, h, left, right, pad) {
  const C = CARD_COLORS;
  g.fillStyle = C.band; rrect(g, p.x, y, p.w, h, [p.r, p.r, 0, 0]); g.fill();
  g.fillStyle = C.onBand;
  const lw = tracked(g, left, p.x + pad, y + h * 0.6, h * 0.28, 600, p.w * 0.5);
  if (right) tracked(g, right, p.x + p.w - pad, y + h * 0.6, h * 0.28, 700, p.w - 2 * pad - lw - h * 0.4, "right");
}
// The dashed tear line with a notch cut into each edge.
function passTear(g, x1, y1, x2, y2, nr) {
  const C = CARD_COLORS;
  g.fillStyle = C.page;
  for (const [cx, cy] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(cx, cy, nr, 0, Math.PI * 2); g.fill(); }
  const along = x1 === x2 ? [0, nr * 1.6] : [nr * 1.6, 0];
  dashed(g, x1 + along[0], y1 + along[1], x2 - along[0], y2 - along[1], C.tear, Math.max(2, nr * 0.16), [nr * 0.6, nr * 0.45]);
}
function passLabel(g, text, x, y, k, maxW, align) {
  g.fillStyle = CARD_COLORS.muted;
  tracked(g, text, x, y, 20 * k, 600, maxW, align);
}
function passFooter(g, lines, x, y, w, size, lh) {
  font(g, size, 400); g.fillStyle = CARD_COLORS.muted;
  lines.forEach((t, i) => g.fillText(fitLine(g, t, w), x, y + size + i * lh));
}
// "NOW -> SEA", drawn with a stroked arrow; returns the width used.
function passRoute(g, e, x, y, size, color) {
  font(g, size, 600, MONO); g.fillStyle = color;
  g.fillText("NOW", x, y);
  const a = x + g.measureText("NOW").width + size * 0.35, aw = size * 1.4;
  arrow(g, a, a + aw, y - size * 0.36, size * 0.5, CARD_COLORS.band);
  g.fillStyle = color;
  g.fillText(cityCode(e), a + aw + size * 0.35, y);
  return a + aw + size * 0.35 + g.measureText(cityCode(e)).width - x;
}

function drawPassVenue(g, W, H, fmt, { s, e, m }) {
  const C = CARD_COLORS, p = passFrame(g, W, H, fmt);
  const [num] = countFor(m);
  const boards = `${num} ${unitWord(m).toUpperCase()}`;
  const url = `${siteHost()}/?v=${s.key}`;
  const place = placeOf(e) || "Place to be announced";
  const title = `${s.title} ${e.year}`;
  // FROM / TO with the big codes and an arrow between them.
  const route = (x, w, y, k, codeSize) => {
    passLabel(g, "FROM", x, y + 20 * k, k, w / 2);
    passLabel(g, "TO", x + w, y + 20 * k, k, w / 2, "right");
    font(g, codeSize, 600, MONO); g.fillStyle = C.text;
    const cy = y + 34 * k + codeSize * 0.8, code = cityCode(e);
    g.fillText("NOW", x, cy);
    const nw = g.measureText("NOW").width, cw = g.measureText(code).width;
    textRight(g, code, x + w, cy);
    const room = w - nw - cw - codeSize * 0.8, aw = Math.min(room, codeSize * 1.6);
    const ax = x + nw + codeSize * 0.4 + (room - aw) / 2;
    if (aw > 10) arrow(g, ax, ax + aw, cy - codeSize * 0.36, codeSize * 0.22, C.band);
    font(g, 24 * k, 400); g.fillStyle = C.muted;
    textRight(g, fitLine(g, place, w * 0.7), x + w, cy + 40 * k);
  };
  const field = (label, x, y, k, w, draw) => { passLabel(g, label, x, y + 20 * k, k, w); draw(y + 30 * k); };

  if (fmt === "wide") {
    const stubW = p.w * 0.3, mainW = p.w - stubW, tearX = p.x + mainW, bandH = 64, pad = 36;
    passBand(g, p, p.y, bandH, "BOARDING PASS", shortLabel(m).toUpperCase(), pad);
    const x = p.x + pad, w = mainW - 2 * pad;
    const main = stack();
    main.gap(12);
    main.add(140, (y, k) => route(x, w, y, k, 64 * k));
    main.gap(8);
    main.add(60, (y, k) => { const ts = fit(g, title, w, 56 * k, 700); g.fillStyle = C.text; g.fillText(title, x, y + ts * 0.9); });
    if (s.full_name) main.add(60, (y, k) => { font(g, 24 * k, 400); g.fillStyle = C.muted; wrap(g, s.full_name, w, 2).forEach((l, i) => g.fillText(l, x, y + 26 * k + i * 30 * k)); });
    main.gap(8);
    main.add(66, (y, k) => {
      field("GATE", x, y, k, w * 0.3, (vy) => { font(g, 30 * k, 700); g.fillStyle = C.text; g.fillText(fitLine(g, shortLabel(m).toUpperCase(), w * 0.3), x, vy + 30 * k); });
      const dx = x + w * 0.34, dw = w * 0.66;
      field("DATE", dx, y, k, dw, (vy) => { fit(g, officialWhen(e, m), dw, 26 * k, 600, 0.7); g.fillStyle = C.text; g.fillText(fitLine(g, officialWhen(e, m), dw), dx, vy + 28 * k); });
    });
    main.gap(12);
    flow(main.blocks, p.y + bandH, p.h - bandH);
    const sx = tearX + 28, sw = stubW - 56, stub = stack();
    stub.gap(10);
    stub.add(80, (y, k) => field("BOARDS IN", sx, y, k, sw, (vy) => { fit(g, boards, sw, 44 * k, 600, 0.5, MONO); g.fillStyle = C.text; g.fillText(boards, sx, vy + 42 * k); }));
    if (m.est) stub.add(34, (y, k) => passLabel(g, "ESTIMATED", sx, y + 28 * k, k, sw));
    stub.gap(10);
    stub.add(96, (y, k, hh) => barcode(g, s.key, sx, y, sw, hh));
    stub.add(14);
    stub.add(76, (y, k) => passFooter(g, [url, GH, asOf()], sx, y, sw, 17 * k, 24 * k));
    stub.add(16);
    flow(stub.blocks, p.y + bandH, p.h - bandH);
    passTear(g, tearX, p.y, tearX, p.y + p.h, 16);
    return;
  }

  const pad = p.w * 0.07, x = p.x + pad, w = p.w - 2 * pad;
  const st = stack();
  st.add(96, (y, k, hh) => passBand(g, p, y, hh, "BOARDING PASS", shortLabel(m).toUpperCase(), pad));
  st.gap(20);
  st.add(190, (y, k) => route(x, w, y, k, 96 * k));
  st.gap(10);
  st.add(92, (y, k) => { const ts = fit(g, title, w, 84 * k, 700); g.fillStyle = C.text; g.fillText(title, x, y + ts * 0.9); });
  if (s.full_name) st.add(84, (y, k) => { font(g, 30 * k, 400); g.fillStyle = C.muted; wrap(g, s.full_name, w, 2).forEach((l, i) => g.fillText(l, x, y + 32 * k + i * 38 * k)); });
  st.gap(10);
  st.add(m.est ? 112 : 84, (y, k) => {
    field("GATE", x, y, k, w * 0.44, (vy) => { font(g, 40 * k, 700); g.fillStyle = C.text; g.fillText(fitLine(g, shortLabel(m).toUpperCase(), w * 0.44), x, vy + 40 * k); });
    const bx = x + w * 0.5, bw = w * 0.5;
    field("BOARDS IN", bx, y, k, bw, (vy) => { fit(g, boards, bw, 40 * k, 600, 0.5, MONO); g.fillStyle = C.text; g.fillText(boards, bx, vy + 40 * k); });
    if (m.est) passLabel(g, "ESTIMATED", bx, y + 104 * k, k, bw);
  });
  st.add(20);
  st.add(108, (y, k) => field("DATE", x, y, k, w, (vy) => {
    font(g, 30 * k, 600); g.fillStyle = C.text;
    wrap(g, officialWhen(e, m), w, 2).forEach((l, i) => g.fillText(l, x, vy + 32 * k + i * 38 * k));
  }));
  st.gap(10);
  st.add(44, (y, k, hh) => passTear(g, p.x, y + hh / 2, p.x + p.w, y + hh / 2, 18 * k));
  st.add(10);
  st.add(100, (y, k, hh) => barcode(g, s.key, x, y, w, hh));
  st.add(18);
  st.add(92, (y, k) => passFooter(g, [url, GH, asOf()], x, y, w, 22 * k, 30 * k));
  st.add(24);
  flow(st.blocks, p.y, p.h);
}

// The itinerary: one leg per venue.
function drawPassList(g, W, H, fmt, { rows, title }) {
  const C = CARD_COLORS;
  const max = fmt === "story" ? 6 : 4;
  const shown = rows.slice(0, max);
  const key = rows.map((r) => r.s.key).join(",");
  const leg = (r, x, w, y, k, hh, first) => {
    if (!first) dashed(g, x, y, x + w, y, C.line, 2 * k, [10 * k, 8 * k]);
    const cd = compactCount(r.m);
    font(g, 44 * k, 600, MONO);
    const rw = g.measureText(cd).width;
    g.fillStyle = r.m.est ? C.muted : C.text;
    g.fillText(cd, x + w - rw, y + hh * 0.5);
    if (r.m.est) passLabel(g, "EST.", x + w, y + hh * 0.5 + 30 * k, k, rw, "right");
    const lw = w - rw - 30 * k, name = `${r.s.title} ${r.e.year}`;
    const ts = fit(g, name, lw, 38 * k, 700);
    g.fillStyle = C.text; g.fillText(name, x, y + hh * 0.2 + ts * 0.9);
    const rw2 = passRoute(g, r.e, x, y + hh * 0.2 + ts + 34 * k, 22 * k, C.muted);
    font(g, 22 * k, 400); g.fillStyle = C.muted;
    g.fillText(fitLine(g, `·  ${shortLabel(r.m)}`, lw - rw2 - 16 * k), x + rw2 + 16 * k, y + hh * 0.2 + ts + 34 * k);
  };
  const more = (x, y, k) => { if (rows.length > shown.length) { font(g, 24 * k, 600); g.fillStyle = C.muted; g.fillText(`+${rows.length - shown.length} more`, x, y + 28 * k); } };

  if (fmt === "wide") {
    const p = passFrame(g, W, H, fmt);
    const stubW = p.w * 0.3, mainW = p.w - stubW, tearX = p.x + mainW, bandH = 64, pad = 36;
    passBand(g, p, p.y, bandH, "ITINERARY", title.toUpperCase(), pad);
    const x = p.x + pad, w = mainW - 2 * pad, main = stack();
    main.gap(6);
    shown.forEach((r, i) => main.add(112, (y, k, hh) => leg(r, x, w, y, k, hh, i === 0)));
    if (rows.length > shown.length) main.add(36, (y, k) => more(x, y, k));
    main.gap(6);
    flow(main.blocks, p.y + bandH, p.h - bandH);
    const sx = tearX + 28, sw = stubW - 56, stub = stack();
    stub.gap(10);
    stub.add(90, (y, k) => {
      passLabel(g, "VENUES", sx, y + 20 * k, k, sw);
      font(g, 50 * k, 600, MONO); g.fillStyle = C.text; g.fillText(String(rows.length), sx, y + 80 * k);
    });
    stub.gap(10);
    stub.add(96, (y, k, hh) => barcode(g, key, sx, y, sw, hh));
    stub.add(14);
    stub.add(76, (y, k) => passFooter(g, [siteHost(), GH, asOf()], sx, y, sw, 17 * k, 24 * k));
    stub.add(16);
    flow(stub.blocks, p.y + bandH, p.h - bandH);
    passTear(g, tearX, p.y, tearX, p.y + p.h, 16);
    return;
  }

  // Story and square: the pass is only as tall as its legs need. The blocks read p, x and w when drawn.
  let p, pad, x, w;
  const st = stack();
  st.add(96, (y, k, hh) => passBand(g, p, y, hh, "ITINERARY", title.toUpperCase(), pad));
  st.add(16);
  shown.forEach((r, i) => st.add(124, (y, k, hh) => leg(r, x, w, y, k, hh, i === 0)));
  if (rows.length > shown.length) st.add(44, (y, k) => more(x, y, k));
  st.gap(10);
  st.add(44, (y, k, hh) => passTear(g, p.x, y + hh / 2, p.x + p.w, y + hh / 2, 18 * k));
  st.add(10);
  st.add(100, (y, k, hh) => barcode(g, key, x, y, w, hh));
  st.add(18);
  st.add(92, (y, k) => passFooter(g, [siteHost(), GH, asOf()], x, y, w, 22 * k, 30 * k));
  st.add(24);
  p = passFrame(g, W, H, fmt, st.blocks.reduce((a, blk) => a + blk.h, 0) + 60);
  pad = p.w * 0.07; x = p.x + pad; w = p.w - 2 * pad;
  flow(st.blocks, p.y, p.h);
}

// ---- 2. Nixie tubes ----
// One glass tube per character of the count; the digits glow unless the date is an estimate.
function nixieTubes(g, text, x, y, maxW, h, est) {
  const C = CARD_COLORS, chars = [...text];
  const gap = h * 0.07, lw = Math.max(2, h * 0.008);
  const tw = Math.min(h * 0.58, (maxW - lw - gap * (chars.length - 1)) / chars.length);
  const size = Math.min(h * 0.62, tw * 1.3);
  chars.forEach((c, i) => {
    const tx = x + lw / 2 + i * (tw + gap); // the outline stays inside x..x + maxW
    rrect(g, tx, y, tw, h, [tw / 2, tw / 2, tw * 0.12, tw * 0.12]);
    g.fillStyle = C.tube; g.fill();
    g.strokeStyle = C.line; g.lineWidth = lw; g.stroke();
    g.save();
    g.clip(); // the glow stays inside the glass
    font(g, size, 600, MONO);
    g.fillStyle = est ? C.estDigit : C.digit;
    if (!est) { g.shadowColor = C.glowColor; g.shadowBlur = size * 0.28; }
    textCenter(g, c, tx + tw / 2, y + h * 0.56 + size * 0.36);
    g.restore();
  });
}
function glowText(g, text, x, y, size, est) {
  const C = CARD_COLORS;
  g.fillStyle = est ? C.estDigit : C.digit;
  if (!est) { g.shadowColor = C.glowColor; g.shadowBlur = size * 0.3; }
  g.fillText(text, x, y);
  g.shadowBlur = 0; g.shadowColor = "transparent";
}
function nixieBrand(g, x, y, k, maxW) { g.fillStyle = CARD_COLORS.muted; tracked(g, "AI CONFERENCE DEADLINES", x, y + 24 * k, 24 * k, 600, maxW); }

function drawNixieVenue(g, W, H, fmt, { s, e, m }) {
  const C = CARD_COLORS, b = safeBox(fmt, W, H);
  g.fillStyle = C.page; g.fillRect(0, 0, W, H);
  const [num] = countFor(m);
  const url = `${siteHost()}/?v=${s.key}`, place = placeOf(e), title = `${s.title} ${e.year}`;
  const unitLine = `${unitWord(m)} to ${goal(m)}`.toUpperCase();
  // Stories cover the lower-right corner, so the lower half stops at 79% of the width.
  const lw = fmt === "story" ? W * 0.79 - b.x : b.w;
  const footer = (st, x, w, z) => {
    st.add(40 * z, (y, k) => { font(g, 28 * z * k, 600); g.fillStyle = C.muted; g.fillText(fitLine(g, url, w), x, y + 28 * z * k); });
    st.add(34 * z, (y, k) => { font(g, 24 * z * k, 400); g.fillStyle = C.muted; g.fillText(fitLine(g, GH, w), x, y + 26 * z * k); });
    st.add(34 * z, (y, k) => { font(g, 24 * z * k, 400); g.fillStyle = C.muted; g.fillText(asOf(), x, y + 26 * z * k); });
  };
  const tubes = (st, x, w, th, z) => {
    st.add(th, (y, k, hh) => nixieTubes(g, num, x, y, w, hh, m.est));
    st.add(24 * z);
    st.add(40 * z, (y, k) => { g.fillStyle = C.muted; tracked(g, unitLine, x, y + 28 * z * k, 28 * z * k, 600, w); });
    if (m.est) st.add(36 * z, (y, k) => { g.fillStyle = C.muted; tracked(g, "ESTIMATED", x, y + 28 * z * k, 24 * z * k, 600, w); });
  };

  if (fmt === "wide") {
    const lw2 = b.w * 0.5, left = stack();
    left.add(30, (y, k) => nixieBrand(g, b.x, y - 2, 0.8 * k, lw2));
    left.gap(16);
    left.add(70, (y, k) => { const ts = fit(g, title, lw2, 64 * k, 700); g.fillStyle = C.text; g.fillText(title, b.x, y + ts * 0.9); });
    if (s.full_name) left.add(62, (y, k) => { font(g, 24 * k, 400); g.fillStyle = C.muted; wrap(g, s.full_name, lw2, 2).forEach((l, i) => g.fillText(l, b.x, y + 26 * k + i * 30 * k)); });
    left.gap(1);
    left.add(36, (y, k) => { font(g, 28 * k, 600); g.fillStyle = C.text; g.fillText(fitLine(g, officialWhen(e, m), lw2), b.x, y + 28 * k); });
    if (place) left.add(32, (y, k) => { font(g, 24 * k, 400); g.fillStyle = C.muted; g.fillText(fitLine(g, place, lw2), b.x, y + 24 * k); });
    left.gap(1);
    footer(left, b.x, lw2, 0.7);
    flow(left.blocks, b.y, b.h);
    const rx = b.x + b.w * 0.56, rw = b.w * 0.44, right = stack();
    right.gap(1);
    tubes(right, rx, rw, 300, 0.75);
    right.gap(1);
    flow(right.blocks, b.y, b.h);
    return;
  }

  const st = stack();
  st.add(40, (y, k) => nixieBrand(g, b.x, y, k, b.w));
  st.gap(20);
  st.add(130, (y, k) => { const ts = fit(g, title, b.w, 120 * k, 700); g.fillStyle = C.text; g.fillText(title, b.x, y + ts * 0.9); });
  if (s.full_name) st.add(92, (y, k) => { font(g, 34 * k, 400); g.fillStyle = C.muted; wrap(g, s.full_name, b.w, 2).forEach((l, i) => g.fillText(l, b.x, y + 38 * k + i * 44 * k)); });
  st.gap(30);
  tubes(st, b.x, lw, fmt === "story" ? 400 : 270, 1);
  st.gap(30);
  st.add(52, (y, k) => { font(g, 40 * k, 600); g.fillStyle = C.text; g.fillText(fitLine(g, officialWhen(e, m), lw), b.x, y + 40 * k); });
  if (place) st.add(46, (y, k) => { font(g, 34 * k, 400); g.fillStyle = C.muted; g.fillText(fitLine(g, place, lw), b.x, y + 34 * k); });
  st.gap(30);
  footer(st, b.x, lw, 1);
  flow(st.blocks, b.y, b.h);
}

function drawNixieList(g, W, H, fmt, { rows, title }) {
  const C = CARD_COLORS, b = safeBox(fmt, W, H);
  g.fillStyle = C.page; g.fillRect(0, 0, W, H);
  const max = fmt === "story" ? 7 : fmt === "square" ? 5 : 4;
  const shown = rows.slice(0, max);
  // Story rows stop short of the covered lower-right corner.
  const rowW = fmt === "story" ? W * 0.79 - b.x : b.w;
  const st = stack();
  const wide = fmt === "wide";
  st.add(40, (y, k) => nixieBrand(g, b.x, y, k, b.w));
  st.add(wide ? 10 : 40);
  st.add(wide ? 72 : 120, (y, k, hh) => { const ts = fit(g, title, b.w, hh * 0.85, 700); g.fillStyle = C.text; g.fillText(title, b.x, y + ts * 0.9); });
  st.add(wide ? 10 : 30);
  for (const r of shown) {
    st.add(wide ? 84 : 124, (y, k, hh) => {
      g.fillStyle = C.line; g.fillRect(b.x, y, rowW, Math.max(2, 2 * k));
      // Sizes follow the row height, so a shrunk row keeps its proportions.
      const cd = compactCount(r.m);
      font(g, hh * 0.42, 600, MONO);
      const rw = g.measureText(cd).width;
      glowText(g, cd, b.x + rowW - rw - hh * 0.13, y + hh * 0.62, hh * 0.42, r.m.est); // room for the glow
      const leftW = rowW - rw - hh * 0.45, name = `${r.s.title} ${r.e.year}`;
      fit(g, name, leftW, hh * 0.355, 700);
      g.fillStyle = C.text; g.fillText(name, b.x, y + hh * 0.45);
      font(g, hh * 0.226, 400); g.fillStyle = C.muted;
      g.fillText(fitLine(g, `${shortLabel(r.m)} · ${officialWhen(r.e, r.m)}`, leftW), b.x, y + hh * 0.82);
    });
  }
  if (rows.length > shown.length) st.add(50, (y, k) => { font(g, 30 * k, 600); g.fillStyle = C.muted; g.fillText(`+${rows.length - shown.length} more`, b.x, y + 36 * k); });
  st.gap(wide ? 10 : 40);
  if (wide) st.add(34, (y, k) => { font(g, 22 * k, 400); g.fillStyle = C.muted; g.fillText(fitLine(g, `${siteHost()}  ·  ${GH}  ·  ${asOf()}`, b.w), b.x, y + 26 * k); });
  else {
    st.add(40, (y, k) => { font(g, 28 * k, 600); g.fillStyle = C.muted; g.fillText(siteHost(), b.x, y + 28 * k); });
    st.add(34, (y, k) => { font(g, 24 * k, 400); g.fillStyle = C.muted; g.fillText(GH, b.x, y + 26 * k); });
    st.add(34, (y, k) => { font(g, 24 * k, 400); g.fillStyle = C.muted; g.fillText(asOf(), b.x, y + 26 * k); });
  }
  flow(st.blocks, b.y, b.h);
}

// ---- 3. Receipt ----
// A paper strip with a torn (sawtooth) bottom edge; every line is mono, label left and value right.
function drawReceipt(g, W, H, fmt, { head, sub, items, total, more }) {
  const C = CARD_COLORS, b = safeBox(fmt, W, H);
  g.fillStyle = C.page; g.fillRect(0, 0, W, H);
  // A Story keeps the strip centred and left of 78% of the width.
  const pw = fmt === "story" ? W * 0.56 : fmt === "square" ? b.w * 0.74 : b.w * 0.8;
  const z = fmt === "wide" ? 0.72 : 1; // base size
  const cols = fmt === "wide" && items.length > 5 ? 2 : 1;
  const px = (W - pw) / 2, pad = 40 * z, x = px + pad, w = pw - 2 * pad;
  const colGap = 36 * z, colW = (w - colGap * (cols - 1)) / cols;
  const perCol = Math.ceil(items.length / cols);
  const tooth = 26 * z;
  const lines = [];
  const add = (h, draw) => lines.push({ h: h * z, draw });
  const rule = () => add(30, (y, k, hh) => dashed(g, x, y + hh / 2, x + w, y + hh / 2, C.muted, 2 * k, [9 * k * z, 7 * k * z]));
  const lr = (left, right, lx, lw, y, size, weight, color) => {
    let s = size;
    font(g, s, weight, MONO);
    while (g.measureText(right).width + s * 4 > lw && s > size * 0.6) { s *= 0.94; font(g, s, weight, MONO); } // a long total
    const rw = g.measureText(right).width;
    g.fillStyle = color;
    g.fillText(right, lx + lw - rw, y);
    // A long label shrinks a little before it is cut short; the value column keeps its size.
    let ls = s;
    while (g.measureText(left).width > lw - rw - s && ls > s * 0.8) { ls *= 0.94; font(g, ls, weight, MONO); }
    g.fillText(fitLine(g, left, lw - rw - s), lx, y);
  };
  add(44);
  add(56, (y, k) => { font(g, 44 * z * k, 600, MONO); g.fillStyle = C.text; textCenter(g, "AI DEADLINES", px + pw / 2, y + 44 * z * k); });
  add(40, (y, k) => { font(g, 24 * z * k, 500, MONO); g.fillStyle = C.muted; textCenter(g, fitLine(g, sub, w), px + pw / 2, y + 30 * z * k); });
  add(12);
  rule();
  for (let row = 0; row < perCol; row++) {
    add(44, (y, k) => {
      for (let c = 0; c < cols; c++) {
        const it = items[c * perCol + row];
        if (it) lr(it.left, it.right, x + c * (colW + colGap), colW, y + 32 * z * k, 26 * z * k, it.strong ? 600 : 500, it.muted ? C.muted : C.text);
      }
    });
  }
  if (more) add(44, (y, k) => { font(g, 26 * z * k, 500, MONO); g.fillStyle = C.muted; g.fillText(more, x, y + 32 * z * k); });
  rule();
  add(52, (y, k) => lr("TOTAL", total, x, w, y + 38 * z * k, 30 * z * k, 600, C.text));
  rule();
  add(50, (y, k) => { font(g, 26 * z * k, 600, MONO); g.fillStyle = C.text; textCenter(g, fitLine(g, "THANK YOU FOR SUBMITTING", w), px + pw / 2, y + 36 * z * k); });
  add(32, (y, k) => { font(g, 22 * z * k, 500, MONO); g.fillStyle = C.muted; textCenter(g, fitLine(g, head, w), px + pw / 2, y + 24 * z * k); });
  add(32, (y, k) => { font(g, 22 * z * k, 500, MONO); g.fillStyle = C.muted; textCenter(g, fitLine(g, GH, w), px + pw / 2, y + 24 * z * k); });
  add(36);
  const total0 = lines.reduce((a, l) => a + l.h, 0);
  const k = Math.min(1, (b.h - tooth) / total0);
  const ph = total0 * k, py = b.y + (b.h - tooth - ph) / 2;
  // The paper, then its sawtooth edge.
  const n = Math.max(2, Math.round(pw / (tooth * 1.6))), tw = pw / n;
  g.fillStyle = C.paper;
  g.beginPath();
  g.moveTo(px, py); g.lineTo(px + pw, py); g.lineTo(px + pw, py + ph);
  for (let i = n; i > 0; i--) { g.lineTo(px + (i - 0.5) * tw, py + ph + tooth); g.lineTo(px + (i - 1) * tw, py + ph); }
  g.closePath(); g.fill();
  let y = py;
  for (const l of lines) { if (l.draw) l.draw(y, k, l.h * k); y += l.h * k; }
}

function drawReceiptVenue(g, W, H, fmt, { s, e, m }) {
  const now = Date.now();
  // One line per milestone; the conference end is folded into its start.
  const ms = e.milestones.filter((x) => x.group !== "other" && x.type !== "end");
  // Two milestones with the same short label: the closing one becomes "... ENDS", and any still alike use their own label.
  const dupes = (labels) => labels.map((l) => labels.filter((o) => o === l).length > 1);
  let labels = ms.map((x) => shortLabel(x).toUpperCase());
  const closes = (x) => /_end$/.test(x.type) || /\b(end|ends|close|closes)\b/i.test(x.label);
  let d = dupes(labels);
  labels = labels.map((l, i) => d[i] && !/ENDS$/.test(l) && closes(ms[i]) ? `${l} ENDS` : l);
  d = dupes(labels);
  labels = labels.map((l, i) => d[i] ? ms[i].label.replace(/\s*\bdeadline\b\s*/i, " ").trim().toUpperCase() : l);
  const items = ms.map((x, i) => {
    const done = Date.parse(x.at) <= now;
    return { left: labels[i], right: `${shortDate(x)}  ${(done ? "DONE" : compactCount(x).toUpperCase()).padStart(5)}`, muted: done, strong: x === m };
  });
  drawReceipt(g, W, H, fmt, {
    head: `${siteHost()}/?v=${s.key}`,
    sub: `${s.title} ${e.year} · ${today()}`.toUpperCase(),
    items,
    total: `NEXT: ${shortLabel(m)} IN ${compactCount(m)}`.toUpperCase(),
  });
}

function drawReceiptList(g, W, H, fmt, { rows }) {
  const max = fmt === "square" ? 8 : fmt === "story" ? 12 : 10;
  const shown = rows.slice(0, max);
  drawReceipt(g, W, H, fmt, {
    head: siteHost(),
    sub: `MY LIST · ${today()}`.toUpperCase(),
    items: shown.map((r) => ({ left: `${r.s.title} ${shortLabel(r.m)}`.toUpperCase(), right: compactCount(r.m).toUpperCase() })),
    more: rows.length > shown.length ? `+${rows.length - shown.length} MORE` : "",
    total: `${rows.length} ${rows.length === 1 ? "DEADLINE" : "DEADLINES"}`,
  });
}

// ---- 4. Graph paper ----
function graphPaper(g, W, H) {
  const C = CARD_COLORS, cell = 36 * W / 1080;
  g.fillStyle = C.page; g.fillRect(0, 0, W, H);
  for (const major of [false, true]) {
    g.fillStyle = major ? C.major : C.minor;
    for (let i = 0; i * cell <= W; i++) if ((i % 5 === 0) === major) g.fillRect(Math.round(i * cell), 0, 1, H);
    for (let i = 0; i * cell <= H; i++) if ((i % 5 === 0) === major) g.fillRect(0, Math.round(i * cell), W, 1);
  }
}
function caption(g, text, x, y, k, maxW) { g.fillStyle = CARD_COLORS.caption; tracked(g, text, x, y + 24 * k, 24 * k, 600, maxW); }
// Like a figure's source note; lines break between the parts, never inside one.
function sourceNote(g, url, x, y, k, w) {
  font(g, 24 * k, 400); g.fillStyle = CARD_COLORS.muted;
  const lines = [];
  for (const part of [`Source: ${url}`, GH, asOf()]) {
    const last = lines.length - 1;
    if (last >= 0 && g.measureText(`${lines[last]} · ${part}`).width <= w) lines[last] += ` · ${part}`;
    else lines.push(part);
  }
  lines.forEach((l, i) => g.fillText(fitLine(g, l, w), x, y + 24 * k + i * 32 * k));
}
// Days left against time: a straight fall to zero at the deadline, with a dot at now.
function plotCountdown(g, e, m, x, y, w, h, k) {
  const C = CARD_COLORS, day = 86400000, now = Date.now(), t1 = Date.parse(m.at);
  const first = Math.min(...e.milestones.map((ms) => Date.parse(ms.at)));
  // Start at the edition's first milestone or 120 days out, whichever is later, but keep "now" off the very start.
  const t0 = Math.min(Math.max(first, t1 - 120 * day), now - Math.max(day, (t1 - now) * 0.25));
  const lab = 24 * k, top = y + lab * 1.8, bottom = y + h - lab * 2, right = x + w, end = x + w * 0.88;
  const X = (t) => x + 2 * k + (t - t0) / (t1 - t0) * (end - x - 2 * k); // the line's round cap stays right of x
  const Y = (t) => bottom - (t1 - t) / (t1 - t0) * (bottom - top);
  g.strokeStyle = C.text; g.lineWidth = 2 * k; g.lineCap = "butt";
  g.beginPath(); g.moveTo(x + k, top - lab * 0.4); g.lineTo(x + k, bottom); g.lineTo(right, bottom); g.stroke();
  g.beginPath(); g.moveTo(end, bottom - 10 * k); g.lineTo(end, bottom + 10 * k); g.stroke();
  font(g, lab, 400); g.fillStyle = C.muted;
  g.fillText("days left", x, y + lab);
  textRight(g, "time", right, bottom - 12 * k);
  textCenter(g, "deadline", Math.min(end, right - g.measureText("deadline").width / 2), bottom + lab * 1.6);
  g.save();
  g.strokeStyle = C.accent; g.lineWidth = 4 * k; g.lineCap = "round";
  if (m.est) g.setLineDash([14 * k, 10 * k]);
  g.beginPath(); g.moveTo(X(t0), Y(t0)); g.lineTo(end, bottom); g.stroke();
  g.restore();
  const tn = Math.min(t1, Math.max(t0, now)), cx = X(tn), cy = Y(tn);
  g.fillStyle = C.page; g.beginPath(); g.arc(cx, cy, 13 * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.accent; g.beginPath(); g.arc(cx, cy, 10 * k, 0, Math.PI * 2); g.fill();
  font(g, lab, 600); g.fillStyle = C.text;
  g.fillText("now", cx + 18 * k, cy - 14 * k);
}

function drawGraphVenue(g, W, H, fmt, { s, e, m }) {
  const C = CARD_COLORS, b = safeBox(fmt, W, H);
  graphPaper(g, W, H);
  const [num] = countFor(m);
  const url = `${siteHost()}/?v=${s.key}`, title = `${s.title} ${e.year}`;
  const unit = m.est ? `${unitWord(m)}, estimated` : unitWord(m);
  const when = `${goal(m).replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())} · ${officialWhen(e, m)}`;
  const count = (x, w, z) => (y, k) => {
    const ns = fit(g, num, w * 0.6, 170 * z * k, 600, 0.4, MONO);
    g.fillStyle = C.text; g.fillText(num, x, y + ns * 0.9);
    const nw = g.measureText(num).width;
    font(g, 52 * z * k, 600); g.fillStyle = C.text;
    g.fillText(fitLine(g, unit, w - nw - 24 * z * k), x + nw + 24 * z * k, y + ns * 0.9);
  };
  const head = (st, x, w, z) => {
    st.add(40 * z, (y, k) => caption(g, "FIG. 1 · TIME TO DEADLINE", x, y, Math.max(z, 0.8) * k, w));
    st.add(16 * z);
    st.add(124 * z, (y, k) => { const ts = fit(g, title, w, 116 * z * k, 700); g.fillStyle = C.text; g.fillText(title, x, y + ts * 0.9); });
    if (s.full_name) st.add(92 * z, (y, k) => { font(g, 34 * z * k, 400); g.fillStyle = C.muted; wrap(g, s.full_name, w, 2).forEach((l, i) => g.fillText(l, x, y + 38 * z * k + i * 44 * z * k)); });
  };
  const whenLine = (x, w, z) => (y, k) => { fit(g, when, w, 34 * z * k, 400, 0.8); g.fillStyle = C.muted; wrap(g, when, w, 2).forEach((l, i) => g.fillText(l, x, y + 36 * z * k + i * 44 * z * k)); };

  if (fmt === "wide") {
    const lw = b.w * 0.48, left = stack();
    head(left, b.x, lw, 0.6);
    left.gap(1);
    left.add(120, count(b.x, lw, 0.62));
    left.add(64, whenLine(b.x, lw, 0.7));
    left.gap(1);
    left.add(60, (y, k) => sourceNote(g, url, b.x, y, 0.8 * k, lw));
    flow(left.blocks, b.y, b.h);
    plotCountdown(g, e, m, b.x + b.w * 0.54, b.y + 10, b.w * 0.46, b.h - 20, 0.85);
    return;
  }

  // Stories cover the lower-right corner, so the lower half stops at 79% of the width.
  const lw = fmt === "story" ? W * 0.79 - b.x : b.w, st = stack();
  head(st, b.x, b.w, 1);
  st.gap(30);
  st.add(fmt === "story" ? 420 : 300, (y, k, hh) => plotCountdown(g, e, m, b.x, y, lw, hh, k));
  st.gap(30);
  st.add(180, count(b.x, lw, 1));
  st.add(96, whenLine(b.x, lw, 1));
  st.gap(30);
  st.add(70, (y, k) => sourceNote(g, url, b.x, y, k, lw));
  flow(st.blocks, b.y, b.h);
}

function drawGraphList(g, W, H, fmt, { rows, title }) {
  const C = CARD_COLORS, b = safeBox(fmt, W, H);
  graphPaper(g, W, H);
  const max = fmt === "story" ? 10 : fmt === "square" ? 7 : 4;
  const shown = rows.slice(0, max);
  const rowW = fmt === "story" ? W * 0.79 - b.x : b.w;
  const days = (r) => Math.max(0, (Date.parse(r.m.at) - Date.now()) / 86400000);
  const longest = Math.max(1, ...shown.map(days));
  const st = stack();
  st.add(40, (y, k) => caption(g, "FIG. 2 · DEADLINES AHEAD", b.x, y, k, b.w));
  st.add(16);
  st.add(fmt === "wide" ? 64 : 110, (y, k, hh) => { const ts = fit(g, title, b.w, hh * 0.85, 700); g.fillStyle = C.text; g.fillText(title, b.x, y + ts * 0.9); });
  st.add(fmt === "wide" ? 6 : 30);
  for (const r of shown) {
    st.add(fmt === "wide" ? 64 : 80, (y, k, hh) => {
      const nameW = rowW * 0.32, bx = b.x + nameW + 16 * k;
      const name = `${r.s.title} ${r.e.year}`;
      fit(g, name, nameW, 30 * k, 700);
      g.fillStyle = C.text; g.fillText(name, b.x, y + hh / 2 - 4 * k);
      font(g, 22 * k, 400); g.fillStyle = C.muted;
      g.fillText(fitLine(g, shortLabel(r.m), nameW), b.x, y + hh / 2 + 22 * k);
      g.fillStyle = C.text; g.fillRect(bx - 2 * k, y, 2 * k, hh);
      const cd = compactCount(r.m);
      font(g, 28 * k, 600, MONO);
      const cw = g.measureText(cd).width;
      const barMax = b.x + rowW - bx - cw - 20 * k;
      const bw = Math.max(4 * k, barMax * days(r) / longest), bh = hh * 0.4, by = y + (hh - bh) / 2;
      if (r.m.est) {
        g.save(); g.strokeStyle = C.accent; g.lineWidth = 3 * k; g.setLineDash([10 * k, 7 * k]);
        g.strokeRect(bx + 1.5 * k, by + 1.5 * k, bw - 3 * k, bh - 3 * k); g.restore();
      } else { g.fillStyle = C.accent; g.fillRect(bx, by, bw, bh); }
      g.fillStyle = C.text; g.fillText(cd, bx + bw + 12 * k, by + bh / 2 + 10 * k);
    });
  }
  if (rows.length > shown.length) st.add(44, (y, k) => { font(g, 26 * k, 600); g.fillStyle = C.muted; g.fillText(`+${rows.length - shown.length} more`, b.x, y + 32 * k); });
  st.gap(fmt === "wide" ? 6 : 30);
  st.add(70, (y, k) => sourceNote(g, siteHost(), b.x, y, k, rowW));
  flow(st.blocks, b.y, b.h);
}

const OBJECT_DRAWERS = {
  pass: [drawPassVenue, drawPassList],
  nixie: [drawNixieVenue, drawNixieList],
  receipt: [drawReceiptVenue, drawReceiptList],
  graph: [drawGraphVenue, drawGraphList],
};

function renderCard(kind, payload, fmt, theme = shareState.theme) {
  Object.keys(CARD_COLORS).forEach((k) => delete CARD_COLORS[k]);
  Object.assign(CARD_COLORS, CARD_THEMES[theme] || CARD_THEMES.console);
  const { w, h } = CARD_FORMATS[fmt];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.textBaseline = "alphabetic";
  const [venue, list] = OBJECT_DRAWERS[CARD_COLORS.style] || [drawVenue, drawList];
  (kind === "venue" ? venue : list)(g, w, h, fmt, payload);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

// ---- dialog ----
async function refreshCard() {
  const img = $("sdImg");
  img.removeAttribute("src");
  // Canvas text needs the web font loaded first, or the first card falls back to a system font.
  try { await Promise.all(["400", "600", "700"].map((w) => document.fonts.load(`${w} 40px "IBM Plex Sans Condensed"`)).concat(["500", "600"].map((w) => document.fonts.load(`${w} 40px "IBM Plex Mono"`)))); } catch (_) { /* fall back */ }
  shareState.blob = await renderCard(shareState.kind, shareState.payload, shareState.format);
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.dataset.url = URL.createObjectURL(shareState.blob);
  img.src = img.dataset.url;
  for (const b of document.querySelectorAll("[data-format]")) b.setAttribute("aria-checked", b.dataset.format === shareState.format);
  for (const b of document.querySelectorAll("[data-card-theme]")) b.setAttribute("aria-checked", b.dataset.cardTheme === shareState.theme);
}

function openShareCard(kind, payload, url, text) {
  Object.assign(shareState, { kind, payload, url, text });
  $("sdTitle").textContent = kind === "venue" ? `${payload.s.title} ${payload.e.year}` : payload.title;
  const dlg = $("sharedlg");
  if (!dlg.open) dlg.showModal();
  refreshCard();
}

function shareVenue(key) {
  const s = DATA.series.find((x) => x.key === key);
  if (!s) return;
  const next = nextFor(s, new Date()) || itemsOf(s).filter((it) => it.t > new Date()).sort((a, b) => a.t - b.t)[0];
  if (!next) return;
  openShareCard("venue", { s, e: next.edition, m: next.m }, venueUrl(s.key),
    `${s.title} ${next.edition.year} · ${next.m.label}: ${officialWhen(next.edition, next.m)}`);
}

function shareListCard() {
  const keys = state.watch || state.starred;
  const now = new Date();
  const rows = DATA.series.filter((s) => keys.has(s.key)).map((s) => {
    const n = nextFor(s, now);
    return n && { s, e: n.edition, m: n.m, t: n.t };
  }).filter(Boolean).sort((a, b) => a.t - b.t);
  if (!rows.length) return;
  openShareCard("list", { rows, title: state.watch ? "Deadlines to watch" : "My next deadlines" }, watchLink(keys),
    `My next deadlines: ${rows.slice(0, 4).map((r) => `${r.s.title} ${r.e.year}`).join(", ")}`);
}

async function shareCardNow() {
  const blob = shareState.blob;
  if (!blob) return;
  const name = `ai-deadlines-${shareState.kind === "venue" ? shareState.payload.s.key : "list"}-${shareState.format}.png`;
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "AI Conference Deadlines", text: `${shareState.text} ${shareState.url}` });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  downloadCard(file);
}

function downloadCard(file) {
  const f = file || new File([shareState.blob], "ai-deadlines-card.png", { type: "image/png" });
  const url = URL.createObjectURL(f);
  Object.assign(document.createElement("a"), { href: url, download: f.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function bindShare() {
  const dlg = $("sharedlg");
  $("sdClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });
  $("sdFormats").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-format]");
    if (!b) return;
    shareState.format = b.dataset.format;
    saveCardPrefs();
    refreshCard();
  });
  $("sdThemes").innerHTML = Object.entries(CARD_THEMES).map(([k, t]) => {
    const dot = t.swatch ? t.dot : t.accent;
    return `<button type="button" role="radio" data-card-theme="${k}" aria-checked="${k === shareState.theme}">
      <span class="swatch" style="background:${t.swatch || `linear-gradient(135deg, ${t.bg1}, ${t.bg2})`}">${dot ? `<i style="background:${dot}"></i>` : ""}</span>${esc(t.name)}</button>`;
  }).join("");
  $("sdThemes").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-card-theme]");
    if (!b) return;
    shareState.theme = b.dataset.cardTheme;
    saveCardPrefs();
    refreshCard();
  });
  $("sdShare").addEventListener("click", shareCardNow);
  $("sdSave").addEventListener("click", () => downloadCard());
  $("sdCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareState.url);
      $("sdCopy").textContent = "Link copied";
      setTimeout(() => { $("sdCopy").textContent = "Copy link"; }, 1500);
    } catch (_) { window.prompt("Copy this link", shareState.url); }
  });
  // Share buttons live inside rendered lists and the hero, so listen at the document.
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-sharecard]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (b.dataset.sharecard === "list") shareListCard(); else shareVenue(b.dataset.sharecard);
  }, true);
}

"use strict";
// Share cards: a PNG drawn on a canvas, for one venue's next date or for a list of venues.
// Story (9:16) keeps everything between 14% and 80% of the height, 8% in from the sides and out of the
// lower-right corner, which Instagram/Facebook Stories cover. The background still runs edge to edge.

const CARD_FORMATS = {
  story: { w: 1080, h: 1920, label: "Story" },
  square: { w: 1080, h: 1080, label: "Square" },
  wide: { w: 1200, h: 630, label: "Wide" },
};
const CARD_COLORS = {
  bg1: "#16181f", bg2: "#0b0c10", text: "#f2f3f6", muted: "#a3a8b2", faint: "#5d626c", line: "#2c313a",
  accent: "#ff6369",
  submission: "#ff6369", reviews: "#b98cf0", decision: "#52a9ff", camera: "#3dd68c", conference: "#b4b9c2", other: "#80858f",
};
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const shareState = { kind: null, payload: null, format: "story", blob: null, url: null };

// ---- text helpers ----
function font(g, size, weight = 600) { g.font = `${weight} ${Math.round(size)}px ${FONT}`; }
function fit(g, text, maxW, size, weight, min = 0.4) {
  let s = size;
  font(g, s, weight);
  while (g.measureText(text).width > maxW && s > size * min) { s *= 0.94; font(g, s, weight); }
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
  if (d >= 2) return [String(Math.floor(d)), "days to go"];
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
      : { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz };
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
  glow.addColorStop(0, color + "55");
  glow.addColorStop(1, color + "00");
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
  font(g, size * 0.82, 650);
  g.fillStyle = CARD_COLORS.muted;
  g.textBaseline = "middle";
  g.fillText("AI Conference Deadlines", x + size * 0.9, y + size * 0.52);
  g.textBaseline = "alphabetic";
}

function drawTrack(g, e, next, x, y, w, size) {
  const ms = e.milestones.filter((m) => m.group !== "other");
  if (ms.length < 2) return;
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
  const numColor = m.est ? CARD_COLORS.muted : m.group === "conference" ? CARD_COLORS.text : color;
  background(g, W, H, color);
  const b = safeBox(fmt, W, H);
  const [num, unit] = cardCount(Date.parse(m.at) - Date.now(), m.est);
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const url = `${siteHost()}/#${s.key}`;

  if (fmt === "wide") {
    const colW = b.w * 0.56;
    brand(g, b.x, b.y, 30);
    font(g, 24, 700); g.fillStyle = color;
    g.fillText(m.label.toUpperCase().slice(0, 48), b.x, b.y + 100);
    const ts = fit(g, `${s.title} ${e.year}`, colW, 84, 800);
    g.fillStyle = CARD_COLORS.text; g.fillText(`${s.title} ${e.year}`, b.x, b.y + 100 + ts * 1.05);
    font(g, 26, 500); g.fillStyle = CARD_COLORS.muted;
    let yy = b.y + 100 + ts * 1.05 + 46;
    for (const line of wrap(g, s.full_name || "", colW, 2)) { g.fillText(line, b.x, yy); yy += 34; }
    font(g, 28, 600); g.fillStyle = CARD_COLORS.text;
    g.fillText(fitLine(g, officialWhen(e, m), colW), b.x, yy + 20);
    if (place) { font(g, 26, 500); g.fillStyle = CARD_COLORS.muted; g.fillText(fitLine(g, place, colW), b.x, yy + 58); }
    // Right column: the number.
    const rx = b.x + b.w * 0.62, rw = b.w * 0.38;
    const ns = fit(g, num, rw, 230, 800);
    g.fillStyle = numColor; g.fillText(num, rx, b.y + 60 + ns * 0.95);
    font(g, 30, 600); g.fillStyle = CARD_COLORS.text; g.fillText(unit, rx, b.y + 60 + ns * 0.95 + 50);
    drawTrack(g, e, m, b.x, b.y + b.h - 80, b.w, 22);
    font(g, 22, 500); g.fillStyle = CARD_COLORS.faint;
    g.fillText(`${url}  ·  ${asOf()}`, b.x, b.y + b.h - 6);
    return;
  }

  // Story and square: one column, laid out top to bottom, then scaled to fit the safe box.
  const blocks = [];
  const add = (h, draw) => blocks.push({ h, draw });
  add(44, (y, k) => brand(g, b.x, y, 44 * k));
  add(fmt === "story" ? 110 : 70, () => {});
  add(44, (y, k) => { font(g, 36 * k, 700); g.fillStyle = color; g.fillText(fitLine(g, m.label.toUpperCase(), b.w), b.x, y + 36 * k); });
  add(20, () => {});
  add(140, (y, k) => { const ts = fit(g, `${s.title} ${e.year}`, b.w, 132 * k, 800); g.fillStyle = CARD_COLORS.text; g.fillText(`${s.title} ${e.year}`, b.x, y + ts * 0.92); });
  add(96, (y, k) => {
    font(g, 36 * k, 500); g.fillStyle = CARD_COLORS.muted;
    wrap(g, s.full_name || "", b.w, 2).forEach((line, i) => g.fillText(line, b.x, y + 40 * k + i * 46 * k));
  });
  add(fmt === "story" ? 90 : 40, () => {});
  add(fmt === "story" ? 330 : 250, (y, k, hh) => { const ns = fit(g, num, b.w, hh * 1.05, 800); g.fillStyle = numColor; g.fillText(num, b.x - ns * 0.03, y + hh * 0.86); });
  add(64, (y, k) => { font(g, 50 * k, 650); g.fillStyle = CARD_COLORS.text; g.fillText(unit, b.x, y + 50 * k); });
  add(fmt === "story" ? 80 : 40, () => {});
  add(52, (y, k) => { font(g, 40 * k, 600); g.fillStyle = CARD_COLORS.text; g.fillText(fitLine(g, officialWhen(e, m), b.w), b.x, y + 40 * k); });
  if (place) add(50, (y, k) => { font(g, 36 * k, 500); g.fillStyle = CARD_COLORS.muted; g.fillText(fitLine(g, place, b.w), b.x, y + 36 * k); });
  add(fmt === "story" ? 90 : 50, () => {});
  // In Stories the right edge of the lower half is covered, so the timeline stops short there.
  add(40, (y, k) => drawTrack(g, e, m, b.x + 14 * k, y + 20 * k, (fmt === "story" ? b.w * 0.82 : b.w) - 28 * k, 30 * k));
  add(fmt === "story" ? 90 : 50, () => {});
  // The link sits bottom-left: Stories put their reply/like controls on the right.
  add(40, (y, k) => { font(g, 30 * k, 600); g.fillStyle = CARD_COLORS.muted; g.fillText(fitLine(g, url, b.w * 0.72), b.x, y + 30 * k); });
  add(36, (y, k) => { font(g, 26 * k, 500); g.fillStyle = CARD_COLORS.faint; g.fillText(asOf(), b.x, y + 28 * k); });
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
  add(120, (y, k) => { const ts = fit(g, title, b.w, 104 * k, 800); g.fillStyle = CARD_COLORS.text; g.fillText(title, b.x, y + ts * 0.9); });
  add(fmt === "wide" ? 20 : 40, () => {});
  for (const r of shown) {
    add(fmt === "wide" ? 88 : 132, (y, k, hh) => {
      const c = CARD_COLORS[r.m.group] || CARD_COLORS.accent;
      g.strokeStyle = CARD_COLORS.line; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(b.x, y + 2); g.lineTo(b.x + rowW, y + 2); g.stroke();
      g.fillStyle = c;
      g.beginPath(); g.arc(b.x + 12 * k, y + hh * 0.4, 10 * k, 0, Math.PI * 2); g.fill();
      const [num, unit] = cardCount(Date.parse(r.m.at) - Date.now(), r.m.est);
      const right = `${num} ${unit.split(" ")[0].replace("months", "mo").replace("days", "d").replace("hours", "h").replace("hour", "h").replace("minutes", "min")}`;
      font(g, 50 * k, 800);
      const rw = g.measureText(right).width;
      g.fillStyle = r.m.est ? CARD_COLORS.muted : c;
      g.fillText(right, b.x + rowW - rw, y + hh * 0.52);
      const leftW = rowW - rw - 60 * k;
      const ts = fit(g, `${r.s.title} ${r.e.year}`, leftW, 46 * k, 750);
      g.fillStyle = CARD_COLORS.text; g.fillText(`${r.s.title} ${r.e.year}`, b.x + 40 * k, y + hh * 0.4 + ts * 0.32);
      font(g, 30 * k, 500); g.fillStyle = CARD_COLORS.muted;
      g.fillText(fitLine(g, `${r.m.label} · ${officialWhen(r.e, r.m)}`, leftW), b.x + 40 * k, y + hh * 0.4 + ts * 0.32 + 42 * k);
    });
  }
  if (rows.length > shown.length) add(50, (y, k) => { font(g, 30 * k, 600); g.fillStyle = CARD_COLORS.faint; g.fillText(`+${rows.length - shown.length} more`, b.x + 40 * k, y + 36 * k); });
  add(fmt === "story" ? 70 : 30, () => {});
  add(40, (y, k) => { font(g, 30 * k, 600); g.fillStyle = CARD_COLORS.muted; g.fillText(siteHost(), b.x, y + 30 * k); });
  add(36, (y, k) => { font(g, 26 * k, 500); g.fillStyle = CARD_COLORS.faint; g.fillText(asOf(), b.x, y + 28 * k); });
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

function renderCard(kind, payload, fmt) {
  const { w, h } = CARD_FORMATS[fmt];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.textBaseline = "alphabetic";
  if (kind === "venue") drawVenue(g, w, h, fmt, payload);
  else drawList(g, w, h, fmt, payload);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

// ---- dialog ----
async function refreshCard() {
  const img = $("sdImg");
  img.removeAttribute("src");
  shareState.blob = await renderCard(shareState.kind, shareState.payload, shareState.format);
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.dataset.url = URL.createObjectURL(shareState.blob);
  img.src = img.dataset.url;
  for (const b of document.querySelectorAll("[data-format]")) b.setAttribute("aria-pressed", b.dataset.format === shareState.format);
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
  openShareCard("venue", { s, e: next.edition, m: next.m }, `${location.origin}${location.pathname}#${s.key}`,
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

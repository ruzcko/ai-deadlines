// GET /og                 → preview image for the home page (the next paper deadline overall)
// GET /og?v=neurips       → one venue's next date
// GET /og?watch=iclr,cvpr → a shared list
// A 1200 x 630 PNG drawn as SVG and rendered with resvg (lib/og, MPL-2.0) in Inter (OFL).
// The countdown changes daily, so the page links to it with &d=<date> and the edge caches each day's image.
import { initWasm, Resvg } from "../lib/og/resvg.mjs";
import wasm from "../lib/og/resvg.wasm";
import { COLORS as C, SITE, cleanKey, countdown, esc, loadData, nextFor, nextOverall, officialWhen, shortCount } from "../lib/deadline.js";

const W = 1200, H = 630, X = 72;
let ready = null, fonts = null;

async function setup(env, origin) {
  ready ??= initWasm(wasm);
  fonts ??= Promise.all(["Inter-Medium.ttf", "Inter-ExtraBold.ttf"].map((f) =>
    env.ASSETS.fetch(new URL(`/fonts/${f}`, origin)).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b))));
  await ready;
  return fonts;
}

// No text measuring in SVG land, so estimate: Inter is ~0.56 em per character at 800, ~0.5 at 500.
const width = (text, size, bold) => String(text).length * size * (bold ? 0.6 : 0.52);
const fit = (text, maxW, size, bold, min = 26) => {
  let s = size;
  while (s > min && width(text, s, bold) > maxW) s -= 2;
  return s;
};
function wrap(text, maxW, size, lines) {
  const out = [];
  let cur = "";
  for (const w of String(text || "").split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (width(next, size) <= maxW || !cur) cur = next; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, "") + "…"; }
  return out;
}
const txt = (x, y, size, weight, fill, s, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(s)}</text>`;

function frame(color, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient>
    <radialGradient id="glow" cx="0.92" cy="0.05" r="0.75"><stop offset="0" stop-color="${color}" stop-opacity=".38"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
  <circle cx="${X + 10}" cy="82" r="9" fill="${C.accent}"/>
  ${txt(X + 30, 91, 26, 700, C.muted, "AI Conference Deadlines")}
  ${body}
</svg>`;
}

function timeline(e, next, now, y) {
  const ms = e.milestones.filter((m) => m.group !== "other");
  if (ms.length < 2) return "";
  const t0 = Date.parse(ms[0].at), t1 = Date.parse(ms[ms.length - 1].at), x0 = X, x1 = W - X;
  const pos = (t) => x0 + Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0))) * (x1 - x0);
  let out = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/>`;
  if (now > t0) out += `<line x1="${x0}" y1="${y}" x2="${pos(Math.min(now, t1)).toFixed(1)}" y2="${y}" stroke="${C.faint}" stroke-width="5" stroke-linecap="round"/>`;
  for (const m of ms) {
    const t = Date.parse(m.at), cx = pos(t).toFixed(1), c = C[m.group] || C.other;
    if (m === next) out += `<circle cx="${cx}" cy="${y}" r="17" fill="${c}" fill-opacity=".25"/>`;
    out += t <= now ? `<circle cx="${cx}" cy="${y}" r="8" fill="${c}" fill-opacity=".55"/>`
      : `<circle cx="${cx}" cy="${y}" r="${m === next ? 11 : 8}" fill="${C.bg2}" stroke="${c}" stroke-width="4"/>`;
  }
  return out;
}

function asOf(now) {
  return "as of " + new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(now));
}

function venueSvg({ s, e, m, t }, now, eyebrowPrefix = "") {
  const color = C[m.group] || C.accent;
  const [num, unit] = countdown(t - now, m.est);
  const title = `${s.title} ${e.year}`;
  const leftW = 640;
  const ts = fit(title, leftW, 92, true, 48);
  const eyebrow = (eyebrowPrefix + m.label).toUpperCase();
  const es = fit(eyebrow, leftW, 24, true, 16);
  const names = wrap(s.full_name || "", leftW, 26, 2);
  const place = [e.city, e.country].filter(Boolean).join(", ");
  const when = officialWhen(e, m);
  const ns = fit(num, 400, 220, true, 120);
  let y = 172;
  let body = txt(X, y, es, 800, color, eyebrow, 'letter-spacing="1.5"');
  y += 16 + ts;
  body += txt(X, y, ts, 800, C.text, title, 'letter-spacing="-2"');
  y += 12;
  for (const line of names) { y += 34; body += txt(X, y, 26, 500, C.muted, line); }
  y = Math.max(y + 56, 420);
  body += txt(X, y, fit(when, leftW, 30, false, 20), 700, C.text, when);
  if (place) body += txt(X, y + 40, 26, 500, C.muted, place);
  body += txt(W - X, 340, ns, 800, m.est ? C.muted : color, num, 'text-anchor="end" letter-spacing="-6"');
  body += txt(W - X, 392, 32, 700, C.text, unit, 'text-anchor="end"');
  body += timeline(e, m, now, 528);
  body += txt(X, 588, 22, 500, C.faint, `${SITE}/?v=${s.key}  ·  ${asOf(now)}`);
  return frame(color, body);
}

function listSvg(rows, now) {
  const shown = rows.slice(0, 4);
  let body = txt(X, 176, 64, 800, C.text, "Deadlines to watch", 'letter-spacing="-2"');
  shown.forEach((r, i) => {
    const y = 236 + i * 84, c = C[r.m.group] || C.accent;
    const right = shortCount(r.t - now, r.m.est);
    body += `<line x1="${X}" y1="${y}" x2="${W - X}" y2="${y}" stroke="${C.line}" stroke-width="2"/>`;
    body += `<circle cx="${X + 9}" cy="${y + 34}" r="8" fill="${c}"/>`;
    body += txt(X + 32, y + 44, 34, 800, C.text, `${r.s.title} ${r.e.year}`);
    const sub = `${r.m.label} · ${officialWhen(r.e, r.m)}`;
    body += txt(X + 32, y + 74, 20, 500, C.muted, sub.length > 70 ? sub.slice(0, 69) + "…" : sub);
    body += txt(W - X, y + 52, 44, 800, r.m.est ? C.muted : c, right, 'text-anchor="end"');
  });
  if (rows.length > shown.length) body += txt(X + 32, 236 + shown.length * 84 + 34, 22, 700, C.faint, `+${rows.length - shown.length} more`);
  body += txt(X, 588, 22, 500, C.faint, `${SITE}  ·  ${asOf(now)}`);
  return frame(C.accent, body);
}

function emptySvg() {
  return frame(C.accent, txt(X, 300, 84, 800, C.text, "Every AI deadline,", 'letter-spacing="-2"') +
    txt(X, 400, 84, 800, C.accent, "counting down.", 'letter-spacing="-2"') +
    txt(X, 470, 30, 500, C.muted, "Submission to camera-ready · map · calendar feeds") +
    txt(X, 588, 22, 500, C.faint, SITE));
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const url = new URL(request.url);
  const [[medium, bold], data] = await Promise.all([setup(env, url.origin), loadData(env, url.origin)]);
  const now = Date.now();
  let svg;
  const v = cleanKey(url.searchParams.get("v"));
  const watch = (url.searchParams.get("watch") || "").split(",").map(cleanKey).filter(Boolean).slice(0, 30);
  if (v) {
    const s = data.series.find((x) => x.key === v);
    const n = s && nextFor(s, now);
    svg = n ? venueSvg(n, now) : emptySvg();
  } else if (watch.length) {
    const rows = data.series.filter((x) => watch.includes(x.key)).map((x) => nextFor(x, now)).filter(Boolean).sort((a, b) => a.t - b.t);
    svg = rows.length ? listSvg(rows, now) : emptySvg();
  } else {
    const n = nextOverall(data, now);
    svg = n ? venueSvg(n, now, "Next deadline · ") : emptySvg();
  }
  const png = new Resvg(svg, {
    font: { fontBuffers: [medium, bold], defaultFontFamily: "Inter", loadSystemFonts: false },
    fitTo: { mode: "width", value: W },
  }).render().asPng();
  const res = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  waitUntil(cache.put(request, res.clone()));
  return res;
}

// Shared by the Pages Functions (link previews). Mirrors the bits of site/app.js that pick a venue's next
// date and format it, so a preview says the same thing the page does.

export const SITE = "ai-deadlines.ruzcko.com";
export const COLORS = {
  bg1: "#16181f", bg2: "#0b0c10", text: "#f2f3f6", muted: "#a3a8b2", faint: "#5d626c", line: "#2c313a", accent: "#ff6369",
  submission: "#ff6369", reviews: "#b98cf0", decision: "#52a9ff", camera: "#3dd68c", conference: "#e8eaee", other: "#80858f",
};
const MAIN = new Set(["submission", "reviews", "decision", "camera", "conference"]);

let cached = null, cachedAt = 0;
export async function loadData(env, origin) {
  if (cached && Date.now() - cachedAt < 10 * 60 * 1000) return cached;
  const res = await env.ASSETS.fetch(new URL("/data/conferences.json", origin));
  cached = await res.json();
  cachedAt = Date.now();
  return cached;
}

export const cleanKey = (k) => (k || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

// Next date worth a preview: the earliest announced one ahead, else the earliest estimate.
export function nextFor(s, now, groups = MAIN) {
  let real = null, est = null;
  for (const e of s.editions) {
    for (const m of e.milestones) {
      if (!groups.has(m.group) || m.type === "end") continue;
      const t = Date.parse(m.at);
      if (t <= now) continue;
      const slot = m.est ? "est" : "real";
      const cur = slot === "est" ? est : real;
      if (!cur || t < cur.t) {
        if (slot === "est") est = { s, e, m, t }; else real = { s, e, m, t };
      }
    }
  }
  return real || est;
}

export function nextOverall(data, now) {
  let best = null;
  for (const s of data.series) {
    const n = nextFor(s, now, new Set(["submission"]));
    if (n && !n.m.est && (!best || n.t < best.t)) best = n;
  }
  return best;
}

export function countdown(ms, est) {
  const d = ms / 86400000;
  if (est) return d >= 60 ? [`~${Math.round(d / 30.44)}`, "months away · estimated"] : [`~${Math.max(1, Math.round(d))}`, "days away · estimated"];
  if (d >= 2) return [String(Math.floor(d)), "days to go"];
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return [String(h), h === 1 ? "hour to go" : "hours to go"];
  return [String(Math.max(1, Math.floor(ms / 60000))), "minutes to go"];
}

export function shortCount(ms, est) {
  const [n, unit] = countdown(ms, est);
  const u = unit.startsWith("month") ? "mo" : unit.startsWith("day") ? "d" : unit.startsWith("hour") ? "h" : "min";
  return `${n} ${u}`;
}

export function zoneFor(label) {
  if (!label || label === "AoE") return "Etc/GMT+12";
  if (label === "UTC") return "UTC";
  if (label === "Pacific") return "America/Los_Angeles";
  const m = /^UTC([+-])(\d+)$/.exec(label);
  if (m) return `Etc/GMT${m[1] === "+" ? "-" : "+"}${m[2]}`;
  return label;
}

// The date as the venue publishes it (its own timezone), so a preview reads the same everywhere.
export function officialWhen(e, m) {
  const t = new Date(m.at);
  if (m.est) return "around " + new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(t);
  if (m.day) {
    const f = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const a = new Date(m.day + "T12:00:00Z");
    const end = m.type === "start" && e.milestones.find((x) => x.type === "end");
    return end ? f.formatRange(a, new Date(end.day + "T12:00:00Z")) : f.format(a);
  }
  try {
    const opts = { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: zoneFor(m.tz) };
    if (!m.notime) Object.assign(opts, { hour: "numeric", minute: "2-digit" });
    return new Intl.DateTimeFormat("en-US", opts).format(t) + " " + (m.tz || "AoE");
  } catch (_) {
    return t.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
}

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

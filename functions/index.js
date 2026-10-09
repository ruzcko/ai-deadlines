// GET /?v=neurips or /?watch=iclr,cvpr: link previews (Messenger, Slack, X, LinkedIn) can't see "#", so shared
// links carry the venue or list in the query. We serve the normal page with its title, description and preview
// image set for them. Every visit gets a preview image dated today, since the countdown in it changes daily.
// Any error falls back to the untouched page.
import { cleanKey, esc, humanCount, loadData, nextFor, nextOverall, officialWhen } from "../lib/deadline.js";

class SetContent {
  constructor(value) { this.value = value; }
  element(el) { el.setAttribute("content", this.value); }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL("/", url.origin));
  try {
    const data = await loadData(env, url.origin);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const v = cleanKey(url.searchParams.get("v"));
    const watch = (url.searchParams.get("watch") || "").split(",").map(cleanKey).filter(Boolean).slice(0, 30);
    let title = null, desc = null, query = "";

    const s = v && data.series.find((x) => x.key === v);
    if (s) {
      const n = nextFor(s, now);
      query = `v=${s.key}`;
      title = n ? `${s.title} ${n.e.year} · ${n.m.label} in ${humanCount(n.t - now, n.m.est)}` : `${s.title} · AI Conference Deadlines`;
      desc = n ? `${n.m.label}: ${officialWhen(n.e, n.m)}.${n.e.city ? ` ${[n.e.city, n.e.country].filter(Boolean).join(", ")}.` : ""} Live countdown, every milestone and calendar feeds.`
        : `${s.full_name || s.title}: deadlines, dates and calendar feeds.`;
    } else if (watch.length) {
      const rows = data.series.filter((x) => watch.includes(x.key)).map((x) => nextFor(x, now)).filter(Boolean).sort((a, b) => a.t - b.t);
      if (rows.length) {
        query = `watch=${rows.map((r) => r.s.key).join(",")}`;
        title = `Deadlines to watch: ${rows.slice(0, 4).map((r) => r.s.title).join(", ")}${rows.length > 4 ? "…" : ""}`;
        desc = rows.slice(0, 3).map((r) => `${r.s.title} ${r.e.year} ${r.m.label.toLowerCase()} in ${humanCount(r.t - now, r.m.est)}`).join(" · ") + ".";
      }
    } else {
      const n = nextOverall(data, now);
      if (n) desc = `Next up: ${n.s.title} ${n.e.year} ${n.m.label.toLowerCase()} in ${humanCount(n.t - now, false)}. Live countdowns for 70+ AI/ML venues, a map, a calendar and subscribable feeds.`;
    }

    const image = `${url.origin}/og?${query ? query + "&" : ""}d=${day}`;
    const rw = new HTMLRewriter()
      .on('meta[property="og:image"]', new SetContent(image))
      .on('meta[name="twitter:image"]', new SetContent(image))
      .on('meta[property="og:url"]', new SetContent(`${url.origin}/${query ? "?" + query : ""}`));
    if (title) {
      rw.on("title", { element(el) { el.setInnerContent(esc(title), { html: true }); } })
        .on('meta[property="og:title"]', new SetContent(title))
        .on('meta[name="twitter:title"]', new SetContent(title));
    }
    if (desc) {
      rw.on('meta[name="description"]', new SetContent(desc))
        .on('meta[property="og:description"]', new SetContent(desc))
        .on('meta[name="twitter:description"]', new SetContent(desc));
    }
    return rw.transform(new Response(page.body, {
      status: page.status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
    }));
  } catch (_) {
    return page;
  }
}

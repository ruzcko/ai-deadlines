"use strict";
// Calendar month view. Deadlines land on the viewer's local day, the same moment the list counts down to.
// Estimated dates aren't pinned to a day (that would be false precision); they go in "Expected this month".

const cal = { month: null, showPast: false }; // first day of the shown month (local time)

function dayKey(t) {
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// 0 = Sunday … 6 = Saturday, from the viewer's locale when the browser knows it.
function firstWeekday() {
  try {
    const loc = new Intl.Locale(navigator.language);
    const info = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo;
    if (info && info.firstDay) return info.firstDay % 7;
  } catch (_) { /* older browsers */ }
  return 0;
}

// Calendar day of a milestone: its own date for day-only entries, else the instant in the chosen zone.
const keyOf = (m, t) => m.day || zoneDayKey(t);

function calItems(monthPrefix) {
  const items = [], expected = new Map();
  for (const s of DATA.series) {
    if (!matches(s)) continue;
    for (const e of s.editions) {
      const endM = e.milestones.find((x) => x.type === "end");
      for (const m of e.milestones) {
        if (!state.groups.has(m.group) || m.type === "end") continue;
        const t = m.day ? new Date(m.day + "T12:00:00") : new Date(m.at);
        if (!keyOf(m, t).startsWith(monthPrefix)) continue;
        if (m.est) {
          const k = `${s.key}:${m.group}`;
          if (!state.hideEst && !expected.has(k)) expected.set(k, { s, e, m, t });
          continue;
        }
        items.push({ s, e, m, t, key: keyOf(m, t), until: m.type === "start" && endM ? endM.day : null });
      }
    }
  }
  items.sort((a, b) => a.t - b.t);
  return { items, expected: [...expected.values()].sort((a, b) => a.t - b.t) };
}

function chipTitle(it) {
  const when = it.m.day ? fmtDate.format(it.t) : fmtDateTime.format(it.t);
  const until = it.until ? ` – ${fmtDate.format(new Date(it.until + "T12:00:00"))}` : "";
  return `${it.s.title} ${it.e.year} · ${it.m.label} · ${when}${until}`;
}

function renderCalendar() {
  const now = new Date();
  if (!cal.month) cal.month = new Date(now.getFullYear(), now.getMonth(), 1);
  const y = cal.month.getFullYear(), mo = cal.month.getMonth();
  const start = new Date(y, mo, 1);
  const { items, expected } = calItems(`${y}-${String(mo + 1).padStart(2, "0")}-`);
  const byDay = new Map();
  for (const it of items) {
    const k = it.key;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(it);
  }

  $("calTitle").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(start);
  $("calcount").textContent = `${items.length} date${items.length === 1 ? "" : "s"} this month` +
    (expected.length ? ` · ${expected.length} expected` : "");

  const first = firstWeekday();
  const wd = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const sunday = new Date(2023, 0, 1); // a Sunday
  const heads = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(1 + ((first + i) % 7));
    return `<div class="cal-wd">${esc(wd.format(d))}</div>`;
  }).join("");

  const lead = (start.getDay() - first + 7) % 7;
  const days = new Date(y, mo + 1, 0).getDate();
  const today = zoneDayKey(now);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div class="cal-cell blank"></div>`);
  for (let d = 1; d <= days; d++) {
    const k = dayKey(new Date(y, mo, d));
    const list = byDay.get(k) || [];
    const chips = list.slice(0, 3).map((it) => `<a class="cchip" href="#${esc(it.s.key)}" style="--c:var(--g-${it.m.group})" title="${esc(chipTitle(it))}"><b>${esc(it.s.title)}</b> ${esc(shortLabel(it.m))}</a>`).join("");
    const more = list.length > 3 ? `<button class="cmore" data-day="${k}">+${list.length - 3} more</button>` : "";
    const dots = list.slice(0, 6).map((it) => `<span style="background:var(--g-${it.m.group})"></span>`).join("");
    const past = k < today ? " past" : "";
    cells.push(`<div class="cal-cell${k === today ? " today" : ""}${past}${list.length ? " has" : ""}" ${list.length ? `data-day="${k}" role="button" tabindex="0" aria-label="${esc(fmtDate.format(new Date(y, mo, d)))}: ${list.length} date${list.length === 1 ? "" : "s"}"` : ""}>
      <span class="cal-n">${d}</span>${chips}${more}<span class="cdots">${dots}</span></div>`);
  }
  while (cells.length % 7) cells.push(`<div class="cal-cell blank"></div>`);
  $("calgrid").innerHTML = heads + cells.join("");

  // Day-by-day agenda: the main view on phones, and where "+N more" leads.
  // The day-by-day list (the main view on phones) starts at today; earlier days fold away.
  const dayEntries = [...byDay.entries()];
  const pastDays = dayEntries.filter(([k]) => k < today);
  const visible = cal.showPast ? dayEntries : dayEntries.filter(([k]) => k >= today);
  const pastBtn = pastDays.length ? `<button class="pill ag-past" type="button" data-agpast>${cal.showPast ? "Hide earlier days" : `Show ${pastDays.length} earlier day${pastDays.length === 1 ? "" : "s"}`}</button>` : "";
  const agenda = visible.map(([k, list]) => `
    <div class="ag-day${k < today ? " past" : ""}" id="ag-${k}"><div class="ag-date">${esc(fmtDate.format(new Date(k + "T12:00:00")))}</div>
    ${list.map((it) => `<a class="ag-item" href="#${esc(it.s.key)}"><span class="sw" style="background:var(--g-${it.m.group})"></span><b>${esc(it.s.title)} ${it.e.year}</b> <span>${esc(it.m.label)}${it.until ? ` – until ${esc(fmtDate.format(new Date(it.until + "T12:00:00")))}` : ""}</span>${it.m.day ? "" : `<span class="muted">${esc(fmtIn("t").format(it.t) + tzTag())}</span>`}</a>`).join("")}</div>`).join("");
  $("calagenda").innerHTML = pastBtn + (agenda || (pastDays.length ? `<p class="muted">Nothing left this month.</p>` : `<p class="muted">Nothing this month for these filters.</p>`));

  $("calexpected").innerHTML = expected.length ? `<h3>Expected this month <span class="badge est">Not announced</span></h3>
    <p class="muted">Projected from last year, so no exact day yet.</p>
    <div class="exp-list">${expected.map((it) => `<a class="exp" href="#${esc(it.s.key)}"><span class="sw" style="background:var(--g-${it.m.group})"></span>${esc(it.s.title)} ${it.e.year} · ${esc(shortLabel(it.m))}</a>`).join("")}</div>` : "";
}

function bindCalendar() {
  const go = (delta) => {
    if (delta === 0) { const n = new Date(); cal.month = new Date(n.getFullYear(), n.getMonth(), 1); }
    else cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + delta, 1);
    renderCalendar();
  };
  $("calPrev").addEventListener("click", () => go(-1));
  $("calNext").addEventListener("click", () => go(1));
  $("calToday").addEventListener("click", () => go(0));
  const toDay = (ev) => {
    if (ev.target.closest("a")) return;
    const cell = ev.target.closest("[data-day]");
    if (!cell) return;
    document.getElementById(`ag-${cell.dataset.day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    $("calagenda").classList.add("show");
  };
  $("calgrid").addEventListener("click", (ev) => {
    const cell = ev.target.closest("[data-day]");
    // Tapping a past day on a phone unfolds the earlier days first, so there's something to scroll to.
    if (cell && cell.dataset.day < zoneDayKey(new Date()) && !cal.showPast) { cal.showPast = true; renderCalendar(); }
    toDay(ev);
  });
  $("calagenda").addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-agpast]")) return;
    cal.showPast = !cal.showPast;
    renderCalendar();
  });
  $("calgrid").addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("[data-day]")) { ev.preventDefault(); toDay(ev); }
  });
}

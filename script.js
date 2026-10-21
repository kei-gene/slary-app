// ==========================================================
// 時給・給与管理アプリ - script.js
// ==========================================================

// ---------- localStorage keys ----------
const LS_WORKPLACES = "wage_workplaces";
const LS_SHIFTS = "wage_shifts";
const LS_SETTINGS = "wage_settings";

// ---------- state ----------
let state = {
  tab: "home",
  workplaces: [],
  shifts: [],
  monthlyGoal: 80000,
  holidays: [],
  editingShiftId: null,
  activeWorkplaceId: null,
  editingRate: null, // null | "new" | rate object (working copy)
  editingWorkplaceId: null,
  editingTemplateId: null,
  historyView: "list", // "list" | "calendar"
  calendarMonthOffset: 0, // months from the current month, shown in the calendar view
  selectedDayDate: null, // date shown in the day-detail modal
  addFresh: false, // true when the add screen was just opened (fields start blank)
  prefillDate: null, // date to pre-fill when opening the add screen from the calendar
  templates: [], // {id, name, workplaceId, start, end} - managed from Settings, selectable on the add screen
  addMode: "single", // "single" | "multi" (add screen: one shift vs several dates at once)
  multiDates: new Set(), // selected dates for the current multi-date add session
  addScreenStyle: "toggle", // "toggle" (単発/複数日 switch) | "unified" (calendar-first, always) - set from Settings
  holidayWeekdays: new Set([0]), // dow numbers treated as the "holiday" rate group (default: Sunday only)
  autoHolidayYears: [], // years for which Japanese public holidays have already been auto-added to state.holidays
};

// ---------- initial demo data (used only on first run) ----------
function defaultWorkplaces() {
  return [
    {
      id: "w1",
      name: "コンビニA",
      paydayType: "fixed",
      payday: 25,
      closingType: "fixed",
      closingDay: 20,
      rates: [
        { id: "r1", dayType: "weekday", start: "09:00", end: "17:00", wage: 1295 },
        { id: "r2", dayType: "weekday", start: "17:00", end: "22:00", wage: 1305 },
        { id: "r3", dayType: "holiday", start: "09:00", end: "17:00", wage: 1305 },
        { id: "r4", dayType: "holiday", start: "17:00", end: "22:00", wage: 1335 },
      ],
    },
  ];
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultShifts() {
  const today = new Date();
  return [
    { id: "s1", workplaceId: "w1", date: addDays(today, -6), start: "09:00", end: "17:00", breakMin: 60 },
    { id: "s2", workplaceId: "w1", date: addDays(today, -3), start: "17:00", end: "22:00", breakMin: 0 },
    { id: "s3", workplaceId: "w1", date: addDays(today, 2), start: "09:00", end: "17:00", breakMin: 60 },
  ];
}

// ---------- helpers ----------
function toMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fmtMin(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}時間${m > 0 ? m + "分" : ""}`;
}
function yen(n) {
  return `¥${Math.round(n).toLocaleString()}`;
}
function monthKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dowLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日(${dowLabel(dateStr)})`;
}
function getDayType(dateStr, holidays) {
  const d = new Date(dateStr + "T00:00:00");
  if (state.holidayWeekdays.has(d.getDay()) || holidays.includes(dateStr)) return "holiday";
  return "weekday";
}

// dow numbers (0-6) currently in each rate group, and a display label for each
function weekdayGroupDows() { return [0, 1, 2, 3, 4, 5, 6].filter((d) => !state.holidayWeekdays.has(d)); }
function holidayGroupDows() { return [0, 1, 2, 3, 4, 5, 6].filter((d) => state.holidayWeekdays.has(d)); }
function weekdayGroupLabel() { const l = weekdayGroupDows().map((d) => DOW_LABELS[d]).join("・"); return l || "（設定なし）"; }
function holidayGroupLabel() { const l = holidayGroupDows().map((d) => DOW_LABELS[d]).join("・"); return (l ? l + "・" : "") + "祝日"; }

// ---------- Japanese public holidays (auto-applied) ----------
function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function nthMonday(year, month, n) {
  const first = new Date(year, month - 1, 1);
  const offset = (8 - first.getDay()) % 7; // days until the first Monday
  return 1 + offset + (n - 1) * 7;
}
function springEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function autumnEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

// returns [{date:"YYYY-MM-DD", name}] for the given year (valid for the current Reiwa-era rule set, ~2020-2099)
function getJapanHolidays(year) {
  const list = [
    { date: ymd(year, 1, 1), name: "元日" },
    { date: ymd(year, 1, nthMonday(year, 1, 2)), name: "成人の日" },
    { date: ymd(year, 2, 11), name: "建国記念の日" },
    { date: ymd(year, 2, 23), name: "天皇誕生日" },
    { date: ymd(year, 3, springEquinoxDay(year)), name: "春分の日" },
    { date: ymd(year, 4, 29), name: "昭和の日" },
    { date: ymd(year, 5, 3), name: "憲法記念日" },
    { date: ymd(year, 5, 4), name: "みどりの日" },
    { date: ymd(year, 5, 5), name: "こどもの日" },
    { date: ymd(year, 7, nthMonday(year, 7, 3)), name: "海の日" },
    { date: ymd(year, 8, 11), name: "山の日" },
    { date: ymd(year, 9, nthMonday(year, 9, 3)), name: "敬老の日" },
    { date: ymd(year, 9, autumnEquinoxDay(year)), name: "秋分の日" },
    { date: ymd(year, 10, nthMonday(year, 10, 2)), name: "スポーツの日" },
    { date: ymd(year, 11, 3), name: "文化の日" },
    { date: ymd(year, 11, 23), name: "勤労感謝の日" },
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const dateSet = new Set(list.map((h) => h.date));

  // 国民の休日: a day with holidays both immediately before and after it, that isn't itself
  // a holiday or a Sunday, becomes a holiday too (mainly 9/22 between 敬老の日 and 秋分の日).
  for (let i = 0; i < list.length - 1; i++) {
    const cur = new Date(list[i].date + "T00:00:00");
    const next = new Date(list[i + 1].date + "T00:00:00");
    const gapDays = Math.round((next - cur) / 86400000);
    if (gapDays === 2) {
      const between = new Date(cur);
      between.setDate(between.getDate() + 1);
      if (between.getDay() !== 0) {
        const dStr = ymd(between.getFullYear(), between.getMonth() + 1, between.getDate());
        if (!dateSet.has(dStr)) { list.push({ date: dStr, name: "国民の休日" }); dateSet.add(dStr); }
      }
    }
  }

  // 振替休日: any holiday that falls on a Sunday pushes to the next day that isn't already a holiday.
  const substitutes = [];
  list.forEach((h) => {
    const d = new Date(h.date + "T00:00:00");
    if (d.getDay() === 0) {
      const sub = new Date(d);
      do { sub.setDate(sub.getDate() + 1); } while (dateSet.has(ymd(sub.getFullYear(), sub.getMonth() + 1, sub.getDate())));
      const subStr = ymd(sub.getFullYear(), sub.getMonth() + 1, sub.getDate());
      substitutes.push({ date: subStr, name: "振替休日" });
      dateSet.add(subStr);
    }
  });

  return list.concat(substitutes).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// name of the Japanese holiday on this date, if any (for display only; "" if none or a custom entry)
function japanHolidayName(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  const hit = getJapanHolidays(year).find((h) => h.date === dateStr);
  return hit ? hit.name : "";
}

// auto-add Japanese public holidays for nearby years, once per year (won't re-add a date the user deleted)
function ensureJapanHolidays() {
  const thisYear = new Date().getFullYear();
  const targetYears = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  let changed = false;
  targetYears.forEach((year) => {
    if (state.autoHolidayYears.includes(year)) return;
    getJapanHolidays(year).forEach((h) => {
      if (!state.holidays.includes(h.date)) state.holidays.push(h.date);
    });
    state.autoHolidayYears.push(year);
    changed = true;
  });
  if (changed) state.holidays.sort();
  return changed;
}

// slice-based pay calculation across a workplace's rate windows
function computePay(workplace, dateStr, startStr, endStr, breakMin, holidays) {
  if (!workplace || !startStr || !endStr) return null;
  let start = toMin(startStr);
  let end = toMin(endStr);
  if (end <= start) end += 24 * 60; // overnight support
  const totalMinutes = end - start;
  if (totalMinutes <= 0) return null;

  const dayType = getDayType(dateStr, holidays);
  const rates = (workplace.rates || []).filter((r) => r.dayType === dayType);

  let gross = 0;
  let coveredMinutes = 0;
  for (const r of rates) {
    const rs = toMin(r.start);
    let re = toMin(r.end);
    if (re <= rs) re += 24 * 60;
    const overlapStart = Math.max(start, rs);
    const overlapEnd = Math.min(end, re);
    if (overlapEnd > overlapStart) {
      const mins = overlapEnd - overlapStart;
      gross += (mins / 60) * r.wage;
      coveredMinutes += mins;
    }
  }
  const uncovered = totalMinutes - coveredMinutes;
  const paidMinutes = Math.max(totalMinutes - breakMin, 0);
  const pay = totalMinutes > 0 ? gross * (paidMinutes / totalMinutes) : 0;

  return {
    pay,
    workedMinutes: paidMinutes,
    totalMinutes,
    uncoveredMinutes: uncovered > 0 ? uncovered : 0,
  };
}

// detect overlapping rate windows within the same day type
function findOverlaps(rates) {
  const flagged = new Set();
  ["weekday", "holiday"].forEach((dt) => {
    const list = rates
      .filter((r) => r.dayType === dt)
      .map((r) => ({ ...r, s: toMin(r.start), e: toMin(r.end) <= toMin(r.start) ? toMin(r.end) + 1440 : toMin(r.end) }))
      .sort((a, b) => a.s - b.s);
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].e > list[i + 1].s) {
        flagged.add(list[i].id);
        flagged.add(list[i + 1].id);
      }
    }
  });
  return flagged;
}

// ---------- persistence ----------
function save() {
  localStorage.setItem(LS_WORKPLACES, JSON.stringify(state.workplaces));
  localStorage.setItem(LS_SHIFTS, JSON.stringify(state.shifts));
  localStorage.setItem(LS_SETTINGS, JSON.stringify({
    monthlyGoal: state.monthlyGoal,
    holidays: state.holidays,
    templates: state.templates,
    holidayWeekdays: [...state.holidayWeekdays],
    autoHolidayYears: state.autoHolidayYears,
    addScreenStyle: state.addScreenStyle,
  }));
}

function load() {
  try {
    const wp = localStorage.getItem(LS_WORKPLACES);
    const sh = localStorage.getItem(LS_SHIFTS);
    const st = localStorage.getItem(LS_SETTINGS);
    state.workplaces = wp ? JSON.parse(wp) : defaultWorkplaces();
    state.shifts = sh ? JSON.parse(sh) : defaultShifts();
    if (st) {
      const parsed = JSON.parse(st);
      state.monthlyGoal = typeof parsed.monthlyGoal === "number" ? parsed.monthlyGoal : 80000;
      state.holidays = Array.isArray(parsed.holidays) ? parsed.holidays : [];
      if (Array.isArray(parsed.templates)) state.templates = parsed.templates;
      if (Array.isArray(parsed.holidayWeekdays)) state.holidayWeekdays = new Set(parsed.holidayWeekdays);
      if (Array.isArray(parsed.autoHolidayYears)) state.autoHolidayYears = parsed.autoHolidayYears;
      if (parsed.addScreenStyle === "toggle" || parsed.addScreenStyle === "unified") state.addScreenStyle = parsed.addScreenStyle;
    }
  } catch (e) {
    console.error("読み込みエラー", e);
    state.workplaces = defaultWorkplaces();
    state.shifts = defaultShifts();
  }
  ensureJapanHolidays();
}

// ---------- tab navigation ----------
function switchTab(tab, keepEditing) {
  state.tab = tab;
  if (!keepEditing) state.editingShiftId = null;
  if (tab === "add") state.addFresh = !keepEditing;
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${tab}`).classList.add("active");
  document.querySelectorAll(".tab-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  renderCurrentScreen();
}

function renderCurrentScreen() {
  if (state.tab === "home") renderHome();
  if (state.tab === "history") renderHistory();
  if (state.tab === "add") renderAddScreen();
  if (state.tab === "workplaces") renderWorkplaces();
  if (state.tab === "rates") renderRates();
  if (state.tab === "settings") renderSettings();
}

// ---------- HOME ----------
let showBreakdown = false;
let homeMonthOffset = 0; // 0 = this month, 1 = next month

function renderHome() {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() + homeMonthOffset);
  const mKey = monthKey(now);
  const monthShifts = state.shifts.filter((s) => monthKey(new Date(s.date + "T00:00:00")) === mKey);

  let totalPay = 0, totalMinutes = 0;
  monthShifts.forEach((s) => {
    const wp = state.workplaces.find((w) => w.id === s.workplaceId);
    const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
    if (r) { totalPay += r.pay; totalMinutes += r.workedMinutes; }
  });

  const progress = state.monthlyGoal > 0 ? Math.min(totalPay / state.monthlyGoal, 1) : 0;
  const remaining = Math.max(state.monthlyGoal - totalPay, 0);

  const byWorkplace = state.workplaces.map((wp) => {
    let pay = 0;
    monthShifts.filter((s) => s.workplaceId === wp.id).forEach((s) => {
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (r) pay += r.pay;
    });
    return { name: wp.name, pay };
  }).filter((w) => w.pay > 0);

  let breakdownHtml = "";
  if (showBreakdown && byWorkplace.length > 1) {
    breakdownHtml = `<div class="breakdown-card">${byWorkplace.map((w) =>
      `<div class="breakdown-row"><span>${escapeHtml(w.name)}</span><span>${yen(w.pay)}</span></div>`
    ).join("")}</div>`;
  }

  document.getElementById("home-content").innerHTML = `
    <div class="home-month-row">
      <div class="home-month">${now.getFullYear()}年${now.getMonth() + 1}月</div>
      <div class="segment month-segment" id="home-month-segment">
        <button class="segment-btn ${homeMonthOffset === 0 ? "active" : ""}" data-offset="0">今月</button>
        <button class="segment-btn ${homeMonthOffset === 1 ? "active" : ""}" data-offset="1">来月</button>
      </div>
    </div>
    <div class="home-block-first" id="home-amount-block" style="cursor:${byWorkplace.length > 1 ? "pointer" : "default"}">
      <div class="home-amount-label">${homeMonthOffset === 0 ? "今月" : "来月"}の予想給与</div>
      <div class="home-amount">${yen(totalPay)}</div>
      ${byWorkplace.length > 1 ? `<div class="home-breakdown-toggle">内訳を${showBreakdown ? "閉じる" : "見る"}</div>` : ""}
    </div>
    ${breakdownHtml}
    <div class="home-block">
      <div class="goal-card">
        <div class="goal-top"><span>目標 ${yen(state.monthlyGoal)} まで</span><span style="font-weight:600;color:#1C1C1E">${yen(remaining)}</span></div>
        <div class="goal-bar"><div class="goal-bar-fill" style="width:${progress * 100}%"></div></div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">勤務予定時間</div><div class="stat-value">${(totalMinutes / 60).toFixed(1)}h</div></div>
      <div class="stat-card"><div class="stat-label">勤務予定日数</div><div class="stat-value">${monthShifts.length}日</div></div>
    </div>
    ${payoutSectionHtml()}
    <div class="bottom-pad" style="padding-top:0">
      <button class="btn-primary btn-danger" id="home-add-btn">＋ シフトを追加</button>
    </div>
  `;

  document.getElementById("home-add-btn").onclick = () => { state.editingShiftId = null; switchTab("add"); };
  const amountBlock = document.getElementById("home-amount-block");
  if (byWorkplace.length > 1) amountBlock.onclick = () => { showBreakdown = !showBreakdown; renderHome(); };
  document.querySelectorAll("#home-month-segment .segment-btn").forEach((btn) => {
    btn.onclick = () => {
      homeMonthOffset = Number(btn.dataset.offset);
      state.calendarMonthOffset = homeMonthOffset;
      renderHome();
    };
  });

  renderAllCalendars();
}

// ---------- HISTORY ----------
function renderHistory() {
  document.getElementById("history-list").classList.toggle("hidden", state.historyView !== "list");
  document.getElementById("history-calendar").classList.toggle("hidden", state.historyView !== "calendar");
  document.querySelectorAll("#history-view-segment .segment-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.historyView);
  });
  if (state.historyView === "list") renderHistoryList();
  else renderHistoryCalendar();
}

function renderHistoryList() {
  const sorted = [...state.shifts].sort((a, b) => (a.date < b.date ? 1 : -1));
  const container = document.getElementById("history-list");
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-note">まだシフトが登録されていません</div>`;
    return;
  }
  container.innerHTML = sorted.map((s) => {
    const wp = state.workplaces.find((w) => w.id === s.workplaceId);
    const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
    return `
      <div class="history-card">
        <div class="history-top">
          <div>
            <div class="history-date">${fmtDate(s.date)}</div>
            <div class="history-sub">${escapeHtml(wp ? wp.name : "―")} ・ ${s.start}〜${s.end}</div>
          </div>
          <div class="history-pay">${r ? yen(r.pay) : "―"}</div>
        </div>
        <div class="history-actions">
          <button class="btn-edit" data-edit="${s.id}">編集</button>
          <button class="btn-delete" data-delete="${s.id}">削除</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => { state.editingShiftId = btn.dataset.edit; switchTab("add", true); };
  });
  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.onclick = () => {
      showConfirm("このシフトを削除しますか？", () => {
        state.shifts = state.shifts.filter((s) => s.id !== btn.dataset.delete);
        save();
        renderHistoryList();
      });
    };
  });
}

// Renders the month-grid calendar into any container. Home and History both use this,
// sharing state.calendarMonthOffset, so navigating the month in either one keeps both in sync.
function renderCalendarInto(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + state.calendarMonthOffset);
  const year = base.getFullYear();
  const month = base.getMonth(); // 0-11
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = todayStr();

  // group shifts by date for this month
  const byDate = {};
  state.shifts.forEach((s) => {
    const d = new Date(s.date + "T00:00:00");
    if (d.getFullYear() === year && d.getMonth() === month) {
      (byDate[s.date] = byDate[s.date] || []).push(s);
    }
  });

  const dowLabels = ["日", "月", "火", "水", "木", "金", "土"];
  let cellsHtml = "";
  for (let i = 0; i < firstDow; i++) cellsHtml += `<div class="calendar-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayShifts = byDate[dateStr] || [];
    let totalPay = 0, totalMinutes = 0;
    dayShifts.forEach((s) => {
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (r) { totalPay += r.pay; totalMinutes += r.workedMinutes; }
    });
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const classes = ["calendar-cell"];
    if (dow === 6) classes.push("sat");
    if (dow === 0 || state.holidays.includes(dateStr)) classes.push("sun-holiday");
    if (dateStr === todayIso) classes.push("today");
    cellsHtml += `
      <div class="${classes.join(" ")}" data-date="${dateStr}">
        <div class="cal-day-num">${day}</div>
        <div class="cal-day-pay">${dayShifts.length > 0 ? yen(totalPay) : ""}</div>
        <div class="cal-day-hours">${dayShifts.length > 0 ? (totalMinutes / 60).toFixed(1) + "h" : ""}</div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="calendar-header">
      <button class="calendar-nav-btn" data-nav="prev">‹</button>
      <span class="calendar-month-label">${year}年${month + 1}月</span>
      <button class="calendar-nav-btn" data-nav="next">›</button>
    </div>
    <div class="calendar-grid">
      ${dowLabels.map((l) => `<div class="calendar-dow">${l}</div>`).join("")}
      ${cellsHtml}
    </div>
  `;

  container.querySelector('[data-nav="prev"]').onclick = () => { state.calendarMonthOffset--; renderAllCalendars(); };
  container.querySelector('[data-nav="next"]').onclick = () => { state.calendarMonthOffset++; renderAllCalendars(); };
  container.querySelectorAll("[data-date]").forEach((cell) => {
    cell.onclick = () => openDayModal(cell.dataset.date);
  });
}

function renderHistoryCalendar() { renderCalendarInto("history-calendar"); }
// "今月いくら" (calendar-month totals) is separate from this: this shows what each workplace will
// actually pay out on its next real payday, based on that workplace's closing/payday settings.
function payoutSectionHtml() {
  if (state.workplaces.length === 0) return "";
  const today = new Date();

  const cards = state.workplaces.map((wp) => {
    const payout = getNextPayout(wp, today);
    if (!payout) return "";
    let amount = 0;
    state.shifts.filter((s) => s.workplaceId === wp.id).forEach((s) => {
      const d = new Date(s.date + "T00:00:00");
      if (d >= payout.periodStart && d <= payout.periodEnd) {
        const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
        if (r) amount += r.pay;
      }
    });
    return `
      <div class="payout-card">
        <div class="payout-top">
          <span class="payout-workplace">${escapeHtml(wp.name)}</span>
          <span class="payout-date">${fmtDateObj(payout.payday)}</span>
        </div>
        <div class="payout-period">対象期間: ${fmtDateObj(payout.periodStart)}〜${fmtDateObj(payout.periodEnd)}</div>
        <div class="payout-amount">${yen(amount)}</div>
      </div>
    `;
  }).join("");

  if (!cards) return "";
  return `<div class="section-label" style="padding-top:0">次の給料日</div><div class="payout-list">${cards}</div>`;
}

function renderHomeCalendar() { renderCalendarInto("home-calendar"); }
function renderAllCalendars() { renderHistoryCalendar(); renderHomeCalendar(); }

// ---------- day detail modal (calendar) ----------
function openDayModal(dateStr) {
  state.selectedDayDate = dateStr;
  document.getElementById("day-modal-title").textContent = fmtDate(dateStr);
  renderDayModalList();
  document.getElementById("day-modal").classList.remove("hidden");
  document.getElementById("day-modal-add").onclick = () => {
    closeDayModal();
    state.editingShiftId = null;
    state.prefillDate = dateStr;
    switchTab("add");
  };
}

function renderDayModalList() {
  const dateStr = state.selectedDayDate;
  const dayShifts = state.shifts.filter((s) => s.date === dateStr);
  const container = document.getElementById("day-modal-list");

  if (dayShifts.length === 0) {
    container.innerHTML = `<div class="day-empty-note">この日のシフトはまだありません</div>`;
    return;
  }

  container.innerHTML = dayShifts.map((s) => {
    const wp = state.workplaces.find((w) => w.id === s.workplaceId);
    const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
    return `
      <div class="day-shift-item">
        <div class="day-shift-info">
          <div style="font-weight:600">${escapeHtml(wp ? wp.name : "―")}</div>
          <div style="color:#8E8E93">${s.start}〜${s.end} ・ ${r ? yen(r.pay) : "―"}</div>
        </div>
        <div class="day-shift-actions">
          <span class="icon-btn" data-day-edit="${s.id}">${ICON_EDIT}</span>
          <span class="icon-btn icon-btn-danger" data-day-delete="${s.id}">${ICON_TRASH}</span>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-day-edit]").forEach((el) => {
    el.onclick = () => {
      closeDayModal();
      state.editingShiftId = el.dataset.dayEdit;
      switchTab("add", true);
    };
  });
  container.querySelectorAll("[data-day-delete]").forEach((el) => {
    el.onclick = () => {
      showConfirm("このシフトを削除しますか？", () => {
        state.shifts = state.shifts.filter((s) => s.id !== el.dataset.dayDelete);
        save();
        renderDayModalList();
        renderAllCalendars();
      });
    };
  });
}

function closeDayModal() {
  state.selectedDayDate = null;
  document.getElementById("day-modal").classList.add("hidden");
}

// true when the add screen should show the multi-date calendar picker: either the user
// switched to "複数日" mode, or the unified add-screen style is active (always calendar-first).
// Never true while editing an existing shift - editing is always a single-shift form.
function isAddMultiMode() {
  return !state.editingShiftId && (state.addMode === "multi" || state.addScreenStyle === "unified");
}

// ---------- ADD / EDIT SHIFT ----------
function renderAddScreen() {
  const editing = state.editingShiftId ? state.shifts.find((s) => s.id === state.editingShiftId) : null;
  document.getElementById("add-title").textContent = editing ? "シフトを編集" : "シフト追加";

  // editing an existing shift is always single-mode; multi-date mode only applies to brand-new shifts
  if (editing) state.addMode = "single";
  const fresh = state.addFresh && !editing;
  if (fresh) { state.multiDates = new Set(); multiCalendarOffset = 0; }

  const showModeSegment = !editing && state.addScreenStyle === "toggle";
  document.getElementById("add-mode-segment").classList.toggle("hidden", !showModeSegment);
  document.querySelectorAll("#add-mode-segment .segment-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === state.addMode);
  });
  document.getElementById("mode-single").onclick = () => { state.addMode = "single"; renderAddScreen(); };
  document.getElementById("mode-multi").onclick = () => { state.addMode = "multi"; renderAddScreen(); };

  const isMulti = isAddMultiMode();
  document.getElementById("multi-date-fields").classList.toggle("hidden", !isMulti);
  document.getElementById("single-date-row").classList.toggle("hidden", isMulti);
  if (isMulti) renderMultiDatePicker();

  const startEl = document.getElementById("add-start");
  const endEl = document.getElementById("add-end");
  const breakEl = document.getElementById("add-break");
  const templateSelect = document.getElementById("add-template");

  const wpSelect = document.getElementById("add-workplace");
  const prevWp = fresh ? "" : wpSelect.value;
  wpSelect.innerHTML = `<option value="">選択してください</option>` +
    state.workplaces.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  wpSelect.value = editing ? editing.workplaceId : (state.workplaces.some((w) => w.id === prevWp) ? prevWp : "");

  templateSelect.innerHTML = `<option value="">テンプレートを選択</option>` +
    state.templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  templateSelect.classList.toggle("hidden", editing ? true : state.templates.length === 0);
  document.getElementById("template-row-label").classList.toggle("hidden", editing ? true : state.templates.length === 0);

  const dateField = document.getElementById("add-date");
  if (editing) dateField.value = editing.date;
  else if (state.prefillDate) { dateField.value = state.prefillDate; state.prefillDate = null; }
  else if (fresh || !dateField.value) dateField.value = todayStr();

  if (editing) {
    startEl.value = editing.start;
    endEl.value = editing.end;
    breakEl.value = editing.breakMin;
  } else if (fresh) {
    startEl.value = "";
    endEl.value = "";
    breakEl.value = "";
    templateSelect.value = "";
  }
  state.addFresh = false;

  templateSelect.onchange = () => {
    const t = state.templates.find((x) => x.id === templateSelect.value);
    if (!t) return;
    if (state.workplaces.some((w) => w.id === t.workplaceId)) wpSelect.value = t.workplaceId;
    startEl.value = t.start;
    endEl.value = t.end;
    updateAddResult();
  };

  [wpSelect, startEl, endEl, breakEl].forEach((el) => { el.oninput = updateAddResult; });
  dateField.oninput = updateAddResult;

  updateAddResult();

  document.getElementById("add-cancel").onclick = () => { state.editingShiftId = null; switchTab("home"); };

  document.getElementById("add-save").onclick = () => {
    if (isMulti) { saveMultiShifts(); return; }
    const shift = {
      id: editing ? editing.id : `s${Date.now()}`,
      workplaceId: wpSelect.value,
      date: dateField.value,
      start: document.getElementById("add-start").value,
      end: document.getElementById("add-end").value,
      breakMin: Number(document.getElementById("add-break").value) || 0,
    };
    if (editing) {
      state.shifts = state.shifts.map((s) => (s.id === shift.id ? shift : s));
    } else {
      state.shifts.push(shift);
    }
    save();
    state.editingShiftId = null;
    switchTab("home");
  };
}

function updateAddResult() {
  const wp = state.workplaces.find((w) => w.id === document.getElementById("add-workplace").value);
  const start = document.getElementById("add-start").value;
  const end = document.getElementById("add-end").value;
  const breakMin = Number(document.getElementById("add-break").value) || 0;
  const box = document.getElementById("add-result");
  const saveBtn = document.getElementById("add-save");

  if (isAddMultiMode()) {
    const dates = [...state.multiDates].sort();
    if (!wp || !start || !end) {
      box.className = "result-card";
      box.innerHTML = `勤務先と出勤・退勤時間を入力してください`;
      saveBtn.disabled = true;
      return;
    }
    if (dates.length === 0) {
      box.className = "result-card";
      box.innerHTML = `カレンダーから日付を選んでください`;
      saveBtn.disabled = true;
      return;
    }
    if (dates.length === 1) {
      // exactly one date selected: show it the same way the single-shift form would
      const result = computePay(wp, dates[0], start, end, breakMin, state.holidays);
      if (result) {
        box.className = "result-card has-value";
        box.innerHTML = `
          <div class="result-row"><span>実働時間</span><span style="font-weight:600">${fmtMin(result.workedMinutes)}</span></div>
          <div class="result-pay"><span>${fmtDate(dates[0])}の給与</span><span class="amount">${yen(result.pay)}</span></div>
          ${result.uncoveredMinutes > 0 ? `<div class="result-warn">⚠ ${fmtMin(result.uncoveredMinutes)}分は時給ルールが未設定です</div>` : ""}
        `;
        saveBtn.disabled = false;
      } else {
        box.className = "result-card";
        box.innerHTML = `出勤・退勤時間を入力してください`;
        saveBtn.disabled = true;
      }
      return;
    }
    let totalPay = 0;
    dates.forEach((d) => {
      const r = computePay(wp, d, start, end, breakMin, state.holidays);
      if (r) totalPay += r.pay;
    });
    box.className = "result-card has-value";
    box.innerHTML = `
      <div class="result-row"><span>選択した日数</span><span style="font-weight:600">${dates.length}日</span></div>
      <div class="result-pay"><span>合計の給与目安</span><span class="amount">${yen(totalPay)}</span></div>
    `;
    saveBtn.disabled = false;
    return;
  }

  const date = document.getElementById("add-date").value;
  const result = computePay(wp, date, start, end, breakMin, state.holidays);
  if (result) {
    box.className = "result-card has-value";
    box.innerHTML = `
      <div class="result-row"><span>実働時間</span><span style="font-weight:600">${fmtMin(result.workedMinutes)}</span></div>
      <div class="result-pay"><span>${fmtDate(date)}の給与</span><span class="amount">${yen(result.pay)}</span></div>
      ${result.uncoveredMinutes > 0 ? `<div class="result-warn">⚠ ${fmtMin(result.uncoveredMinutes)}分は時給ルールが未設定です</div>` : ""}
    `;
    saveBtn.disabled = false;
  } else {
    box.className = "result-card";
    box.innerHTML = `勤務先と出勤・退勤時間を入力してください`;
    saveBtn.disabled = true;
  }
}

// ---------- multi-date picker (add screen) ----------
let multiCalendarOffset = 0;

function renderMultiDatePicker() {
  const container = document.getElementById("multi-calendar");
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + multiCalendarOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = todayStr();
  const dowLabels = ["日", "月", "火", "水", "木", "金", "土"];

  let cellsHtml = "";
  for (let i = 0; i < firstDow; i++) cellsHtml += `<div class="calendar-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const classes = ["calendar-cell"];
    if (dow === 6) classes.push("sat");
    if (dow === 0 || state.holidays.includes(dateStr)) classes.push("sun-holiday");
    if (dateStr === todayIso) classes.push("today");
    if (state.multiDates.has(dateStr)) classes.push("selected");
    cellsHtml += `
      <div class="${classes.join(" ")}" data-date="${dateStr}">
        <div class="cal-day-num">${day}</div>
        <div class="cal-day-pay"></div>
        <div class="cal-day-hours"></div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="calendar-header">
      <button class="calendar-nav-btn" data-nav="prev">‹</button>
      <span class="calendar-month-label">${year}年${month + 1}月</span>
      <button class="calendar-nav-btn" data-nav="next">›</button>
    </div>
    <div class="calendar-grid">
      ${dowLabels.map((l) => `<div class="calendar-dow">${l}</div>`).join("")}
      ${cellsHtml}
    </div>
  `;

  container.querySelector('[data-nav="prev"]').onclick = () => { multiCalendarOffset--; renderMultiDatePicker(); };
  container.querySelector('[data-nav="next"]').onclick = () => { multiCalendarOffset++; renderMultiDatePicker(); };
  container.querySelectorAll("[data-date]").forEach((cell) => {
    cell.onclick = () => {
      const d = cell.dataset.date;
      if (state.multiDates.has(d)) state.multiDates.delete(d);
      else state.multiDates.add(d);
      renderMultiDatePicker();
      updateAddResult();
    };
  });
}

function saveMultiShifts() {
  const workplaceId = document.getElementById("add-workplace").value;
  const start = document.getElementById("add-start").value;
  const end = document.getElementById("add-end").value;
  const breakMin = Number(document.getElementById("add-break").value) || 0;
  const dates = [...state.multiDates];
  if (!workplaceId || !start || !end || dates.length === 0) return;

  const existingSet = new Set(state.shifts.filter((s) => s.workplaceId === workplaceId).map((s) => s.date));
  const toAdd = dates.filter((d) => !existingSet.has(d));

  if (toAdd.length === 0) {
    showNotice("選択した日付はすべて既に登録されています");
    return;
  }

  toAdd.forEach((d, i) => {
    state.shifts.push({ id: `s${Date.now()}_${i}`, workplaceId, date: d, start, end, breakMin });
  });
  save();
  state.multiDates = new Set();
  switchTab("home");
}

// ---------- WORKPLACES ----------
function renderWorkplaces() {
  const container = document.getElementById("workplace-list");
  container.innerHTML = state.workplaces.map((w) => `
    <div class="workplace-card" data-open="${w.id}">
      <div>
        <div class="workplace-name">${escapeHtml(w.name)}</div>
        <div class="workplace-meta">給料日: ${formatDateRule(w.paydayType || "fixed", w.payday)} ・ 締め日: ${formatDateRule(w.closingType || "fixed", w.closingDay)}</div>
        <div class="workplace-meta">時給ルール ${w.rates.length}件</div>
      </div>
      <div class="workplace-card-right">
        <span class="icon-btn" data-edit-workplace="${w.id}">${ICON_EDIT}</span>
        <span class="chevron">›</span>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit-workplace]").forEach((el) => {
    el.onclick = (e) => {
      e.stopPropagation();
      openWorkplaceModal(state.workplaces.find((w) => w.id === el.dataset.editWorkplace));
    };
  });

  container.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = () => { state.activeWorkplaceId = el.dataset.open; switchTab("rates"); };
  });

  document.getElementById("workplace-add-btn").onclick = () => {
    const id = `w${Date.now()}`;
    const newWorkplace = { id, name: "新しい勤務先", paydayType: "fixed", payday: 25, closingType: "fixed", closingDay: 20, rates: [] };
    state.workplaces.push(newWorkplace);
    save();
    state.activeWorkplaceId = id;
    switchTab("rates");
    openWorkplaceModal(newWorkplace);
  };
}

// ---------- RATE RULES ----------
function renderRates() {
  const wp = state.workplaces.find((w) => w.id === state.activeWorkplaceId);
  if (!wp) { switchTab("workplaces"); return; }

  document.getElementById("rates-title").textContent = `${wp.name} の時給ルール`;
  document.getElementById("rates-back").onclick = () => switchTab("workplaces");
  document.getElementById("rates-edit-workplace").onclick = () => openWorkplaceModal(wp);

  const overlapping = findOverlaps(wp.rates);
  const groups = [{ key: "weekday", label: weekdayGroupLabel() }, { key: "holiday", label: holidayGroupLabel() }];

  const groupsHtml = groups.map((g) => {
    const rows = wp.rates.filter((r) => r.dayType === g.key);
    const rowsHtml = rows.length === 0
      ? `<div class="rate-empty">ルールが未設定です</div>`
      : rows.map((r) => `
          <div class="rate-group-row ${overlapping.has(r.id) ? "overlap" : ""}" data-edit-rate="${r.id}">
            <div>
              <div class="rate-time">${r.start}〜${r.end}</div>
              ${overlapping.has(r.id) ? `<div class="rate-warn">⚠ 時間帯が重複しています</div>` : ""}
            </div>
            <div class="rate-right">
              <span class="rate-wage">${yen(r.wage)}</span>
              <span class="icon-btn icon-btn-danger" data-delete-rate="${r.id}">${ICON_TRASH}</span>
            </div>
          </div>
        `).join("");
    return `<div class="section-label">${g.label}</div><div class="list-pad"><div class="card">${rowsHtml}</div></div>`;
  }).join("");

  document.getElementById("rates-content").innerHTML = `
    ${groupsHtml}
    <button class="rate-add-btn" id="rate-add-btn">＋ ルールを追加</button>
  `;

  document.querySelectorAll("[data-edit-rate]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("[data-delete-rate]")) return;
      openRateModal(wp.rates.find((r) => r.id === el.dataset.editRate));
    };
  });
  document.querySelectorAll("[data-delete-rate]").forEach((el) => {
    el.onclick = () => {
      wp.rates = wp.rates.filter((r) => r.id !== el.dataset.deleteRate);
      save();
      renderRates();
    };
  });
  document.getElementById("rate-add-btn").onclick = () => {
    openRateModal({ id: `r${Date.now()}`, dayType: "weekday", start: "09:00", end: "17:00", wage: 1200 });
  };
}

function openRateModal(rate) {
  state.editingRate = { ...rate };
  document.getElementById("rate-modal").classList.remove("hidden");
  document.getElementById("modal-start").value = rate.start;
  document.getElementById("modal-end").value = rate.end;
  document.getElementById("modal-wage").value = rate.wage;
  setDayTypeButton(rate.dayType);
}

function setDayTypeButton(dayType) {
  state.editingRate.dayType = dayType;
  document.getElementById("daytype-weekday").textContent = weekdayGroupLabel();
  document.getElementById("daytype-holiday").textContent = holidayGroupLabel();
  document.getElementById("daytype-weekday").classList.toggle("active", dayType === "weekday");
  document.getElementById("daytype-holiday").classList.toggle("active", dayType === "holiday");
}

function closeRateModal() {
  state.editingRate = null;
  document.getElementById("rate-modal").classList.add("hidden");
}

// ---------- WORKPLACE EDIT MODAL ----------
function setDateRuleType(segmentId, inputId, type) {
  document.querySelectorAll(`#${segmentId} .segment-btn`).forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });
  document.getElementById(inputId).classList.toggle("hidden", type !== "fixed");
}

function wireDateRuleSegment(segmentId, inputId) {
  document.querySelectorAll(`#${segmentId} .segment-btn`).forEach((btn) => {
    btn.onclick = () => setDateRuleType(segmentId, inputId, btn.dataset.type);
  });
}

function openWorkplaceModal(workplace) {
  state.editingWorkplaceId = workplace.id;
  document.getElementById("wp-modal-name").value = workplace.name;

  document.getElementById("wp-modal-closing").value = workplace.closingDay;
  setDateRuleType("wp-modal-closing-type", "wp-modal-closing", workplace.closingType || "fixed");

  document.getElementById("wp-modal-payday").value = workplace.payday;
  setDateRuleType("wp-modal-payday-type", "wp-modal-payday", workplace.paydayType || "fixed");

  document.getElementById("workplace-modal").classList.remove("hidden");
}

function closeWorkplaceModal() {
  state.editingWorkplaceId = null;
  document.getElementById("workplace-modal").classList.add("hidden");
}

// day-config helpers: resolve "fixed"/"endOfMonth"/"lastWeekday" into an actual date for a given month,
// and format one for display. month is 0-indexed (JS Date convention).
function resolveDateRule(type, day, year, month) {
  const lastDate = new Date(year, month + 1, 0); // last calendar day of the month
  if (type === "endOfMonth") return lastDate;
  if (type === "lastWeekday") {
    const d = new Date(lastDate);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }
  return new Date(year, month, Math.min(Number(day) || 1, lastDate.getDate()));
}
function formatDateRule(type, day) {
  if (type === "endOfMonth") return "月末";
  if (type === "lastWeekday") return "月末最後の平日";
  return `${day}日`;
}
function fmtDateObj(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日(${DOW_LABELS[d.getDay()]})`;
}
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// For a workplace, finds the next upcoming payday and the shift period (closing-to-closing) it covers.
function getNextPayout(workplace, today) {
  const closingFor = (y, m) => resolveDateRule(workplace.closingType || "fixed", workplace.closingDay, y, m);
  const paydayFor = (y, m) => resolveDateRule(workplace.paydayType || "fixed", workplace.payday, y, m);
  const todayStripped = stripTime(today);

  const candidates = [];
  for (let offset = -1; offset <= 2; offset++) {
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const y = base.getFullYear(), m = base.getMonth();
    const close = closingFor(y, m);
    const sameMonthPayday = paydayFor(y, m);
    let payday;
    if (sameMonthPayday > close) {
      payday = sameMonthPayday;
    } else {
      const next = new Date(y, m + 1, 1);
      payday = paydayFor(next.getFullYear(), next.getMonth());
    }
    const prev = new Date(y, m - 1, 1);
    const periodStart = new Date(closingFor(prev.getFullYear(), prev.getMonth()));
    periodStart.setDate(periodStart.getDate() + 1);
    candidates.push({ payday: stripTime(payday), periodStart: stripTime(periodStart), periodEnd: stripTime(close) });
  }
  const upcoming = candidates.filter((c) => c.payday >= todayStripped).sort((a, b) => a.payday - b.payday);
  return upcoming[0] || null;
}

// ---------- SETTINGS ----------
function renderSettings() {
  document.getElementById("settings-goal").value = state.monthlyGoal;
  document.getElementById("settings-goal").oninput = (e) => {
    state.monthlyGoal = Number(e.target.value) || 0;
    save();
  };
  renderHolidayList();
  document.getElementById("holiday-add-btn").onclick = () => {
    const val = document.getElementById("holiday-input").value;
    if (val && !state.holidays.includes(val)) {
      state.holidays.push(val);
      state.holidays.sort();
      document.getElementById("holiday-input").value = "";
      save();
      renderHolidayList();
    }
  };
  renderDowGroupPicker();
  renderTemplateList();
  renderAddStyleSetting();
}

function renderAddStyleSetting() {
  const container = document.getElementById("add-style-list");
  const options = [
    { key: "toggle", label: "①単発/複数日選択", desc: "「単発」「複数日まとめて」をボタンで切り替えて使う" },
    { key: "unified", label: "②シフト追加（統一バージョン）", desc: "カレンダーで日付を選ぶだけ。1日でも複数日でも同じ画面で登録できる" },
  ];
  container.innerHTML = options.map((o) => `
    <div class="addstyle-row" data-style="${o.key}">
      <div>
        <div class="addstyle-label">${o.label}</div>
        <div class="addstyle-desc">${o.desc}</div>
      </div>
      ${state.addScreenStyle === o.key ? ICON_CHECK : ""}
    </div>
  `).join("");
  container.querySelectorAll("[data-style]").forEach((el) => {
    el.onclick = () => {
      state.addScreenStyle = el.dataset.style;
      save();
      renderAddStyleSetting();
    };
  });
}

function renderDowGroupPicker() {
  const picker = document.getElementById("dow-group-picker");
  picker.innerHTML = [0, 1, 2, 3, 4, 5, 6].map((dow) => `
    <button class="weekday-btn ${state.holidayWeekdays.has(dow) ? "active" : ""}" data-dow-group="${dow}">${DOW_LABELS[dow]}</button>
  `).join("");
  picker.querySelectorAll("[data-dow-group]").forEach((btn) => {
    btn.onclick = () => {
      const dow = Number(btn.dataset.dowGroup);
      if (state.holidayWeekdays.has(dow)) state.holidayWeekdays.delete(dow);
      else state.holidayWeekdays.add(dow);
      save();
      renderDowGroupPicker();
      renderTemplateList(); // summaries reference the group, so refresh alongside it
    };
  });
  document.getElementById("dow-group-summary").textContent =
    `平日: ${weekdayGroupLabel()} ／ 休日: ${holidayGroupLabel()}`;
}

let expandedHolidayYears = new Set();

function holidayRowHtml(dateStr, name) {
  return `
    <div class="holiday-row">
      <span>${dateStr}${name ? `<span class="holiday-name">${name}</span>` : ""}</span>
      <span class="icon-btn icon-btn-danger" data-del-holiday="${dateStr}">${ICON_TRASH}</span>
    </div>
  `;
}

function renderHolidayList() {
  const container = document.getElementById("holiday-list");
  if (state.holidays.length === 0) {
    container.innerHTML = `<div class="rate-empty">祝日が登録されていません</div>`;
    return;
  }

  const byYear = {}; // auto-recognized Japanese holidays, grouped by year
  const custom = []; // dates the user added that aren't a recognized Japanese holiday
  [...state.holidays].sort().forEach((h) => {
    const name = japanHolidayName(h);
    if (name) (byYear[h.slice(0, 4)] = byYear[h.slice(0, 4)] || []).push({ date: h, name });
    else custom.push(h);
  });

  const years = Object.keys(byYear).sort();
  const yearGroupsHtml = years.map((year) => {
    const open = expandedHolidayYears.has(year);
    return `
      <div class="holiday-year-header" data-year-toggle="${year}">
        <span>${year}年の祝日（${byYear[year].length}件）</span>
        <span class="chevron-icon ${open ? "open" : ""}">${ICON_CHEVRON_DOWN}</span>
      </div>
      <div class="holiday-year-body ${open ? "" : "hidden"}">
        ${byYear[year].map((h) => holidayRowHtml(h.date, h.name)).join("")}
      </div>
    `;
  }).join("");

  const customHtml = custom.length > 0
    ? `<div class="holiday-year-header no-toggle"><span>追加した祝日（${custom.length}件）</span></div>` +
      custom.map((d) => holidayRowHtml(d, "")).join("")
    : "";

  container.innerHTML = yearGroupsHtml + customHtml;

  container.querySelectorAll("[data-year-toggle]").forEach((el) => {
    el.onclick = () => {
      const year = el.dataset.yearToggle;
      if (expandedHolidayYears.has(year)) expandedHolidayYears.delete(year);
      else expandedHolidayYears.add(year);
      renderHolidayList();
    };
  });
  container.querySelectorAll("[data-del-holiday]").forEach((el) => {
    el.onclick = () => {
      state.holidays = state.holidays.filter((h) => h !== el.dataset.delHoliday);
      save();
      renderHolidayList();
    };
  });
}

// ---------- TEMPLATES (勤務先 + 開始/終了 time, managed from Settings) ----------
const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function renderTemplateList() {
  const container = document.getElementById("template-list");
  if (state.templates.length === 0) {
    container.innerHTML = `<div class="rate-empty">テンプレートが登録されていません</div>`;
  } else {
    container.innerHTML = state.templates.map((t) => {
      const wp = state.workplaces.find((w) => w.id === t.workplaceId);
      return `
        <div class="day-shift-item">
          <div class="day-shift-info">
            <div style="font-weight:600">${escapeHtml(t.name)}</div>
            <div style="color:#8E8E93">${wp ? escapeHtml(wp.name) : "―"} ・ ${t.start}〜${t.end}</div>
          </div>
          <div class="day-shift-actions">
            <span class="icon-btn" data-tmpl-edit="${t.id}">${ICON_EDIT}</span>
            <span class="icon-btn icon-btn-danger" data-tmpl-delete="${t.id}">${ICON_TRASH}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  container.querySelectorAll("[data-tmpl-edit]").forEach((el) => {
    el.onclick = () => openTemplateModal(state.templates.find((t) => t.id === el.dataset.tmplEdit));
  });
  container.querySelectorAll("[data-tmpl-delete]").forEach((el) => {
    el.onclick = () => {
      showConfirm("このテンプレートを削除しますか？", () => {
        state.templates = state.templates.filter((t) => t.id !== el.dataset.tmplDelete);
        save();
        renderTemplateList();
      });
    };
  });
}

function openTemplateModal(template) {
  state.editingTemplateId = template ? template.id : null;
  document.getElementById("template-modal-title").textContent = template ? "テンプレートを編集" : "テンプレートを追加";
  document.getElementById("tmpl-modal-name").value = template ? template.name : "";
  const wpSelect = document.getElementById("tmpl-modal-workplace");
  wpSelect.innerHTML = state.workplaces.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  wpSelect.value = template ? template.workplaceId : (state.workplaces[0] ? state.workplaces[0].id : "");
  document.getElementById("tmpl-modal-start").value = template ? template.start : "09:00";
  document.getElementById("tmpl-modal-end").value = template ? template.end : "17:00";
  document.getElementById("template-modal").classList.remove("hidden");
}

function closeTemplateModal() {
  state.editingTemplateId = null;
  document.getElementById("template-modal").classList.add("hidden");
}

// ---------- utils ----------
const ICON_EDIT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3"/><path d="M13.5 6.5l4 4"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.5h5V7"/><path d="M6.5 7l.8 12.2a1 1 0 0 0 1 .8h7.4a1 1 0 0 0 1-.8L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>';
const ICON_CHEVRON_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#007AFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// custom confirm/notice modal - replaces native confirm()/alert(), which are unreliable
// in some mobile browser contexts (installed PWAs, in-app browsers, etc.)
function showConfirm(message, onConfirm, options = {}) {
  document.getElementById("confirm-modal-title").textContent = options.title || (onConfirm ? "確認" : "お知らせ");
  document.getElementById("confirm-modal-message").textContent = message;
  const okBtn = document.getElementById("confirm-modal-ok");
  const cancelBtn = document.getElementById("confirm-modal-cancel");
  const row = cancelBtn.parentElement;
  const okOnly = !onConfirm;
  row.classList.toggle("ok-only", okOnly);
  okBtn.textContent = options.okLabel || (okOnly ? "OK" : "削除する");
  const modal = document.getElementById("confirm-modal");
  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");
  okBtn.onclick = () => { close(); if (onConfirm) onConfirm(); };
  cancelBtn.onclick = close;
}
function showNotice(message) {
  showConfirm(message, null);
}

// ---------- init ----------
function init() {
  load();

  document.querySelectorAll(".tab-item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("daytype-weekday").onclick = () => setDayTypeButton("weekday");
  document.getElementById("daytype-holiday").onclick = () => setDayTypeButton("holiday");
  document.getElementById("modal-close").onclick = closeRateModal;
  document.getElementById("modal-save").onclick = () => {
    const wp = state.workplaces.find((w) => w.id === state.activeWorkplaceId);
    const updated = {
      id: state.editingRate.id,
      dayType: state.editingRate.dayType,
      start: document.getElementById("modal-start").value,
      end: document.getElementById("modal-end").value,
      wage: Number(document.getElementById("modal-wage").value) || 0,
    };
    const exists = wp.rates.find((r) => r.id === updated.id);
    wp.rates = exists ? wp.rates.map((r) => (r.id === updated.id ? updated : r)) : [...wp.rates, updated];
    save();
    closeRateModal();
    renderRates();
  };

  document.getElementById("wp-modal-delete").onclick = () => {
    const id = state.editingWorkplaceId;
    const wp = state.workplaces.find((w) => w.id === id);
    if (!wp) return;
    const count = state.shifts.filter((s) => s.workplaceId === id).length;
    const msg = count > 0
      ? `「${wp.name}」を削除しますか？\nこの勤務先のシフト${count}件も一緒に削除されます。`
      : `「${wp.name}」を削除しますか？`;
    showConfirm(msg, () => {
      state.workplaces = state.workplaces.filter((w) => w.id !== id);
      state.shifts = state.shifts.filter((s) => s.workplaceId !== id);
      state.templates = state.templates.filter((t) => t.workplaceId !== id);
      if (state.activeWorkplaceId === id) state.activeWorkplaceId = null;
      save();
      closeWorkplaceModal();
      switchTab("workplaces");
    });
  };
  document.getElementById("wp-modal-close").onclick = closeWorkplaceModal;
  wireDateRuleSegment("wp-modal-closing-type", "wp-modal-closing");
  wireDateRuleSegment("wp-modal-payday-type", "wp-modal-payday");
  document.getElementById("wp-modal-save").onclick = () => {
    const name = document.getElementById("wp-modal-name").value.trim();
    if (!name) { showNotice("勤務先名を入力してください"); return; }
    const wp = state.workplaces.find((w) => w.id === state.editingWorkplaceId);
    wp.name = name;
    wp.closingType = document.querySelector("#wp-modal-closing-type .segment-btn.active")?.dataset.type || "fixed";
    wp.closingDay = Number(document.getElementById("wp-modal-closing").value) || wp.closingDay;
    wp.paydayType = document.querySelector("#wp-modal-payday-type .segment-btn.active")?.dataset.type || "fixed";
    wp.payday = Number(document.getElementById("wp-modal-payday").value) || wp.payday;
    save();
    closeWorkplaceModal();
    renderWorkplaces();
    if (state.tab === "rates") renderRates();
    renderHome();
  };

  document.querySelectorAll("#history-view-segment .segment-btn").forEach((btn) => {
    btn.onclick = () => { state.historyView = btn.dataset.view; renderHistory(); };
  });
  document.getElementById("day-modal-close").onclick = closeDayModal;

  document.getElementById("template-add-btn").onclick = () => openTemplateModal(null);
  document.getElementById("tmpl-modal-close").onclick = closeTemplateModal;
  document.getElementById("tmpl-modal-save").onclick = () => {
    const name = document.getElementById("tmpl-modal-name").value.trim();
    const workplaceId = document.getElementById("tmpl-modal-workplace").value;
    const start = document.getElementById("tmpl-modal-start").value;
    const end = document.getElementById("tmpl-modal-end").value;
    if (!name) { showNotice("テンプレート名を入力してください"); return; }
    if (!workplaceId) { showNotice("勤務先を選択してください"); return; }
    const entry = { id: state.editingTemplateId || `tmpl${Date.now()}`, name, workplaceId, start, end };
    const exists = state.templates.find((t) => t.id === entry.id);
    state.templates = exists ? state.templates.map((t) => (t.id === entry.id ? entry : t)) : [...state.templates, entry];
    save();
    closeTemplateModal();
    renderTemplateList();
  };

  let touchStartX = null, touchStartY = null;
  const homeContent = document.getElementById("home-content");
  homeContent.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  homeContent.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy)) return; // ignore short or mostly-vertical swipes
    if (dx < 0 && homeMonthOffset < 1) { homeMonthOffset = 1; state.calendarMonthOffset = homeMonthOffset; renderHome(); }
    else if (dx > 0 && homeMonthOffset > 0) { homeMonthOffset = 0; state.calendarMonthOffset = homeMonthOffset; renderHome(); }
  }, { passive: true });
  homeContent.addEventListener("touchcancel", () => { touchStartX = null; }, { passive: true });

  document.querySelectorAll(".stepper button").forEach((btn) => {
    btn.onclick = () => {
      const input = document.getElementById("add-break");
      input.value = Math.max(0, (Number(input.value) || 0) + Number(btn.dataset.step));
      input.dispatchEvent(new Event("input"));
    };
  });

  switchTab("home");
}

document.addEventListener("DOMContentLoaded", init);

// ==========================================================
// 年収の壁(専用タブ版 v2)   【script.js の一番下に貼る(premium.js の後ろ)】
//
// ・前回の wall.js は削除して、これに置き換えてください
// ・タブバーに「年収の壁」を追加します(index.html は編集不要。JSで自動追加)
//   並び順: ホーム / 年収の壁 / ＋追加 / 勤務先 / 履歴 / 設定
// ・年収の壁タブ: 収入の見込み・壁ごとの状況・月ごとのグラフ・壁の設定
// ・ホーム: いちばん近い壁を、控えめな1行で表示(タップでタブへ)
// ・金額の初期値は2026年10月時点の目安です(制度は変わるため、必ず確認してください)
// ==========================================================
(function () {
  const LS_WALLS = "wage_walls"; // { profile, basis, walls:[{id,name,amount,enabled,note}] }
  const TAB_ORDER = ["home", "wall", "add", "workplaces", "history", "settings"];

  // ---------- 壁の初期値(給与収入ベース・円) ----------
  function presetWalls(profile, year) {
    const after2026 = year >= 2026;
    const list = [
      {
        id: "juminzei", name: "住民税(所得割)がかかり始める", amount: 1100000, enabled: true,
        note: "目安です。自治体によって金額が変わります。住民税は翌年度にかかります。",
      },
      {
        id: "shotokuzei", name: "所得税がかかり始める", amount: after2026 ? 1780000 : 1600000, enabled: true,
        note: after2026
          ? "2026年分から178万円に引き上げられました。勤労学生控除などを使うと変わる場合があります。"
          : "2025年分は160万円です。",
      },
      {
        id: "kenpo", name: "健康保険の扶養から外れる", amount: profile === "student" ? 1500000 : 1300000, enabled: true,
        note: profile === "student"
          ? "19〜22歳(配偶者を除く)の扶養認定の基準です。判定は今後1年間の見込み収入で行われ、月額の基準もあります。"
          : "判定は今後1年間の見込み収入で行われ、月額(約10.8万円)の基準もあります。健保組合によって扱いが違う場合があります。",
      },
    ];
    if (profile === "student") {
      list.push({
        id: "oya", name: "親の控除(63万円)が減り始める", amount: after2026 ? 1590000 : 1500000, enabled: true,
        note: "親の特定親族特別控除が満額でなくなるラインです。超えても一気になくならず、段階的に減ります。2026年分は改正後の目安です。",
      });
    }
    return list;
  }

  function defaultWallState() {
    return { profile: "general", basis: "payday", walls: presetWalls("general", new Date().getFullYear()) };
  }

  function loadWalls() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_WALLS) : null;
      const w = raw ? JSON.parse(raw) : null;
      if (w && Array.isArray(w.walls)) {
        return {
          profile: w.profile === "student" ? "student" : "general",
          basis: w.basis === "workday" ? "workday" : "payday",
          walls: w.walls.filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && Number(x.amount) > 0)
            .map((x) => ({ id: x.id, name: x.name, amount: Number(x.amount), enabled: x.enabled !== false, note: x.note || "" })),
        };
      }
    } catch (e) { /* 読めなければ初期値 */ }
    return defaultWallState();
  }

  function saveWalls(cfg) {
    try { localStorage.setItem(LS_WALLS, JSON.stringify(cfg)); } catch (e) {}
  }

  // ---------- 収入の集計 ----------
  // シフトの勤務日から「実際に給料が支払われる日」を求める(勤務先の締め日・給料日の設定を使う)
  function paydayOf(wp, dateStr) {
    const d = stripTime(new Date(dateStr + "T00:00:00"));
    if (!wp) return d;
    const y = d.getFullYear(), m = d.getMonth();
    const close = resolveDateRule(wp.closingType || "fixed", wp.closingDay, y, m);
    const pm = d > stripTime(close) ? m + 1 : m; // 締め日を過ぎていたら、次の締め期間に入る
    const base = new Date(y, pm, 1);
    const by = base.getFullYear(), bm = base.getMonth();
    const closeDate = resolveDateRule(wp.closingType || "fixed", wp.closingDay, by, bm);
    const sameMonth = resolveDateRule(wp.paydayType || "fixed", wp.payday, by, bm);
    const payday = sameMonth > closeDate ? sameMonth : resolveDateRule(wp.paydayType || "fixed", wp.payday, by, bm + 1);
    return stripTime(payday);
  }

  // その年(basis: "payday"=給料日の年 / "workday"=勤務日の年)の収入を、日付順に並べて返す
  function collectIncome(year, basis) {
    const items = [];
    state.shifts.forEach((s) => {
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (!r) return;
      const date = basis === "payday" ? paydayOf(wp, s.date) : stripTime(new Date(s.date + "T00:00:00"));
      if (date.getFullYear() !== year) return;
      items.push({ date, pay: r.pay, minutes: r.workedMinutes });
    });
    items.sort((a, b) => a.date - b.date);
    return items;
  }

  function analyze(year, cfg, today) {
    const items = collectIncome(year, cfg.basis);
    let total = 0, paid = 0, minutes = 0;
    items.forEach((it) => {
      total += it.pay; minutes += it.minutes;
      if (it.date <= today) paid += it.pay;
    });
    return { items, total, paid, upcoming: total - paid, avgHourly: minutes > 0 ? total / (minutes / 60) : null };
  }

  function crossingDate(items, amount) {
    let cum = 0;
    for (const it of items) { cum += it.pay; if (cum > amount) return it.date; }
    return null;
  }

  // 月ごとの収入(1月〜12月の12個)
  function monthlyTotals(items) {
    const arr = new Array(12).fill(0);
    items.forEach((it) => { arr[it.date.getMonth()] += it.pay; });
    return arr;
  }

  // 年末の見込み: 登録済みの収入 + 「直近3か月の月平均」 × まだシフトが入っていない残りの月
  function forecastYearEnd(year, items, total, today) {
    if (year !== today.getFullYear()) return null;
    const monthly = monthlyTotals(items);
    const m = today.getMonth();
    let lastMonth = m;
    items.forEach((it) => { if (it.date.getMonth() > lastMonth) lastMonth = it.date.getMonth(); });
    const from = Math.max(0, m - 2);
    let sum = 0;
    for (let i = from; i <= m; i++) sum += monthly[i];
    const pace = sum / (m - from + 1);
    const remaining = 11 - lastMonth;
    if (!(pace > 0) || remaining <= 0) return null;
    return { pace, remaining, value: total + pace * remaining };
  }

  if (typeof window !== "undefined") {
    window.__wallTest = { presetWalls, paydayOf, collectIncome, analyze, crossingDate, monthlyTotals, forecastYearEnd };
  }
  if (typeof document === "undefined") return; // テスト用(ブラウザ以外では画面の処理をしない)

  // ---------- 表示用の部品 ----------
  function man(yenAmount) { return `${(yenAmount / 10000).toLocaleString()}万円`; }
  function enabledWalls(cfg) {
    return cfg.walls.filter((w) => w.enabled && w.amount > 0).sort((x, y) => x.amount - y.amount);
  }

  function wallRowsHtml(a, walls, today, cfg) {
    const when = cfg.basis === "payday" ? "給料" : "勤務";
    const nextIdx = walls.findIndex((w) => a.total < w.amount);
    return walls.map((w, i) => {
      const ratio = a.total / w.amount;
      const st = ratio >= 1 ? "over" : ratio >= 0.85 ? "warn" : "ok";
      const pct = Math.min(100, Math.round(ratio * 100));
      const remain = w.amount - a.total;
      let msg;
      if (remain <= 0) {
        const cd = crossingDate(a.items, w.amount);
        msg = cd && cd > today
          ? `登録済みのシフトだと、${fmtDateObj(cd)}の${when}分から超えます(${yen(-remain)}オーバー)`
          : `すでに超えています(${yen(-remain)}オーバー)`;
      } else {
        const hours = a.avgHourly ? `(約${(remain / a.avgHourly).toFixed(1)}時間分)` : "";
        msg = `あと ${yen(remain)} ${hours}`;
      }
      return `
        <div class="wall-row wall-${st}${i === nextIdx ? " wall-next" : ""}">
          <div class="wall-row-top">
            <span class="wall-name">${escapeHtml(w.name)}</span>
            <span class="wall-amount">${man(w.amount)}</span>
          </div>
          <div class="wall-bar"><div class="wall-bar-fill" style="width:${pct}%"></div></div>
          <div class="wall-msg">${msg}</div>
        </div>
      `;
    }).join("");
  }

  function chartHtml(a, year, today) {
    const monthly = monthlyTotals(a.items);
    const max = Math.max(...monthly, 1);
    const thisYear = today.getFullYear();
    return `<div class="wc-chart">${monthly.map((v, i) => {
      const isNow = year === thisYear && i === today.getMonth();
      const future = year > thisYear || (year === thisYear && i > today.getMonth());
      const cls = ["wc-col", isNow ? "wc-now" : "", future ? "wc-future" : "", v <= 0 ? "wc-zero" : ""].join(" ");
      return `<div class="${cls}">
        <div class="wc-val">${v > 0 ? (v / 10000).toFixed(1) : ""}</div>
        <div class="wc-bar-wrap"><div class="wc-bar" style="height:${v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 2}%"></div></div>
        <div class="wc-m">${i + 1}</div>
      </div>`;
    }).join("")}</div>`;
  }

  // ---------- 年収の壁タブの中身 ----------
  let yearOffset = 0; // 0 = 今年 / 1 = 来年

  function renderWallMain() {
    const container = document.getElementById("wall-main");
    if (!container) return;
    const cfg = loadWalls();
    const today = stripTime(new Date());
    const year = today.getFullYear() + yearOffset;
    const a = analyze(year, cfg, today);
    const walls = enabledWalls(cfg);
    const isPayday = cfg.basis === "payday";

    // 年末の見込み
    let forecastHtml = "";
    const fc = forecastYearEnd(year, a.items, a.total, today);
    if (fc) {
      const willCross = walls.filter((w) => a.total < w.amount && fc.value >= w.amount);
      forecastHtml = `
        <div class="wall-forecast">
          このペースだと、年末には約 <b>${yen(fc.value)}</b> になりそうです。
          <span class="wall-forecast-sub">(これから先のシフトが入っていない${fc.remaining}か月分を、直近3か月の月平均 ${yen(fc.pace)} で計算した目安)</span>
          ${willCross.length ? `<div class="wall-forecast-warn">この見込みだと「${willCross.map((w) => escapeHtml(w.name)).join("」「")}」を超えそうです。</div>` : ""}
        </div>`;
    }

    container.innerHTML = `
      <div class="wall-card">
        <div class="wall-sub">${year}年 ・ ${isPayday ? "給料日ベース" : "勤務日ベース"} ・ ${cfg.profile === "student" ? "学生(19〜22歳)" : "学生以外"}</div>
        <div class="wall-income-label">${year}年の収入(見込み)</div>
        <div class="wall-income">${yen(a.total)}</div>
        <div class="wall-income-sub">${isPayday ? "支払い済み" : "勤務済み"} ${yen(a.paid)} ／ これから ${yen(a.upcoming)}</div>
        ${forecastHtml}
      </div>

      <div class="wall-card">
        <div class="wall-card-title">壁ごとの状況</div>
        ${walls.length
          ? `<div class="wall-rows">${wallRowsHtml(a, walls, today, cfg)}</div>`
          : `<div class="wall-set-hint">表示する壁がありません。下の「壁の設定」でONにしてください。</div>`}
      </div>

      <div class="wall-card">
        <div class="wall-card-title">月ごとの収入 <span class="wall-card-unit">(万円)</span></div>
        <div class="wall-set-hint">${isPayday ? "給料が支払われる月で表示しています。" : "勤務した月で表示しています。"}</div>
        ${chartHtml(a, year, today)}
      </div>

      <div class="wall-foot">※ 目安です。制度は変わります。税金や扶養の判定は、勤務先・学校・保険者などで確認してください。</div>
    `;
  }

  function renderWall() {
    document.querySelectorAll("#wall-year-seg .segment-btn").forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.off) === yearOffset));
    renderWallMain();
    renderWallSettings();
  }

  // ---------- 壁の設定(年収の壁タブの下半分) ----------
  function renderWallSettings() {
    const cfg = loadWalls();
    document.querySelectorAll("#wall-profile-seg .segment-btn").forEach((b) => b.classList.toggle("active", b.dataset.profile === cfg.profile));
    document.querySelectorAll("#wall-basis-seg .segment-btn").forEach((b) => b.classList.toggle("active", b.dataset.basis === cfg.basis));

    const list = document.getElementById("wall-list");
    if (!list) return;
    list.innerHTML = cfg.walls.map((w) => `
      <div class="wall-set-row">
        <div class="wall-set-top">
          <label class="wall-set-check">
            <input type="checkbox" data-wall-toggle="${w.id}" ${w.enabled ? "checked" : ""}>
            <span class="wall-set-name">${escapeHtml(w.name)}</span>
          </label>
          <div class="wall-set-amount">
            <input type="number" step="0.1" min="0" data-wall-amount="${w.id}" value="${w.amount / 10000}">
            <span>万円</span>
            ${w.id.startsWith("c_") ? `<span class="icon-btn icon-btn-danger" data-wall-del="${w.id}">${ICON_TRASH}</span>` : ""}
          </div>
        </div>
        ${w.note ? `<div class="wall-set-hint">${escapeHtml(w.note)}</div>` : ""}
      </div>
    `).join("");

    list.querySelectorAll("[data-wall-toggle]").forEach((el) => {
      el.onchange = () => {
        const c = loadWalls(); const w = c.walls.find((x) => x.id === el.dataset.wallToggle);
        if (w) { w.enabled = el.checked; saveWalls(c); renderWallMain(); }
      };
    });
    list.querySelectorAll("[data-wall-amount]").forEach((el) => {
      el.oninput = () => {
        const v = Number(el.value);
        if (!(v > 0)) return; // 入力途中は保存しない
        const c = loadWalls(); const w = c.walls.find((x) => x.id === el.dataset.wallAmount);
        if (w) { w.amount = Math.round(v * 10000); saveWalls(c); renderWallMain(); } // 上の表示だけ更新(入力中の欄は触らない)
      };
    });
    list.querySelectorAll("[data-wall-del]").forEach((el) => {
      el.onclick = () => {
        showConfirm("この壁を削除しますか？", () => {
          const c = loadWalls(); c.walls = c.walls.filter((x) => x.id !== el.dataset.wallDel);
          saveWalls(c); renderWall();
        });
      };
    });
  }

  function wireSettings() {
    document.querySelectorAll("#wall-year-seg .segment-btn").forEach((b) => {
      b.onclick = () => { yearOffset = Number(b.dataset.off); renderWall(); };
    });
    document.querySelectorAll("#wall-profile-seg .segment-btn").forEach((b) => {
      b.onclick = () => {
        const cfg = loadWalls();
        const next = b.dataset.profile;
        if (cfg.profile === next) return;
        showConfirm("区分を変えると、壁の金額が初期値に戻ります。(自分で追加した壁は残ります)", () => {
          cfg.profile = next;
          cfg.walls = presetWalls(next, new Date().getFullYear()).concat(cfg.walls.filter((w) => w.id.startsWith("c_")));
          saveWalls(cfg); renderWall();
        }, { title: "区分の変更", okLabel: "変更する" });
      };
    });
    document.querySelectorAll("#wall-basis-seg .segment-btn").forEach((b) => {
      b.onclick = () => { const cfg = loadWalls(); cfg.basis = b.dataset.basis; saveWalls(cfg); renderWall(); };
    });
    document.getElementById("wall-add-btn").onclick = () => {
      const name = document.getElementById("wall-add-name").value.trim();
      const manVal = Number(document.getElementById("wall-add-amount").value);
      if (!name || !(manVal > 0)) { showNotice("壁の名前と、金額(万円)を入力してください"); return; }
      const cfg = loadWalls();
      cfg.walls.push({ id: `c_${Date.now()}`, name, amount: Math.round(manVal * 10000), enabled: true, note: "" });
      saveWalls(cfg);
      document.getElementById("wall-add-name").value = "";
      document.getElementById("wall-add-amount").value = "";
      renderWall();
    };
    document.getElementById("wall-reset-btn").onclick = () => {
      showConfirm("壁の金額を初期値に戻しますか？(自分で追加した壁は残ります)", () => {
        const cfg = loadWalls();
        cfg.walls = presetWalls(cfg.profile, new Date().getFullYear()).concat(cfg.walls.filter((w) => w.id.startsWith("c_")));
        saveWalls(cfg); renderWall();
      }, { title: "初期値に戻す", okLabel: "戻す" });
    };
  }

  // ---------- タブと画面を追加 ----------
  function injectScreenAndTab() {
    if (document.getElementById("screen-wall")) return;
    const app = document.querySelector(".app");
    const tabbar = document.querySelector(".tabbar");
    if (!app || !tabbar) return;

    const section = document.createElement("section");
    section.id = "screen-wall";
    section.className = "screen";
    section.innerHTML = `
      <div class="header-row">
        <span class="header-title">年収の壁</span>
        <div class="segment view-segment" id="wall-year-seg">
          <button class="segment-btn" data-off="0">今年</button>
          <button class="segment-btn" data-off="1">来年</button>
        </div>
      </div>
      <div id="wall-main" class="list-pad"></div>

      <div class="section-label">壁の設定</div>
      <div class="tmpl-hint" style="padding:0 20px 8px">金額は2026年10月時点の目安です。制度は変わるため、変更があれば金額を自分で直せます。</div>
      <div class="list-pad">
        <div class="card pad-14">
          <div class="wall-set-label">あなたの区分</div>
          <div class="segment" id="wall-profile-seg">
            <button class="segment-btn" data-profile="general">学生以外</button>
            <button class="segment-btn" data-profile="student">学生(19〜22歳)</button>
          </div>
          <div class="wall-set-label">集計の基準</div>
          <div class="segment" id="wall-basis-seg" style="margin-bottom:6px">
            <button class="segment-btn" data-basis="payday">給料日ベース</button>
            <button class="segment-btn" data-basis="workday">勤務日ベース</button>
          </div>
          <div class="wall-set-hint">税金は「給料が支払われた年」で数えるのが基本なので、給料日ベースがおすすめです(12月勤務分が翌年1月払いなら、翌年の収入になります)。</div>
        </div>
      </div>
      <div class="list-pad" style="margin-top:12px">
        <div class="card" id="wall-list"></div>
        <div class="wall-add-row">
          <input type="text" id="wall-add-name" class="modal-input" placeholder="壁の名前(例: 会社の手当)">
          <input type="number" id="wall-add-amount" class="modal-input wall-add-amount" placeholder="万円" step="0.1" min="0">
          <button class="btn-small" id="wall-add-btn">追加</button>
        </div>
        <button class="rate-add-btn" id="wall-reset-btn" style="width:100%;margin:12px 0 0">壁の金額を初期値(2026年の目安)に戻す</button>
        <div class="wall-set-hint" style="margin-top:12px">
          <b>社会保険(勤務先)について:</b> 2026年10月から、月額8.8万円(年収約106万円)の賃金要件はなくなりました。現在は「週20時間以上」などが目安で、昼間の学生は原則対象外です。くわしくは勤務先でご確認ください。
        </div>
      </div>
    `;
    app.insertBefore(section, tabbar);

    const btn = document.createElement("button");
    btn.className = "tab-item";
    btn.dataset.tab = "wall";
    btn.innerHTML = `<span class="tab-icon"><svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V11M12 20V4M19 20v-6"/><path d="M3 20h18"/></svg></span><span class="tab-label">年収の壁</span>`;
    btn.addEventListener("click", () => switchTab("wall"));
    tabbar.appendChild(btn);

    // 並び順: ホーム / 年収の壁 / ＋追加 / 勤務先 / 履歴 / 設定
    TAB_ORDER.forEach((t) => {
      const b = tabbar.querySelector(`.tab-item[data-tab="${t}"]`);
      if (b) tabbar.appendChild(b);
    });

    wireSettings();
  }

  const baseRenderCurrentScreen = renderCurrentScreen;
  renderCurrentScreen = function () {
    baseRenderCurrentScreen();
    if (state.tab === "wall") renderWall();
  };

  // ---------- ホーム: いちばん近い壁を控えめに表示 ----------
  function homeNoteHtml() {
    const cfg = loadWalls();
    const today = stripTime(new Date());
    const a = analyze(today.getFullYear(), cfg, today);
    const walls = enabledWalls(cfg);
    if (walls.length === 0 || a.items.length === 0) return ""; // 今年のシフトがなければ出さない

    let w = walls.find((x) => a.total < x.amount);
    let st, name, main, pct, head = "一番近い年収の壁";
    if (w) {
      const remain = w.amount - a.total;
      const ratio = a.total / w.amount;
      st = ratio >= 0.85 ? "warn" : "ok";
      pct = Math.round(ratio * 100);
      name = `${escapeHtml(w.name)}(${man(w.amount)})`;
      main = `あと <b>${yen(remain)}</b>`;
    } else {
      w = walls[walls.length - 1];
      st = "over"; pct = 100; head = "年収の壁";
      name = `最大の壁: ${escapeHtml(w.name)}(${man(w.amount)})`;
      main = `すべての壁を超えています`;
    }
    // 1行目: 見出し「一番近い年収の壁」 / 2行目: 壁の名前(小さく) / 3行目: あと◯円(目に入る大きさ)
    return `
      <div class="wall-note wall-note-${st}" id="wall-note">
        <div class="wall-note-line">
          <span class="wall-note-label">${head}</span>
          <span class="wall-note-chev">›</span>
        </div>
        <div class="wall-note-name">${name}</div>
        <div class="wall-note-main">${main}</div>
        <div class="wall-note-bar"><div class="wall-note-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
      </div>
    `;
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try {
      const container = document.getElementById("home-content");
      if (!container) return;
      const html = homeNoteHtml();
      if (!html) return;
      const wrap = document.createElement("div");
      wrap.className = "wall-note-wrap";
      wrap.innerHTML = html;
      const goal = container.querySelector(".home-block");
      if (goal) goal.insertAdjacentElement("afterend", wrap);
      else container.insertBefore(wrap, container.querySelector(".stat-grid"));
      document.getElementById("wall-note").onclick = () => switchTab("wall");
    } catch (e) { console.error("年収の壁の表示エラー", e); }
  };

  document.addEventListener("DOMContentLoaded", injectScreenAndTab);
})();

// ==========================================================
// 年収の壁   【script.js の一番下に貼る(premium.js の後ろでOK)】
//
// ・ホーム画面に「今年の収入」と「各壁まであと◯円」を表示します
// ・壁の金額・ON/OFF・集計の基準は、設定画面で変えられます
// ・金額の初期値は2026年10月時点の目安です(制度は変わるため、必ず確認してください)
// ==========================================================
(function () {
  const LS_WALLS = "wage_walls"; // { profile, basis, walls:[{id,name,amount,enabled,note}] }

  // ---------- 壁の初期値(給与収入ベース・円) ----------
  function presetWalls(profile, year) {
    const after2026 = year >= 2026;
    const list = [
      {
        id: "juminzei", name: "住民税(所得割)がかかり始める", amount: 1100000, enabled: true,
        note: "目安です。自治体によって金額が変わります。住民税は翌年度にかかります。",
      },
      {
        id: "shotokuzei", name: "所得税がかかり始める", amount: after2026 ? 1780000 : 1600000, enabled: true,
        note: after2026
          ? "2026年分から178万円に引き上げられました。勤労学生控除などを使うと変わる場合があります。"
          : "2025年分は160万円です。",
      },
      {
        id: "kenpo", name: "健康保険の扶養から外れる", amount: profile === "student" ? 1500000 : 1300000, enabled: true,
        note: profile === "student"
          ? "19〜22歳(配偶者を除く)の扶養認定の基準です。判定は今後1年間の見込み収入で行われ、月額の基準もあります。"
          : "判定は今後1年間の見込み収入で行われ、月額(約10.8万円)の基準もあります。健保組合によって扱いが違う場合があります。",
      },
    ];
    if (profile === "student") {
      list.push({
        id: "oya", name: "親の控除(63万円)が減り始める", amount: after2026 ? 1590000 : 1500000, enabled: true,
        note: "親の特定親族特別控除が満額でなくなるラインです。超えても一気になくならず、段階的に減ります。2026年分は改正後の目安です。",
      });
    }
    return list;
  }

  function defaultWallState() {
    return { profile: "general", basis: "payday", walls: presetWalls("general", new Date().getFullYear()) };
  }

  function loadWalls() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_WALLS) : null;
      const w = raw ? JSON.parse(raw) : null;
      if (w && Array.isArray(w.walls)) {
        return {
          profile: w.profile === "student" ? "student" : "general",
          basis: w.basis === "workday" ? "workday" : "payday",
          walls: w.walls.filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && Number(x.amount) > 0)
            .map((x) => ({ id: x.id, name: x.name, amount: Number(x.amount), enabled: x.enabled !== false, note: x.note || "" })),
        };
      }
    } catch (e) { /* 読めなければ初期値 */ }
    return defaultWallState();
  }

  function saveWalls(cfg) {
    try { localStorage.setItem(LS_WALLS, JSON.stringify(cfg)); } catch (e) {}
  }

  // ---------- 収入の集計 ----------
  // シフトの勤務日から「実際に給料が支払われる日」を求める(勤務先の締め日・給料日の設定を使う)
  function paydayOf(wp, dateStr) {
    const d = stripTime(new Date(dateStr + "T00:00:00"));
    if (!wp) return d;
    const y = d.getFullYear(), m = d.getMonth();
    const close = resolveDateRule(wp.closingType || "fixed", wp.closingDay, y, m);
    const pm = d > stripTime(close) ? m + 1 : m; // 締め日を過ぎていたら、次の締め期間に入る
    const base = new Date(y, pm, 1);
    const by = base.getFullYear(), bm = base.getMonth();
    const closeDate = resolveDateRule(wp.closingType || "fixed", wp.closingDay, by, bm);
    const sameMonth = resolveDateRule(wp.paydayType || "fixed", wp.payday, by, bm);
    const payday = sameMonth > closeDate ? sameMonth : resolveDateRule(wp.paydayType || "fixed", wp.payday, by, bm + 1);
    return stripTime(payday);
  }

  // その年(basis: "payday"=給料日の年 / "workday"=勤務日の年)の収入を、日付順に並べて返す
  function collectIncome(year, basis) {
    const items = [];
    state.shifts.forEach((s) => {
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (!r) return;
      const date = basis === "payday" ? paydayOf(wp, s.date) : stripTime(new Date(s.date + "T00:00:00"));
      if (date.getFullYear() !== year) return;
      items.push({ date, pay: r.pay, minutes: r.workedMinutes });
    });
    items.sort((a, b) => a.date - b.date);
    return items;
  }

  function analyze(year, cfg, today) {
    const items = collectIncome(year, cfg.basis);
    let total = 0, paid = 0, minutes = 0;
    items.forEach((it) => {
      total += it.pay; minutes += it.minutes;
      if (it.date <= today) paid += it.pay;
    });
    return { items, total, paid, upcoming: total - paid, avgHourly: minutes > 0 ? total / (minutes / 60) : null };
  }

  function crossingDate(items, amount) {
    let cum = 0;
    for (const it of items) { cum += it.pay; if (cum > amount) return it.date; }
    return null;
  }

  if (typeof window !== "undefined") {
    window.__wallTest = { presetWalls, paydayOf, collectIncome, analyze, crossingDate };
  }
  if (typeof document === "undefined") return; // テスト用(ブラウザ以外では画面の処理をしない)

  // ---------- ホーム画面のカード ----------
  function man(yenAmount) { return `${(yenAmount / 10000).toLocaleString()}万円`; }

  function wallCardHtml() {
    const cfg = loadWalls();
    const today = stripTime(new Date());
    const a = analyze(today.getFullYear(), cfg, today);
    const walls = cfg.walls.filter((w) => w.enabled && w.amount > 0).sort((x, y) => x.amount - y.amount);
    if (walls.length === 0) return "";

    const isPayday = cfg.basis === "payday";
    const when = isPayday ? "給料" : "勤務";
    const nextIdx = walls.findIndex((w) => a.total < w.amount);

    const rows = walls.map((w, i) => {
      const ratio = a.total / w.amount;
      const st = ratio >= 1 ? "over" : ratio >= 0.85 ? "warn" : "ok";
      const pct = Math.min(100, Math.round(ratio * 100));
      const remain = w.amount - a.total;
      let msg;
      if (remain <= 0) {
        const cd = crossingDate(a.items, w.amount);
        msg = cd && cd > today
          ? `登録済みのシフトだと、${fmtDateObj(cd)}の${when}分から超えます(${yen(-remain)}オーバー)`
          : `すでに超えています(${yen(-remain)}オーバー)`;
      } else {
        const hours = a.avgHourly ? `(約${(remain / a.avgHourly).toFixed(1)}時間分)` : "";
        msg = `あと ${yen(remain)} ${hours}`;
      }
      return `
        <div class="wall-row wall-${st}${i === nextIdx ? " wall-next" : ""}">
          <div class="wall-row-top">
            <span class="wall-name">${escapeHtml(w.name)}</span>
            <span class="wall-amount">${man(w.amount)}</span>
          </div>
          <div class="wall-bar"><div class="wall-bar-fill" style="width:${pct}%"></div></div>
          <div class="wall-msg">${msg}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="wall-card">
        <div class="wall-head">
          <span class="wall-title">年収の壁</span>
          <span class="wall-link" id="wall-open-settings">設定</span>
        </div>
        <div class="wall-sub">${today.getFullYear()}年 ・ ${isPayday ? "給料日ベース" : "勤務日ベース"} ・ ${cfg.profile === "student" ? "学生(19〜22歳)" : "学生以外"}</div>
        <div class="wall-income-label">今年の収入(見込み)</div>
        <div class="wall-income">${yen(a.total)}</div>
        <div class="wall-income-sub">${isPayday ? "支払い済み" : "勤務済み"} ${yen(a.paid)} ／ これから ${yen(a.upcoming)}</div>
        <div class="wall-rows">${rows}</div>
        <div class="wall-foot">※ 目安です。制度は変わります。税金や扶養の判定は、勤務先・学校・保険者などで確認してください。</div>
      </div>
    `;
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try {
      const container = document.getElementById("home-content");
      if (!container) return;
      const html = wallCardHtml();
      if (!html) return;
      const wrap = document.createElement("div");
      wrap.className = "wall-wrap";
      wrap.innerHTML = html;
      const anchor = container.querySelector(".bottom-pad");
      container.insertBefore(wrap, anchor);
      const link = document.getElementById("wall-open-settings");
      if (link) link.onclick = () => switchTab("settings");
    } catch (e) { console.error("年収の壁カードの表示エラー", e); }
  };

  // ---------- 設定画面 ----------
  function injectSettings() {
    const screen = document.getElementById("screen-settings");
    if (!screen || document.getElementById("wall-settings")) return;
    const wrap = document.createElement("div");
    wrap.id = "wall-settings";
    wrap.innerHTML = `
      <div class="section-label">年収の壁</div>
      <div class="tmpl-hint" style="padding:0 20px 8px">ホームに「壁まであと◯円」を表示します。金額は2026年10月時点の目安です。制度は変わるため、変更があれば金額を自分で直せます。</div>
      <div class="list-pad">
        <div class="card pad-14">
          <div class="wall-set-label">あなたの区分</div>
          <div class="segment" id="wall-profile-seg">
            <button class="segment-btn" data-profile="general">学生以外</button>
            <button class="segment-btn" data-profile="student">学生(19〜22歳)</button>
          </div>
          <div class="wall-set-label">集計の基準</div>
          <div class="segment" id="wall-basis-seg" style="margin-bottom:6px">
            <button class="segment-btn" data-basis="payday">給料日ベース</button>
            <button class="segment-btn" data-basis="workday">勤務日ベース</button>
          </div>
          <div class="wall-set-hint">税金は「給料が支払われた年」で数えるのが基本なので、給料日ベースがおすすめです(12月勤務分が翌年1月払いなら、翌年の収入になります)。</div>
        </div>
      </div>
      <div class="list-pad" style="margin-top:12px">
        <div class="card" id="wall-list"></div>
        <div class="wall-add-row">
          <input type="text" id="wall-add-name" class="modal-input" placeholder="壁の名前(例: 会社の手当)">
          <input type="number" id="wall-add-amount" class="modal-input wall-add-amount" placeholder="万円" step="0.1" min="0">
          <button class="btn-small" id="wall-add-btn">追加</button>
        </div>
        <button class="rate-add-btn" id="wall-reset-btn" style="width:100%;margin:12px 0 0">壁の金額を初期値(2026年の目安)に戻す</button>
        <div class="wall-set-hint" style="margin-top:12px">
          <b>社会保険(勤務先)について:</b> 2026年10月から、月額8.8万円(年収約106万円)の賃金要件はなくなりました。現在は「週20時間以上」などが目安で、昼間の学生は原則対象外です。くわしくは勤務先でご確認ください。
        </div>
      </div>
    `;
    const backup = document.getElementById("backup-section");
    if (backup) screen.insertBefore(wrap, backup); else screen.appendChild(wrap);

    document.querySelectorAll("#wall-profile-seg .segment-btn").forEach((b) => {
      b.onclick = () => {
        const cfg = loadWalls();
        const next = b.dataset.profile;
        if (cfg.profile === next) return;
        showConfirm("区分を変えると、壁の金額が初期値に戻ります。(自分で追加した壁は残ります)", () => {
          cfg.profile = next;
          cfg.walls = presetWalls(next, new Date().getFullYear()).concat(cfg.walls.filter((w) => w.id.startsWith("c_")));
          saveWalls(cfg); renderWallSettings();
        }, { title: "区分の変更", okLabel: "変更する" });
      };
    });
    document.querySelectorAll("#wall-basis-seg .segment-btn").forEach((b) => {
      b.onclick = () => { const cfg = loadWalls(); cfg.basis = b.dataset.basis; saveWalls(cfg); renderWallSettings(); };
    });
    document.getElementById("wall-add-btn").onclick = () => {
      const name = document.getElementById("wall-add-name").value.trim();
      const man = Number(document.getElementById("wall-add-amount").value);
      if (!name || !(man > 0)) { showNotice("壁の名前と、金額(万円)を入力してください"); return; }
      const cfg = loadWalls();
      cfg.walls.push({ id: `c_${Date.now()}`, name, amount: Math.round(man * 10000), enabled: true, note: "" });
      saveWalls(cfg);
      document.getElementById("wall-add-name").value = "";
      document.getElementById("wall-add-amount").value = "";
      renderWallSettings();
    };
    document.getElementById("wall-reset-btn").onclick = () => {
      showConfirm("壁の金額を初期値に戻しますか？(自分で追加した壁は残ります)", () => {
        const cfg = loadWalls();
        cfg.walls = presetWalls(cfg.profile, new Date().getFullYear()).concat(cfg.walls.filter((w) => w.id.startsWith("c_")));
        saveWalls(cfg); renderWallSettings();
      }, { title: "初期値に戻す", okLabel: "戻す" });
    };
    renderWallSettings();
  }

  function renderWallSettings() {
    const cfg = loadWalls();
    document.querySelectorAll("#wall-profile-seg .segment-btn").forEach((b) => b.classList.toggle("active", b.dataset.profile === cfg.profile));
    document.querySelectorAll("#wall-basis-seg .segment-btn").forEach((b) => b.classList.toggle("active", b.dataset.basis === cfg.basis));

    const list = document.getElementById("wall-list");
    list.innerHTML = cfg.walls.map((w) => `
      <div class="wall-set-row">
        <div class="wall-set-top">
          <label class="wall-set-check">
            <input type="checkbox" data-wall-toggle="${w.id}" ${w.enabled ? "checked" : ""}>
            <span class="wall-set-name">${escapeHtml(w.name)}</span>
          </label>
          <div class="wall-set-amount">
            <input type="number" step="0.1" min="0" data-wall-amount="${w.id}" value="${w.amount / 10000}">
            <span>万円</span>
            ${w.id.startsWith("c_") ? `<span class="icon-btn icon-btn-danger" data-wall-del="${w.id}">${ICON_TRASH}</span>` : ""}
          </div>
        </div>
        ${w.note ? `<div class="wall-set-hint">${escapeHtml(w.note)}</div>` : ""}
      </div>
    `).join("");

    list.querySelectorAll("[data-wall-toggle]").forEach((el) => {
      el.onchange = () => {
        const c = loadWalls(); const w = c.walls.find((x) => x.id === el.dataset.wallToggle);
        if (w) { w.enabled = el.checked; saveWalls(c); }
      };
    });
    list.querySelectorAll("[data-wall-amount]").forEach((el) => {
      el.oninput = () => {
        const v = Number(el.value);
        if (!(v > 0)) return; // 入力途中は保存しない
        const c = loadWalls(); const w = c.walls.find((x) => x.id === el.dataset.wallAmount);
        if (w) { w.amount = Math.round(v * 10000); saveWalls(c); }
      };
    });
    list.querySelectorAll("[data-wall-del]").forEach((el) => {
      el.onclick = () => {
        showConfirm("この壁を削除しますか？", () => {
          const c = loadWalls(); c.walls = c.walls.filter((x) => x.id !== el.dataset.wallDel);
          saveWalls(c); renderWallSettings();
        });
      };
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectSettings();
    document.querySelectorAll('.tab-item[data-tab="settings"]').forEach((b) =>
      b.addEventListener("click", () => setTimeout(renderWallSettings, 0)));
  });
})();

// ==========================================================
// ホームの整理(home-tidy.js)   【script.js の一番下に貼る(wall.js の後ろ)】
//
// 目的: 開いた瞬間に「今月いくら?」「次の給料日は?」が分かるようにする
//
// 変えた点
//  ・予想給与 + 目標バー + 勤務時間/日数 を 1枚のカードにまとめた
//  ・「次の給料日」は、一番近い1件だけを1行で表示(ほかの勤務先・対象期間は、タップで展開)
//  ・ホーム下の「＋シフトを追加」ボタンを削除(下のタブの「＋」と重複していたため)
//  ・ホームのカレンダーは、金額だけを表示(時間は日付をタップすると見られます)
//  ・年収の壁の注意は、給料日の下に置く
//
// 既存のコードは書き換えず、renderHome を上から包んで整えています。
// うまく動かなくなったら、この貼り付け分を消せば、元のホームに戻ります。
// ==========================================================
(function () {
  let hmBreakdown = false;  // 勤務先ごとの内訳を開いているか
  let hmPayoutOpen = false; // 給料日の詳細(ほかの勤務先・対象期間)を開いているか

  // ---------- 今月(or 来月)の集計 ----------
  function monthSummary(offset) {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + offset);
    const mKey = monthKey(base);
    const shifts = state.shifts.filter((s) => monthKey(new Date(s.date + "T00:00:00")) === mKey);

    let pay = 0, minutes = 0;
    const days = new Set();
    const perWp = {};
    shifts.forEach((s) => {
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (!r) return;
      pay += r.pay;
      minutes += r.workedMinutes;
      days.add(s.date); // 同じ日に2件あっても1日と数える
      perWp[s.workplaceId] = (perWp[s.workplaceId] || 0) + r.pay;
    });
    const byWorkplace = state.workplaces
      .map((w) => ({ name: w.name, pay: perWp[w.id] || 0 }))
      .filter((w) => w.pay > 0);
    return { base, pay, minutes, days: days.size, byWorkplace };
  }

  // ---------- 次の給料日(勤務先ごと) ----------
  // 先頭 = 「金額が0円ではない中で、いちばん近い給料日」(全部0円なら、いちばん近い給料日)
  function payoutList() {
    const today = new Date();
    const list = [];
    state.workplaces.forEach((wp) => {
      const payout = getNextPayout(wp, today);
      if (!payout) return;
      let amount = 0;
      state.shifts.filter((s) => s.workplaceId === wp.id).forEach((s) => {
        const d = new Date(s.date + "T00:00:00");
        if (d >= payout.periodStart && d <= payout.periodEnd) {
          const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
          if (r) amount += r.pay;
        }
      });
      list.push({ wp, payout, amount });
    });
    list.sort((a, b) => a.payout.payday - b.payout.payday);
    const firstPaid = list.findIndex((x) => x.amount > 0);
    if (firstPaid > 0) list.unshift(list.splice(firstPaid, 1)[0]);
    return list;
  }

  function payoutHtml(list) {
    if (list.length === 0) return "";
    const rest = list.length - 1;
    const shown = hmPayoutOpen ? list : list.slice(0, 1);
    const rows = shown.map((x) => `
      <div class="hm-po">
        <div class="hm-payout-row">
          <div class="hm-payout-l">
            <div class="hm-payout-date">${fmtDateObj(x.payout.payday)}</div>
            <div class="hm-payout-wp">${escapeHtml(x.wp.name)}</div>
          </div>
          <div class="hm-payout-amt">${yen(x.amount)}</div>
        </div>
        ${hmPayoutOpen ? `<div class="hm-payout-period">対象期間: ${fmtDateObj(x.payout.periodStart)}〜${fmtDateObj(x.payout.periodEnd)}</div>` : ""}
      </div>
    `).join("");
    const label = hmPayoutOpen ? "閉じる ▴" : (rest > 0 ? `ほか${rest}件を見る ▾` : "対象期間を見る ▾");
    return `
      <div class="hm-payout">
        <div class="hm-payout-head">
          <span>次の給料日</span>
          <button type="button" class="hm-toggle" id="hm-payout-toggle">${label}</button>
        </div>
        ${rows}
      </div>
    `;
  }

  // ---------- ホーム全体を組み立てる ----------
  function tidyHome() {
    const container = document.getElementById("home-content");
    if (!container) return;

    const sum = monthSummary(homeMonthOffset);
    const label = homeMonthOffset === 0 ? "今月" : "来月";
    const hasMultiWp = sum.byWorkplace.length > 1;

    // 目標(0円に設定されているときは表示しない)
    let goalHtml = "";
    const goal = state.monthlyGoal;
    if (goal > 0) {
      const progress = Math.min(sum.pay / goal, 1);
      const remain = Math.max(goal - sum.pay, 0);
      goalHtml = `
        <div class="hm-goal${remain === 0 ? " hm-goal-done" : ""}">
          <div class="hm-goal-top"><span>目標 ${yen(goal)}</span><b>${remain === 0 ? "達成" : `あと ${yen(remain)}`}</b></div>
          <div class="hm-goal-bar"><div class="hm-goal-fill" style="width:${progress * 100}%"></div></div>
        </div>`;
    }

    const breakdownHtml = hmBreakdown && hasMultiWp
      ? `<div class="hm-breakdown">${sum.byWorkplace.map((w) =>
          `<div class="hm-bd-row"><span>${escapeHtml(w.name)}</span><span>${yen(w.pay)}</span></div>`).join("")}</div>`
      : "";

    const emptyHtml = state.workplaces.length === 0
      ? `<div class="hm-empty">勤務先を登録すると、ここに給与が表示されます。<button type="button" class="hm-empty-btn" id="hm-empty-btn">勤務先を追加する</button></div>`
      : "";

    const html = `
      <div class="home-month-row">
        <div class="home-month">${sum.base.getFullYear()}年${sum.base.getMonth() + 1}月</div>
        <div class="segment month-segment" id="home-month-segment">
          <button class="segment-btn ${homeMonthOffset === 0 ? "active" : ""}" data-offset="0">今月</button>
          <button class="segment-btn ${homeMonthOffset === 1 ? "active" : ""}" data-offset="1">来月</button>
        </div>
      </div>
      <div class="hm-main">
        <div class="hm-card">
          <div class="hm-label">${label}の予想給与</div>
          <div class="hm-amount">${yen(sum.pay)}</div>
          <div class="hm-meta">${(sum.minutes / 60).toFixed(1)}時間 ・ ${sum.days}日${hasMultiWp ? ` ・ <button type="button" class="hm-toggle hm-toggle-inline" id="hm-bd-toggle">内訳${hmBreakdown ? "を閉じる" : ""}</button>` : ""}</div>
          ${breakdownHtml}
          ${goalHtml}
          ${emptyHtml}
        </div>
      </div>
      <div class="hm-side" id="hm-side">${payoutHtml(payoutList())}</div>
    `;

    // ここまで成功してから、画面を差し替える(途中で失敗しても元の画面は壊れない)
    const note = container.querySelector(".wall-note-wrap"); // wall.js が入れた「年収の壁」の注意
    if (note) note.remove();
    container.innerHTML = html;
    if (note) document.getElementById("hm-side").appendChild(note);

    document.querySelectorAll("#home-month-segment .segment-btn").forEach((btn) => {
      btn.onclick = () => {
        homeMonthOffset = Number(btn.dataset.offset);
        state.calendarMonthOffset = homeMonthOffset;
        renderHome();
      };
    });
    const bd = document.getElementById("hm-bd-toggle");
    if (bd) bd.onclick = () => { hmBreakdown = !hmBreakdown; renderHome(); };
    const po = document.getElementById("hm-payout-toggle");
    if (po) po.onclick = () => { hmPayoutOpen = !hmPayoutOpen; renderHome(); };
    const eb = document.getElementById("hm-empty-btn");
    if (eb) eb.onclick = () => switchTab("workplaces");
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try { tidyHome(); } catch (e) { console.error("ホームの整理でエラー(元の画面のまま表示します)", e); }
  };
})();
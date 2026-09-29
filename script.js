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
  holidayWeekdays: new Set([0]), // dow numbers treated as the "holiday" rate group (default: Sunday only)
  autoHolidayYears: [], // years for which Japanese public holidays have already been auto-added to state.holidays
};

// ---------- initial demo data (used only on first run) ----------
function defaultWorkplaces() {
  return [
    {
      id: "w1",
      name: "コンビニA",
      payday: 25,
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
    <div class="bottom-pad" style="padding-top:0">
      <button class="btn-primary btn-danger" id="home-add-btn">＋ シフトを追加</button>
    </div>
  `;

  document.getElementById("home-add-btn").onclick = () => { state.editingShiftId = null; switchTab("add"); };
  const amountBlock = document.getElementById("home-amount-block");
  if (byWorkplace.length > 1) amountBlock.onclick = () => { showBreakdown = !showBreakdown; renderHome(); };
  document.querySelectorAll("#home-month-segment .segment-btn").forEach((btn) => {
    btn.onclick = () => { homeMonthOffset = Number(btn.dataset.offset); renderHome(); };
  });
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
      if (confirm("このシフトを削除しますか？")) {
        state.shifts = state.shifts.filter((s) => s.id !== btn.dataset.delete);
        save();
        renderHistoryList();
      }
    };
  });
}

function renderHistoryCalendar() {
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
    let totalPay = 0;
    dayShifts.forEach((s) => {
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (r) totalPay += r.pay;
    });
    const classes = ["calendar-cell"];
    if (dayShifts.length > 0) classes.push("has-shift");
    if (dateStr === todayIso) classes.push("today");
    cellsHtml += `
      <div class="${classes.join(" ")}" data-date="${dateStr}">
        <div class="cal-day-num">${day}</div>
        ${dayShifts.length > 0 ? `<div class="cal-day-pay">${yen(totalPay)}</div>` : ""}
      </div>
    `;
  }

  document.getElementById("history-calendar").innerHTML = `
    <div class="calendar-header">
      <button class="calendar-nav-btn" id="cal-prev">‹</button>
      <span class="calendar-month-label">${year}年${month + 1}月</span>
      <button class="calendar-nav-btn" id="cal-next">›</button>
    </div>
    <div class="calendar-grid">
      ${dowLabels.map((l) => `<div class="calendar-dow">${l}</div>`).join("")}
      ${cellsHtml}
    </div>
  `;

  document.getElementById("cal-prev").onclick = () => { state.calendarMonthOffset--; renderHistoryCalendar(); };
  document.getElementById("cal-next").onclick = () => { state.calendarMonthOffset++; renderHistoryCalendar(); };
  document.querySelectorAll("#history-calendar [data-date]").forEach((cell) => {
    cell.onclick = () => openDayModal(cell.dataset.date);
  });
}

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
          <span data-day-edit="${s.id}">✎</span>
          <span data-day-delete="${s.id}" style="color:#FF3B30">🗑</span>
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
      if (confirm("このシフトを削除しますか？")) {
        state.shifts = state.shifts.filter((s) => s.id !== el.dataset.dayDelete);
        save();
        renderDayModalList();
        renderHistoryCalendar();
      }
    };
  });
}

function closeDayModal() {
  state.selectedDayDate = null;
  document.getElementById("day-modal").classList.add("hidden");
}

// ---------- ADD / EDIT SHIFT ----------
function renderAddScreen() {
  const editing = state.editingShiftId ? state.shifts.find((s) => s.id === state.editingShiftId) : null;
  document.getElementById("add-title").textContent = editing ? "シフトを編集" : "シフト追加";

  // editing an existing shift is always single-mode; bulk only applies to brand-new shifts
  const fresh = state.addFresh && !editing;
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
  const date = document.getElementById("add-date").value;
  const start = document.getElementById("add-start").value;
  const end = document.getElementById("add-end").value;
  const breakMin = Number(document.getElementById("add-break").value) || 0;

  const result = computePay(wp, date, start, end, breakMin, state.holidays);
  const box = document.getElementById("add-result");
  const saveBtn = document.getElementById("add-save");

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

// ---------- WORKPLACES ----------
function renderWorkplaces() {
  const container = document.getElementById("workplace-list");
  container.innerHTML = state.workplaces.map((w) => `
    <div class="workplace-card" data-open="${w.id}">
      <div>
        <div class="workplace-name">${escapeHtml(w.name)}</div>
        <div class="workplace-meta">給料日: ${w.payday}日 ・ 締め日: ${w.closingDay}日</div>
        <div class="workplace-meta">時給ルール ${w.rates.length}件</div>
      </div>
      <div class="workplace-card-right">
        <span class="workplace-edit" data-edit-workplace="${w.id}">✎</span>
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
    const newWorkplace = { id, name: "新しい勤務先", payday: 25, closingDay: 20, rates: [] };
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
              <span class="rate-delete" data-delete-rate="${r.id}">🗑</span>
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
function openWorkplaceModal(workplace) {
  state.editingWorkplaceId = workplace.id;
  document.getElementById("wp-modal-name").value = workplace.name;
  document.getElementById("wp-modal-payday").value = workplace.payday;
  document.getElementById("wp-modal-closing").value = workplace.closingDay;
  document.getElementById("workplace-modal").classList.remove("hidden");
}

function closeWorkplaceModal() {
  state.editingWorkplaceId = null;
  document.getElementById("workplace-modal").classList.add("hidden");
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

function renderHolidayList() {
  const container = document.getElementById("holiday-list");
  if (state.holidays.length === 0) {
    container.innerHTML = `<div class="rate-empty">祝日が登録されていません</div>`;
    return;
  }
  const sorted = [...state.holidays].sort();
  container.innerHTML = sorted.map((h) => {
    const name = japanHolidayName(h);
    return `
      <div class="holiday-row">
        <span>${h}${name ? `<span class="holiday-name">${name}</span>` : ""}</span>
        <span class="holiday-delete" data-del-holiday="${h}">🗑</span>
      </div>
    `;
  }).join("");
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
            <span data-tmpl-edit="${t.id}">✎</span>
            <span data-tmpl-delete="${t.id}" style="color:#FF3B30">🗑</span>
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
      if (confirm("このテンプレートを削除しますか？")) {
        state.templates = state.templates.filter((t) => t.id !== el.dataset.tmplDelete);
        save();
        renderTemplateList();
      }
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
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
    if (!confirm(msg)) return;
    state.workplaces = state.workplaces.filter((w) => w.id !== id);
    state.shifts = state.shifts.filter((s) => s.workplaceId !== id);
    state.templates = state.templates.filter((t) => t.workplaceId !== id);
    if (state.activeWorkplaceId === id) state.activeWorkplaceId = null;
    save();
    closeWorkplaceModal();
    switchTab("workplaces");
  };
  document.getElementById("wp-modal-close").onclick = closeWorkplaceModal;
  document.getElementById("wp-modal-save").onclick = () => {
    const name = document.getElementById("wp-modal-name").value.trim();
    if (!name) { alert("勤務先名を入力してください"); return; }
    const wp = state.workplaces.find((w) => w.id === state.editingWorkplaceId);
    wp.name = name;
    wp.payday = Number(document.getElementById("wp-modal-payday").value) || wp.payday;
    wp.closingDay = Number(document.getElementById("wp-modal-closing").value) || wp.closingDay;
    save();
    closeWorkplaceModal();
    renderWorkplaces();
    if (state.tab === "rates") renderRates();
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
    if (!name) { alert("テンプレート名を入力してください"); return; }
    if (!workplaceId) { alert("勤務先を選択してください"); return; }
    const entry = { id: state.editingTemplateId || `tmpl${Date.now()}`, name, workplaceId, start, end };
    const exists = state.templates.find((t) => t.id === entry.id);
    state.templates = exists ? state.templates.map((t) => (t.id === entry.id ? entry : t)) : [...state.templates, entry];
    save();
    closeTemplateModal();
    renderTemplateList();
  };

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
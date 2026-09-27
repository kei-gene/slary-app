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
  addMode: "single", // "single" | "bulk"
  bulkWeekdays: new Set(),
  bulkExcluded: new Set(), // dates excluded from the current manual bulk preview
  templateExcluded: new Set(), // dates excluded from the current template bulk preview
  historyView: "list", // "list" | "calendar"
  calendarMonthOffset: 0, // months from the current month, shown in the calendar view
  selectedDayDate: null, // date shown in the day-detail modal
  prefillDate: null, // date to pre-fill when opening the add screen from the calendar
  weeklyTemplates: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }, // dow -> {workplaceId,start,end,breakMin} | null
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
  if (d.getDay() === 0 || holidays.includes(dateStr)) return "holiday";
  return "weekday";
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
    weeklyTemplates: state.weeklyTemplates,
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
      if (parsed.weeklyTemplates) state.weeklyTemplates = { ...state.weeklyTemplates, ...parsed.weeklyTemplates };
    }
  } catch (e) {
    console.error("読み込みエラー", e);
    state.workplaces = defaultWorkplaces();
    state.shifts = defaultShifts();
  }
}

// ---------- tab navigation ----------
function switchTab(tab) {
  state.tab = tab;
  state.editingShiftId = null;
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

function renderHome() {
  const now = new Date();
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
    <div class="home-month">${now.getFullYear()}年${now.getMonth() + 1}月</div>
    <div class="home-block-first" id="home-amount-block" style="cursor:${byWorkplace.length > 1 ? "pointer" : "default"}">
      <div class="home-amount-label">今月の予想給与</div>
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
    btn.onclick = () => { state.editingShiftId = btn.dataset.edit; switchTab("add"); };
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
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const tmpl = state.weeklyTemplates[dow];
    const wp = tmpl ? state.workplaces.find((w) => w.id === tmpl.workplaceId) : null;
    const r = tmpl && wp ? computePay(wp, dateStr, tmpl.start, tmpl.end, tmpl.breakMin, state.holidays) : null;

    container.innerHTML = `
      <div class="day-empty-note">この日のシフトはまだありません</div>
      ${tmpl && wp ? `
        <div class="tmpl-quick-card">
          <div class="tmpl-quick-label">${DOW_LABELS[dow]}曜日の初期設定</div>
          <div class="tmpl-quick-detail">${escapeHtml(wp.name)} ・ ${tmpl.start}〜${tmpl.end}${r ? ` ・ ${yen(r.pay)}` : ""}</div>
          <button class="btn-primary" id="tmpl-quick-save" style="margin-top:10px">この内容で登録</button>
        </div>
      ` : ""}
    `;

    if (tmpl && wp) {
      document.getElementById("tmpl-quick-save").onclick = () => {
        state.shifts.push({
          id: `s${Date.now()}`,
          workplaceId: tmpl.workplaceId,
          date: dateStr,
          start: tmpl.start,
          end: tmpl.end,
          breakMin: tmpl.breakMin,
        });
        save();
        renderDayModalList();
        renderHistoryCalendar();
      };
    }
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
      switchTab("add");
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
  if (editing) state.addMode = "single";
  document.getElementById("add-mode-segment").classList.toggle("hidden", !!editing);
  document.querySelectorAll("#add-mode-segment .segment-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === state.addMode);
  });
  document.getElementById("mode-single").onclick = () => { state.addMode = "single"; renderAddScreen(); };
  document.getElementById("mode-bulk").onclick = () => { state.addMode = "bulk"; renderAddScreen(); };
  document.getElementById("mode-template").onclick = () => { state.addMode = "template"; renderAddScreen(); };

  const isBulk = state.addMode === "bulk" && !editing;
  const isTemplate = state.addMode === "template" && !editing;
  document.getElementById("bulk-fields").classList.toggle("hidden", !isBulk);
  document.getElementById("single-date-row").classList.toggle("hidden", isBulk);
  document.getElementById("add-result").classList.toggle("hidden", isBulk || isTemplate);
  document.getElementById("bulk-preview").classList.toggle("hidden", !isBulk);
  document.getElementById("template-fields").classList.toggle("hidden", !isTemplate);
  document.getElementById("template-preview").classList.toggle("hidden", !isTemplate);
  document.getElementById("shared-fields").classList.toggle("hidden", isTemplate);

  const wpSelect = document.getElementById("add-workplace");
  wpSelect.innerHTML = state.workplaces.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  wpSelect.value = editing ? editing.workplaceId : (state.workplaces[0] ? state.workplaces[0].id : "");

  const dateField = document.getElementById("add-date");
  if (editing) dateField.value = editing.date;
  else if (state.prefillDate) { dateField.value = state.prefillDate; state.prefillDate = null; }
  else if (!dateField.value) dateField.value = todayStr();

  document.getElementById("add-start").value = editing ? editing.start : (document.getElementById("add-start").value || "09:00");
  document.getElementById("add-end").value = editing ? editing.end : (document.getElementById("add-end").value || "17:00");
  document.getElementById("add-break").value = editing ? editing.breakMin : (document.getElementById("add-break").value || 45);

  // bulk period defaults: today through the end of the current month
  const bulkStartEl = document.getElementById("bulk-start");
  const bulkEndEl = document.getElementById("bulk-end");
  if (!bulkStartEl.value) bulkStartEl.value = todayStr();
  if (!bulkEndEl.value) {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    bulkEndEl.value = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  }

  // template period defaults: same as bulk (today through end of month)
  const tmplStartEl = document.getElementById("tmpl-start");
  const tmplEndEl = document.getElementById("tmpl-end");
  if (!tmplStartEl.value) tmplStartEl.value = bulkStartEl.value;
  if (!tmplEndEl.value) tmplEndEl.value = bulkEndEl.value;

  document.querySelectorAll(".weekday-btn").forEach((btn) => {
    btn.classList.toggle("active", state.bulkWeekdays.has(Number(btn.dataset.dow)));
    btn.onclick = () => {
      const dow = Number(btn.dataset.dow);
      if (state.bulkWeekdays.has(dow)) state.bulkWeekdays.delete(dow);
      else state.bulkWeekdays.add(dow);
      btn.classList.toggle("active");
      renderBulkPreview();
    };
  });

  const recompute = () => {
    if (isBulk) renderBulkPreview();
    else if (isTemplate) renderTemplatePreview();
    else updateAddResult();
  };
  [wpSelect, dateField, document.getElementById("add-start"), document.getElementById("add-end"),
   document.getElementById("add-break"), bulkStartEl, bulkEndEl, tmplStartEl, tmplEndEl].forEach((el) => { el.oninput = recompute; });

  recompute();

  document.getElementById("add-cancel").onclick = () => { state.editingShiftId = null; switchTab("home"); };

  document.getElementById("add-save").onclick = () => {
    if (isBulk) { saveBulkShifts(); return; }
    if (isTemplate) { saveTemplateShifts(); return; }
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
    box.innerHTML = `出勤・退勤時間を入力してください`;
    saveBtn.disabled = true;
  }
}

// ---------- BULK ADD ----------
function computeBulkDates(startStr, endStr, weekdaySet) {
  const dates = [];
  if (!startStr || !endStr || weekdaySet.size === 0) return dates;
  let cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  let guard = 0;
  while (cur <= end && guard < 366) {
    if (weekdaySet.has(cur.getDay())) {
      dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    }
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return dates;
}

function renderBulkPreview() {
  const wp = state.workplaces.find((w) => w.id === document.getElementById("add-workplace").value);
  const startStr = document.getElementById("bulk-start").value;
  const endStr = document.getElementById("bulk-end").value;
  const startTime = document.getElementById("add-start").value;
  const endTime = document.getElementById("add-end").value;
  const breakMin = Number(document.getElementById("add-break").value) || 0;
  const container = document.getElementById("bulk-preview");
  const saveBtn = document.getElementById("add-save");

  const dates = computeBulkDates(startStr, endStr, state.bulkWeekdays);
  // drop exclusions for dates no longer in range
  state.bulkExcluded = new Set([...state.bulkExcluded].filter((d) => dates.includes(d)));

  if (dates.length === 0) {
    container.innerHTML = `<div class="bulk-preview-summary">期間と曜日を選択してください</div>`;
    saveBtn.disabled = true;
    return;
  }

  const existingSet = new Set(state.shifts.filter((s) => s.workplaceId === wp?.id).map((s) => s.date));
  let willAddCount = 0;

  const rowsHtml = dates.map((d) => {
    const conflict = existingSet.has(d);
    const excluded = state.bulkExcluded.has(d);
    const skip = conflict || excluded;
    if (!skip) willAddCount++;
    const r = !skip ? computePay(wp, d, startTime, endTime, breakMin, state.holidays) : null;
    return `
      <div class="bulk-preview-row ${skip ? "skip" : ""}" data-toggle-date="${d}">
        <span>${fmtDate(d)}${conflict ? "（既に登録あり）" : ""}</span>
        <span class="bulk-preview-toggle">${r ? yen(r.pay) : ""} ${conflict ? "" : (excluded ? "追加しない" : "追加する")}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="bulk-preview-summary">${willAddCount}件のシフトを追加します（タップで個別に外せます）</div>
    <div class="card">${rowsHtml}</div>
  `;

  container.querySelectorAll("[data-toggle-date]").forEach((row) => {
    const d = row.dataset.toggleDate;
    if (existingSet.has(d)) return; // conflicts can't be toggled back on
    row.onclick = () => {
      if (state.bulkExcluded.has(d)) state.bulkExcluded.delete(d);
      else state.bulkExcluded.add(d);
      renderBulkPreview();
    };
  });

  saveBtn.disabled = willAddCount === 0;
}

function saveBulkShifts() {
  const workplaceId = document.getElementById("add-workplace").value;
  const wp = state.workplaces.find((w) => w.id === workplaceId);
  const startStr = document.getElementById("bulk-start").value;
  const endStr = document.getElementById("bulk-end").value;
  const startTime = document.getElementById("add-start").value;
  const endTime = document.getElementById("add-end").value;
  const breakMin = Number(document.getElementById("add-break").value) || 0;

  const dates = computeBulkDates(startStr, endStr, state.bulkWeekdays);
  const existingSet = new Set(state.shifts.filter((s) => s.workplaceId === wp?.id).map((s) => s.date));
  const toAdd = dates.filter((d) => !existingSet.has(d) && !state.bulkExcluded.has(d));

  if (toAdd.length === 0) return;

  toAdd.forEach((d, i) => {
    state.shifts.push({
      id: `s${Date.now()}_${i}`,
      workplaceId,
      date: d,
      start: startTime,
      end: endTime,
      breakMin,
    });
  });
  save();

  state.bulkExcluded = new Set();
  state.bulkWeekdays = new Set();
  alert(`${toAdd.length}件のシフトを追加しました`);
  switchTab("home");
}

// ---------- TEMPLATE-BASED BULK REGISTRATION ----------
function computeTemplateEntries(startStr, endStr) {
  const entries = [];
  if (!startStr || !endStr) return entries;
  let cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  let guard = 0;
  while (cur <= end && guard < 366) {
    const dow = cur.getDay();
    const tmpl = state.weeklyTemplates[dow];
    if (tmpl) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      entries.push({ date: dateStr, ...tmpl });
    }
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return entries;
}

function renderTemplatePreview() {
  const startStr = document.getElementById("tmpl-start").value;
  const endStr = document.getElementById("tmpl-end").value;
  const container = document.getElementById("template-preview");
  const saveBtn = document.getElementById("add-save");

  const hasAnyTemplate = Object.values(state.weeklyTemplates).some((t) => !!t);
  if (!hasAnyTemplate) {
    container.innerHTML = `<div class="bulk-preview-summary">「設定」で曜日ごとの初期設定を先に登録してください</div>`;
    saveBtn.disabled = true;
    return;
  }

  const entries = computeTemplateEntries(startStr, endStr);
  state.templateExcluded = new Set([...state.templateExcluded].filter((d) => entries.some((e) => e.date === d)));

  if (entries.length === 0) {
    container.innerHTML = `<div class="bulk-preview-summary">期間内に初期設定のある曜日がありません</div>`;
    saveBtn.disabled = true;
    return;
  }

  let willAddCount = 0;
  const rowsHtml = entries.map((e) => {
    const wp = state.workplaces.find((w) => w.id === e.workplaceId);
    const conflict = state.shifts.some((s) => s.workplaceId === e.workplaceId && s.date === e.date);
    const excluded = state.templateExcluded.has(e.date);
    const skip = conflict || excluded;
    if (!skip) willAddCount++;
    const r = !skip && wp ? computePay(wp, e.date, e.start, e.end, e.breakMin, state.holidays) : null;
    return `
      <div class="bulk-preview-row ${skip ? "skip" : ""}" data-tmpl-toggle="${e.date}">
        <span>${fmtDate(e.date)} ${wp ? escapeHtml(wp.name) : ""}${conflict ? "（既に登録あり）" : ""}</span>
        <span class="bulk-preview-toggle">${r ? yen(r.pay) : ""} ${conflict ? "" : (excluded ? "追加しない" : "追加する")}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="bulk-preview-summary">${willAddCount}件のシフトを追加します（タップで個別に外せます）</div>
    <div class="card">${rowsHtml}</div>
  `;

  container.querySelectorAll("[data-tmpl-toggle]").forEach((row) => {
    const d = row.dataset.tmplToggle;
    const entry = entries.find((e) => e.date === d);
    const conflict = state.shifts.some((s) => s.workplaceId === entry.workplaceId && s.date === d);
    if (conflict) return;
    row.onclick = () => {
      if (state.templateExcluded.has(d)) state.templateExcluded.delete(d);
      else state.templateExcluded.add(d);
      renderTemplatePreview();
    };
  });

  saveBtn.disabled = willAddCount === 0;
}

function saveTemplateShifts() {
  const startStr = document.getElementById("tmpl-start").value;
  const endStr = document.getElementById("tmpl-end").value;
  const entries = computeTemplateEntries(startStr, endStr);

  const toAdd = entries.filter((e) => {
    const conflict = state.shifts.some((s) => s.workplaceId === e.workplaceId && s.date === e.date);
    return !conflict && !state.templateExcluded.has(e.date);
  });

  if (toAdd.length === 0) return;

  toAdd.forEach((e, i) => {
    state.shifts.push({
      id: `s${Date.now()}_${i}`,
      workplaceId: e.workplaceId,
      date: e.date,
      start: e.start,
      end: e.end,
      breakMin: e.breakMin,
    });
  });
  save();

  state.templateExcluded = new Set();
  alert(`${toAdd.length}件のシフトを追加しました`);
  switchTab("home");
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
  const groups = [{ key: "weekday", label: "月〜土" }, { key: "holiday", label: "日曜・祝日" }];

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
  renderWeeklyTemplates();
}

function renderHolidayList() {
  const container = document.getElementById("holiday-list");
  if (state.holidays.length === 0) {
    container.innerHTML = `<div class="rate-empty">祝日が登録されていません</div>`;
    return;
  }
  container.innerHTML = state.holidays.map((h) => `
    <div class="holiday-row">
      <span>${h}</span>
      <span class="holiday-delete" data-del-holiday="${h}">🗑</span>
    </div>
  `).join("");
  container.querySelectorAll("[data-del-holiday]").forEach((el) => {
    el.onclick = () => {
      state.holidays = state.holidays.filter((h) => h !== el.dataset.delHoliday);
      save();
      renderHolidayList();
    };
  });
}

// ---------- WEEKLY DEFAULT TEMPLATES ----------
const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function renderWeeklyTemplates() {
  const container = document.getElementById("weekly-template-list");
  container.innerHTML = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
    const t = state.weeklyTemplates[dow];
    const on = !!t;
    const wp = on ? state.workplaces.find((w) => w.id === t.workplaceId) : null;
    return `
      <div class="wt-row" data-dow="${dow}">
        <div class="wt-head">
          <div>
            <div class="wt-day-label">${DOW_LABELS[dow]}曜日</div>
            <div class="wt-summary">${on ? `${wp ? escapeHtml(wp.name) : "―"} ・ ${t.start}〜${t.end}` : "設定なし"}</div>
          </div>
          <button class="wt-toggle ${on ? "on" : ""}" data-wt-toggle="${dow}"></button>
        </div>
        <div class="wt-detail ${on ? "" : "hidden"}" data-wt-detail="${dow}">
          <div class="wt-detail-row">
            <label>勤務先</label>
            <select data-wt-field="workplaceId" data-dow="${dow}">
              ${state.workplaces.map((w) => `<option value="${w.id}" ${on && t.workplaceId === w.id ? "selected" : ""}>${escapeHtml(w.name)}</option>`).join("")}
            </select>
          </div>
          <div class="wt-detail-row">
            <label>出勤</label>
            <input type="time" data-wt-field="start" data-dow="${dow}" value="${on ? t.start : "09:00"}">
          </div>
          <div class="wt-detail-row">
            <label>退勤</label>
            <input type="time" data-wt-field="end" data-dow="${dow}" value="${on ? t.end : "17:00"}">
          </div>
          <div class="wt-detail-row">
            <label>休憩(分)</label>
            <input type="number" min="0" step="5" data-wt-field="breakMin" data-dow="${dow}" value="${on ? t.breakMin : 45}">
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-wt-toggle]").forEach((btn) => {
    btn.onclick = () => {
      const dow = Number(btn.dataset.wtToggle);
      if (state.weeklyTemplates[dow]) {
        state.weeklyTemplates[dow] = null;
      } else {
        state.weeklyTemplates[dow] = {
          workplaceId: state.workplaces[0] ? state.workplaces[0].id : "",
          start: "09:00",
          end: "17:00",
          breakMin: 45,
        };
      }
      save();
      renderWeeklyTemplates();
    };
  });

  container.querySelectorAll("[data-wt-field]").forEach((el) => {
    el.onchange = () => {
      const dow = Number(el.dataset.dow);
      const field = el.dataset.wtField;
      if (!state.weeklyTemplates[dow]) return;
      state.weeklyTemplates[dow][field] = field === "breakMin" ? (Number(el.value) || 0) : el.value;
      save();
      renderWeeklyTemplates();
    };
  });
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

  switchTab("home");
}

document.addEventListener("DOMContentLoaded", init);
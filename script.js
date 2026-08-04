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
  localStorage.setItem(LS_SETTINGS, JSON.stringify({ monthlyGoal: state.monthlyGoal, holidays: state.holidays }));
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
        renderHistory();
      }
    };
  });
}

// ---------- ADD / EDIT SHIFT ----------
function renderAddScreen() {
  const editing = state.editingShiftId ? state.shifts.find((s) => s.id === state.editingShiftId) : null;
  document.getElementById("add-title").textContent = editing ? "シフトを編集" : "シフト追加";

  const wpSelect = document.getElementById("add-workplace");
  wpSelect.innerHTML = state.workplaces.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  wpSelect.value = editing ? editing.workplaceId : (state.workplaces[0] ? state.workplaces[0].id : "");

  document.getElementById("add-date").value = editing ? editing.date : todayStr();
  document.getElementById("add-start").value = editing ? editing.start : "09:00";
  document.getElementById("add-end").value = editing ? editing.end : "17:00";
  document.getElementById("add-break").value = editing ? editing.breakMin : 45;

  updateAddResult();

  document.getElementById("add-cancel").onclick = () => { state.editingShiftId = null; switchTab("home"); };
  [wpSelect, document.getElementById("add-date"), document.getElementById("add-start"),
   document.getElementById("add-end"), document.getElementById("add-break")].forEach((el) => {
    el.oninput = updateAddResult;
  });

  document.getElementById("add-save").onclick = () => {
    const shift = {
      id: editing ? editing.id : `s${Date.now()}`,
      workplaceId: wpSelect.value,
      date: document.getElementById("add-date").value,
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
      <div class="chevron">›</div>
    </div>
  `).join("");

  container.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = () => { state.activeWorkplaceId = el.dataset.open; switchTab("rates"); };
  });

  document.getElementById("workplace-add-btn").onclick = () => {
    const id = `w${Date.now()}`;
    state.workplaces.push({ id, name: "新しい勤務先", payday: 25, closingDay: 20, rates: [] });
    save();
    state.activeWorkplaceId = id;
    switchTab("rates");
  };
}

// ---------- RATE RULES ----------
function renderRates() {
  const wp = state.workplaces.find((w) => w.id === state.activeWorkplaceId);
  if (!wp) { switchTab("workplaces"); return; }

  document.getElementById("rates-title").textContent = `${wp.name} の時給ルール`;
  document.getElementById("rates-back").onclick = () => switchTab("workplaces");

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

  switchTab("home");
}

document.addEventListener("DOMContentLoaded", init);
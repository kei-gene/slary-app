// ==========================================================
// ホーム画面(home.js)
//
// ・「今月の稼ぎ」カード: 金額 + 勤務時間・日数 + 目標バー(今の稼ぎ / 目標)
// ・「次の給料日」と「年収の壁」: 小さな2つのタイル
//     給料日タイル → タップで、対象期間・ほかの勤務先を開く
//     年収の壁タイル → タップで、年収の壁タブへ
// ・下にカレンダー
//
// 読み込み順: script.js の後(wall.js より前でも後でも動きます)
// ==========================================================

let hmBreakdown = false;  // 勤務先ごとの内訳を開いているか
let hmPayoutOpen = false; // 給料日の詳細(ほかの勤務先・対象期間)を開いているか

// ---------- 今月(or 来月)の集計 ----------
function hmMonthSummary(offset) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const mKey = monthKey(base);
  const shifts = state.shifts.filter((s) => monthKey(new Date(s.date + "T00:00:00")) === mKey);

  let pay = 0, minutes = 0, earned = 0; // earned = 今日までに働いた分(予定は含まない)
  const today = todayStr();
  const days = new Set();
  const perWp = {};
  shifts.forEach((s) => {
    const wp = state.workplaces.find((w) => w.id === s.workplaceId);
    const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
    if (!r) return;
    pay += r.pay;
    if (s.date <= today) earned += r.pay;
    minutes += r.workedMinutes;
    days.add(s.date); // 同じ日に2件あっても1日と数える
    perWp[s.workplaceId] = (perWp[s.workplaceId] || 0) + r.pay;
  });
  const byWorkplace = state.workplaces
    .map((w) => ({ name: w.name, pay: perWp[w.id] || 0 }))
    .filter((w) => w.pay > 0);
  return { base, pay, earned, minutes, days: days.size, byWorkplace };
}

// ---------- 次の給料日(勤務先ごと) ----------
// 先頭 = 「金額が0円ではない中で、いちばん近い給料日」(全部0円なら、いちばん近い給料日)
function hmPayoutList() {
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

// ---------- 部品 ----------
// 目標: バー + 「今の稼ぎ / 目標」。0円に設定されているときは出さない
function hmGoalHtml(sum, showEarned) {
  const goal = state.monthlyGoal;
  const earnedText = yen(showEarned ? sum.earned : sum.pay);
  if (!(goal > 0)) {
    return showEarned ? `<div class="hc-goal hc-nogoal"><div class="hc-gt"><span>今の稼ぎ <b>${earnedText}</b></span></div></div>` : "";
  }
  // 達成の判定: 今月は「今日までに働いた分」、来月は「予定どおりに働いた場合」
  const basis = homeMonthOffset === 0 ? sum.earned : sum.pay;
  const done = basis >= goal;
  const pct = Math.min(basis / goal, 1) * 100;
  const left = done ? "🎉 目標達成" : (homeMonthOffset === 1 ? "予定" : "今の稼ぎ");
  return `
    <div class="hc-goal${done ? " hc-done" : ""}">
      <div class="hc-bar"><i style="width:${pct}%"></i></div>
      <div class="hc-gt"><span>${left} <b>${earnedText}</b></span><span>目標 <b>${yen(goal)}</b></span></div>
    </div>`;
}

// 次の給料日タイル(+ 開いたときの詳細カード)
function hmPayoutHtml(list) {
  if (list.length === 0) return "";
  const first = list[0];
  const rest = list.length - 1;
  const tile = `
    <button type="button" class="hc-tile hc-pay${hmPayoutOpen ? " is-open" : ""}" id="hm-payout-tile">
      <small>次の給料日${rest > 0 && !hmPayoutOpen ? `<em>ほか${rest}件</em>` : ""}</small>
      <b class="hc-d">${fmtDateObj(first.payout.payday)}</b>
      <span class="hc-s">${escapeHtml(first.wp.name)} ${yen(first.amount)}</span>
    </button>`;
  if (!hmPayoutOpen) return tile;
  const rows = list.map((x) => `
    <div class="hm-po">
      <div class="hm-payout-row">
        <div class="hm-payout-l">
          <div class="hm-payout-date">${fmtDateObj(x.payout.payday)}</div>
          <div class="hm-payout-wp">${escapeHtml(x.wp.name)}</div>
        </div>
        <div class="hm-payout-amt">${yenBig(x.amount)}</div>
      </div>
      <div class="hm-payout-period">対象期間: ${fmtDateObj(x.payout.periodStart)}〜${fmtDateObj(x.payout.periodEnd)}</div>
    </div>`).join("");
  return tile + `
    <div class="hm-payout hc-detail">
      <div class="hm-payout-head"><span>次の給料日</span><button type="button" class="hm-toggle" id="hm-payout-toggle">閉じる ▴</button></div>
      ${rows}
    </div>`;
}

// 年収の壁タイル(wall.js が用意した情報を使う)
function hmWallHtml() {
  const info = typeof window.wallHomeInfo === "function" ? window.wallHomeInfo() : null;
  if (!info) return "";
  return `
    <button type="button" class="hc-tile hc-wall hc-wall-${info.st}" id="hm-wall-tile">
      <small>年収の壁</small>
      <b class="hc-big${info.st === "over" ? " hc-small-text" : ""}">${escapeHtml(info.main)}</b>
      <span class="hc-s">${escapeHtml(info.name)}</span>
      <div class="hc-wbar"><i style="width:${Math.min(100, info.pct)}%"></i></div>
    </button>`;
}

// ---------- ホーム全体 ----------
function renderHome() {
  const container = document.getElementById("home-content");
  if (!container) return;

  const sum = hmMonthSummary(homeMonthOffset);
  const label = homeMonthOffset === 0 ? "今月" : "来月";
  const hasMultiWp = sum.byWorkplace.length > 1;

  // まだ働いていない予定のシフトが含まれるときだけ「予定込み」の印と、「今日まで」の金額を出す
  const ym = `${sum.base.getFullYear()}-${String(sum.base.getMonth() + 1).padStart(2, "0")}`;
  const hasFuture = state.shifts.some((x) => x.date.startsWith(ym) && x.date > todayStr());
  const showEarned = homeMonthOffset === 0 && hasFuture;

  const breakdownHtml = hmBreakdown && hasMultiWp
    ? `<div class="hm-breakdown">${sum.byWorkplace.map((w) =>
        `<div class="hm-bd-row"><span>${escapeHtml(w.name)}</span><span>${yen(w.pay)}</span></div>`).join("")}</div>`
    : "";
  const emptyHtml = state.workplaces.length === 0
    ? `<div class="hm-empty">勤務先を登録すると、ここに給与が表示されます。<button type="button" class="hm-empty-btn" id="hm-empty-btn">勤務先を追加する</button></div>`
    : "";
  const tiles = hmPayoutHtml(hmPayoutList()) + hmWallHtml();
  const oneTile = (tiles.match(/class="hc-tile /g) || []).length === 1 && !hmPayoutOpen;

  container.innerHTML = `
    <div class="home-month-row">
      <div class="home-month">${sum.base.getFullYear()}年${sum.base.getMonth() + 1}月</div>
      <div class="segment month-segment" id="home-month-segment">
        <button class="segment-btn ${homeMonthOffset === 0 ? "active" : ""}" data-offset="0">今月</button>
        <button class="segment-btn ${homeMonthOffset === 1 ? "active" : ""}" data-offset="1">来月</button>
      </div>
    </div>
    <div class="hm-main">
      <div class="hm-card hc-card">
        <div class="hm-label">${label}の稼ぎ${hasFuture ? `<span class="hm-tag">予定込み</span>` : ""}</div>
        <div class="hc-row">
          <div class="hm-amount">${yenBig(sum.pay)}</div>
          <div class="hc-ht"><div>${numUnit((sum.minutes / 60).toFixed(1), "時間")}</div><div>${numUnit(sum.days, "日")}</div></div>
        </div>
        ${hasMultiWp ? `<button type="button" class="hc-bd" id="hm-bd-toggle">内訳${hmBreakdown ? "を閉じる" : ""}</button>` : ""}
        ${breakdownHtml}
        ${hmGoalHtml(sum, showEarned)}
        ${emptyHtml}
      </div>
    </div>
    <div class="hm-side" id="hm-side">${tiles ? `<div class="hc-tiles${oneTile ? " hc-one" : ""}">${tiles}</div>` : ""}</div>
  `;

  document.querySelectorAll("#home-month-segment .segment-btn").forEach((btn) => {
    btn.onclick = () => {
      homeMonthOffset = Number(btn.dataset.offset);
      state.calendarMonthOffset = homeMonthOffset;
      renderHome();
    };
  });
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on("hm-bd-toggle", () => { hmBreakdown = !hmBreakdown; renderHome(); });
  on("hm-payout-tile", () => { hmPayoutOpen = !hmPayoutOpen; renderHome(); });
  on("hm-payout-toggle", () => { hmPayoutOpen = !hmPayoutOpen; renderHome(); });
  on("hm-wall-tile", () => switchTab("wall"));
  on("hm-empty-btn", () => switchTab("workplaces"));

  renderAllCalendars();
}
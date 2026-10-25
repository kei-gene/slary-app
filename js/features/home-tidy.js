// ==========================================================
// ホームの整理(home-tidy.js)
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
          <div class="hm-payout-amt">${yenBig(x.amount)}</div>
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
          <div class="hm-amount">${yenBig(sum.pay)}</div>
          <div class="hm-meta">${numUnit((sum.minutes / 60).toFixed(1), "時間")} ・ ${numUnit(sum.days, "日")}${hasMultiWp ? ` ・ <button type="button" class="hm-toggle hm-toggle-inline" id="hm-bd-toggle">内訳${hmBreakdown ? "を閉じる" : ""}</button>` : ""}</div>
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
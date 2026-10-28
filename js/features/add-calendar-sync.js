// ==========================================================
// シフト追加のカレンダーを、ホームのカレンダーと連動させる
//   (js/features/add-calendar-sync.js)
//
// ・登録済みのシフトの「金額」と「勤務時間」を、追加画面のカレンダーにも表示
//   → どの日にもう入っているかを見ながら、追加する日を選べる
// ・表示する月を、ホーム/履歴のカレンダーと共通にする
//   (ホームで見ていた月が、追加画面でも最初に開く。追加画面で月を動かすと、ホームも同じ月になる)
// ・ホームの日付→「この日にシフトを追加」から来たときは、その日があらかじめ選ばれる
// ・script.js は書き換えず、上から包んで変更しています
// ==========================================================
(function () {
  let syncPending = false; // 追加画面を開いた直後だけ、表示月をホームに合わせる

  // ---------- 登録済みシフトを、カレンダーのマスに表示 ----------
  function decorate() {
    const box = document.getElementById("multi-calendar");
    if (!box) return;
    const byDate = {};
    state.shifts.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });

    box.querySelectorAll("[data-date]").forEach((cell) => {
      const list = byDate[cell.dataset.date];
      if (!list) return;
      let pay = 0, minutes = 0;
      list.forEach((s) => {
        const wp = state.workplaces.find((w) => w.id === s.workplaceId);
        const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
        if (r) { pay += r.pay; minutes += r.workedMinutes; }
      });
      const payEl = cell.querySelector(".cal-day-pay");
      const hourEl = cell.querySelector(".cal-day-hours");
      if (payEl) payEl.textContent = yen(pay);
      if (hourEl) hourEl.textContent = (minutes / 60).toFixed(1) + "h";
      cell.classList.add("has-shift");
    });
  }

  const basePicker = renderMultiDatePicker;
  renderMultiDatePicker = function () {
    if (syncPending) { multiCalendarOffset = state.calendarMonthOffset; syncPending = false; }
    basePicker();
    decorate();
    state.calendarMonthOffset = multiCalendarOffset; // 追加画面で動かした月を、ホームにも反映
  };

  // ---------- 追加画面を開いたとき ----------
  const baseRenderAddScreen = renderAddScreen;
  renderAddScreen = function () {
    const fresh = state.addFresh && !state.editingShiftId;
    const pre = state.prefillDate; // 元の処理が消す前に控えておく
    if (fresh) syncPending = true;
    baseRenderAddScreen();
    syncPending = false;

    if (fresh && pre && /^\d{4}-\d{2}-\d{2}$/.test(pre)) {
      const now = new Date();
      const y = Number(pre.slice(0, 4)), m = Number(pre.slice(5, 7));
      multiCalendarOffset = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
      state.multiDates = new Set([pre]);
      renderMultiDatePicker();
      updateAddResult();
    }
  };
})();
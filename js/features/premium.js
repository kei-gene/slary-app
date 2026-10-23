// ==========================================================
// 割増計算(深夜・残業)
//
// ・勤務先ごとに「深夜割増」「残業割増」をON/OFFできます(初期はOFF)
// ・深夜割増: 22:00〜翌5:00の時間に、時給の25%を上乗せ
// ・残業割増: 1日の実働が8時間を超えた分に、時給の25%を上乗せ
// ・両方にあてはまる時間は、合計50%の上乗せになります
// ・既存のコード(computePay など)は書き換えず、上から包んで拡張しています
// ==========================================================
(function () {
  const NIGHT_FROM = 22 * 60; // 22:00
  const NIGHT_TO = 5 * 60;    // 5:00
  const NIGHT_RATE = 0.25;
  const OVERTIME_RATE = 0.25;
  const OVERTIME_AFTER = 8 * 60; // 1日8時間

  function isNightMinute(t) {
    const m = ((t % 1440) + 1440) % 1440;
    return m >= NIGHT_FROM || m < NIGHT_TO;
  }

  // ---------- 計算の拡張 ----------
  const baseComputePay = computePay;

  computePay = function (workplace, dateStr, startStr, endStr, breakMin, holidays) {
    const r = baseComputePay(workplace, dateStr, startStr, endStr, breakMin, holidays);
    if (!r) return r;
    r.premiumPay = 0; r.nightPay = 0; r.overtimePay = 0; r.nightMinutes = 0; r.overtimeMinutes = 0;

    const opt = (workplace && workplace.premium) || {};
    if (!opt.night && !opt.overtime) return r;

    const start = toMin(startStr);
    let end = toMin(endStr);
    if (end <= start) end += 1440;
    const total = end - start;
    const f = r.workedMinutes / total; // 休憩を引いたあとの割合(休憩は全体に按分する既存の考え方に合わせる)
    if (!(f > 0)) return r;

    const dayType = getDayType(dateStr, holidays);
    const windows = (workplace.rates || [])
      .filter((x) => x.dayType === dayType)
      .map((x) => {
        const rs = toMin(x.start);
        let re = toMin(x.end);
        if (re <= rs) re += 1440;
        return { rs, re, wage: x.wage };
      });

    let nightPay = 0, overtimePay = 0, nightMin = 0, overtimeMin = 0;
    for (let t = start; t < end; t++) {
      const win = windows.find((w) => t >= w.rs && t < w.re);
      if (!win) continue; // 時給ルールがない時間は割増も計算しない
      const perMin = win.wage / 60;
      if (opt.night && isNightMinute(t)) {
        nightPay += perMin * f * NIGHT_RATE;
        nightMin += f;
      }
      if (opt.overtime) {
        const before = (t - start) * f;      // この1分の前までの実働
        const after = before + f;            // この1分のあとまでの実働
        const ot = Math.max(0, after - Math.max(before, OVERTIME_AFTER));
        if (ot > 0) { overtimePay += perMin * ot * OVERTIME_RATE; overtimeMin += ot; }
      }
    }

    r.nightPay = nightPay;
    r.overtimePay = overtimePay;
    r.premiumPay = nightPay + overtimePay;
    r.nightMinutes = Math.round(nightMin);
    r.overtimeMinutes = Math.round(overtimeMin);
    r.pay += r.premiumPay;
    return r;
  };

  if (typeof document === "undefined") return; // テスト用(ブラウザ以外では画面の処理をしない)

  // ---------- 勤務先の編集画面に、ON/OFFスイッチを追加 ----------
  let currentWpId = null;

  function injectToggles() {
    const saveBtn = document.getElementById("wp-modal-save");
    if (!saveBtn || document.getElementById("wp-premium-block")) return;
    const block = document.createElement("div");
    block.id = "wp-premium-block";
    block.innerHTML = `
      <div class="section-label small">割増賃金(自動で上乗せ)</div>
      <label class="prem-row"><input type="checkbox" id="wp-prem-night"><span>深夜割増(22時〜翌5時 +25%)</span></label>
      <label class="prem-row"><input type="checkbox" id="wp-prem-ot"><span>残業割増(1日8時間超 +25%)</span></label>
      <div class="prem-hint">時給ルールに割増分をすでに含めている場合は、OFFのままにしてください。</div>
    `;
    saveBtn.parentNode.insertBefore(block, saveBtn);
  }

  const baseOpenWorkplaceModal = openWorkplaceModal;
  openWorkplaceModal = function (workplace) {
    baseOpenWorkplaceModal(workplace);
    currentWpId = workplace.id;
    const p = workplace.premium || {};
    document.getElementById("wp-prem-night").checked = !!p.night;
    document.getElementById("wp-prem-ot").checked = !!p.overtime;
  };

  // ---------- シフト追加画面: 割増分の内訳を表示 ----------
  const baseUpdateAddResult = updateAddResult;
  updateAddResult = function () {
    baseUpdateAddResult();
    try {
      const box = document.getElementById("add-result");
      if (!box || !box.classList.contains("has-value")) return;
      let date = null;
      if (isAddMultiMode()) {
        const ds = [...state.multiDates];
        if (ds.length === 1) date = ds[0];
      } else {
        date = document.getElementById("add-date").value;
      }
      if (!date) return;
      const wp = state.workplaces.find((w) => w.id === document.getElementById("add-workplace").value);
      const r = computePay(
        wp, date,
        document.getElementById("add-start").value,
        document.getElementById("add-end").value,
        Number(document.getElementById("add-break").value) || 0,
        state.holidays
      );
      if (r && r.premiumPay > 0) {
        const parts = [];
        if (r.nightPay > 0) parts.push(`深夜 ${yen(r.nightPay)}`);
        if (r.overtimePay > 0) parts.push(`残業 ${yen(r.overtimePay)}`);
        box.insertAdjacentHTML("beforeend",
          `<div class="result-premium">うち割増分 +${yen(r.premiumPay)}(${parts.join(" / ")})</div>`);
      }
    } catch (e) { /* 表示だけの補助なので、失敗しても無視 */ }
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectToggles();
    const saveBtn = document.getElementById("wp-modal-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const wp = state.workplaces.find((w) => w.id === currentWpId);
        if (!wp) return;
        wp.premium = {
          night: document.getElementById("wp-prem-night").checked,
          overtime: document.getElementById("wp-prem-ot").checked,
        };
        save();
        renderCurrentScreen();
      });
    }
  });
})();
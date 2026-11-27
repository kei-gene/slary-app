// ==========================================================
// 勤務先まわり(workplaces.js)
//
//  1. 割増(深夜・残業)の計算と、勤務先の編集画面のスイッチ   … 元 premium.js
//  2. 時給の履歴(「○月から時給が変わる」)               … 元 rate-history.js
//  3. 勤務先タブ: スライドで削除 / 開いた画面 / 下から出る確認  … 元 workplace-detail.js
//
// 読み込み順が大事です(computePay を 1 → 2 の順に包んでいます)。
// ==========================================================

// ==========================================================
// 【1. 割増の計算】(深夜・残業)
// ==========================================================
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
// ==========================================================
// 【2. 時給の履歴】
// ==========================================================
// ==========================================================
// 時給の履歴(昇給に対応)  (js/features/rate-history.js)
//
// 【なにが変わる?】
//   これまで: 時給ルールを変えると、過去のシフトの金額まで全部変わってしまった
//   これから: 「昇給を登録」すると、指定した日から新しい時給になり、過去の金額は変わらない
//
// 【しくみ】
//   ・勤務先のデータに、昔の時給ルールを残す(rateHistory)
//   ・シフトの日付に合ったルールで、給料を計算する
//   ・今の時給ルール(rates)は、これまでどおり画面から編集できる(「今」のルールを直す)
//   ・昇給を一度も登録していない勤務先は、今までと完全に同じ動き
// ・script.js は書き換えず、上から包んで変更しています(premium.js より後に読み込むこと)
// ==========================================================
(function () {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const dateLabel = (d) => (d ? d.replace(/-/g, "/") : "最初から");

  // ---------- ルールの一覧(古い順): 昔のルール + 今のルール ----------
  function setsOf(wp) {
    const list = (Array.isArray(wp.rateHistory) ? wp.rateHistory : []).map((h) => ({ from: h.from || "", rates: Array.isArray(h.rates) ? h.rates : [] }));
    list.push({ from: wp.ratesFrom || "", rates: wp.rates || [] });
    list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    return list;
  }
  // この日に使うルール
  function ratesFor(wp, dateStr) {
    const sets = setsOf(wp);
    let pick = sets[0];
    for (const s of sets) if (s.from <= dateStr) pick = s;
    return pick.rates;
  }

  // ---------- 計算: シフトの日付に合ったルールを使う ----------
  const baseComputePay = computePay;
  computePay = function (workplace, dateStr, ...rest) {
    if (workplace && dateStr && Array.isArray(workplace.rateHistory) && workplace.rateHistory.length > 0) {
      const r = ratesFor(workplace, dateStr);
      if (r !== workplace.rates) workplace = Object.assign({}, workplace, { rates: r });
    }
    return baseComputePay(workplace, dateStr, ...rest);
  };

  if (typeof document === "undefined") return; // テスト用(ブラウザ以外では画面の処理をしない)

  // ---------- 昇給の登録 / 取り消し ----------
  function applyChange(wp, date, delta) {
    const old = JSON.parse(JSON.stringify(wp.rates || []));
    wp.rateHistory = (wp.rateHistory || []).concat([{ from: wp.ratesFrom || "", rates: old }]);
    const stamp = Date.now();
    wp.rates = old.map((r, i) => ({ ...r, id: `r${stamp}_${i}`, wage: r.wage + delta }));
    wp.ratesFrom = date;
    save();
  }
  function undoLast(wp) {
    const h = wp.rateHistory || [];
    const last = h.pop();
    if (!last) return;
    wp.rates = last.rates;
    wp.ratesFrom = last.from || "";
    if (h.length === 0) { delete wp.rateHistory; if (!wp.ratesFrom) delete wp.ratesFrom; }
    save();
  }

  function wageRange(rates) {
    const w = (rates || []).map((r) => r.wage);
    if (w.length === 0) return "未設定";
    const lo = Math.min(...w), hi = Math.max(...w);
    return lo === hi ? yen(lo) : `${yen(lo)}〜${yen(hi)}`;
  }

  // ---------- 勤務先の「時給ルール」画面に、履歴を追加 ----------
  function decorate() {
    const wp = state.workplaces.find((w) => w.id === state.activeWorkplaceId);
    const host = document.getElementById("rates-content");
    if (!wp || !host) return;
    const old = document.getElementById("rh-section");
    if (old) old.remove();

    const sets = setsOf(wp); // 古い順
    const rows = sets.slice().reverse().map((s, i, arr) => {
      const isNow = i === 0;
      const next = arr[i - 1]; // 一つ新しいルール
      return `<div class="rh-row${isNow ? " rh-now" : ""}">
        <div class="rh-l">
          <div class="rh-from">${dateLabel(s.from)}${s.from ? "〜" : ""}${isNow ? '<span class="rh-tag">いま</span>' : ""}</div>
          ${!isNow && next ? `<div class="rh-sub">${dateLabel(next.from)}の前日まで</div>` : ""}
        </div>
        <div class="rh-wage">${wageRange(s.rates)}</div>
      </div>`;
    }).join("");

    const sec = document.createElement("div");
    sec.id = "rh-section";
    sec.innerHTML = `
      <div class="section-label">時給の履歴</div>
      <div class="list-pad">
        <div class="card rh-card">
          ${sets.length > 1 ? rows : `<div class="rh-empty">いまのルールが、すべてのシフトに使われています。</div>`}
        </div>
        <div class="rh-note">時給が上がったときは、ルールを直接書き換えず、下のボタンから登録してください。<b>過去のシフトの金額は変わりません。</b></div>
        <button class="rate-add-btn rh-add" id="rh-add-btn">＋ 昇給・時給の変更を登録</button>
        ${wp.rateHistory && wp.rateHistory.length ? `<button type="button" class="rh-undo" id="rh-undo-btn">直前の変更を取り消す</button>` : ""}
      </div>`;
    host.appendChild(sec);

    document.getElementById("rh-add-btn").onclick = () => openChangeModal(wp);
    const u = document.getElementById("rh-undo-btn");
    if (u) u.onclick = () => {
      const last = wp.rateHistory[wp.rateHistory.length - 1];
      showConfirm(
        `「${dateLabel(wp.ratesFrom)}からの時給」を取り消して、ひとつ前のルールに戻します。\n\nシフトの金額は、前のルールで計算し直されます。`,
        () => { undoLast(wp); renderRates(); },
        { title: "変更の取り消し", okLabel: "取り消す" }
      );
    };
  }

  const baseRenderRates = renderRates;
  renderRates = function () {
    baseRenderRates();
    try { decorate(); } catch (e) { console.error("時給の履歴の表示でエラー(通常の画面のまま表示します)", e); }
  };

  // ---------- 昇給の入力画面 ----------
  function openChangeModal(wp) {
    if (document.getElementById("rh-modal")) return;
    if (!wp.rates || wp.rates.length === 0) { showNotice("先に、時給ルールを登録してください。"); return; }
    const sample = wp.rates[0].wage;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "rh-modal";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rh-title">
        <div class="modal-header">
          <span class="modal-title" id="rh-title">昇給・時給の変更</span>
          <span class="modal-close" id="rh-close" aria-label="閉じる">✕</span>
        </div>
        <div class="section-label small">いつから?</div>
        <input type="date" id="rh-date" class="modal-input full" value="${todayStr()}">
        <div class="section-label small">すべての時給を</div>
        <div class="segment" id="rh-dir">
          <button type="button" class="segment-btn active" data-dir="1">上げる</button>
          <button type="button" class="segment-btn" data-dir="-1">下げる</button>
        </div>
        <input type="number" id="rh-amount" class="modal-input full" inputmode="numeric" min="1" placeholder="金額(円)  例: 50">
        <div class="rh-preview" id="rh-preview"></div>
        <div class="gd-error" id="rh-error" role="alert"></div>
        <button id="rh-save" class="btn-primary" style="margin-top:12px">登録する</button>
      </div>`;
    document.body.appendChild(overlay);

    let dir = 1;
    const close = () => overlay.remove();
    const amountOf = () => Math.round(Number(document.getElementById("rh-amount").value)) || 0;
    const preview = () => {
      const a = amountOf();
      document.getElementById("rh-preview").textContent = a > 0 ? `例: ${yen(sample)} → ${yen(Math.max(0, sample + dir * a))}` : "";
    };
    overlay.querySelectorAll("#rh-dir .segment-btn").forEach((b) => {
      b.onclick = () => {
        dir = Number(b.dataset.dir);
        overlay.querySelectorAll("#rh-dir .segment-btn").forEach((x) => x.classList.toggle("active", x === b));
        preview();
      };
    });
    document.getElementById("rh-amount").oninput = preview;
    document.getElementById("rh-close").onclick = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    document.getElementById("rh-save").onclick = () => {
      const err = document.getElementById("rh-error");
      const date = document.getElementById("rh-date").value;
      const a = amountOf();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = "日付を入力してください。"; return; }
      if (wp.ratesFrom && date <= wp.ratesFrom) { err.textContent = `最新の変更日(${dateLabel(wp.ratesFrom)})より、あとの日付にしてください。`; return; }
      if (!(a >= 1 && a <= 100000)) { err.textContent = "金額は1〜100000円で入力してください。"; return; }
      if (wp.rates.some((r) => r.wage + dir * a < 1)) { err.textContent = "時給が0円以下になってしまいます。金額を見直してください。"; return; }
      applyChange(wp, date, dir * a);
      close();
      renderRates();
    };
  }
})();
// ==========================================================
// 【3. 勤務先タブ】(スライドで削除・開いた画面)
// ==========================================================
// ==========================================================
// 勤務先タブの整理(js/features/workplace-detail.js)
//
// 【変わること】
//  1. 一覧は「タップ」だけにそろえました(ペンのボタンはなくなります)
//  2. タップして開く画面に、勤務先の情報・時給ルール・時給の履歴を、ぜんぶ集めました
//       - 「勤務先の情報」の枠をタップすると、名前・締め日・給料日・割増を直せます
//  3. 削除は、開いた画面の一番下に置きました(編集の画面の「削除」は、見えなくします)
//       - 「この勤務先を削除」を押すと、下から確認が出てきます(削除する / キャンセル)
//  4. 一覧では、スマホなら、横に(左へ)スライドして、削除もできます
//       - スライドすると赤い「削除」が出ます。押すと、同じ確認が下から出ます
//  5. どの方法でも、確認で「削除する」を押すまでは、消えません
//
// ・script.js などは書き換えず、上から包んでいます(rate-history.js より後に読み込むこと)
// ==========================================================
(function () {
  if (typeof document === "undefined") return;

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ICON_TRASH_S = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7"/><path d="M6.5 7l.8 12.2a1 1 0 0 0 1 .8h7.4a1 1 0 0 0 1-.8L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>`;

  // ---------- 下から出てくる確認 ----------
  let sheetOpen = false;
  function openSheet({ title, message, okLabel, onOk }) {
    if (sheetOpen) return;
    sheetOpen = true;
    const overlay = document.createElement("div");
    overlay.className = "wd-sheet-overlay";
    overlay.innerHTML = `
      <div class="wd-sheet" role="alertdialog" aria-modal="true" aria-labelledby="wd-sheet-title">
        <div class="wd-grab" aria-hidden="true"></div>
        <div class="wd-sheet-title" id="wd-sheet-title">${esc(title)}</div>
        <div class="wd-sheet-msg">${esc(message)}</div>
        <button type="button" class="wd-sheet-ok" id="wd-sheet-ok">${esc(okLabel)}</button>
        <button type="button" class="wd-sheet-cancel" id="wd-sheet-cancel">キャンセル</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("is-open"))); // スッと上がってくる動き

    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close(cb) {
      document.removeEventListener("keydown", onKey);
      overlay.classList.remove("is-open");
      setTimeout(() => { overlay.remove(); sheetOpen = false; if (typeof cb === "function") cb(); }, 220);
    }
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector("#wd-sheet-cancel").onclick = () => close();
    overlay.querySelector("#wd-sheet-ok").onclick = () => close(onOk);
    overlay.querySelector("#wd-sheet-cancel").focus(); // 間違えて押しにくいほう(キャンセル)に合わせておく
  }

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("wd-toast");
    if (!t) { t = document.createElement("div"); t.id = "wd-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("is-show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-show"), 2400);
  }

  // ---------- 削除(どこから押しても、ここを通る) ----------
  function askDelete(id) {
    const wp = state.workplaces.find((w) => w.id === id);
    if (!wp) return;
    const nShift = state.shifts.filter((s) => s.workplaceId === id).length;
    const nTmpl = state.templates.filter((t) => t.workplaceId === id).length;
    const also = [nShift ? `シフト${nShift}件` : "", nTmpl ? `テンプレート${nTmpl}件` : ""].filter(Boolean).join("と");
    openSheet({
      title: `「${wp.name}」を削除しますか?`,
      message: (also ? `この勤務先の${also}も、一緒に削除されます。` : "") + "元に戻せません。",
      okLabel: "削除する",
      onOk: () => {
        state.workplaces = state.workplaces.filter((w) => w.id !== id);
        state.shifts = state.shifts.filter((s) => s.workplaceId !== id);
        state.templates = state.templates.filter((t) => t.workplaceId !== id);
        if (state.activeWorkplaceId === id) state.activeWorkplaceId = null;
        save();
        switchTab("workplaces");
        toast(`「${wp.name}」を削除しました`);
      },
    });
  }

  // ---------- 一覧: ペンをなくす + 横にスライドして削除 ----------
  const OPEN_X = 88; // 赤い削除ボタンの幅
  let openedWrap = null;
  function closeSwipe(w) { if (!w) return; w.classList.remove("is-open"); const c = w.querySelector(".workplace-card"); if (c) c.style.transform = ""; if (openedWrap === w) openedWrap = null; }

  function decorateList() {
    const list = document.getElementById("workplace-list");
    if (!list) return;
    list.querySelectorAll("[data-edit-workplace]").forEach((el) => el.remove()); // ペン
    openedWrap = null;

    list.querySelectorAll(".workplace-card").forEach((card) => {
      const id = card.dataset.open;
      const wrap = document.createElement("div");
      wrap.className = "wd-swipe";
      card.parentNode.insertBefore(wrap, card);
      wrap.innerHTML = `<button type="button" class="wd-swipe-del" aria-label="この勤務先を削除">${ICON_TRASH_S}<span>削除</span></button>`;
      wrap.appendChild(card);

      let x0 = 0, y0 = 0, base = 0, dx = 0, mode = "", movedAt = 0;
      card.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        if (openedWrap && openedWrap !== wrap) closeSwipe(openedWrap);
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
        base = wrap.classList.contains("is-open") ? -OPEN_X : 0; dx = 0; mode = "";
      }, { passive: true });
      card.addEventListener("touchmove", (e) => {
        const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
        if (!mode) {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          mode = Math.abs(mx) > Math.abs(my) ? "h" : "v"; // 横にスライドなのか、縦のスクロールなのか
          if (mode === "h") wrap.classList.add("is-drag");
        }
        if (mode !== "h") return;
        dx = Math.max(-OPEN_X - 24, Math.min(0, base + mx));
        card.style.transform = `translateX(${dx}px)`;
      }, { passive: true });
      const end = () => {
        wrap.classList.remove("is-drag");
        if (mode !== "h") return;
        movedAt = Date.now();
        if (dx < -OPEN_X / 2) { wrap.classList.add("is-open"); card.style.transform = `translateX(${-OPEN_X}px)`; openedWrap = wrap; }
        else closeSwipe(wrap);
      };
      card.addEventListener("touchend", end, { passive: true });
      card.addEventListener("touchcancel", end, { passive: true });

      // 開いているときのタップは、「閉じる」だけにする。スライド直後の、誤タップも防ぐ
      wrap.addEventListener("click", (e) => {
        if (e.target.closest(".wd-swipe-del")) return;
        if (wrap.classList.contains("is-open")) { e.preventDefault(); e.stopPropagation(); closeSwipe(wrap); return; }
        if (Date.now() - movedAt < 350) { e.preventDefault(); e.stopPropagation(); }
      }, true);

      wrap.querySelector(".wd-swipe-del").onclick = () => { closeSwipe(wrap); askDelete(id); };
    });
  }
  document.addEventListener("touchstart", (e) => { if (openedWrap && !openedWrap.contains(e.target)) closeSwipe(openedWrap); }, { passive: true });

  const baseRenderWorkplaces = renderWorkplaces;
  renderWorkplaces = function () {
    baseRenderWorkplaces();
    try { decorateList(); } catch (e) { console.error("勤務先の一覧の表示でエラー(通常の表示のままにします)", e); }
  };

  // ---------- 開いた画面: 情報 + 時給ルール + 履歴 + 削除 ----------
  function decorateDetail() {
    const wp = state.workplaces.find((w) => w.id === state.activeWorkplaceId);
    const host = document.getElementById("rates-content");
    if (!wp || !host) return;

    const title = document.getElementById("rates-title");
    if (title) title.textContent = wp.name;                       // 「◯◯ の時給ルール」→ 勤務先の名前
    const pen = document.getElementById("rates-edit-workplace");
    if (pen) pen.style.visibility = "hidden";                      // ペンはなくす(位置はそのまま)

    const prem = wp.premium || {};
    const premText = [prem.night && "深夜", prem.overtime && "残業"].filter(Boolean).join("・") || "なし";
    const info = document.createElement("div");
    info.id = "wd-info-wrap";
    info.innerHTML = `
      <div class="wd-head"><span>勤務先の情報</span><span class="wd-edit-hint">タップして編集 ›</span></div>
      <div class="list-pad">
        <button type="button" class="card wd-info" id="wd-info">
          <span class="wd-row"><span class="wd-k">勤務先名</span><span class="wd-v">${esc(wp.name)}</span></span>
          <span class="wd-row"><span class="wd-k">締め日</span><span class="wd-v">${esc(formatDateRule(wp.closingType || "fixed", wp.closingDay))}</span></span>
          <span class="wd-row"><span class="wd-k">給料日</span><span class="wd-v">${esc(formatDateRule(wp.paydayType || "fixed", wp.payday))}</span></span>
          <span class="wd-row"><span class="wd-k">割増</span><span class="wd-v">${esc(premText)}</span></span>
        </button>
      </div>
      <div class="wd-head wd-head-rules"><span>時給ルール</span></div>`;
    host.insertBefore(info, host.firstChild);
    info.querySelector("#wd-info").onclick = () => openWorkplaceModal(wp);

    const danger = document.createElement("div");
    danger.id = "wd-danger";
    danger.innerHTML = `<button type="button" class="btn-delete-wide" id="wd-delete">この勤務先を削除</button>`;
    host.appendChild(danger);                                       // 一番下
    danger.querySelector("#wd-delete").onclick = () => askDelete(wp.id);
  }

  const baseRenderRates = renderRates;
  renderRates = function () {
    baseRenderRates();
    try { if (state.tab === "rates") decorateDetail(); } catch (e) { console.error("勤務先の画面の表示でエラー(通常の表示のままにします)", e); }
  };

})();
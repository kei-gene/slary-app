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
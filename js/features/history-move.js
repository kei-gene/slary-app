// ==========================================================
// 勤務履歴を「設定」の中へ移動 + 履歴を1画面にたくさん表示  (js/features/history-move.js)
//
// ・下のタブから「履歴」ボタンをなくす(画面そのものは残して、設定から開く)
// ・設定の「テンプレート」の下に「勤務履歴」ボタンを追加
// ・履歴の1件を1行にまとめ、編集・削除は小さなアイコンにして、一度にたくさん見えるようにする
//   (月ごとにまとめて、月の合計も表示)
// ・履歴から「編集」したあと、保存や取り消しをすると、履歴に戻る
// ・script.js などは書き換えず、上から包んで変更しています
// ==========================================================
(function () {
  if (typeof document === "undefined") return;

  const DOW = ["日", "月", "火", "水", "木", "金", "土"];
  const ARROW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const CLOCK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  // ---------- 移動のしかた ----------
  let returnToHistory = false; // 履歴から編集に入ったとき、戻り先を履歴にする

  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    if (state.tab === "add") {
      if (returnToHistory && tab === "home") tab = "history"; // 編集を終えたら、履歴に戻る
      returnToHistory = false;
    }
    baseSwitchTab(tab, keepEditing);
    // 履歴はタブにないので、開いている間は「設定」を選択中の見た目にする
    if (tab === "history") {
      document.querySelectorAll(".tab-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === "settings"));
    }
  };

  // ---------- 履歴の画面: 戻るボタン ----------
  function addBackButton() {
    const screen = document.getElementById("screen-history");
    if (!screen || document.getElementById("hs-back")) return;
    const back = document.createElement("button");
    back.type = "button";
    back.id = "hs-back";
    back.className = "hs-back";
    back.innerHTML = "‹ 設定";
    back.onclick = () => switchTab("settings");
    screen.insertBefore(back, screen.firstChild);
  }

  // ---------- 履歴の一覧(1件=1行) ----------
  function monthKeyOf(dateStr) { return dateStr.slice(0, 7); }

  renderHistoryList = function () {
    const container = document.getElementById("history-list");
    if (!container) return;
    container.classList.add("hs-list");
    const sorted = [...state.shifts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.start < b.start ? 1 : -1)));
    if (sorted.length === 0) {
      container.innerHTML = `<div class="empty-note">まだシフトが登録されていません</div>`;
      return;
    }

    // 月ごとにまとめる(新しい月が上)
    const months = [];
    sorted.forEach((s) => {
      const key = monthKeyOf(s.date);
      let g = months[months.length - 1];
      if (!g || g.key !== key) { g = { key, items: [], total: 0 }; months.push(g); }
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (r) g.total += r.pay;
      g.items.push({ s, wp, r });
    });

    container.innerHTML = months.map((g) => `
      <div class="hs-month">
        <span class="hs-month-name">${g.key.slice(0, 4)}年${Number(g.key.slice(5))}月</span>
        <span class="hs-month-sum">${g.items.length}件 ・ ${yen(g.total)}</span>
      </div>
      <div class="card hs-card">
        ${g.items.map(({ s, wp, r }) => {
          const d = new Date(s.date + "T00:00:00");
          const dow = d.getDay();
          const hours = r ? (r.workedMinutes / 60).toFixed(1) : "";
          return `
          <div class="hs-row">
            <div class="hs-date${dow === 0 ? " hs-sun" : dow === 6 ? " hs-sat" : ""}">
              <span class="hs-d">${d.getMonth() + 1}/${d.getDate()}</span><span class="hs-w">${DOW[dow]}</span>
            </div>
            <div class="hs-main">
              <div class="hs-wp">${escapeHtml(wp ? wp.name : "―")}</div>
              <div class="hs-time">${s.start}〜${s.end}${hours ? ` ・ ${hours}h` : ""}</div>
            </div>
            <div class="hs-pay">${r ? yen(r.pay) : "―"}</div>
            <div class="hs-acts">
              <button type="button" class="hs-ic" data-edit="${s.id}" aria-label="編集">${ICON_EDIT}</button>
              <button type="button" class="hs-ic hs-ic-del" data-delete="${s.id}" aria-label="削除">${ICON_TRASH}</button>
            </div>
          </div>`;
        }).join("")}
      </div>`).join("");

    container.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => {
        state.editingShiftId = btn.dataset.edit;
        returnToHistory = true;
        switchTab("add", true);
      };
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
  };

  // ---------- 設定の「テンプレート」の下に「勤務履歴」ボタン ----------
  function addSettingsEntry() {
    const screen = document.getElementById("screen-settings");
    if (!screen || document.getElementById("hs-entry")) return;
    const wrap = document.createElement("div");
    wrap.id = "hs-entry";
    wrap.className = "list-pad hs-entry-wrap";
    wrap.innerHTML = `
      <button type="button" class="card hs-entry" id="hs-entry-btn">
        <span class="hs-entry-ic">${CLOCK}</span>
        <span class="hs-entry-text">
          <span class="hs-entry-title">勤務履歴</span>
          <span class="hs-entry-sub">これまでのシフトを見る・直す・消す</span>
        </span>
        <span class="hs-entry-arrow">${ARROW}</span>
      </button>`;
    // 置き場所: 「テンプレート」の下(見つからないときだけ、設定の一番上)
    const tmplList = document.getElementById("template-list");
    const tmplBlock = tmplList && (tmplList.closest(".list-pad") || tmplList.parentNode);
    if (tmplBlock && tmplBlock.parentNode) {
      tmplBlock.parentNode.insertBefore(wrap, tmplBlock.nextSibling);
    } else {
      const title = screen.querySelector(".header-title");
      screen.insertBefore(wrap, title ? title.nextSibling : screen.firstChild);
    }
    document.getElementById("hs-entry-btn").onclick = () => switchTab("history");
  }

  // ---------- 下のタブから「履歴」を外す ----------
  function removeHistoryTab() {
    document.querySelectorAll('.tabbar .tab-item[data-tab="history"]').forEach((b) => b.remove());
  }

  document.addEventListener("DOMContentLoaded", () => {
    removeHistoryTab();
    addBackButton();
    addSettingsEntry();
  });
})();
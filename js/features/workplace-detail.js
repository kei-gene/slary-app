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
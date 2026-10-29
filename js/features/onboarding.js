// ==========================================================
// 初回ガイド  (js/features/onboarding.js)
//
// ・初めて開いたときに、サンプルのバイト先・シフトを入れない(空の状態から始める)
// ・ホームに「はじめに」カードを表示(勤務先 → シフト → 年収の壁の確認)
// ・かんたん登録: 勤務先名・時給・締め日・給料日だけで、勤務先を1件登録できる
// ・すでに勤務先とシフトがある人(今までの利用者)には、何も表示しません。データも変更しません
// ・script.js は書き換えず、上から包んで変更しています
// ==========================================================
(function () {
  // ---------- 1. サンプルデータをやめる(保存データがないときだけ使われる) ----------
  defaultWorkplaces = function () { return []; };
  defaultShifts = function () { return []; };

  // ---------- 小さな道具 ----------
  const LS_META = "wage_meta"; // backup.js と共用(それぞれ自分の項目だけ書き換える)
  function loadMeta() { try { return JSON.parse(localStorage.getItem(LS_META)) || {}; } catch (e) { return {}; } }
  function saveMeta(patch) { try { localStorage.setItem(LS_META, JSON.stringify({ ...loadMeta(), ...patch })); } catch (e) {} }
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // 年収の壁タブを開いたら、ステップ3を完了にする
  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    if (tab === "wall") saveMeta({ guideWallSeen: true });
    return baseSwitchTab(tab, keepEditing);
  };

  // ---------- 2. かんたん登録(モーダル) ----------
  function dayOptions(selected) {
    let h = "";
    for (let d = 1; d <= 28; d++) h += `<option value="${d}"${selected === String(d) ? " selected" : ""}>${d}日</option>`;
    h += `<option value="eom"${selected === "eom" ? " selected" : ""}>月末</option>`;
    return h;
  }

  // 登録できたあと: 時間帯ごとの時給の案内
  function showDone(overlay, id, close) {
    const modal = overlay.querySelector(".modal");
    modal.innerHTML = `
      <div class="gd-done-mark">✓</div>
      <div class="gd-done-title">登録しました</div>
      <div class="gd-done-text">時間帯によって時給が違うときは、「時給ルール」で追加できます。<br>(例: 夕方から時給アップ)</div>
      <button id="gd-open-rates" class="btn-primary" style="margin-top:16px">時給ルールを設定する</button>
      <button id="gd-later" class="btn-confirm-cancel gd-later">あとで</button>`;
    document.getElementById("gd-later").onclick = close;
    document.getElementById("gd-open-rates").onclick = () => {
      overlay.remove();
      state.activeWorkplaceId = id;
      switchTab("rates");
    };
  }

  function openQuickStart() {
    if (document.getElementById("gd-modal")) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "gd-modal";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="gd-modal-title">
        <div class="modal-header">
          <span class="modal-title" id="gd-modal-title">バイト先をかんたん登録</span>
          <span class="modal-close" id="gd-close" aria-label="閉じる">✕</span>
        </div>
        <div class="section-label small">バイト先の名前</div>
        <input type="text" id="gd-name" class="modal-input full" maxlength="30" placeholder="例: コンビニA" autocomplete="off">
        <div class="section-label small">時給(円)</div>
        <input type="number" id="gd-wage" class="modal-input full" inputmode="numeric" min="1" placeholder="例: 1100">
        <div class="section-label small">土日祝の時給(円)<span class="gd-opt">任意</span></div>
        <input type="number" id="gd-wage-h" class="modal-input full" inputmode="numeric" min="1" placeholder="空欄なら同じ時給">
        <label class="prem-row gd-night"><input type="checkbox" id="gd-night"><span>深夜割増あり(22時〜翌5時 +25%)</span></label>
        <div class="two-col" style="margin-top:12px">
          <div>
            <div class="section-label small">締め日</div>
            <select id="gd-closing" class="modal-input gd-select">${dayOptions("eom")}</select>
          </div>
          <div>
            <div class="section-label small">給料日</div>
            <select id="gd-payday" class="modal-input gd-select">${dayOptions("25")}</select>
          </div>
        </div>
        <div class="gd-hint">時間帯ごとの時給は、登録したあとに設定できます。</div>
        <div class="gd-error" id="gd-error" role="alert"></div>
        <button id="gd-save" class="btn-primary" style="margin-top:12px">登録する</button>
      </div>`;
    document.body.appendChild(overlay);

    let savedId = null; // 登録できたあとに閉じたときは、ホームを更新する
    const close = () => { overlay.remove(); if (savedId) switchTab("home"); };
    document.getElementById("gd-close").onclick = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.getElementById("gd-save").onclick = () => {
      const name = document.getElementById("gd-name").value.trim();
      const wage = Math.round(Number(document.getElementById("gd-wage").value));
      const err = document.getElementById("gd-error");
      if (!name) { err.textContent = "バイト先の名前を入力してください。"; return; }
      if (!(wage >= 1 && wage <= 100000)) { err.textContent = "時給は1〜100000円で入力してください。"; return; }
      const wageHRaw = document.getElementById("gd-wage-h").value.trim();
      const wageH = wageHRaw === "" ? wage : Math.round(Number(wageHRaw));
      if (!(wageH >= 1 && wageH <= 100000)) { err.textContent = "土日祝の時給は1〜100000円で入力するか、空欄にしてください。"; return; }
      const cl = document.getElementById("gd-closing").value;
      const pd = document.getElementById("gd-payday").value;
      const stamp = Date.now();
      state.workplaces.push({
        id: `w${stamp}`,
        name,
        closingType: cl === "eom" ? "endOfMonth" : "fixed", closingDay: cl === "eom" ? 31 : Number(cl),
        paydayType: pd === "eom" ? "endOfMonth" : "fixed", payday: pd === "eom" ? 31 : Number(pd),
        // 一日中同じ時給(曜日の区分に関係なく同額)
        rates: [
          { id: `r${stamp}a`, dayType: "weekday", start: "00:00", end: "24:00", wage },
          { id: `r${stamp}b`, dayType: "holiday", start: "00:00", end: "24:00", wage: wageH },
        ],
        premium: { night: document.getElementById("gd-night").checked, overtime: false },
      });
      save();
      savedId = `w${stamp}`;
      showDone(overlay, savedId, close);
    };
    setTimeout(() => { const n = document.getElementById("gd-name"); if (n) n.focus(); }, 50);
  }

  // ---------- 3. ホームの「はじめに」カード ----------
  function guideState() {
    const hasWp = state.workplaces.length > 0;
    const hasShift = state.shifts.length > 0;
    return { hasWp, hasShift, wallSeen: !!loadMeta().guideWallSeen };
  }

  function stepHtml(n, done, title, desc, btnLabel, id, disabled) {
    return `
      <div class="gd-step${done ? " gd-done" : ""}${disabled ? " gd-wait" : ""}">
        <div class="gd-mark">${done ? "✓" : n}</div>
        <div class="gd-body">
          <div class="gd-title">${title}</div>
          <div class="gd-desc">${desc}</div>
        </div>
        ${done || disabled ? "" : `<button type="button" class="gd-btn" id="${id}">${btnLabel}</button>`}
      </div>`;
  }

  function injectGuide() {
    const host = document.getElementById("home-content");
    if (!host || host.querySelector(".gd-card")) return;
    const g = guideState();
    if (g.hasWp && g.hasShift) return;          // 使い始めている人には出さない
    if (loadMeta().guideDismissed) return;       // 閉じた人には出さない

    // ガイドと重なる「勤務先を追加する」の案内は消す
    const oldEmpty = host.querySelector(".hm-empty");
    if (oldEmpty) oldEmpty.remove();

    const doneCount = [g.hasWp, g.hasShift, g.wallSeen].filter(Boolean).length;
    const card = document.createElement("div");
    card.className = "gd-card";
    card.innerHTML = `
      <div class="gd-head">
        <div>
          <div class="gd-h1">はじめに</div>
          <div class="gd-h2">${(window.APP && window.APP.name) ? esc(window.APP.name) + "へようこそ。" : ""}3つの手順で使えます(${doneCount}/3)</div>
        </div>
        <button type="button" class="gd-x" id="gd-dismiss" aria-label="はじめにを閉じる">閉じる</button>
      </div>
      ${stepHtml(1, g.hasWp, "バイト先と時給を登録", "名前と時給、給料日だけでOK。あとから変えられます。", "登録する", "gd-s1", false)}
      ${stepHtml(2, g.hasShift, "シフトを入れる", "カレンダーで日付を選ぶと、給料が自動で計算されます。", "シフトを追加", "gd-s2", !g.hasWp)}
      ${stepHtml(3, g.wallSeen, "年収の壁を確認", "扶養に関わる「年収の壁」までの残りが分かります。", "見てみる", "gd-s3", false)}
      <div class="gd-foot">以前のデータがある場合は、<button type="button" class="gd-link" id="gd-restore">設定からバックアップを復元</button>できます。</div>`;
    host.insertBefore(card, host.firstChild);

    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on("gd-s1", openQuickStart);
    on("gd-s2", () => switchTab("add"));
    on("gd-s3", () => switchTab("wall"));
    on("gd-restore", () => switchTab("settings"));
    on("gd-dismiss", () => { saveMeta({ guideDismissed: true }); card.remove(); });
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try { injectGuide(); } catch (e) { console.error("初回ガイドでエラー(通常のホームのまま表示します)", e); }
  };

  // ホームの「勤務先を追加する」ボタン(ガイドを閉じた人向け)も、かんたん登録につなぐ
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#hm-empty-btn");
    if (b) { e.stopImmediatePropagation(); openQuickStart(); }
  }, true);

  // ---------- 4. シフト追加画面: 勤務先が0件のときの案内 ----------
  const baseRenderAddScreen = renderAddScreen;
  renderAddScreen = function () {
    baseRenderAddScreen();
    try {
      const screen = document.getElementById("screen-add");
      const old = document.getElementById("gd-add-hint");
      if (old) old.remove();
      if (!screen || state.workplaces.length > 0) return;
      const hint = document.createElement("div");
      hint.id = "gd-add-hint";
      hint.className = "gd-add-hint";
      hint.innerHTML = `先に、バイト先を登録してください。<button type="button" class="gd-btn" id="gd-add-reg">登録する</button>`;
      const anchor = document.getElementById("shared-fields");
      anchor.parentNode.insertBefore(hint, anchor);
      document.getElementById("gd-add-reg").onclick = openQuickStart;
    } catch (e) { /* 案内だけの補助なので、失敗しても無視 */ }
  };
})();
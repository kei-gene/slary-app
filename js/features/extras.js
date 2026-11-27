// ==========================================================
// おまけの機能(extras.js)
//
//  1. 初回ガイド・かんたん登録                 … 元 onboarding.js
//  2. お知らせ(ベル・帯・一覧)                 … 元 news.js
//  3. 月の目標を達成したときのお祝い           … 元 goal-celebration.js
//  4. 引っ張って更新                           … 元 pull-refresh.js
//
// ※ 保存まわりの道具(loadMeta / saveMeta / esc)は script.js にあります。
// ==========================================================

// ==========================================================
// 【1. 初回ガイド】
// ==========================================================
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
  // ---------- 小さな道具 ----------

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
// ==========================================================
// 【2. お知らせ】
// ==========================================================
// ==========================================================
// お知らせ機能  (js/features/news.js)   【v3: 本文の飾り(色・マーカー・大きさ・取り消し線)に対応】
//
// ・アプリを開いたときに news.json を読み込む
// ・ホームのロゴの右に「ベルマーク」を常に表示。新しいお知らせがあるときは、赤い数字の印がつく
// ・ベルをタップすると、お知らせの一覧(新しい順)が開く。読んだお知らせは「NEW」が消えるだけで、一覧には残る
// ・「重要」のお知らせだけは、読むまでホームの上に帯でも出す
// ・読み込むだけで、利用者のデータは送信しません
// ・読み込みに失敗しても(オフライン等)、何も表示せず、アプリは普通に動きます
// ・script.js は書き換えず、上から包んで変更しています
//
// 【お知らせの出し方】 news.json を編集して、他のファイルと一緒に公開するだけ
//   (news.json は「かせログ お知らせエディタ」で作れます)
//   id    : 重複しない文字列(これが同じなら「読んだ」扱いのまま。新しく出したいときは新しいidに)
//   date  : 表示する日付(YYYY-MM-DD)
//   title : 見出し(短く。\n で改行できます)
//   body  : 本文(\n で改行)。次の書き方で飾れます(お知らせエディタのボタンでも付けられます)
//             リンク       [表示する文字](https://...)
//             太字         **文字**
//             下線         __文字__
//             取り消し線   ~~文字~~
//             文字の色     {c=#ff3b30|文字}   (やさしい書き方: {赤|文字}  赤・青・緑・橙・紫・灰)
//             マーカー     {m=#ffe066|文字}   (やさしい書き方: ==文字== / ==ピンク|文字==)
//             大きさ       {s=大|文字}        (小・大・特大)
//             重ねてもOK   例: {c=#ff3b30,s=大|**赤くて大きい太字**}
//   level : "info"(ふつう) / "important"(オレンジで目立たせる)
//   until : (任意) この日を過ぎたら表示しない(YYYY-MM-DD)
//   style : (任意) 見た目の指定。使わない項目は書かなくてOK
//             accent=アクセント色 / bg=背景色 / titleColor=見出しの色 / bodyColor=本文の色  (#RRGGBB の形)
//             titleSize=見出しの大きさ(12〜32) / bodySize=本文の大きさ(11〜22)  (数字。単位はpx)
//             ※ 一覧では、見出しは titleSize より少し小さく表示されます
// ==========================================================
(function () {
  const NEWS_URL = "news.json";
  const MAX_ITEMS = 20;     // 一覧に出す最大件数
  const KEEP_READ_IDS = 60; // 「読んだ」記録の保存件数

  let items = [];

  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

  // ---------- 見た目の指定(style) ----------
  // 色は #RGB / #RRGGBB だけ、大きさは範囲内の数字だけを通す(それ以外は無視。安全のため)
  const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  function cleanStyle(s) {
    const o = {};
    if (!s || typeof s !== "object") return o;
    ["accent", "bg", "titleColor", "bodyColor"].forEach((k) => {
      if (typeof s[k] === "string" && HEX.test(s[k])) o[k] = s[k];
    });
    const num = (v, lo, hi) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
    const ts = num(s.titleSize, 12, 32); if (ts) o.titleSize = ts;
    const bs = num(s.bodySize, 11, 22); if (bs) o.bodySize = bs;
    return o;
  }
  // 色の上に置く文字を、白か黒かで選ぶ(明るい色の上でも読めるように)
  function inkOn(hex) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return 1.05 / (L + 0.05) >= 3 ? "#fff" : "#1C1C1E";
  }
  const css = (list) => list.filter(Boolean).join(";");
  const styleAttr = (c) => (c ? ` style="${c}"` : "");
  // 背景色・アクセント色があるとき、「枠つきのカード」にする
  const boxCss = (s) => (s.bg || s.accent
    ? css([s.bg && `background:${s.bg}`, s.accent && `border-left:4px solid ${s.accent}`, "border-radius:10px", "padding:12px"])
    : "");

  // ---------- 読み込み ----------
  function cleanItems(json) {
    const list = json && Array.isArray(json.items) ? json.items : [];
    const today = todayStr();
    return list
      .filter((x) => x && typeof x.id === "string" && x.id && typeof x.title === "string" && x.title)
      .filter((x) => !(isDate(x.until) && x.until < today))
      .map((x) => ({
        id: x.id.slice(0, 80),
        date: isDate(x.date) ? x.date : "",
        title: x.title.slice(0, 80),
        body: typeof x.body === "string" ? x.body.slice(0, 3000) : "",
        important: x.level === "important",
        style: cleanStyle(x.style),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, MAX_ITEMS);
  }

  async function fetchNews() {
    try {
      const res = await fetch(NEWS_URL, { cache: "no-cache" });
      if (!res.ok) return;
      items = cleanItems(await res.json());
      if (typeof state !== "undefined" && state.tab === "home") renderHome();
    } catch (e) { /* オフラインや未設置のときは、何も出さない */ }
  }

  // ---------- 読んだ記録 ----------
  const readIds = () => new Set(Array.isArray(loadMeta().newsRead) ? loadMeta().newsRead : []);
  const unread = () => { const r = readIds(); return items.filter((x) => !r.has(x.id)); };
  function markAllRead() {
    const merged = [...new Set([...items.map((x) => x.id), ...readIds()])].slice(0, KEEP_READ_IDS);
    saveMeta({ newsRead: merged });
  }

  // ---------- ホームの「ベル」と、重要なお知らせの帯 ----------
  const BELL_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>`;

  function injectBell() {
    // ロゴの右端に置く(ロゴの帯はホームの画面ごとに1つだけで、作り直されないので、毎回つけ直す)
    const bar = document.querySelector(".brand-bar");
    const fallback = document.querySelector("#home-content .home-month-row"); // ロゴの帯がないとき用
    const host = bar || fallback;
    if (!host) return;
    host.querySelectorAll(".nw-bell").forEach((el) => el.remove());
    if (bar) bar.classList.toggle("nw-has-bell", items.length > 0);
    if (items.length === 0) return;

    const n = unread().length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nw-bell";
    btn.setAttribute("aria-label", n > 0 ? `お知らせ(未読${n}件)` : "お知らせ");
    btn.innerHTML = BELL_SVG + (n > 0 ? `<span class="nw-badge">${n > 9 ? "9+" : n}</span>` : "");
    btn.onclick = openNews;
    if (bar) host.appendChild(btn);
    else host.insertBefore(btn, host.querySelector(".month-segment"));
  }

  function injectBanner() {
    const host = document.getElementById("home-content");
    if (!host || host.querySelector(".nw-banner")) return;
    const list = unread().filter((x) => x.important); // 読むまで目立たせるのは、重要なものだけ
    if (list.length === 0) return;
    const s = list[0].style || {};
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nw-banner nw-important";
    if (s.bg) btn.style.background = s.bg;
    btn.innerHTML = `
      <span class="nw-tag"${styleAttr(css([s.accent && `background:${s.accent}`, s.accent && `color:${inkOn(s.accent)}`]))}>重要</span>
      <span class="nw-title"${styleAttr(css([s.titleColor && `color:${s.titleColor}`]))}>${esc(list[0].title.replace(/\s*\n\s*/g, " "))}</span>
      ${list.length > 1 ? `<span class="nw-more">ほか${list.length - 1}件</span>` : ""}
      <span class="nw-chev">›</span>`;
    btn.onclick = openNews;
    host.insertBefore(btn, host.firstChild);
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try { injectBell(); injectBanner(); } catch (e) { console.error("お知らせの表示でエラー(通常のホームのまま表示します)", e); }
  };

  // ---------- 一覧・詳細(モーダル) ----------
  // 本文の整形: HTMLは無効にしたうえで、改行・リンク・飾り(太字/下線/文字色/マーカー)だけ使えるようにする
  /*render-begin*/
  // 本文の飾り(アプリの news.js と、お知らせエディタで、まったく同じ処理)
  //   **太字**  __下線__  ~~取り消し線~~  ==マーカー==  [文字](https://...) のリンク
  //   {c=#ff3b30|文字色}  {m=#ffe066|マーカー}  {s=大|大きさ(小・大・特大)}  {c=#ff3b30,s=大|重ねて指定}
  //   やさしい書き方も使えます: {赤|文字} {赤,大|文字} ==ピンク|文字==
  const TXT_NAMES = { 赤: '#E5484D', 青: '#2F7FE0', 緑: '#12A36A', 橙: '#E67700', 紫: '#8E4EC6', 灰: '#8E8E93' };
  const MRK_NAMES = { 黄: '#FFE066', ピンク: '#FFC2D4', 緑: '#B7F0CF', 青: '#BFE0FF', 橙: '#FFD6A5' };
  const SIZE_NAMES = { 小: '0.85em', 大: '1.2em', 特大: '1.45em' };
  const HEXC = '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})';
  const HEX_ONLY = new RegExp('^' + HEXC + '$');
  const MRK_CSS = (h) => `background:linear-gradient(transparent 45%,${h} 45%);-webkit-box-decoration-break:clone;box-decoration-break:clone`;
  function fmtStyle(keys) { // "c=#f00,s=大" や "赤,大" → style文字列。知らない指定が1つでもあれば null(記号のまま表示)
    const out = [];
    for (let k of keys.split(',')) {
      k = k.trim();
      let m;
      if ((m = k.match(/^c=(.+)$/))) { const v = HEX_ONLY.test(m[1]) ? m[1] : TXT_NAMES[m[1]]; if (!v) return null; out.push('color:' + v); }
      else if ((m = k.match(/^m=(.+)$/))) { const v = HEX_ONLY.test(m[1]) ? m[1] : MRK_NAMES[m[1]]; if (!v) return null; out.push(MRK_CSS(v)); }
      else if ((m = k.match(/^s=(.+)$/))) { if (!SIZE_NAMES[m[1]]) return null; out.push('font-size:' + SIZE_NAMES[m[1]] + ';line-height:1.5'); }
      else if (TXT_NAMES[k]) out.push('color:' + TXT_NAMES[k]);
      else if (SIZE_NAMES[k]) out.push('font-size:' + SIZE_NAMES[k] + ';line-height:1.5');
      else return null;
    }
    return out.length ? out.join(';') : null;
  }
  function inlineFmt(s) { // HTMLを無効にした文字を受け取って、飾りだけHTMLにする。色は #RGB / #RRGGBB と決めた名前だけ通す
    let prev, n = 0;
    do {
      prev = s;
      s = s.replace(/\{([^{}|\n]{1,40})\|([^{}]*)\}/g, (m, keys, t) => { const st = fmtStyle(keys); return st ? `<span style="${st}">${t}</span>` : m.replace(/\{/g, '\u0003').replace(/\}/g, '\u0004'); });
    } while (s !== prev && ++n < 8); // 入れ子は、内側から順に変える(知らない指定は、あとで { } に戻す)
    s = s.replace(/\u0003/g, '{').replace(/\u0004/g, '}');
    return s
      .replace(/==(?:(黄|ピンク|緑|青|橙|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))\|)?([^=\n]+?)==/g, (m, c, t) => `<span style="${MRK_CSS(c ? (MRK_NAMES[c] || c) : MRK_NAMES['黄'])}">${t}</span>`)
      .replace(/\*\*([^*\n]+)\*\*/g, '<span style="font-weight:700">$1</span>')
      .replace(/__([^_\n]+)__/g, '<span style="text-decoration:underline;text-underline-offset:3px">$1</span>')
      .replace(/~~([^~\n]+)~~/g, '<span style="text-decoration:line-through">$1</span>');
  }
  function bodyHtml(text) {
    const links = []; // リンクのURLが飾りの記号(__ など)で壊れないよう、先に取り出す
    let s = esc(text).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${inlineFmt(label)}</a>`);
      return '\u0001' + (links.length - 1) + '\u0002';
    });
    s = inlineFmt(s).replace(/\r?\n/g, '<br>');
    return s.replace(/\u0001(\d+)\u0002/g, (m, i) => links[Number(i)]);
  }
  // 一覧に出す短い抜粋(飾りは外して、文字だけにする)
  function previewText(text) {
    return bodyHtml(text).replace(/<br>/g, ' ').replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
  }
  /*render-end*/
  // 見出しの改行(\n)は、詳細と一覧では<br>、1行の帯ではスペースにする
  const titleHtml = (t) => esc(t).replace(/\r?\n/g, "<br>");

  function openNews() {
    if (document.getElementById("nw-modal")) return;
    const r = readIds(); // 開いた時点の「未読」(NEW表示用)
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "nw-modal";
    overlay.innerHTML = `<div class="modal nw-modal" role="dialog" aria-modal="true" aria-label="お知らせ"></div>`;
    document.body.appendChild(overlay);
    const box = overlay.querySelector(".nw-modal");
    markAllRead();

    const close = () => { overlay.remove(); if (state.tab === "home") renderHome(); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    function showList() {
      box.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">お知らせ</span>
          <span class="modal-close" id="nw-close" aria-label="閉じる">✕</span>
        </div>
        <div class="nw-list">
          ${items.map((x, i) => {
            const s = x.style || {};
            // 背景色・アクセント色があるときは、重要のお知らせと同じ「枠つきのカード」にする
            const cardCss = s.bg || s.accent ? css([boxCss(s), "margin:6px 0", "border-bottom:none"]) : "";
            const tsz = s.titleSize ? Math.round(s.titleSize * 15 / 18) : 0; // 一覧では少し小さく
            const tcss = css([s.titleColor && `color:${s.titleColor}`, tsz && `font-size:${tsz}px`]);
            return `
            <button type="button" class="nw-item${x.important ? " nw-item-important" : ""}" data-i="${i}"${styleAttr(cardCss)}>
              <div class="nw-item-head">
                ${r.has(x.id) ? "" : `<span class="nw-new">NEW</span>`}
                <span class="nw-date">${esc(x.date.replace(/-/g, "/"))}</span>
                <span class="nw-item-chev">›</span>
              </div>
              <div class="nw-item-title"${styleAttr(tcss)}>${titleHtml(x.title)}</div>
              ${x.body ? `<div class="nw-item-preview">${esc(previewText(x.body))}</div>` : ""}
            </button>`;
          }).join("") || `<div class="nw-empty">お知らせはありません</div>`}
        </div>`;
      document.getElementById("nw-close").onclick = close;
      box.querySelectorAll(".nw-item").forEach((el) => { el.onclick = () => showDetail(items[Number(el.dataset.i)]); });
    }

    function showDetail(x) {
      const s = x.style || {};
      const tcss = css([s.titleColor && `color:${s.titleColor}`, s.titleSize && `font-size:${s.titleSize}px`]);
      const bcss = css([s.bodyColor && `color:${s.bodyColor}`, s.bodySize && `font-size:${s.bodySize}px`]);
      box.innerHTML = `
        <div class="modal-header">
          <button type="button" class="nw-back" id="nw-back">‹ 一覧へ</button>
          <span class="modal-close" id="nw-close" aria-label="閉じる">✕</span>
        </div>
        <div class="nw-detail${x.important ? " nw-detail-important" : ""}"${styleAttr(boxCss(s))}>
          <div class="nw-date">${esc(x.date.replace(/-/g, "/"))}</div>
          <div class="nw-detail-title"${styleAttr(tcss)}>${titleHtml(x.title)}</div>
          <div class="nw-detail-body"${styleAttr(bcss)}>${bodyHtml(x.body) || "(詳しい内容はありません)"}</div>
        </div>`;
      document.getElementById("nw-back").onclick = showList;
      document.getElementById("nw-close").onclick = close;
    }

    showList();
  }

  document.addEventListener("DOMContentLoaded", fetchNews);
})();
// ==========================================================
// 【3. 目標達成のお祝い】
// ==========================================================
// ==========================================================
// 月の目標を達成したときのお祝い  (js/features/goal-celebration.js)
//
// ・今月、実際に働いた分(今日までのシフト)の合計が、月収目標に届いたら、
//   紙吹雪とメッセージでお祝いする
// ・お祝いは、アプリを開いたときと、ほかの画面からホームに戻ってくるたびに出ます
//   (ホームを開いたままの操作、たとえば月の切り替えでは出ません)
// ・これからの予定のシフトは数えません(まだ働いていないので)
// ・「動きを減らす」設定の端末では、紙吹雪なしでメッセージだけ出します
// ・script.js は書き換えず、上から包んで変更しています
// ==========================================================
(function () {
  // ---------- 今月、今日までに働いた分 ----------
  function earnedSoFar(ym) {
    const today = todayStr();
    let sum = 0;
    state.shifts.forEach((s) => {
      if (!s.date.startsWith(ym) || s.date > today) return;
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (r) sum += r.pay;
    });
    return sum;
  }

  // 「ホームに来た」ときだけ、お祝いを出す目印(アプリを開いた直後も、来たことにする)
  let arrived = true;

  // 戻り値: true = 判断が終わった(出した/目標なし/未達成)  false = まだ出せない状況なので、あとでもう一度
  function check() {
    if (state.tab !== "home" || homeMonthOffset !== 0) return false; // 過去・未来の月を見ているときは、今月のホームに戻るまで待つ
    if (document.getElementById("disclaimer-ok") || document.getElementById("gc-overlay")) return false; // 同意画面などの最中は出さない
    const goal = state.monthlyGoal;
    if (!(goal > 0)) return true;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const earned = earnedSoFar(ym);
    if (earned < goal) return true;
    setTimeout(() => celebrate(goal, earned, now.getMonth() + 1), 350); // ホームが表示されてから
    return true;
  }

  // ほかの画面からホームに切り替えたら、「来た」ことにする(ホームのまま同じタブを押しても、出さない)
  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    if (tab === "home" && state.tab !== "home") arrived = true;
    return baseSwitchTab(tab, keepEditing);
  };

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try {
      if (arrived && check()) arrived = false;
    } catch (e) { console.error("目標達成のお祝いでエラー(通常のホームのまま表示します)", e); }
  };

  // ---------- お祝いの表示 ----------
  function celebrate(goal, earned, month) {
    if (document.getElementById("gc-overlay")) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const overlay = document.createElement("div");
    overlay.id = "gc-overlay";
    overlay.className = "gc-overlay";
    overlay.innerHTML = `
      ${reduce ? "" : `<canvas class="gc-canvas" aria-hidden="true"></canvas>`}
      <div class="gc-card" role="dialog" aria-modal="true" aria-labelledby="gc-title">
        <div class="gc-emoji" aria-hidden="true">🎉</div>
        <div class="gc-title" id="gc-title">目標達成！おめでとうございます</div>
        <div class="gc-text">${month}月は、目標の${yen(goal)}を超えました。<br>ここまでで <b>${yen(earned)}</b> 稼ぎました。</div>
        <button type="button" class="btn-primary gc-btn" id="gc-ok">やったー！</button>
      </div>`;
    document.body.appendChild(overlay);
    let stop = () => {};
    const close = () => { stop(); overlay.remove(); };
    document.getElementById("gc-ok").onclick = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    if (!reduce) stop = confetti(overlay.querySelector(".gc-canvas"));
  }

  // ---------- 紙吹雪(数秒でおさまる) ----------
  function confetti(canvas) {
    if (!canvas || !canvas.getContext) return () => {};
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#12A36A", "#2CC585", "#8ED9B6", "#F5A623", "#FFD166", "#FF6B6B", "#4DA3FF"];
    const parts = Array.from({ length: 110 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.6,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vx: -1 + Math.random() * 2, vy: 2 + Math.random() * 3.5,
      rot: Math.random() * Math.PI * 2, vr: -0.2 + Math.random() * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0, alive = true;
    const t0 = performance.now();
    (function frame(t) {
      if (!alive) return;
      ctx.clearRect(0, 0, W, H);
      let visible = 0;
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx += Math.sin(p.y / 40) * 0.02;
        if (p.y < H + 20) visible++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (visible > 0 && t - t0 < 6000) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    })(t0);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }

  window.__goalCelebrationTest = { earnedSoFar, check }; // 動作確認用
})();
// ==========================================================
// 【4. 引っ張って更新】
// ==========================================================
// ==========================================================
// 引っ張って更新(js/features/pull-refresh.js)
//
// ・画面の一番上で、指で下に引っ張って離すと、アプリを読み込み直します
//   (最新のお知らせや、公開した新しい版も、ここで読み込まれます)
// ・入力したデータ(シフトなど)は、端末に保存済みなので消えません
// ・次のときは動きません(入力の途中で消えてしまうのを防ぐため)
//     - 「追加」タブ  - ポップアップが開いているとき  - 文字を入力しているとき
// ・script.js は書き換えず、この1ファイルだけで動きます
// ==========================================================
(function () {
  const THRESHOLD = 72;   // これだけ引っ張って離すと、更新(px)
  const MAX_PULL = 110;   // 見た目の引っ張れる上限(px)
  const RESIST = 0.5;     // 指の動きに対する、画面の動きの割合(重く感じさせる)

  let startY = 0, startX = 0, pull = 0, tracking = false, busy = false, decided = false;

  // ---- 見た目(くるくる) ----
  const el = document.createElement("div");
  el.className = "ptr";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="ptr-circle"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13"/><path d="M6 12l6 6 6-6"/></svg></div>`;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
  if (document.body) document.body.appendChild(el);

  function draw(y) {
    const p = Math.min(1, y / THRESHOLD);
    el.style.setProperty("--ptr-y", y + "px");
    el.style.setProperty("--ptr-p", p);
    el.classList.toggle("ptr-ready", y >= THRESHOLD);
    el.classList.toggle("ptr-show", y > 4);
  }
  function reset() {
    el.classList.remove("ptr-drag");
    pull = 0; draw(0);
  }

  // ---- 動いてよい場面か ----
  const scrollTop = () => window.pageYOffset || document.documentElement.scrollTop || 0;
  function blocked(target) {
    if (busy) return true;
    if (typeof state !== "undefined" && state.tab === "add") return true;       // 入力が消えないように
    if (document.querySelector(".modal-overlay:not(.hidden)")) return true;      // ポップアップ中
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;           // 入力中
    // 中身が自分でスクロールできる場所(下に戻れる)の中なら、そちらを優先
    for (let n = target; n && n !== document.body; n = n.parentElement) {
      if (n.scrollTop > 0) return true;
    }
    return false;
  }

  // ---- 指の動き ----
  document.addEventListener("touchstart", (e) => {
    tracking = false; decided = false;
    if (e.touches.length !== 1 || scrollTop() > 0 || blocked(e.target)) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      // 縦に下へ動いたときだけ、引っ張る動き。横や上は、ふつうの操作
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scrollTop() > 0) { tracking = false; return; }
      decided = true;
      el.classList.add("ptr-drag");
    }
    if (e.cancelable) e.preventDefault(); // 画面そのものが、びよんと動くのを止める
    pull = Math.min(MAX_PULL, dy * RESIST);
    draw(pull);
  }, { passive: false });

  function end() {
    if (!tracking || !decided) { tracking = false; return; }
    tracking = false;
    if (pull >= THRESHOLD) {
      busy = true;
      el.classList.remove("ptr-drag");
      el.classList.add("ptr-loading");
      draw(THRESHOLD);
      setTimeout(() => location.reload(), 350);
    } else reset();
  }
  document.addEventListener("touchend", end, { passive: true });
  document.addEventListener("touchcancel", () => { if (!busy) { tracking = false; reset(); } }, { passive: true });
})();
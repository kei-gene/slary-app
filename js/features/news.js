// ==========================================================
// お知らせ機能  (js/features/news.js)
//
// ・アプリを開いたときに news.json を読み込む
// ・ホームの右上に「ベルマーク」を常に表示。新しいお知らせがあるときは、赤い数字の印がつく
// ・ベルをタップすると、お知らせの一覧(新しい順)が開く。読んだお知らせは「NEW」が消えるだけで、一覧には残る
// ・「重要」のお知らせだけは、読むまでホームの上に帯でも出す
// ・読み込むだけで、利用者のデータは送信しません
// ・読み込みに失敗しても(オフライン等)、何も表示せず、アプリは普通に動きます
// ・script.js は書き換えず、上から包んで変更しています
//
// 【お知らせの出し方】 news.json を編集して、他のファイルと一緒に公開するだけ
//   id    : 重複しない文字列(これが同じなら「読んだ」扱いのまま。新しく出したいときは新しいidに)
//   date  : 表示する日付(YYYY-MM-DD)
//   title : 見出し(短く)
//   body  : 本文(\n で改行。 [表示する文字](https://...) と書くとリンクになります)
//   level : "info"(ふつう) / "important"(オレンジで目立たせる)
//   until : (任意) この日を過ぎたら表示しない(YYYY-MM-DD)
// ==========================================================
(function () {
  const NEWS_URL = "news.json";
  const MAX_ITEMS = 20;     // 一覧に出す最大件数
  const KEEP_READ_IDS = 60; // 「読んだ」記録の保存件数
  const LS_META = "wage_meta"; // backup.js などと共用(それぞれ自分の項目だけ書き換える)

  let items = [];

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function loadMeta() { try { return JSON.parse(localStorage.getItem(LS_META)) || {}; } catch (e) { return {}; } }
  function saveMeta(patch) { try { localStorage.setItem(LS_META, JSON.stringify({ ...loadMeta(), ...patch })); } catch (e) {} }
  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

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
    const row = document.querySelector("#home-content .home-month-row");
    if (!row || row.querySelector(".nw-bell") || items.length === 0) return;
    const n = unread().length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nw-bell";
    btn.setAttribute("aria-label", n > 0 ? `お知らせ(未読${n}件)` : "お知らせ");
    btn.innerHTML = BELL_SVG + (n > 0 ? `<span class="nw-badge">${n > 9 ? "9+" : n}</span>` : "");
    btn.onclick = openNews;
    row.insertBefore(btn, row.querySelector(".month-segment"));
  }

  function injectBanner() {
    const host = document.getElementById("home-content");
    if (!host || host.querySelector(".nw-banner")) return;
    const list = unread().filter((x) => x.important); // 読むまで目立たせるのは、重要なものだけ
    if (list.length === 0) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nw-banner nw-important";
    btn.innerHTML = `
      <span class="nw-tag">重要</span>
      <span class="nw-title">${esc(list[0].title)}</span>
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
  // 本文の整形: HTMLは無効にしたうえで、改行と [文字](https://...) のリンクだけ使えるようにする
  function bodyHtml(text) {
    return esc(text)
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n/g, "<br>");
  }
  // 一覧に出す短い抜粋(リンクの記号などは外して、文字だけにする)
  function previewText(text) {
    return text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1").replace(/\s+/g, " ").trim();
  }

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
          ${items.map((x, i) => `
            <button type="button" class="nw-item${x.important ? " nw-item-important" : ""}" data-i="${i}">
              <div class="nw-item-head">
                ${r.has(x.id) ? "" : `<span class="nw-new">NEW</span>`}
                <span class="nw-date">${esc(x.date.replace(/-/g, "/"))}</span>
                <span class="nw-item-chev">›</span>
              </div>
              <div class="nw-item-title">${esc(x.title)}</div>
              ${x.body ? `<div class="nw-item-preview">${esc(previewText(x.body))}</div>` : ""}
            </button>`).join("") || `<div class="nw-empty">お知らせはありません</div>`}
        </div>`;
      document.getElementById("nw-close").onclick = close;
      box.querySelectorAll(".nw-item").forEach((el) => { el.onclick = () => showDetail(items[Number(el.dataset.i)]); });
    }

    function showDetail(x) {
      box.innerHTML = `
        <div class="modal-header">
          <button type="button" class="nw-back" id="nw-back">‹ 一覧へ</button>
          <span class="modal-close" id="nw-close" aria-label="閉じる">✕</span>
        </div>
        <div class="nw-detail${x.important ? " nw-detail-important" : ""}">
          <div class="nw-date">${esc(x.date.replace(/-/g, "/"))}</div>
          <div class="nw-detail-title">${esc(x.title)}</div>
          <div class="nw-detail-body">${bodyHtml(x.body) || "(詳しい内容はありません)"}</div>
        </div>`;
      document.getElementById("nw-back").onclick = showList;
      document.getElementById("nw-close").onclick = close;
    }

    showList();
  }

  document.addEventListener("DOMContentLoaded", fetchNews);
})();
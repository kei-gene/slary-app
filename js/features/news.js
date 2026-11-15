// ==========================================================
// お知らせ機能  (js/features/news.js)
//
// ・アプリを開いたときに news.json を読み込む
// ・ホームのロゴの右に「ベルマーク」を常に表示。新しいお知らせがあるときは、赤い数字の印がつく
// ・ベルをタップすると、お知らせの一覧(新しい順)が開く。読んだお知らせは「NEW」が消えるだけで、一覧には残る
// ・「重要」のお知らせだけは、読むまでホームの上に帯でも出す
// ・読み込むだけで、利用者のデータは送信しません
// ・読み込みに失敗しても(オフライン等)、何も表示せず、アプリは普通に動きます
// ・script.js は書き換えず、上から包んで変更しています
//
// 【本文の飾り】(HTMLは使えません。この記号だけが飾りになります。組み合わせ・入れ子もOK)
//   **太字**            → 太字
//   __下線__            → 下線
//   ~~取り消し~~        → 取り消し線
//   ==マーカー==        → 黄色のマーカー   /  ==ピンク|文字==  のように色も選べる(黄・ピンク・緑・青・橙)
//   {赤|文字}           → 文字の色(赤・青・緑・橙・紫・灰、または #E5484D のような色コード)
//   {大|文字}           → 文字の大きさ(小・大・特大)     /  {赤,大|文字}  のように , で組み合わせ
//   [文字](https://...) → リンク
//
// 【お知らせの出し方】 news.json を編集して、他のファイルと一緒に公開するだけ
//   id    : 重複しない文字列(これが同じなら「読んだ」扱いのまま。新しく出したいときは新しいidに)
//   date  : 表示する日付(YYYY-MM-DD)
//   title : 見出し(短く)
//   body  : 本文(\n で改行。リンクや、太字・色・マーカーなどの飾りも使えます。書き方は下の「本文の飾り」)
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

  // ---------- 本文の飾り ----------
  // 安全のため、HTMLは無効にしたうえで、決まった記号だけを、決まった見た目に変える
  const TEXT_COLORS = { 赤: "#E5484D", 青: "#2F7FE0", 緑: "#12A36A", 橙: "#E67700", 紫: "#8E4EC6", 灰: "#8E8E93" };
  const MARK_COLORS = { 黄: "#FFE066", ピンク: "#FFC2D4", 緑: "#B7F0CF", 青: "#BFE0FF", 橙: "#FFD6A5" };
  const SIZES = { 小: "0.85em", 大: "1.2em", 特大: "1.45em" };
  const HEX = /^#[0-9A-Fa-f]{6}$/;

  // {赤,大|文字} の「赤,大」を、見た目(style)に直す。分からない指定があれば null
  function styleOf(keys) {
    const parts = [];
    for (const raw of keys.split(",")) {
      const k = raw.trim();
      if (TEXT_COLORS[k]) parts.push(`color:${TEXT_COLORS[k]}`);
      else if (HEX.test(k)) parts.push(`color:${k}`);
      else if (SIZES[k]) parts.push(`font-size:${SIZES[k]};line-height:1.5`);
      else return null;
    }
    return parts.join(";");
  }

  // 飾りの記号を、安全なHTMLに変える(入力は esc() ずみの文字)
  function decorate(t) {
    t = t.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
         .replace(/__([\s\S]+?)__/g, '<u class="nw-u">$1</u>')
         .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>")
         .replace(/==([\s\S]+?)==/g, (m, inner) => {
           let color = MARK_COLORS["黄"], body = inner;
           const sep = inner.indexOf("|");
           if (sep > 0 && sep <= 8) {
             const k = inner.slice(0, sep).trim();
             if (MARK_COLORS[k]) { color = MARK_COLORS[k]; body = inner.slice(sep + 1); }
             else if (HEX.test(k)) { color = k; body = inner.slice(sep + 1); }
           }
           return `<mark class="nw-mk" style="background-image:linear-gradient(transparent 55%,${color} 55%)">${body}</mark>`;
         });
    // {色|文字} は、入れ子にも対応するため、内側から順に変える
    for (let i = 0; i < 6; i++) {
      const next = t.replace(/\{([^|{}\n]+)\|([^{}]+?)\}/g, (m, keys, body) => {
        const st = styleOf(keys);
        return st ? `<span style="${st}">${body}</span>` : m;
      });
      if (next === t) break;
      t = next;
    }
    return t;
  }

  const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

  // 本文の整形: HTMLは無効にしたうえで、飾り・リンク・改行だけを使えるようにする
  function bodyHtml(text) {
    const links = [];
    // リンクのアドレスの中の記号が、飾りと間違われないように、先に取り出しておく
    let t = esc(text).replace(LINK_RE, (m, label, url) => {
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${decorate(label)}</a>`);
      return `\u0000${links.length - 1}\u0000`;
    });
    t = decorate(t).replace(/\n/g, "<br>");
    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => links[Number(i)]);
  }

  // 一覧に出す短い抜粋(飾りの記号は外して、文字だけにする)
  function previewText(text) {
    let t = text.replace(LINK_RE, "$1");
    for (let i = 0; i < 6; i++) {
      const next = t.replace(/\{[^|{}\n]+\|([^{}]*)\}/g, "$1");
      if (next === t) break;
      t = next;
    }
    t = t.replace(/==(?:[^|=\n]{1,8}\|)?([\s\S]+?)==/g, "$1")
         .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
         .replace(/__([\s\S]+?)__/g, "$1")
         .replace(/~~([\s\S]+?)~~/g, "$1");
    return t.replace(/\s+/g, " ").trim();
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
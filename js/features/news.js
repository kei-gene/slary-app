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
  const LS_META = "wage_meta"; // backup.js などと共用(それぞれ自分の項目だけ書き換える)

  let items = [];

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function loadMeta() { try { return JSON.parse(localStorage.getItem(LS_META)) || {}; } catch (e) { return {}; } }
  function saveMeta(patch) { try { localStorage.setItem(LS_META, JSON.stringify({ ...loadMeta(), ...patch })); } catch (e) {} }
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
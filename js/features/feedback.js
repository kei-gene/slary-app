// ==========================================================
// ご意見・不具合を送る + バージョン表示(js/features/feedback.js)
//
// ・設定タブの一番下に、「ご意見・不具合を送る」ボタンと、バージョンを表示します
// ・ボタンを押すと、Googleフォームが新しいタブで開きます
// ・script.js などは書き換えず、設定タブの下に足すだけです
//
// 【あとで直すのは、ここだけ】
// ==========================================================
const FEEDBACK_FORM_URL = "https://forms.gle/ここにフォームのURL"; // ← GoogleフォームのURL
const APP_STAGE = "ベータ版";   // 表示する段階の名前
const APP_VERSION = "0.1";    // バージョン番号
// ==========================================================

(function () {
  if (typeof document === "undefined") return;

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const appName = () => (window.APP && window.APP.name) || "かせログ"; // 名前は app-config.js の1か所から
  const versionText = () => [appName(), APP_STAGE, "v" + APP_VERSION].filter(Boolean).join(" ");
  if (window.APP) window.APP.version = APP_VERSION; // ほかの機能からも使えるように

  // https:// で始まる、本物のURLのときだけ「設定済み」とみなす(差し替え忘れの目印)
  const urlReady = () => /^https:\/\/[^\s/]+\.[^\s/]+/.test(FEEDBACK_FORM_URL) && !/ここに/.test(FEEDBACK_FORM_URL);

  const ICON_EXT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;

  function build() {
    const wrap = document.createElement("div");
    wrap.id = "fb-wrap";
    wrap.innerHTML = `
      <div class="fb-card">
        <div class="fb-title">ご意見・不具合</div>
        <div class="fb-sub">使いにくい点や、困ったことを教えてください。</div>
        <a class="fb-btn" id="fb-send" href="${esc(urlReady() ? FEEDBACK_FORM_URL : "#")}" target="_blank" rel="noopener noreferrer">
          <span>ご意見・不具合を送る</span>${ICON_EXT}
        </a>
        <div class="fb-note" id="fb-note" role="status" hidden>フォームのURLが未設定です(feedback.js の先頭で設定します)</div>
      </div>
      <div class="fb-version" id="fb-version">${esc(versionText())}</div>`;
    wrap.querySelector("#fb-send").addEventListener("click", (e) => {
      if (urlReady()) return; // 設定済みなら、そのままリンクとして新しいタブで開く
      e.preventDefault();
      wrap.querySelector("#fb-note").hidden = false;
    });
    return wrap;
  }

  // 設定タブの、一番下に置く(ほかの機能があとから並べ替えても、最後に戻す)
  function place() {
    const screen = document.getElementById("screen-settings");
    if (!screen) return;
    let wrap = document.getElementById("fb-wrap");
    if (!wrap) wrap = build();
    if (screen.lastElementChild !== wrap) screen.appendChild(wrap);
  }

  document.addEventListener("DOMContentLoaded", place);
  if (document.readyState !== "loading") place();

  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    const r = baseSwitchTab(tab, keepEditing);
    if (tab === "settings") { try { place(); } catch (e) { console.error("設定の下の表示でエラー", e); } }
    return r;
  };
})();
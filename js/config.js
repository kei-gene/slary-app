// ==========================================================
// アプリの設定(あとで直すのは、ここだけ)  js/config.js
//
//  ・アプリ名 / バージョン / ご意見フォームのURL
//  ・index.html の一番上(disclaimer-text.js より前)で読み込みます
// ==========================================================

// ---------- アプリ名(名前を変えるときは、まずここ!) ----------
window.APP = {
  name: "かせログ",
};

// ---------- ご意見・不具合フォーム / バージョン表示(設定タブの一番下) ----------
const FEEDBACK_FORM_URL = "https://forms.gle/1k86812jr1jLf3Mz9"; // ← GoogleフォームのURL
const APP_STAGE = "ベータ版";   // 表示する段階の名前
const APP_VERSION = "0.1";    // バージョン番号

window.APP.version = APP_VERSION; // ほかの機能からも使えるように

// ---------- 画面に出る名前を、自動で差し替えます ----------
(function () {
  const name = window.APP.name;
  document.title = name;
  // CSS(PC版サイドバーのロゴ文字)から使えるようにする
  document.documentElement.style.setProperty("--app-name", JSON.stringify(name));
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".brand-name").forEach((el) => (el.textContent = name));
  });
})();
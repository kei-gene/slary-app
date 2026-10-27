// ==========================================================
// アプリ名の設定(名前を変えるときは、まずここ!)
// index.html の一番上(disclaimer-text.js より前)で読み込みます
// ==========================================================
window.APP = {
  name: "かせログ",
};

// 画面に出る名前を自動で差し替えます
(function () {
  const name = window.APP.name;
  document.title = name;
  // CSS(PC版サイドバーのロゴ文字)から使えるようにする
  document.documentElement.style.setProperty("--app-name", JSON.stringify(name));
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".brand-name").forEach((el) => (el.textContent = name));
  });
})();
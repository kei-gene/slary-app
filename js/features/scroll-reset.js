// ==========================================================
// 画面を開いたとき、いつも一番上から表示する(scroll-reset.js)
//
// ・タブを切り替えたとき、前の画面のスクロール位置が残って、
//   見出しが画面の上に隠れてしまうのを防ぎます
// ・ポップアップ(勤務先の編集など)も、開くたびに一番上から表示します
// ・既存のコードは書き換えず、上から包んでいます
// ==========================================================
(function () {
  if (typeof document === "undefined") return;

  // タブを切り替えたら、ページの一番上へ
  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    baseSwitchTab(tab, keepEditing);
    window.scrollTo(0, 0);
  };

  // ポップアップが開いたら、中身を一番上へ
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof MutationObserver === "undefined") return;
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      new MutationObserver(() => {
        if (overlay.classList.contains("hidden")) return;
        const modal = overlay.querySelector(".modal");
        if (modal) modal.scrollTop = 0;
      }).observe(overlay, { attributes: true, attributeFilter: ["class"] });
    });
  });
})();
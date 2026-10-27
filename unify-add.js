// ==========================================================
// シフト追加を「統一バージョン」に固定する  (js/features/unify-add.js)
//
// ・設定の「シフト追加画面のスタイル」を非表示にする
// ・シフト追加は常に「カレンダーで日付を選ぶ」形(1日でも複数日でもOK)
// ・script.js は書き換えず、上から包んで変更しています
// ==========================================================
(function () {
  // 新規追加のときは常にカレンダー式(編集のときだけ1件用の画面)
  isAddMultiMode = function () {
    return !state.editingShiftId;
  };

  // 保存データに古い「toggle」が残っていても、常に統一バージョンとして扱う
  const baseRenderAddScreen = renderAddScreen;
  renderAddScreen = function () {
    state.addScreenStyle = "unified";
    baseRenderAddScreen();
  };

  // 設定画面のスタイル選択は、もう描画しない
  renderAddStyleSetting = function () {};

  // 設定画面の「シフト追加画面のスタイル」の見出しと枠を隠す
  function hideStyleSection() {
    const list = document.getElementById("add-style-list");
    if (list) {
      const pad = list.closest(".list-pad") || list;
      pad.style.display = "none";
    }
    document.querySelectorAll("#screen-settings .section-label").forEach((el) => {
      if (el.textContent.includes("シフト追加画面のスタイル")) el.style.display = "none";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    hideStyleSection();
    const screen = document.getElementById("screen-settings");
    if (screen) new MutationObserver(hideStyleSection).observe(screen, { childList: true, subtree: true });
  });
})();
// ==========================================================
// 設定タブの整理
//
// ・よく使うもの(月収目標・テンプレート・バックアップ)を上に
// ・あまり触らないもの(祝日・曜日の区分・追加画面のスタイル)は
//   「詳細設定」の中にたたんで収納
// ・「ご利用にあたって」(免責事項)もたたんで収納
// ・説明文を短くしています
// ・既存のコードは書き換えず、画面ができたあとに並べ替えるだけです
// ==========================================================
(function () {
  if (typeof document === "undefined") return;

  // ---------- 説明文を短くする(追加画面のスタイル) ----------
  const STYLE_DESC = {
    toggle: "単発/複数日をボタンで切り替え",
    unified: "カレンダーで日付を選ぶだけ(1日でも複数日でもOK)",
  };
  const baseRenderAddStyleSetting = renderAddStyleSetting;
  renderAddStyleSetting = function () {
    baseRenderAddStyleSetting();
    document.querySelectorAll("#add-style-list .addstyle-row").forEach((row) => {
      const d = row.querySelector(".addstyle-desc");
      if (d && STYLE_DESC[row.dataset.style]) d.textContent = STYLE_DESC[row.dataset.style];
    });
  };

  // ---------- 見出しごとにまとまりを作る ----------
  function sectionsOf(screen) {
    const flat = [];
    [...screen.children].forEach((el) => {
      if (el.classList.contains("header-title")) return;
      if (el.id === "backup-section") flat.push(...el.children); // バックアップと免責は別々に扱う
      else flat.push(el);
    });
    const groups = {};
    let key = null;
    flat.forEach((el) => {
      if (el.classList.contains("section-label")) {
        key = el.textContent.trim();
        groups[key] = [];
      }
      if (key) groups[key].push(el);
    });
    return groups;
  }

  // 折りたたみ(見出しの行をタップで開閉)
  function makeFold(id, title, sub, bodyEls) {
    const wrap = document.createElement("div");
    wrap.className = "st-fold";
    wrap.id = id;
    wrap.innerHTML = `
      <button type="button" class="st-fold-head" aria-expanded="false">
        <span class="st-fold-text">
          <span class="st-fold-title">${title}</span>
          ${sub ? `<span class="st-fold-sub">${sub}</span>` : ""}
        </span>
        <span class="chevron-icon">${ICON_CHEVRON_DOWN}</span>
      </button>
      <div class="st-fold-body hidden"></div>
    `;
    const body = wrap.querySelector(".st-fold-body");
    bodyEls.forEach((el) => body.appendChild(el));
    const head = wrap.querySelector(".st-fold-head");
    head.onclick = () => {
      const open = body.classList.toggle("hidden") === false;
      head.setAttribute("aria-expanded", String(open));
      wrap.classList.toggle("is-open", open); // 開いている間は、見出しと中身を1つの枠にまとめて見せる
      wrap.querySelector(".chevron-icon").classList.toggle("open", open);
    };
    return wrap;
  }

  function setText(el, text) { if (el) el.textContent = text; }

  function tidySettings() {
    const screen = document.getElementById("screen-settings");
    if (!screen || document.getElementById("st-detail")) return;
    const g = sectionsOf(screen);
    const need = ["月収目標", "祝日設定", "曜日の区分", "テンプレート", "シフト追加画面のスタイル"];
    if (need.some((k) => !g[k])) { console.warn("設定の整理をスキップ: 見出しが見つかりません"); return; }

    // 説明文を短く
    setText(g["祝日設定"][1], "日本の祝日は自動で登録されます。不要な日の削除や、独自の休みの追加もできます。");
    setText(g["曜日の区分"][1], "オンにした曜日は、休日(祝日)と同じ時給ルールになります。");
    setText(g["テンプレート"][1], "シフト追加画面で選ぶと、勤務先と出退勤の時間が自動で入ります。");

    // 詳細設定の中身
    const detail = makeFold(
      "st-detail", "詳細設定", "祝日・曜日の区分・追加画面のスタイル",
      [...g["祝日設定"], ...g["曜日の区分"], ...g["シフト追加画面のスタイル"]]
    );

    // 免責事項
    const discl = g["ご利用にあたって"]
      ? makeFold("st-disclaimer", "ご利用にあたって", "免責事項など", g["ご利用にあたって"].slice(1))
      : null;
    if (g["ご利用にあたって"]) g["ご利用にあたって"][0].remove(); // 見出し(折りたたみの題名に置き換え)

    // 並べ直し: 月収目標 → テンプレート → バックアップ → 詳細設定 → ご利用にあたって
    const order = [
      ...g["月収目標"],
      ...g["テンプレート"],
      ...(g["バックアップ"] || []),
    ];
    order.forEach((el) => screen.appendChild(el));
    const spacer = document.createElement("div");
    spacer.className = "st-spacer";
    screen.appendChild(spacer);
    screen.appendChild(detail);
    if (discl) screen.appendChild(discl);
    const old = document.getElementById("backup-section");
    if (old && old.children.length === 0) old.remove();
  }

  document.addEventListener("DOMContentLoaded", tidySettings);
})();
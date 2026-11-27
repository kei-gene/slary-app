// ==========================================================
// 設定まわり(settings.js)
//
//  1. バックアップ・復元 + 初回の免責(同意)画面       … 元 backup.js
//  2. 設定タブの折りたたみ(詳細設定 / ご利用にあたって) … 元 settings-tidy.js
//  3. 勤務履歴(設定の中から開く画面)の移動まわり       … 元 history-move.js
//  4. ご意見・不具合を送る + バージョン表示             … 元 feedback.js
//
// 設定タブの並び順や見出しは index.html に書いてあります。
// ==========================================================

// ==========================================================
// 【1. バックアップ・免責】
// ==========================================================
// ==========================================================
// バックアップ・復元 + 免責表示
// 【v5】年収の壁の設定(wage_walls)もバックアップに含めるようにした
// ==========================================================
(function () {
  const BACKUP_KEYS = { workplaces: "wage_workplaces", shifts: "wage_shifts", settings: "wage_settings", walls: "wage_walls" };
  const REMIND_DAYS = 30;

  // 文章は disclaimer-text.js から読み込む(読み込めなかったときの最低限の予備つき)
  const FALLBACK = {
    version: 0,
    intro: "",
    items: [{ level: "important", title: "ご利用にあたって", body: "表示される金額は**目安**であり、正確性を保証するものではありません。データはこの端末内に保存されます。" }],
  };
  function getDisclaimer() {
    const d = window.DISCLAIMER_TEXT;
    return d && Array.isArray(d.items) && d.items.length > 0 ? d : FALLBACK;
  }

  // 本文用: 上の無害化をしたあとで、強調の印と改行だけをHTMLに変換する
  //   **文字** → マーカー強調 / !!文字!! → 赤字 / 改行 → <br>
  function rich(str) {
    return esc(str)
      .replace(/\*\*([\s\S]+?)\*\*/g, '<mark class="disc-em">$1</mark>')
      .replace(/!!([\s\S]+?)!!/g, '<span class="disc-warn">$1</span>')
      .replace(/\n/g, "<br>");
  }

  function disclaimerItemsHtml() {
    return getDisclaimer().items.map((it, i) => `
      <div class="disc-item${it.level === "important" ? " disc-item-important" : ""}">
        <div class="disc-num">${i + 1}</div>
        <div class="disc-main">
          <div class="disc-title">${esc(it.title)}</div>
          <p class="disc-text">${rich(it.body)}</p>
        </div>
      </div>
    `).join("");
  }

  // ---------- export ----------
  function buildBackup() {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
    return {
      app: "wage-manager",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        workplaces: read(BACKUP_KEYS.workplaces) || [],
        shifts: read(BACKUP_KEYS.shifts) || [],
        settings: read(BACKUP_KEYS.settings) || {},
        walls: read(BACKUP_KEYS.walls), // 年収の壁の設定(まだ使っていなければ null)
      },
    };
  }

  function backupFileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `jikyu-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  }

  async function exportBackup() {
    const json = JSON.stringify(buildBackup(), null, 2);
    const name = backupFileName();
    const file = new File([json], name, { type: "application/json" });

    // スマホはまず共有シート(ファイルに保存/LINE/メール等)を試す
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "時給アプリのバックアップ" });
        saveMeta({ lastBackupAt: new Date().toISOString() });
        refreshStatus();
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // ユーザーがキャンセル
        // それ以外は通常のダウンロードにフォールバック
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveMeta({ lastBackupAt: new Date().toISOString() });
    refreshStatus();
  }

  async function copyBackup() {
    const json = JSON.stringify(buildBackup());
    try {
      await navigator.clipboard.writeText(json);
      showNotice("コピーしました。メモアプリなどに貼り付けて保管してください。");
      saveMeta({ lastBackupAt: new Date().toISOString() });
      refreshStatus();
    } catch (e) {
      showNotice("コピーに失敗しました。「ファイルに保存」をお使いください。");
    }
  }

  // ---------- import ----------
  function validateBackup(obj) {
    if (!obj || typeof obj !== "object" || obj.app !== "wage-manager" || !obj.data) return "このアプリのバックアップファイルではありません。";
    const { workplaces, shifts, settings } = obj.data;
    if (!Array.isArray(workplaces) || !Array.isArray(shifts)) return "バックアップの形式が正しくありません。";
    const okWp = workplaces.every((w) => w && typeof w.id === "string" && typeof w.name === "string" && Array.isArray(w.rates));
    const okSh = shifts.every((s) => s && typeof s.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date || "") && typeof s.start === "string" && typeof s.end === "string");
    if (!okWp || !okSh) return "バックアップの中身に不正なデータがあります。";
    if (settings && typeof settings !== "object") return "設定データの形式が正しくありません。";
    const walls = obj.data.walls; // 古いバックアップには無いので、あれば検証する
    if (walls != null && (typeof walls !== "object" || !Array.isArray(walls.walls))) return "年収の壁の設定の形式が正しくありません。";
    return null;
  }

  function applyBackup(obj) {
    // 復元前の状態を1世代だけ退避(復元を間違えたとき用)
    try { localStorage.setItem("wage_prev_restore", JSON.stringify(buildBackup())); } catch (e) {}
    localStorage.setItem(BACKUP_KEYS.workplaces, JSON.stringify(obj.data.workplaces));
    localStorage.setItem(BACKUP_KEYS.shifts, JSON.stringify(obj.data.shifts));
    localStorage.setItem(BACKUP_KEYS.settings, JSON.stringify(obj.data.settings || {}));
    if (obj.data.walls) localStorage.setItem(BACKUP_KEYS.walls, JSON.stringify(obj.data.walls)); // 古いバックアップでは今の設定を残す
    location.reload();
  }

  function handleImportText(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { showNotice("読み込めませんでした。バックアップファイル(.json)を選んでください。"); return; }
    const err = validateBackup(obj);
    if (err) { showNotice(err); return; }
    const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString("ja-JP") : "不明";
    showConfirm(
      `このバックアップで復元しますか？\n\n作成日時: ${when}\n勤務先 ${obj.data.workplaces.length}件 / シフト ${obj.data.shifts.length}件\n\n現在のデータは上書きされます。`,
      () => applyBackup(obj),
      { title: "復元の確認", okLabel: "復元する" }
    );
  }

  function pickFile() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => handleImportText(String(reader.result));
      reader.readAsText(f);
    };
    input.click();
  }

  // ---------- UI: settings section ----------
  function daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function refreshStatus() {
    const el = document.getElementById("backup-status");
    if (!el) return;
    const meta = loadMeta();
    const d = daysSince(meta.lastBackupAt);
    const stale = d === null || d >= REMIND_DAYS;
    el.textContent = d === null
      ? "まだバックアップを取っていません"
      : `最終バックアップ: ${new Date(meta.lastBackupAt).toLocaleDateString("ja-JP")}(${d === 0 ? "今日" : d + "日前"})`;
    el.classList.toggle("backup-stale", stale);
  }

  // 設定タブのバックアップ欄と、免責事項の文章(枠は index.html にあります)
  function setupSettingsSection() {
    const list = document.getElementById("disclaimer-list");
    if (list) list.innerHTML = disclaimerItemsHtml();
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on("backup-export-btn", exportBackup);
    on("backup-copy-btn", copyBackup);
    on("backup-import-btn", pickFile);
    on("backup-paste-toggle", () => document.getElementById("backup-paste-area").classList.toggle("hidden"));
    on("backup-paste-go", () => handleImportText(document.getElementById("backup-paste-text").value.trim()));
    refreshStatus();
  }

  // ---------- UI: first-run disclaimer ----------
  function maybeShowDisclaimer() {
    const d = getDisclaimer();
    const meta = loadMeta();
    if (meta.disclaimerVersion === d.version) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.zIndex = 100;
    overlay.innerHTML = `
      <div class="modal disclaimer-modal" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <div class="disc-modal-head">
          <img class="disc-modal-logo" src="img/icon-96.png" alt="" width="52" height="52">
          <div class="disc-modal-title" id="disclaimer-title">ご利用にあたって</div>
          ${d.intro ? `<p class="disc-modal-intro">${rich(d.intro)}</p>` : ""}
        </div>
        <div class="disc-modal-body">${disclaimerItemsHtml()}</div>
        <button class="btn-primary disc-modal-btn" id="disclaimer-ok">同意して始める</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("disclaimer-ok").onclick = () => {
      saveMeta({ disclaimerVersion: d.version, disclaimerAcceptedAt: new Date().toISOString() });
      overlay.remove();
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupSettingsSection();
    maybeShowDisclaimer();
    // 設定タブを開くたびに「最終バックアップ」表示を更新
    document.querySelectorAll('.tab-item[data-tab="settings"]').forEach((b) =>
      b.addEventListener("click", () => setTimeout(refreshStatus, 0)));
  });
})();
// ==========================================================
// 【2. 折りたたみ・3. 勤務履歴の移動】
// ==========================================================
(function () {
  // 折りたたみ(見出しの行をタップで開閉。開いている間は、見出しと中身を1つの枠にまとめて見せる)
  function wireFolds() {
    document.querySelectorAll(".st-fold").forEach((wrap) => {
      const head = wrap.querySelector(".st-fold-head");
      const body = wrap.querySelector(".st-fold-body");
      if (!head || !body) return;
      head.onclick = () => {
        const open = body.classList.toggle("hidden") === false;
        head.setAttribute("aria-expanded", String(open));
        wrap.classList.toggle("is-open", open);
        wrap.querySelector(".chevron-icon").classList.toggle("open", open);
      };
    });
  }

  // 履歴はタブにないので、設定から開く。戻るボタンと「勤務履歴」ボタンをつなぐ
  document.addEventListener("DOMContentLoaded", () => {
    wireFolds();
    const back = document.getElementById("hs-back");
    if (back) back.onclick = () => switchTab("settings");
    const entry = document.getElementById("hs-entry-btn");
    if (entry) entry.onclick = () => switchTab("history");
  });

  // 履歴から「編集」に入ったときは、保存・取り消しのあと履歴に戻る。
  // 履歴を開いている間は、下のタブの「設定」を選択中の見た目にする
  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    if (state.tab === "add") {
      if (state.returnToHistory && tab === "home") tab = "history";
      state.returnToHistory = false;
    }
    baseSwitchTab(tab, keepEditing);
    if (tab === "history") {
      document.querySelectorAll(".tab-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === "settings"));
    }
  };
})();

// ==========================================================
// 【4. ご意見・不具合を送る】+ バージョン表示
// ==========================================================
(function () {
  if (typeof document === "undefined") return;

  const appName = () => (window.APP && window.APP.name) || "かせログ"; // 名前は app-config.js の1か所から
  const versionText = () => [appName(), APP_STAGE, "v" + APP_VERSION].filter(Boolean).join(" ");

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
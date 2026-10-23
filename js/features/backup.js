// ==========================================================
// バックアップ・復元 + 免責表示
// 【v5】年収の壁の設定(wage_walls)もバックアップに含めるようにした
// ==========================================================
(function () {
  const LS_META = "wage_meta"; // { disclaimerVersion, disclaimerAcceptedAt, lastBackupAt }
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

  // 書いた文章をそのまま安全に表示する(HTMLとして解釈させない)
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  // ---------- meta ----------
  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(LS_META)) || {}; } catch (e) { return {}; }
  }
  function saveMeta(patch) {
    try { localStorage.setItem(LS_META, JSON.stringify({ ...loadMeta(), ...patch })); } catch (e) {}
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

  function injectSettingsSection() {
    const screen = document.getElementById("screen-settings");
    if (!screen || document.getElementById("backup-section")) return;
    const wrap = document.createElement("div");
    wrap.id = "backup-section";
    wrap.innerHTML = `
      <div class="section-label">バックアップ</div>
      <div class="tmpl-hint" style="padding:0 20px 8px">データはこの端末内だけに保存されます。機種変更などに備えて、定期的に保存しましょう。</div>
      <div class="list-pad">
        <div class="card pad-14">
          <div id="backup-status" class="backup-status"></div>
          <button class="btn-primary" id="backup-export-btn">バックアップを保存</button>
          <div class="backup-sub-row">
            <button class="btn-confirm-cancel backup-sub-btn" id="backup-copy-btn">テキストをコピー</button>
            <button class="btn-confirm-cancel backup-sub-btn" id="backup-import-btn">ファイルから復元</button>
          </div>
          <div class="backup-paste-toggle" id="backup-paste-toggle">コピーしたテキストから復元する</div>
          <div id="backup-paste-area" class="hidden">
            <textarea id="backup-paste-text" class="backup-textarea" placeholder="コピーしたバックアップを貼り付け"></textarea>
            <button class="btn-confirm-cancel backup-sub-btn" id="backup-paste-go" style="width:100%">貼り付けた内容で復元</button>
          </div>
        </div>
      </div>

      <div class="section-label">ご利用にあたって</div>
      <div class="list-pad">
        <div class="card disclaimer-card">
          ${disclaimerItemsHtml()}
        </div>
      </div>
    `;
    screen.appendChild(wrap);

    document.getElementById("backup-export-btn").onclick = exportBackup;
    document.getElementById("backup-copy-btn").onclick = copyBackup;
    document.getElementById("backup-import-btn").onclick = pickFile;
    document.getElementById("backup-paste-toggle").onclick = () =>
      document.getElementById("backup-paste-area").classList.toggle("hidden");
    document.getElementById("backup-paste-go").onclick = () =>
      handleImportText(document.getElementById("backup-paste-text").value.trim());
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
    injectSettingsSection();
    maybeShowDisclaimer();
    // 設定タブを開くたびに「最終バックアップ」表示を更新
    document.querySelectorAll('.tab-item[data-tab="settings"]').forEach((b) =>
      b.addEventListener("click", () => setTimeout(refreshStatus, 0)));
  });
})();
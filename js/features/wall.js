// ==========================================================
// 年収の壁(専用タブ版 v2)
//
// ・タブバーに「年収の壁」を追加します(index.html は編集不要。JSで自動追加)
//   並び順: ホーム / 年収の壁 / ＋追加 / 勤務先 / 履歴 / 設定
// ・年収の壁タブ: 収入の見込み・壁ごとの状況・月ごとのグラフ・壁の設定
// ・ホーム: いちばん近い壁を、控えめな1行で表示(タップでタブへ)
// ・金額の初期値は2026年10月時点の目安です(制度は変わるため、必ず確認してください)
// ==========================================================
(function () {
  const LS_WALLS = "wage_walls"; // { profile, basis, walls:[{id,name,amount,enabled,note}] }
  const TAB_ORDER = ["home", "wall", "add", "workplaces", "history", "settings"];

  // ---------- 壁の初期値(給与収入ベース・円) ----------
  function presetWalls(profile, year) {
    const after2026 = year >= 2026;
    const list = [
      {
        id: "juminzei", name: "住民税", effect: "超えると住民税がかかる(翌年度から)", amount: 1100000, enabled: true,
        note: "自治体によって金額が変わります。課税されるのは翌年度です。",
      },
      {
        id: "shotokuzei", name: "所得税", effect: "超えると所得税がかかる", amount: after2026 ? 1780000 : 1600000, enabled: true,
        note: after2026
          ? "2026年分から178万円に引き上げられました。勤労学生控除などで変わる場合があります。"
          : "2025年分は160万円です。",
      },
      {
        id: "kenpo", name: "健康保険の扶養", effect: profile === "student" ? "超えると親の扶養から外れる" : "超えると扶養から外れる", amount: profile === "student" ? 1500000 : 1300000, enabled: true,
        note: profile === "student"
          ? "19〜22歳(配偶者を除く)の基準です。今後1年間の見込み収入で判定され、月額の基準もあります。"
          : "今後1年間の見込み収入で判定され、月額(約10.8万円)の基準もあります。健保組合により扱いが異なる場合があります。",
      },
    ];
    if (profile === "student") {
      list.push({
        id: "oya", name: "親の控除", effect: "超えると親の控除が段階的に減る", amount: after2026 ? 1590000 : 1500000, enabled: true,
        note: "親の特定親族特別控除が満額でなくなるラインです。超えても段階的に減ります。",
      });
    }
    return list;
  }

  function defaultWallState() {
    return { profile: "general", basis: "payday", walls: presetWalls("general", new Date().getFullYear()) };
  }

  // 名前・説明文は保存せず、いつも最新の文章(プリセット)を使う。自分で追加した壁だけ、保存した内容を使う
  function presetOf(x, profile) {
    return presetWalls(profile, 2026).find((w) => w.id === x.id); // 区分(学生/学生以外)ごとに文章が違う壁がある
  }

  function loadWalls() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_WALLS) : null;
      const w = raw ? JSON.parse(raw) : null;
      if (w && Array.isArray(w.walls)) {
        const prof = w.profile === "student" ? "student" : "general";
        return {
          profile: prof,
          basis: w.basis === "workday" ? "workday" : "payday",
          walls: w.walls.filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && Number(x.amount) > 0)
            .map((x) => { const p = presetOf(x, prof) || {}; return { id: x.id, name: p.name || x.name, effect: p.effect || "", amount: Number(x.amount), enabled: x.enabled !== false, note: p.note || x.note || "" }; }),
        };
      }
    } catch (e) { /* 読めなければ初期値 */ }
    return defaultWallState();
  }

  function saveWalls(cfg) {
    try { localStorage.setItem(LS_WALLS, JSON.stringify(cfg)); } catch (e) {}
  }

  // ---------- 収入の集計 ----------
  // シフトの勤務日から「実際に給料が支払われる日」を求める(勤務先の締め日・給料日の設定を使う)
  function paydayOf(wp, dateStr) {
    const d = stripTime(new Date(dateStr + "T00:00:00"));
    if (!wp) return d;
    const y = d.getFullYear(), m = d.getMonth();
    const close = resolveDateRule(wp.closingType || "fixed", wp.closingDay, y, m);
    const pm = d > stripTime(close) ? m + 1 : m; // 締め日を過ぎていたら、次の締め期間に入る
    const base = new Date(y, pm, 1);
    const by = base.getFullYear(), bm = base.getMonth();
    const closeDate = resolveDateRule(wp.closingType || "fixed", wp.closingDay, by, bm);
    const sameMonth = resolveDateRule(wp.paydayType || "fixed", wp.payday, by, bm);
    const payday = sameMonth > closeDate ? sameMonth : resolveDateRule(wp.paydayType || "fixed", wp.payday, by, bm + 1);
    return stripTime(payday);
  }

  // その年(basis: "payday"=給料日の年 / "workday"=勤務日の年)の収入を、日付順に並べて返す
  function collectIncome(year, basis) {
    const items = [];
    state.shifts.forEach((s) => {
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (!r) return;
      const date = basis === "payday" ? paydayOf(wp, s.date) : stripTime(new Date(s.date + "T00:00:00"));
      if (date.getFullYear() !== year) return;
      items.push({ date, pay: r.pay, minutes: r.workedMinutes });
    });
    items.sort((a, b) => a.date - b.date);
    return items;
  }

  function analyze(year, cfg, today) {
    const items = collectIncome(year, cfg.basis);
    let total = 0, paid = 0, minutes = 0;
    items.forEach((it) => {
      total += it.pay; minutes += it.minutes;
      if (it.date <= today) paid += it.pay;
    });
    return { items, total, paid, upcoming: total - paid, avgHourly: minutes > 0 ? total / (minutes / 60) : null };
  }

  function crossingDate(items, amount) {
    let cum = 0;
    for (const it of items) { cum += it.pay; if (cum > amount) return it.date; }
    return null;
  }

  // 月ごとの収入(1月〜12月の12個)
  function monthlyTotals(items) {
    const arr = new Array(12).fill(0);
    items.forEach((it) => { arr[it.date.getMonth()] += it.pay; });
    return arr;
  }

  // 年末の見込み: 登録済みの収入 + 「直近3か月の月平均」 × まだシフトが入っていない残りの月
  function forecastYearEnd(year, items, total, today) {
    if (year !== today.getFullYear()) return null;
    const monthly = monthlyTotals(items);
    const m = today.getMonth();
    let lastMonth = m;
    items.forEach((it) => { if (it.date.getMonth() > lastMonth) lastMonth = it.date.getMonth(); });
    const from = Math.max(0, m - 2);
    let sum = 0;
    for (let i = from; i <= m; i++) sum += monthly[i];
    const pace = sum / (m - from + 1);
    const remaining = 11 - lastMonth;
    if (!(pace > 0) || remaining <= 0) return null;
    return { pace, remaining, value: total + pace * remaining };
  }

  if (typeof window !== "undefined") {
    window.__wallTest = { presetWalls, paydayOf, collectIncome, analyze, crossingDate, monthlyTotals, forecastYearEnd };
  }
  if (typeof document === "undefined") return; // テスト用(ブラウザ以外では画面の処理をしない)

  // ---------- 表示用の部品 ----------
  function man(yenAmount) { return `${(yenAmount / 10000).toLocaleString()}万円`; }
  function enabledWalls(cfg) {
    return cfg.walls.filter((w) => w.enabled && w.amount > 0).sort((x, y) => x.amount - y.amount);
  }

  function wallRowsHtml(a, walls, today, cfg, highlightFirst) {
    const when = cfg.basis === "payday" ? "給料" : "勤務";
    const nextIdx = highlightFirst ? 0 : -1;
    return walls.map((w, i) => {
      const ratio = a.total / w.amount;
      const st = ratio >= 1 ? "over" : ratio >= 0.85 ? "warn" : "ok";
      const pct = Math.min(100, Math.round(ratio * 100));
      const remain = w.amount - a.total;
      let msg;
      if (remain <= 0) {
        const cd = crossingDate(a.items, w.amount);
        msg = cd && cd > today
          ? `登録済みのシフトだと、${fmtDateObj(cd)}の${when}分から超えます(${yen(-remain)}オーバー)`
          : `すでに超えています(${yen(-remain)}オーバー)`;
      } else {
        // 時間は、半分以上まで近づいてから出す(遠いうちは数字が大きすぎて実感がわかないため)
        const hours = a.avgHourly && ratio >= 0.5 ? `(約${Math.round(remain / a.avgHourly).toLocaleString()}時間分)` : "";
        msg = `あと ${yen(remain)} ${hours}`;
      }
      return `
        <div class="wall-row wall-${st}${i === nextIdx ? " wall-next" : ""}">
          <div class="wall-row-top">
            <span class="wall-name">${escapeHtml(w.name)}</span>
            <span class="wall-amount">${man(w.amount)}</span>
          </div>
          ${w.effect ? `<div class="wall-effect">${escapeHtml(w.effect)}</div>` : ""}
          <div class="wall-bar"><div class="wall-bar-fill" style="width:${pct}%"></div></div>
          <div class="wall-msg">${msg}</div>
        </div>
      `;
    }).join("");
  }

  function chartHtml(a, year, today) {
    const monthly = monthlyTotals(a.items);
    const max = Math.max(...monthly, 1);
    const thisYear = today.getFullYear();
    return `<div class="wc-chart">${monthly.map((v, i) => {
      const isNow = year === thisYear && i === today.getMonth();
      const future = year > thisYear || (year === thisYear && i > today.getMonth());
      const cls = ["wc-col", isNow ? "wc-now" : "", future ? "wc-future" : "", v <= 0 ? "wc-zero" : ""].join(" ");
      return `<div class="${cls}">
        <div class="wc-val">${v > 0 ? (v / 10000).toFixed(1) : ""}</div>
        <div class="wc-bar-wrap"><div class="wc-bar" style="height:${v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 2}%"></div></div>
        <div class="wc-m">${i + 1}</div>
      </div>`;
    }).join("")}</div>`;
  }

  // ---------- 年収の壁タブの中身 ----------
  let yearOffset = 0; // 0 = 今年 / 1 = 来年

  // たたむ・開く(開き具合は、画面を描き直しても覚えておく)
  const foldOpen = { others: false, chart: false };
  function foldHtml(key, title, sub, bodyHtml) {
    const open = foldOpen[key];
    return `
      <div class="wall-fold${open ? " is-open" : ""}">
        <button type="button" class="wall-fold-head" data-wallfold="${key}" aria-expanded="${open}">
          <span class="wall-fold-text">
            <span class="wall-fold-title">${title}</span>
            ${sub ? `<span class="wall-fold-sub">${sub}</span>` : ""}
          </span>
          <span class="chevron-icon ${open ? "open" : ""}">${ICON_CHEVRON_DOWN}</span>
        </button>
        <div class="wall-fold-body ${open ? "" : "hidden"}">${bodyHtml}</div>
      </div>`;
  }

  // いちばん近い壁を大きく、ほかの壁はたたんでおく
  function wallsSectionHtml(a, walls, today, cfg) {
    if (walls.length === 0) {
      return `<div class="wall-card"><div class="wall-set-hint">表示する壁がありません。下の「壁の設定」でONにしてください。</div></div>`;
    }
    const next = walls.find((w) => a.total < w.amount);
    if (!next) { // すべて超えている: 全部そのまま見せる
      return `<div class="wall-card">
        <div class="wall-card-title">すべての壁を超えています</div>
        <div class="wall-rows">${wallRowsHtml(a, walls, today, cfg, false)}</div>
      </div>`;
    }
    const others = walls.filter((w) => w !== next);
    return `
      <div class="wall-card">
        <div class="wall-card-title">いちばん近い壁</div>
        <div class="wall-rows wall-rows-one">${wallRowsHtml(a, [next], today, cfg, true)}</div>
      </div>
      ${others.length ? foldHtml("others", `ほかの壁を見る(${others.length})`, "", `<div class="wall-rows wall-rows-others">${wallRowsHtml(a, others, today, cfg, false)}</div>`) : ""}`;
  }

  function renderWallMain() {
    const container = document.getElementById("wall-main");
    if (!container) return;
    const cfg = loadWalls();
    const today = stripTime(new Date());
    const year = today.getFullYear() + yearOffset;
    const a = analyze(year, cfg, today);
    const walls = enabledWalls(cfg);
    const isPayday = cfg.basis === "payday";

    // 年末の見込み
    let forecastHtml = "";
    const fc = forecastYearEnd(year, a.items, a.total, today);
    if (fc) {
      const willCross = walls.filter((w) => a.total < w.amount && fc.value >= w.amount);
      forecastHtml = `
        <div class="wall-forecast">
          このペースだと、年末には約 <b>${yen(fc.value)}</b> になりそうです。
          <span class="wall-forecast-sub">(シフト未登録の${fc.remaining}か月分を、直近3か月の月平均 ${yen(fc.pace)} で計算)</span>
          ${willCross.length ? `<div class="wall-forecast-warn">この見込みだと「${willCross.map((w) => escapeHtml(w.name)).join("」「")}」を超えそうです。</div>` : ""}
        </div>`;
    }

    container.innerHTML = `
      <div class="wall-card">
        <div class="wall-sub">${year}年 ・ ${isPayday ? "給料日ベース" : "勤務日ベース"} ・ ${cfg.profile === "student" ? "学生(19〜22歳)" : "学生以外"}</div>
        <div class="wall-income-label">${year}年の収入(見込み)</div>
        <div class="wall-income">${yenBig(a.total)}</div>
        <div class="wall-income-sub">${isPayday ? "支払い済み" : "勤務済み"} ${yen(a.paid)} ／ これから ${yen(a.upcoming)}</div>
        ${forecastHtml}
      </div>

      ${wallsSectionHtml(a, walls, today, cfg)}

      ${foldHtml("chart", "月ごとの収入グラフ", `${isPayday ? "給料が支払われる月" : "勤務した月"}で集計(万円)`, `<div class="wall-fold-card">${chartHtml(a, year, today)}</div>`)}

      <div class="wall-foot">※ 目安です。税金や扶養の判定は、勤務先・学校・保険者などで確認してください。</div>
    `;
    container.querySelectorAll("[data-wallfold]").forEach((btn) => {
      btn.onclick = () => { foldOpen[btn.dataset.wallfold] = !foldOpen[btn.dataset.wallfold]; renderWallMain(); };
    });
  }

  function renderWall() {
    document.querySelectorAll("#wall-year-seg .segment-btn").forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.off) === yearOffset));
    renderWallMain();
    renderWallSettings();
  }

  // ---------- 壁の設定(年収の壁タブの下半分) ----------
  function renderWallSettings() {
    const cfg = loadWalls();
    document.querySelectorAll("#wall-profile-seg .segment-btn").forEach((b) => b.classList.toggle("active", b.dataset.profile === cfg.profile));
    document.querySelectorAll("#wall-basis-seg .segment-btn").forEach((b) => b.classList.toggle("active", b.dataset.basis === cfg.basis));

    const list = document.getElementById("wall-list");
    if (!list) return;
    list.innerHTML = cfg.walls.map((w) => `
      <div class="wall-set-row">
        <div class="wall-set-top">
          <label class="wall-set-check">
            <input type="checkbox" data-wall-toggle="${w.id}" ${w.enabled ? "checked" : ""}>
            <span class="wall-set-name">${escapeHtml(w.name)}</span>
          </label>
          <div class="wall-set-amount">
            <input type="number" step="0.1" min="0" data-wall-amount="${w.id}" value="${w.amount / 10000}">
            <span>万円</span>
            ${w.id.startsWith("c_") ? `<span class="icon-btn icon-btn-danger" data-wall-del="${w.id}">${ICON_TRASH}</span>` : ""}
          </div>
        </div>
        ${w.note ? `<div class="wall-set-hint">${escapeHtml(w.note)}</div>` : ""}
      </div>
    `).join("");

    list.querySelectorAll("[data-wall-toggle]").forEach((el) => {
      el.onchange = () => {
        const c = loadWalls(); const w = c.walls.find((x) => x.id === el.dataset.wallToggle);
        if (w) { w.enabled = el.checked; saveWalls(c); renderWallMain(); }
      };
    });
    list.querySelectorAll("[data-wall-amount]").forEach((el) => {
      el.oninput = () => {
        const v = Number(el.value);
        if (!(v > 0)) return; // 入力途中は保存しない
        const c = loadWalls(); const w = c.walls.find((x) => x.id === el.dataset.wallAmount);
        if (w) { w.amount = Math.round(v * 10000); saveWalls(c); renderWallMain(); } // 上の表示だけ更新(入力中の欄は触らない)
      };
    });
    list.querySelectorAll("[data-wall-del]").forEach((el) => {
      el.onclick = () => {
        showConfirm("この壁を削除しますか？", () => {
          const c = loadWalls(); c.walls = c.walls.filter((x) => x.id !== el.dataset.wallDel);
          saveWalls(c); renderWall();
        });
      };
    });
  }

  function wireSettings() {
    document.getElementById("wall-set-toggle").onclick = () => {
      const open = document.getElementById("wall-set-body").classList.toggle("hidden") === false;
      document.querySelector(".wall-fold-settings").classList.toggle("is-open", open);
      document.getElementById("wall-set-toggle").setAttribute("aria-expanded", String(open));
      document.getElementById("wall-set-chev").classList.toggle("open", open);
    };
    document.querySelectorAll("#wall-year-seg .segment-btn").forEach((b) => {
      b.onclick = () => { yearOffset = Number(b.dataset.off); renderWall(); };
    });
    document.querySelectorAll("#wall-profile-seg .segment-btn").forEach((b) => {
      b.onclick = () => {
        const cfg = loadWalls();
        const next = b.dataset.profile;
        if (cfg.profile === next) return;
        showConfirm("区分を変えると、壁の金額が初期値に戻ります。(自分で追加した壁は残ります)", () => {
          cfg.profile = next;
          cfg.walls = presetWalls(next, new Date().getFullYear()).concat(cfg.walls.filter((w) => w.id.startsWith("c_")));
          saveWalls(cfg); renderWall();
        }, { title: "区分の変更", okLabel: "変更する" });
      };
    });
    document.querySelectorAll("#wall-basis-seg .segment-btn").forEach((b) => {
      b.onclick = () => { const cfg = loadWalls(); cfg.basis = b.dataset.basis; saveWalls(cfg); renderWall(); };
    });
    document.getElementById("wall-add-btn").onclick = () => {
      const name = document.getElementById("wall-add-name").value.trim();
      const manVal = Number(document.getElementById("wall-add-amount").value);
      if (!name || !(manVal > 0)) { showNotice("壁の名前と、金額(万円)を入力してください"); return; }
      const cfg = loadWalls();
      cfg.walls.push({ id: `c_${Date.now()}`, name, amount: Math.round(manVal * 10000), enabled: true, note: "" });
      saveWalls(cfg);
      document.getElementById("wall-add-name").value = "";
      document.getElementById("wall-add-amount").value = "";
      renderWall();
    };
    document.getElementById("wall-reset-btn").onclick = () => {
      showConfirm("壁の金額を初期値に戻しますか？(自分で追加した壁は残ります)", () => {
        const cfg = loadWalls();
        cfg.walls = presetWalls(cfg.profile, new Date().getFullYear()).concat(cfg.walls.filter((w) => w.id.startsWith("c_")));
        saveWalls(cfg); renderWall();
      }, { title: "初期値に戻す", okLabel: "戻す" });
    };
  }

  // ---------- タブと画面を追加 ----------
  function injectScreenAndTab() {
    if (document.getElementById("screen-wall")) return;
    const app = document.querySelector(".app");
    const tabbar = document.querySelector(".tabbar");
    if (!app || !tabbar) return;

    const section = document.createElement("section");
    section.id = "screen-wall";
    section.className = "screen";
    section.innerHTML = `
      <div class="header-row">
        <span class="header-title">年収の壁</span>
        <div class="segment view-segment" id="wall-year-seg">
          <button class="segment-btn" data-off="0">今年</button>
          <button class="segment-btn" data-off="1">来年</button>
        </div>
      </div>
      <div id="wall-main" class="list-pad"></div>

      <div class="wall-fold wall-fold-settings">
        <button type="button" class="wall-fold-head" id="wall-set-toggle" aria-expanded="false">
          <span class="wall-fold-text">
            <span class="wall-fold-title">壁の設定</span>
            <span class="wall-fold-sub">区分・集計の基準・金額の変更</span>
          </span>
          <span class="chevron-icon" id="wall-set-chev">${ICON_CHEVRON_DOWN}</span>
        </button>
      <div class="wall-fold-body hidden" id="wall-set-body">
      <div class="tmpl-hint" style="padding:12px 20px 8px">金額は2026年10月時点の目安です。制度が変わったときは、自分で直せます。</div>
      <div class="list-pad">
        <div class="card pad-14">
          <div class="wall-set-label">あなたの区分</div>
          <div class="segment" id="wall-profile-seg">
            <button class="segment-btn" data-profile="general">学生以外</button>
            <button class="segment-btn" data-profile="student">学生(19〜22歳)</button>
          </div>
          <div class="wall-set-label">集計の基準</div>
          <div class="segment" id="wall-basis-seg" style="margin-bottom:6px">
            <button class="segment-btn" data-basis="payday">給料日ベース</button>
            <button class="segment-btn" data-basis="workday">勤務日ベース</button>
          </div>
          <div class="wall-set-hint">税金は「給料が支払われた年」で数えるため、給料日ベースがおすすめです(12月勤務分が1月払いなら、翌年の収入)。</div>
        </div>
      </div>
      <div class="list-pad" style="margin-top:12px">
        <div class="card" id="wall-list"></div>
        <div class="wall-add-row">
          <input type="text" id="wall-add-name" class="modal-input" placeholder="壁の名前(例: 会社の手当)">
          <input type="number" id="wall-add-amount" class="modal-input wall-add-amount" placeholder="万円" step="0.1" min="0">
          <button class="btn-small" id="wall-add-btn">追加</button>
        </div>
        <button class="rate-add-btn" id="wall-reset-btn" style="width:100%;margin:12px 0 0">壁の金額を初期値(2026年の目安)に戻す</button>
        <div class="wall-set-hint" style="margin-top:12px">
          <b>社会保険(勤務先):</b> 2026年10月から、月額8.8万円(年収約106万円)の賃金要件はなくなりました。目安は「週20時間以上」などで、昼間の学生は原則対象外です。詳しくは勤務先へ。
        </div>
      </div>
      </div>
      </div>
    `;
    app.insertBefore(section, tabbar);

    const btn = document.createElement("button");
    btn.className = "tab-item";
    btn.dataset.tab = "wall";
    btn.innerHTML = `<span class="tab-icon"><svg class="tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V11M12 20V4M19 20v-6"/><path d="M3 20h18"/></svg></span><span class="tab-label">年収の壁</span>`;
    btn.addEventListener("click", () => switchTab("wall"));
    tabbar.appendChild(btn);

    // 並び順: ホーム / 年収の壁 / ＋追加 / 勤務先 / 履歴 / 設定
    TAB_ORDER.forEach((t) => {
      const b = tabbar.querySelector(`.tab-item[data-tab="${t}"]`);
      if (b) tabbar.appendChild(b);
    });

    wireSettings();
  }

  const baseRenderCurrentScreen = renderCurrentScreen;
  renderCurrentScreen = function () {
    baseRenderCurrentScreen();
    if (state.tab === "wall") renderWall();
  };

  // ---------- ホーム: いちばん近い壁を控えめに表示 ----------
  function homeNoteHtml() {
    const cfg = loadWalls();
    const today = stripTime(new Date());
    const a = analyze(today.getFullYear(), cfg, today);
    const walls = enabledWalls(cfg);
    if (walls.length === 0 || a.items.length === 0) return ""; // 今年のシフトがなければ出さない

    let w = walls.find((x) => a.total < x.amount);
    let st, name, main, pct, head = "一番近い年収の壁";
    if (w) {
      const remain = w.amount - a.total;
      const ratio = a.total / w.amount;
      st = ratio >= 0.85 ? "warn" : "ok";
      pct = Math.round(ratio * 100);
      name = `${escapeHtml(w.name)}(${man(w.amount)})`;
      main = `あと <b>${yen(remain)}</b>`;
    } else {
      w = walls[walls.length - 1];
      st = "over"; pct = 100; head = "年収の壁";
      name = `最大の壁: ${escapeHtml(w.name)}(${man(w.amount)})`;
      main = `すべての壁を超えています`;
    }
    // 1行目: 見出し「一番近い年収の壁」 / 2行目: 壁の名前(小さく) / 3行目: あと◯円(目に入る大きさ)
    return `
      <div class="wall-note wall-note-${st}" id="wall-note">
        <div class="wall-note-line">
          <span class="wall-note-label">${head}</span>
          <span class="wall-note-chev">›</span>
        </div>
        <div class="wall-note-name">${name}</div>
        <div class="wall-note-main">${main}</div>
        <div class="wall-note-bar"><div class="wall-note-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
      </div>
    `;
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try {
      const container = document.getElementById("home-content");
      if (!container) return;
      const html = homeNoteHtml();
      if (!html) return;
      const wrap = document.createElement("div");
      wrap.className = "wall-note-wrap";
      wrap.innerHTML = html;
      const goal = container.querySelector(".home-block");
      if (goal) goal.insertAdjacentElement("afterend", wrap);
      else container.insertBefore(wrap, container.querySelector(".stat-grid"));
      document.getElementById("wall-note").onclick = () => switchTab("wall");
    } catch (e) { console.error("年収の壁の表示エラー", e); }
  };

  document.addEventListener("DOMContentLoaded", injectScreenAndTab);
})();
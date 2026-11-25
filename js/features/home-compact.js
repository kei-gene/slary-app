// ==========================================================
// ホームをすっきり見せる(home-compact.js)
//
// 変えた点
//  ・「今月の稼ぎ」の金額の右に、勤務時間と勤務日数を移動
//  ・目標は「バー + 今の稼ぎ / 目標」だけの表示に
//  ・「次の給料日」と「年収の壁」を、小さな2つのタイルに
//     - 給料日タイルをタップ → 対象期間・ほかの勤務先を開く
//     - 年収の壁タイルをタップ → 年収の壁タブへ
//  ・カレンダーは独立した白いカードに(CSS側)
//
// 読み込み順: home-tidy.js と wall.js の「後」に読み込んでください。
// 既存のコードは書き換えず、renderHome をもう一度上から包んでいます。
// うまく動かなくなったら、この貼り付け分を消せば、元のホームに戻ります。
// ==========================================================
(function () {
  const WRAP = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  function build(container) {
    const card = container.querySelector(".hm-card");
    if (!card) return null;
    const label = card.querySelector(".hm-label");
    const amount = card.querySelector(".hm-amount");
    const meta = card.querySelector(".hm-meta");
    if (!label || !amount || !meta) return null;

    // ---- 勤務時間・日数(.hm-n = 数字, .hm-u = 単位) ----
    const nums = meta.querySelectorAll(".hm-n");
    const units = meta.querySelectorAll(".hm-u");
    const pair = (i) => (nums[i] && units[i] ? nums[i].outerHTML + units[i].outerHTML : "");

    // ---- 目標 ----
    const goalEl = card.querySelector(".hm-goal");
    let goalNode = null;
    const earnedB = card.querySelector(".hm-earned b");
    const earnedText = earnedB ? WRAP(earnedB) : WRAP(amount); // 予定がなければ、金額そのものが「今の稼ぎ」
    const next = typeof homeMonthOffset === "number" && homeMonthOffset === 1;
    if (goalEl) {
      const done = goalEl.classList.contains("hm-goal-done");
      const goalText = WRAP(goalEl.querySelector(".hm-goal-top span")).replace(/^目標\s*/, "");
      const fill = goalEl.querySelector(".hm-goal-fill");
      const w = fill && fill.style.width ? fill.style.width : "0%";
      const left = done ? "🎉 目標達成" : (next ? "予定" : "今の稼ぎ");
      goalNode = document.createElement("div");
      goalNode.className = "hc-goal" + (done ? " hc-done" : "");
      goalNode.innerHTML =
        `<div class="hc-bar"><i style="width:${w}"></i></div>` +
        `<div class="hc-gt"><span>${left} <b></b></span><span>目標 <b class="hc-g"></b></span></div>`;
      goalNode.querySelector(".hc-gt span:first-child b").textContent = earnedText;
      goalNode.querySelector(".hc-g").textContent = goalText;
    } else if (earnedB) {
      // 目標がないときも「今の稼ぎ」は1行だけ見せる
      goalNode = document.createElement("div");
      goalNode.className = "hc-goal hc-nogoal";
      goalNode.innerHTML = `<div class="hc-gt"><span>今の稼ぎ <b></b></span></div>`;
      goalNode.querySelector("b").textContent = earnedText;
    }

    // ---- 新しいカードの中身(元の要素は、ここでは動かさない) ----
    const frag = document.createDocumentFragment();
    frag.appendChild(label.cloneNode(true));

    const row = document.createElement("div");
    row.className = "hc-row";
    const amt = amount.cloneNode(true);
    const ht = document.createElement("div");
    ht.className = "hc-ht";
    ht.innerHTML = `<div>${pair(0)}</div><div>${pair(1)}</div>`;
    row.append(amt, ht);
    frag.appendChild(row);

    const bd = meta.querySelector("#hm-bd-toggle"); // 勤務先が2つ以上のときだけある「内訳」ボタン
    if (bd) {
      const nb = bd.cloneNode(true);
      nb.onclick = bd.onclick;
      nb.classList.add("hc-bd");
      frag.appendChild(nb);
    }
    const breakdown = card.querySelector(".hm-breakdown");
    if (breakdown) frag.appendChild(breakdown.cloneNode(true));
    if (goalNode) frag.appendChild(goalNode);

    const empty = card.querySelector(".hm-empty");
    if (empty) {
      const ne = empty.cloneNode(true);
      const btn = ne.querySelector("#hm-empty-btn");
      const ob = empty.querySelector("#hm-empty-btn");
      if (btn && ob) btn.onclick = ob.onclick;
      frag.appendChild(ne);
    }

    // ---- 右(PCでは右の列): 給料日と年収の壁のタイル ----
    const side = container.querySelector("#hm-side");
    const tiles = document.createElement("div");
    tiles.className = "hc-tiles";
    let count = 0;

    const payout = container.querySelector(".hm-payout");
    if (payout) {
      const first = payout.querySelector(".hm-po");
      const toggle = payout.querySelector("#hm-payout-toggle");
      const opened = !!payout.querySelector(".hm-payout-period");
      if (first && toggle) {
        const more = (WRAP(toggle).match(/ほか(\d+)件/) || [])[1];
        const t = document.createElement("button");
        t.type = "button";
        t.className = "hc-tile hc-pay" + (opened ? " is-open" : "");
        t.innerHTML = `<small>次の給料日${more && !opened ? `<em>ほか${more}件</em>` : ""}</small><b class="hc-d"></b><span class="hc-s"></span>`;
        t.querySelector(".hc-d").textContent = WRAP(first.querySelector(".hm-payout-date"));
        t.querySelector(".hc-s").textContent = `${WRAP(first.querySelector(".hm-payout-wp"))} ${WRAP(first.querySelector(".hm-payout-amt"))}`;
        t.onclick = () => toggle.click(); // 元の「開く/閉じる」ボタンを押す(画面は home-tidy.js が描き直す)
        tiles.appendChild(t);
        count++;
        if (opened) { payout.classList.add("hc-detail"); tiles.appendChild(payout); } // 開いたときは、元の詳細カードをそのまま使う
      }
    }

    const note = container.querySelector(".wall-note");
    if (note) {
      const st = note.classList.contains("wall-note-over") ? "over" : note.classList.contains("wall-note-warn") ? "warn" : "ok";
      const fill = note.querySelector(".wall-note-bar-fill");
      const w = fill && fill.style.width ? fill.style.width : "0%";
      const mainEl = note.querySelector(".wall-note-main");
      const t = document.createElement("button");
      t.type = "button";
      t.className = `hc-tile hc-wall hc-wall-${st}`;
      t.innerHTML = `<small>年収の壁</small><b class="hc-big"></b><span class="hc-s"></span><div class="hc-wbar"><i style="width:${w}"></i></div>`;
      const big = t.querySelector(".hc-big");
      big.textContent = WRAP(mainEl).replace(/^あと\s*/, "あと");
      if (st === "over") big.classList.add("hc-small-text");
      t.querySelector(".hc-s").textContent = WRAP(note.querySelector(".wall-note-name"));
      t.onclick = () => switchTab("wall");
      tiles.appendChild(t);
      count++;
    }
    if (count === 1 && !tiles.querySelector(".hc-detail")) tiles.classList.add("hc-one");

    return { card, frag, side, tiles, count };
  }

  function compact() {
    const container = document.getElementById("home-content");
    if (!container) return;
    const r = build(container); // ここまで成功してから画面を差し替える(失敗しても元の画面は壊れない)
    if (!r) return;
    r.card.replaceChildren(r.frag);
    r.card.classList.add("hc-card");
    if (r.side) {
      r.side.replaceChildren();
      if (r.count > 0) r.side.appendChild(r.tiles);
    }
  }

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try { compact(); } catch (e) { console.error("ホームの整理(compact)でエラー(元の画面のまま表示します)", e); }
  };
})();
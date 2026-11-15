// ==========================================================
// 引っ張って更新(js/features/pull-refresh.js)
//
// ・画面の一番上で、指で下に引っ張って離すと、アプリを読み込み直します
//   (最新のお知らせや、公開した新しい版も、ここで読み込まれます)
// ・入力したデータ(シフトなど)は、端末に保存済みなので消えません
// ・次のときは動きません(入力の途中で消えてしまうのを防ぐため)
//     - 「追加」タブ  - ポップアップが開いているとき  - 文字を入力しているとき
// ・script.js は書き換えず、この1ファイルだけで動きます
// ==========================================================
(function () {
  const THRESHOLD = 72;   // これだけ引っ張って離すと、更新(px)
  const MAX_PULL = 110;   // 見た目の引っ張れる上限(px)
  const RESIST = 0.5;     // 指の動きに対する、画面の動きの割合(重く感じさせる)

  let startY = 0, startX = 0, pull = 0, tracking = false, busy = false, decided = false;

  // ---- 見た目(くるくる) ----
  const el = document.createElement("div");
  el.className = "ptr";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="ptr-circle"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13"/><path d="M6 12l6 6 6-6"/></svg></div>`;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
  if (document.body) document.body.appendChild(el);

  function draw(y) {
    const p = Math.min(1, y / THRESHOLD);
    el.style.setProperty("--ptr-y", y + "px");
    el.style.setProperty("--ptr-p", p);
    el.classList.toggle("ptr-ready", y >= THRESHOLD);
    el.classList.toggle("ptr-show", y > 4);
  }
  function reset() {
    el.classList.remove("ptr-drag");
    pull = 0; draw(0);
  }

  // ---- 動いてよい場面か ----
  const scrollTop = () => window.pageYOffset || document.documentElement.scrollTop || 0;
  function blocked(target) {
    if (busy) return true;
    if (typeof state !== "undefined" && state.tab === "add") return true;       // 入力が消えないように
    if (document.querySelector(".modal-overlay:not(.hidden)")) return true;      // ポップアップ中
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;           // 入力中
    // 中身が自分でスクロールできる場所(下に戻れる)の中なら、そちらを優先
    for (let n = target; n && n !== document.body; n = n.parentElement) {
      if (n.scrollTop > 0) return true;
    }
    return false;
  }

  // ---- 指の動き ----
  document.addEventListener("touchstart", (e) => {
    tracking = false; decided = false;
    if (e.touches.length !== 1 || scrollTop() > 0 || blocked(e.target)) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      // 縦に下へ動いたときだけ、引っ張る動き。横や上は、ふつうの操作
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scrollTop() > 0) { tracking = false; return; }
      decided = true;
      el.classList.add("ptr-drag");
    }
    if (e.cancelable) e.preventDefault(); // 画面そのものが、びよんと動くのを止める
    pull = Math.min(MAX_PULL, dy * RESIST);
    draw(pull);
  }, { passive: false });

  function end() {
    if (!tracking || !decided) { tracking = false; return; }
    tracking = false;
    if (pull >= THRESHOLD) {
      busy = true;
      el.classList.remove("ptr-drag");
      el.classList.add("ptr-loading");
      draw(THRESHOLD);
      setTimeout(() => location.reload(), 350);
    } else reset();
  }
  document.addEventListener("touchend", end, { passive: true });
  document.addEventListener("touchcancel", () => { if (!busy) { tracking = false; reset(); } }, { passive: true });
})();
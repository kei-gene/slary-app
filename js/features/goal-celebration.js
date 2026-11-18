// ==========================================================
// 月の目標を達成したときのお祝い  (js/features/goal-celebration.js)
//
// ・今月、実際に働いた分(今日までのシフト)の合計が、月収目標に届いたら、
//   紙吹雪とメッセージでお祝いする
// ・お祝いは、アプリを開いたときと、ほかの画面からホームに戻ってくるたびに出ます
//   (ホームを開いたままの操作、たとえば月の切り替えでは出ません)
// ・これからの予定のシフトは数えません(まだ働いていないので)
// ・「動きを減らす」設定の端末では、紙吹雪なしでメッセージだけ出します
// ・script.js は書き換えず、上から包んで変更しています
// ==========================================================
(function () {
  // ---------- 今月、今日までに働いた分 ----------
  function earnedSoFar(ym) {
    const today = todayStr();
    let sum = 0;
    state.shifts.forEach((s) => {
      if (!s.date.startsWith(ym) || s.date > today) return;
      const wp = state.workplaces.find((w) => w.id === s.workplaceId);
      const r = computePay(wp, s.date, s.start, s.end, s.breakMin, state.holidays);
      if (r) sum += r.pay;
    });
    return sum;
  }

  // 「ホームに来た」ときだけ、お祝いを出す目印(アプリを開いた直後も、来たことにする)
  let arrived = true;

  // 戻り値: true = 判断が終わった(出した/目標なし/未達成)  false = まだ出せない状況なので、あとでもう一度
  function check() {
    if (state.tab !== "home" || homeMonthOffset !== 0) return false; // 過去・未来の月を見ているときは、今月のホームに戻るまで待つ
    if (document.getElementById("disclaimer-ok") || document.getElementById("gc-overlay")) return false; // 同意画面などの最中は出さない
    const goal = state.monthlyGoal;
    if (!(goal > 0)) return true;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const earned = earnedSoFar(ym);
    if (earned < goal) return true;
    setTimeout(() => celebrate(goal, earned, now.getMonth() + 1), 350); // ホームが表示されてから
    return true;
  }

  // ほかの画面からホームに切り替えたら、「来た」ことにする(ホームのまま同じタブを押しても、出さない)
  const baseSwitchTab = switchTab;
  switchTab = function (tab, keepEditing) {
    if (tab === "home" && state.tab !== "home") arrived = true;
    return baseSwitchTab(tab, keepEditing);
  };

  const baseRenderHome = renderHome;
  renderHome = function () {
    baseRenderHome();
    try {
      if (arrived && check()) arrived = false;
    } catch (e) { console.error("目標達成のお祝いでエラー(通常のホームのまま表示します)", e); }
  };

  // ---------- お祝いの表示 ----------
  function celebrate(goal, earned, month) {
    if (document.getElementById("gc-overlay")) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const overlay = document.createElement("div");
    overlay.id = "gc-overlay";
    overlay.className = "gc-overlay";
    overlay.innerHTML = `
      ${reduce ? "" : `<canvas class="gc-canvas" aria-hidden="true"></canvas>`}
      <div class="gc-card" role="dialog" aria-modal="true" aria-labelledby="gc-title">
        <div class="gc-emoji" aria-hidden="true">🎉</div>
        <div class="gc-title" id="gc-title">目標達成！おめでとうございます</div>
        <div class="gc-text">${month}月は、目標の${yen(goal)}を超えました。<br>ここまでで <b>${yen(earned)}</b> 稼ぎました。</div>
        <button type="button" class="btn-primary gc-btn" id="gc-ok">やったー！</button>
      </div>`;
    document.body.appendChild(overlay);
    let stop = () => {};
    const close = () => { stop(); overlay.remove(); };
    document.getElementById("gc-ok").onclick = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    if (!reduce) stop = confetti(overlay.querySelector(".gc-canvas"));
  }

  // ---------- 紙吹雪(数秒でおさまる) ----------
  function confetti(canvas) {
    if (!canvas || !canvas.getContext) return () => {};
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#12A36A", "#2CC585", "#8ED9B6", "#F5A623", "#FFD166", "#FF6B6B", "#4DA3FF"];
    const parts = Array.from({ length: 110 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.6,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vx: -1 + Math.random() * 2, vy: 2 + Math.random() * 3.5,
      rot: Math.random() * Math.PI * 2, vr: -0.2 + Math.random() * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0, alive = true;
    const t0 = performance.now();
    (function frame(t) {
      if (!alive) return;
      ctx.clearRect(0, 0, W, H);
      let visible = 0;
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx += Math.sin(p.y / 40) * 0.02;
        if (p.y < H + 20) visible++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (visible > 0 && t - t0 < 6000) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    })(t0);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }

  window.__goalCelebrationTest = { earnedSoFar, check }; // 動作確認用
})();
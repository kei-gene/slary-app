// ==========================================================
// 数字の見せ方(format.js)
//
// ・金額は「¥」を小さく、数字を大きく見せます  例: ¥24,655 → 小さい¥ + 大きい 24,655
// ・時間や日数は、数字を太く、単位(時間・日)を小さく見せます
// ・見た目は polish.css の .amt / .hm-n / .hm-u で決まります
// ・ほかのファイルから yenBig(...) / numUnit(...) として呼び出します
//   (script.js の次に読み込むこと)
// ==========================================================
function yenBig(n) {
  return `<span class="amt"><span class="amt-yen">¥</span>${Math.round(n).toLocaleString()}</span>`;
}
function numUnit(value, unit) {
  return `<b class="hm-n">${value}</b><span class="hm-u">${unit}</span>`;
}
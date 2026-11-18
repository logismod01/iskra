/**
 * Раунд 45: база дошла до 13 677 тем и источники в git чистые (1.52.0).
 *
 * Что требовалось:
 *   1) Волна новых карточек дошла до сайта, Сью и README — одно и то же число.
 *   2) В каждом новом разделе десятки тем, а не названия ради галочки.
 *   3) Ни одной карточки короче 60 знаков и ни одного повтора названия —
 *      проверяется по исходникам в kb-src/cards, а не только по готовому паку.
 *   4) Словари выросли вместе с темами.
 *   5) Версия 1.52.0 и тест подключён к npm test.
 *
 * Запуск: node tests/round45.test.mjs
 */
import fs from "node:fs";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");
const readme = read("README.md");
const agentPack = JSON.parse(read("agent/data/kb-pack.json"));

const items = (() => {
  const i = html.indexOf('id="kbPack"');
  const a = html.indexOf(">", i) + 1;
  const b = html.indexOf("</script>", a);
  return JSON.parse(html.slice(a, b));
})();

console.log("round45: база и источники — " + pkg.version);

/* ---------- 1. Одно число везде ---------- */
await test("сайт, Сью и README называют одно число тем", async () => {
  const n = items.items.length;
  assert(agentPack.items.length === n, "у Сью " + agentPack.items.length + ", на сайте " + n);
  assert(readme.includes(String(n)), "в README нет числа " + n);
});

await test("пак Сью совпадает с сайтом по списку тем", async () => {
  const site = items.items.map((x) => x.title).join("\n");
  const agent = agentPack.items.map((x) => x.topic).join("\n");
  assert(site === agent, "списки тем расходятся");
});

/* ---------- 2. Новые разделы ---------- */
await test("новые разделы на месте и в них десятки тем", async () => {
  const count = (p) => items.items.filter((x) => x.title.startsWith(p)).length;
  const need = [
    ["Латынь:", 100], ["Фразеологизм:", 100], ["Электрика:", 50], ["Сантехника:", 50],
    ["Маркетинг:", 50], ["Дизайн:", 50], ["Химия в быту:", 50], ["Выживание:", 50],
    ["Этикет:", 50], ["Стиль:", 50], ["Ремонт:", 40], ["Транспорт:", 50],
    ["История России:", 120], ["Интернет:", 50], ["Математика глубже:", 60], ["Рыбалка:", 40],
  ];
  const miss = need.filter(([p, n]) => count(p) < n).map(([p, n]) => p + " (" + count(p) + "/" + n + ")");
  assert(miss.length === 0, "не хватает: " + miss.join(", "));
});

/* ---------- 3. Исходники в git ---------- */
await test("в исходниках нет коротких текстов", async () => {
  const dir = new URL("../kb-src/cards/", import.meta.url);
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
    fs.readFileSync(new URL(f, dir), "utf8").split("\n").forEach((line, i) => {
      if (!line.trim() || line.trim().startsWith("#")) return;
      const parts = line.split("|");
      if (parts.length < 3) { bad.push(f + ":" + (i + 1) + " битая"); return; }
      const text = parts.slice(1, -1).join("|").trim();
      if (text.length < 60) bad.push(f + ":" + (i + 1) + " (" + text.length + ")");
    });
  }
  assert(bad.length === 0, "короткие: " + bad.slice(0, 5).join(", "));
});

await test("в новых файлах нет повторов названий", async () => {
  const dir = new URL("../kb-src/cards/", import.meta.url);
  const files = fs.readdirSync(dir).filter((x) => x.endsWith(".txt")).sort();
  const seen = new Map();
  const dup = [];
  for (const f of files) {
    fs.readFileSync(new URL(f, dir), "utf8").split("\n").forEach((line) => {
      const t = (line.split("|")[0] || "").trim().toLowerCase();
      if (!t) return;
      if (seen.has(t) && seen.get(t) !== f) dup.push(t + " (" + seen.get(t) + " и " + f + ")");
      else if (!seen.has(t)) seen.set(t, f);
    });
  }
  assert(dup.length === 0, "повторы между файлами: " + dup.slice(0, 5).join(", "));
});

/* ---------- 4. Словари ---------- */
await test("словари выросли вместе с темами", async () => {
  const words = (lang) => read("kb-src/words/" + lang + ".txt").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  assert(words("en") >= 1800, "английских слов мало: " + words("en"));
  assert(words("de") >= 380, "немецких слов мало: " + words("de"));
  assert(words("es") >= 360, "испанских слов мало: " + words("es"));
  assert(words("zh") >= 300, "китайских слов мало: " + words("zh"));
});

/* ---------- 5. Версия ---------- */
await test("версия поднята и кэш обновлён", async () => {
  assert(pkg.version === "1.52.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.52\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("этот тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round45.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round45: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

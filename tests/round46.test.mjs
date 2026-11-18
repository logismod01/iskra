/**
 * Раунд 46: база дошла до 15 102 тем — третья волна (1.53.0).
 *
 * Что требовалось:
 *   1) Новая волна не меньше 1 400 тем доехала до сайта, Сью и README.
 *   2) Каждый новый раздел — десятки живых тем, а не название для отчёта.
 *   3) Исходники в git: без коротких текстов и без повторов названий.
 *   4) Версия 1.53.0, кэш обновлён, тест подключён к npm test.
 *
 * Запуск: node tests/round46.test.mjs
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

const count = (p) => items.items.filter((x) => x.title.startsWith(p)).length;

console.log("round46: третья волна тем — " + pkg.version);

/* ---------- 1. Объём ---------- */
await test("тем не меньше пятнадцати тысяч", async () => {
  assert(items.items.length >= 15000, "тем мало: " + items.items.length);
});

await test("сайт, Сью и README называют одно число", async () => {
  const n = items.items.length;
  assert(agentPack.items.length === n, "у Сью " + agentPack.items.length + ", на сайте " + n);
  assert(readme.includes(String(n)), "в README нет числа " + n);
});

await test("пак Сью совпадает с сайтом по списку тем", async () => {
  const site = items.items.map((x) => x.title).join("\n");
  const agent = agentPack.items.map((x) => x.topic).join("\n");
  assert(site === agent, "списки тем расходятся");
});

/* ---------- 2. Разделы третьей волны ---------- */
await test("разделы третьей волны на месте и в них десятки тем", async () => {
  const need = [
    ["Кухни мира:", 60], ["Офис:", 55], ["Рукоделие:", 45], ["Малый бизнес:", 40],
    ["Спорт правила:", 45], ["Геология:", 60], ["Симптомы:", 45], ["Растения:", 45],
    ["Логистика:", 45], ["Мифология:", 55], ["Искусство:", 55], ["Кино:", 45],
    ["Электроника:", 50], ["Гитара:", 40], ["Логика:", 45], ["ИИ:", 45],
    ["Веб:", 50], ["Настольные игры:", 40], ["Теория музыки:", 50],
    ["Первая помощь:", 40], ["Налоги:", 40], ["ЖКХ:", 40],
    ["Изобретения:", 60], ["Погода:", 45],
  ];
  const miss = need.filter(([p, n]) => count(p) < n).map(([p, n]) => p + " (" + count(p) + "/" + n + ")");
  assert(miss.length === 0, "не хватает: " + miss.join(", "));
});

await test("тем стало больше, чем было в 1.50.0", async () => {
  assert(items.items.length >= 13677 + 1400, "прирост меньше 1400: " + (items.items.length - 13677));
});

/* ---------- 3. Исходники ---------- */
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

await test("в исходниках нет повторов названий между файлами", async () => {
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

/* ---------- 4. Версия ---------- */
await test("версия поднята и кэш обновлён", async () => {
  assert(pkg.version === "1.53.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.53\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("этот тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round46.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round46: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

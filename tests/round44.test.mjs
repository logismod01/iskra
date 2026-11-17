/**
 * Раунд 44: база перевалила за двенадцать тысяч тем (1.49.0).
 *
 * Что требовалось:
 *   1) Тем не меньше 12 000 — волна новых конспектов дошла до сайта и до Сью.
 *   2) Новые карточки — не заглушки: название, текст от 60 знаков, три тега.
 *   3) Ни одного повтора названия: словари и темы часто пересекаются.
 *   4) Новые разделы действительно есть, а не только в тексте коммита.
 *   5) Пак агента совпадает с пакетом сайта, README называет то же число.
 *   6) Версия 1.49.0 и тест подключён к npm test.
 *
 * Запуск: node tests/round44.test.mjs
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

console.log("round44: волна тем — " + pkg.version);

/* ---------- 1. Объём ---------- */
await test("тем не меньше двенадцати тысяч", async () => {
  assert(items.items.length >= 12000, "тем мало: " + items.items.length);
});

await test("названия не повторяются ни разу", async () => {
  const seen = new Map();
  for (const it of items.items) {
    const k = String(it.title || "").toLowerCase().trim();
    assert(k, "пустое название у " + it.id);
    assert(!seen.has(k), "два раза: «" + it.title + "» (" + seen.get(k) + " и " + it.id + ")");
    seen.set(k, it.id);
  }
});

await test("у каждой темы живой текст и три тега", async () => {
  for (const it of items.items) {
    assert(String(it.text || "").length >= 60, "короткий текст: " + it.id);
    assert(/[a-zа-яё]/i.test(it.text), "в тексте нет слов: " + it.id);
    assert(String(it.tags || "").split(/\s+/).filter(Boolean).length >= 3, "мало тегов: " + it.id);
  }
});

/* ---------- 2. Новые разделы ---------- */
await test("новые разделы на месте", async () => {
  const t = items.items.map((x) => x.title).join(" | ");
  const need = [
    "Кухня:", "Тренировки:", "Шахматы:", "Физика глубже:", "Медицина:",
    "Право для жизни:", "Финансы:", "Дом:", "Авто:", "Дети:", "Учёба:",
    "Работа:", "Инструменты:", "Сад:", "Животные:", "Музыка:", "Литература:",
    "Питание:", "Фото:", "Безопасность:", "Путешествия:", "Астрономия:",
    "География мира:", "Психология:", "История мира:",
  ];
  const miss = need.filter((p) => !t.includes(p));
  assert(miss.length === 0, "нет разделов: " + miss.join(", "));
});

await test("в новых разделах десятки тем, а не одна", async () => {
  const count = (p) => items.items.filter((x) => x.title.startsWith(p)).length;
  [["Кухня:", 60], ["Тренировки:", 50], ["Шахматы:", 50], ["Физика глубже:", 100], ["Право для жизни:", 50]].forEach(([p, n]) => {
    const got = count(p);
    assert(got >= n, "раздел «" + p + "» — всего " + got + " тем, ждали не меньше " + n);
  });
});

/* ---------- 3. Пак агента и README ---------- */
await test("пак Сью совпадает с пакетом сайта", async () => {
  assert(agentPack.items.length === items.items.length, "у Сью " + agentPack.items.length + ", на сайте " + items.items.length);
  const site = items.items.map((x) => x.title).join("\n");
  const agent = agentPack.items.map((x) => x.topic).join("\n");
  assert(site === agent, "списки тем расходятся");
});

await test("README называет то же число тем", async () => {
  assert(readme.includes(String(items.items.length)), "в README нет числа " + items.items.length);
  assert(!/9289 конспект|\(9289 тем\)/.test(readme), "README всё ещё говорит про 9289 тем");
});

await test("карточки в git — источник, а не только готовый пак", async () => {
  const dir = new URL("../kb-src/cards/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  assert(files.length >= 50, "файлов карточек мало: " + files.length);
  const total = files.reduce((n, f) => n + fs.readFileSync(new URL(f, dir), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length, 0);
  assert(total >= 5000, "строк в карточках мало: " + total);
});

/* ---------- 4. Версия ---------- */
await test("версия поднята и кэш обновлён", async () => {
  assert(pkg.version === "1.49.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.49\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("этот тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round44.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round44: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

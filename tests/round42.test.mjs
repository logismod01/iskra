/**
 * Раунд 42: база выросла и находится по названию (1.49.0).
 *
 * Что требовалось:
 *   1) Тем должно быть много — заметно больше тысячи, и не за счёт повторов:
 *      у каждой темы своё название и свой id.
 *   2) Новая тема обязана находиться, если человек написал её название:
 *      раньше «Право: права потребителя» проигрывало другой теме на слово
 *      «право» и не попадало даже в первые две.
 *   3) Темы владельца (общая база, выученное) остаются выше встроенных.
 *   4) Пак у Сью — тот же набор, что у сайта: без интернета агент отвечает
 *      по тем же темам.
 *   5) Сайт, пак агента и README называют одно и то же число тем.
 *
 * Запуск: node tests/round42.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

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

const site = () => new JSDOM(html, {
  runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole()
}).window;

console.log("round42: база тем — " + pkg.version);

const items = (() => {
  const i = html.indexOf('id="kbPack"');
  const a = html.indexOf(">", i) + 1;
  const b = html.indexOf("</script>", a);
  return JSON.parse(html.slice(a, b));
})();

/* ---------- 1. Объём и чистота ---------- */
await test("тем не меньше девяти тысяч и каждое название встречается один раз", async () => {
  assert(items.items.length >= 9000, "тем мало: " + items.items.length);
  const seen = new Map();
  for (const it of items.items) {
    const k = String(it.title || "").toLowerCase().trim();
    assert(k, "пустое название у " + it.id);
    assert(!seen.has(k), "два раза: «" + it.title + "» (" + seen.get(k) + " и " + it.id + ")");
    seen.set(k, it.id);
  }
});

await test("id латиницей до первого дефиса и не повторяются", async () => {
  const ids = new Set();
  for (const it of items.items) {
    assert(/^[a-z]+-[a-z0-9-]+$/.test(it.id), "не тот id: " + it.id);
    assert(!ids.has(it.id), "дубль id: " + it.id);
    ids.add(it.id);
  }
});

await test("в каждой теме есть текст на русском и не меньше трёх тегов", async () => {
  for (const it of items.items) {
    assert(String(it.text || "").length >= 60, "короткий текст: " + it.id);
    assert(/[a-zа-яё]/i.test(it.text), "в тексте нет слов: " + it.id);
    assert(String(it.tags || "").split(/\s+/).filter(Boolean).length >= 3, "мало тегов: " + it.id);
  }
});

await test("короткие справки — формулы, даты, единицы — в базе есть", async () => {
  const t = items.items.map(x => x.title).join(" | ");
  ["Формула:", "Дата:", "Единица:"].forEach((p) => assert(t.includes(p), "нет раздела «" + p + "»"));
});

/* ---------- 2. Поиск по названию ---------- */
await test("название темы находит именно эту тему", async () => {
  const w = site();
  const probe = ["Право: права потребителя", "Русский: не и ни", "Факт: почему 0! = 1", "Питон: f-строки", "Дата: 988 год"];
  for (const title of probe) {
    const hits = JSON.parse(w.eval(`JSON.stringify(kbSearch(${JSON.stringify(title)}, 2))`));
    assert(hits.length, "ничего не нашлось: " + title);
    assert(hits[0].title === title, "первой идёт «" + hits[0].title + "», а не «" + title + "»");
  }
});

await test("названия из разных папок находятся все подряд", async () => {
  /* Полный перебор всех тем уже делает smoke-тест; здесь — по одной теме
     из каждой десятой, чтобы поймать провал в любой части базы и не
     растягивать прогон на лишние минуты. */
  const w = site();
  const miss = w.eval(`(() => {
    const out = [];
    const all = KNOWLEDGE_PACK.items;
    for (let i = 0; i < all.length; i += 10) {
      const it = all[i];
      if (!kbSearch(it.title, 2).some(h => h.title === it.title)) out.push(it.title);
    }
    return out;
  })()`);
  assert(miss.length === 0, "не находятся: " + miss.slice(0, 5).join(", "));
});

await test("вопрос словами, а не названием, тоже находит тему", async () => {
  const w = site();
  const hit = JSON.parse(w.eval(`JSON.stringify(kbSearch("сколько дней на возврат товара в магазин", 3))`));
  assert(hit.length, "ничего не нашлось");
  assert(hit.some(h => /потребител/i.test(h.title)), "не нашлась тема про права потребителя: " + hit.map(h => h.title).join(", "));
});

await test("тема владельца важнее встроенной с тем же названием", async () => {
  const w = site();
  w.eval(`sharedKbSave([{ topic: "Пифагор", text: "ПО_ВЛАДЕЛЬЦУ: теорема Пифагора, a² + b² = c².", tags: "теорема" }]);`);
  const hits = JSON.parse(w.eval(`JSON.stringify(kbSearch("Теорема Пифагора", 2))`));
  assert(hits.length && hits[0].shared === true, "встроенная перебила общую: " + (hits[0] && hits[0].title));
});

/* ---------- 3. Тот же пак у Сью ---------- */
await test("у Сью лежит тот же набор тем, что у сайта", async () => {
  const agent = JSON.parse(read("agent/data/kb-pack.json"));
  assert(agent.items.length === items.items.length, "у Сью " + agent.items.length + ", у сайта " + items.items.length);
  const a = new Set(agent.items.map(x => String(x.topic).toLowerCase().trim()));
  const s = new Set(items.items.map(x => String(x.title).toLowerCase().trim()));
  const onlySite = [...s].filter(x => !a.has(x));
  const onlyAgent = [...a].filter(x => !s.has(x));
  assert(!onlySite.length, "нет у Сью: " + onlySite.slice(0, 3).join(", "));
  assert(!onlyAgent.length, "нет у сайта: " + onlyAgent.slice(0, 3).join(", "));
});

await test("пак Сью читается без интернета: тема, текст, теги", async () => {
  const agent = JSON.parse(read("agent/data/kb-pack.json"));
  for (const it of agent.items) {
    assert(String(it.topic || "").trim(), "без темы");
    assert(String(it.text || "").length >= 60, "короткий текст: " + it.topic);
    assert(String(it.tags || "").trim(), "без тегов: " + it.topic);
  }
});

/* ---------- 4. Числа совпадают там, где о них говорят ---------- */
await test("счётчик в меню считает по базе, а не по числу в коде", async () => {
  const w = site();
  w.eval("updateMoreCounts()");
  const n = String(w.document.getElementById("moreKbCount").textContent);
  assert(n === String(items.items.length), "счётчик показал " + n + ", а тем " + items.items.length);
});

await test("README называет то же число тем", async () => {
  assert(readme.includes(String(items.items.length)), "в README нет числа " + items.items.length);
  assert(!/863 конспект|\(863 тем|= 863\b/.test(readme), "README всё ещё говорит про 863 темы");
});

/* ---------- 5. Версия ---------- */
await test("версия поднята и кэш обновлён", async () => {
  assert(pkg.version === "1.49.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.49\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("этот тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round42.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round42: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

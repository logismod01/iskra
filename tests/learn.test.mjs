/**
 * Тест «выучи что угодно»: тема словом или ссылкой.
 * Проверяем разбор адреса, очистку HTML, ограничения безопасности
 * и то, что выученное реально попадает в «Мои темы».
 *
 * Запуск: node tests/learn.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => errors.push(e.message));
virtualConsole.on("error", (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
  }
});
const { window } = dom;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

const PAGE = `<html><head><style>.x{color:red}</style></head><body>
  <nav>меню меню меню</nav>
  <h1>Фотосинтез у растений</h1>
  <p>Фотосинтез — это процесс, при котором растения на свету превращают воду и углекислый газ в глюкозу и кислород.</p>
  <p>Реакция идёт в хлорофилле и требует энергии света. Кислород выделяется как побочный продукт, а глюкоза идёт на рост.</p>
  <script>alert("не должно попасть в конспект")</script>
  <footer>подвал</footer></body></html>`;

let fetchLog = [];
window.fetch = async (url) => {
  const u = String(url);
  fetchLog.push(u);
  if (u.includes("example.com/article")) return { ok: true, status: 200, text: async () => PAGE };
  if (u.includes("ru.wikipedia.org/w/api.php")) return {
    ok: true, status: 200,
    json: async () => ({ query: { search: [{ title: "Фотосинтез", snippet: "процесс" }] } })
  };
  if (u.includes("rest_v1/page/summary")) return {
    ok: true, status: 200,
    json: async () => ({ title: "Фотосинтез", extract: "Фотосинтез — процесс образования органических веществ из неорганических на свету.", content_urls: { desktop: { page: "https://ru.wikipedia.org/wiki/Фотосинтез" } } })
  };
  throw new Error("offline в тесте");
};

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("ссылка распознаётся, обычные слова — нет", () => {
  const f = (s) => window.eval(`looksLikeUrl(${JSON.stringify(s)})`);
  assert(f("https://ru.wikipedia.org/wiki/Фотосинтез") === true, "http-ссылка не распознана");
  assert(f("example.com/article") === true, "адрес без протокола не распознан");
  assert(f("фотосинтез") === false, "слово принято за ссылку");
  assert(f("1.5 литра") === false, "число принято за ссылку");
  assert(f("т.е. так") === false, "сокращение принято за ссылку");
});

await test("локальная сеть и мусор не открываются", () => {
  const n = (s) => window.eval(`normalizeLearnUrl(${JSON.stringify(s)})`);
  assert(n("http://localhost:3000/secret") === "", "localhost не заблокирован");
  assert(n("192.168.1.1/admin") === "", "локальный адрес не заблокирован");
  assert(n("javascript:alert(1)") === "", "javascript: не заблокирован");
  assert(/^https:\/\/example\.com\/article$/.test(n("example.com/article")), "нормальный адрес не принят: " + n("example.com/article"));
});

await test("HTML чистится до текста", () => {
  const t = window.eval(`htmlToReadableText(${JSON.stringify(PAGE)})`);
  assert(/Фотосинтез/.test(t), "потерялся текст");
  assert(!/<[a-z]/i.test(t), "в тексте остались теги");
  assert(!/alert/.test(t) && !/color:red/.test(t), "скрипт или стиль попали в текст");
  assert(!/меню меню/.test(t), "меню попало в текст");
});

await test("ссылка: читаем, конспектируем, запоминаем", async () => {
  window.eval("localStorage.removeItem('iskra.learned.v1')");
  const r = await window.eval(`learnAndSave("example.com/article")`);
  assert(r.ok, "не выучила: " + (r.msg || ""));
  assert(r.source === "https://example.com/article", "источник не сохранён: " + r.source);
  assert(r.text.length > 80, "конспект слишком короткий");
  const list = window.eval("learnedList()");
  assert(list.length === 1 && list[0].topic, "тема не попала в свои знания");
  assert(fetchLog.some((u) => u.includes("example.com/article")), "страница даже не запрашивалась");
});

await test("тема словом: берём Википедию", async () => {
  window.eval("localStorage.removeItem('iskra.learned.v1')");
  const r = await window.eval(`learnAndSave("фотосинтез")`);
  assert(r.ok, "не выучила: " + (r.msg || ""));
  assert(/Фотосинтез/i.test(r.text), "в конспект не попал материал: " + r.text.slice(0, 80));
  assert(window.eval("learnedList().length") === 1, "тема не сохранилась");
});

await test("запрещённое не учим", async () => {
  const r = await window.eval(`learnAndSave("как сварить наркотики в домашних условиях")`);
  assert(r.ok === false, "запрещённая тема прошла");
  assert(/наркотик/i.test(r.msg), "нет внятного отказа: " + r.msg);
});

await test("выученное видно в «Мои знания» и в поиске", () => {
  window.eval("localStorage.removeItem('iskra.learned.v1'); learnedAdd('Тестовая тема', 'Короткий конспект про тестовую тему, достаточно длинный для сохранения.', 'https://example.com')");
  const byCat = window.eval(`kbBrowse("", "mine", 10)`);
  assert(byCat.length === 1 && byCat[0].learned === true, "категория «Мои темы» пустая");
  const byQuery = window.eval(`kbBrowse("тестовая", "all", 10)`);
  assert(byQuery.some((x) => x.learned && /Тестовая/.test(x.title)), "поиск не нашёл свою тему");
  assert(window.eval(`kbCountByCat("mine")`) === 1, "счётчик «Мои темы» врёт");
});

await test("панель: поле, кнопка и статус на месте", async () => {
  window.eval("renderKnowledgePanel()");
  await wait(30);
  const doc = window.document;
  assert(doc.querySelector("#learnTopicInput"), "нет поля ввода");
  assert(doc.querySelector("#learnTopicGo"), "нет кнопки «Выучить»");
  assert(doc.querySelector("#learnStatus"), "нет строки статуса");
  assert(doc.querySelector('#kbCats [data-cat="mine"]'), "нет категории «Мои темы»");
  doc.querySelector("#learnTopicInput").value = "example.com/article";
  doc.querySelector("#learnTopicGo").click();
  for (let i = 0; i < 60 && /Читаю|Ищу/.test(doc.querySelector("#learnStatus").textContent); i++) await wait(50);
  assert(/Выучила/.test(doc.querySelector("#learnStatus").textContent), "статус не обновился: " + doc.querySelector("#learnStatus").textContent);
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
// выходим сразу: фоновые таймеры страницы не должны ронять процесс после закрытия окна
process.exit(process.exitCode || 0);

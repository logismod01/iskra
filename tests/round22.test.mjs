/**
 * Раунд 22: свободное листание, меню целиком и новые инструменты.
 *
 * Что проверяем:
 * 1) пока Искра печатает, страница больше не «сопротивляется»: вниз тянет,
 *    только если человек сам внизу; отлистал вверх — тишина и кнопка «К ответу»;
 * 2) плавная прокрутка отключается на время ответа (иначе каждый кусок текста
 *    запускал новую анимацию и получалось дёрганье);
 * 3) меню на телефоне имеет запасную высоту в vh (старые браузеры не знают dvh)
 *    и прокрутку внутри — все пункты достаются;
 * 4) новые инструменты: 8 шаблонов, диктовка, экспорт разговора, закладки;
 * 5) под ответом сразу видны «Копировать» и «Короче», остальное — за «Ещё».
 *
 * Запуск: node tests/round22.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

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

console.log("round22: свободное листание и инструменты");

/* ---------- 1. CSS: прокрутка не мешает ---------- */
await test("пока идёт ответ, плавная прокрутка отключена", async () => {
  assert(/body\.generating \.messages \{ scroll-behavior: auto; \}/.test(html),
    "нет отключения плавности на время ответа");
});

await test("класс generating ставится в начале и снимается в finally", async () => {
  assert(/document\.body\.classList\.add\("generating"\)/.test(html), "класс generating не ставится");
  const tail = html.slice(html.indexOf("document.body.classList.remove(\"generating\")"));
  assert(/liveStream/.test(tail.slice(0, 400)), "класс generating снимается не в том месте");
});

await test("кнопка «К ответу» есть в разметке и в стилях", async () => {
  assert(/id="jumpLatest"/.test(html), "нет кнопки «К ответу»");
  assert(/\.jump-latest \{[\s\S]*?position: absolute/.test(html), "кнопка не висит над лентой");
  assert(/\.jump-latest\.show \{ opacity: 1; pointer-events: auto;/.test(html), "кнопка не показывается");
});

/* ---------- 2. Меню: все пункты достаются ---------- */
await test("на телефоне у меню есть запасная высота в vh", async () => {
  const i = html.indexOf("Телефон: отдельный, спокойный интерфейс");
  const mobile = html.slice(i, html.indexOf("Пункты меню, которые нужны только на телефоне"));
  const block = mobile.slice(mobile.indexOf(".more-menu {"), mobile.indexOf("@keyframes moreSheetUp"));
  assert(/max-height: min\(78vh, 520px\)/.test(block), "нет запасной высоты в vh — старый браузер обрежет меню");
  assert(/max-height: min\(72dvh, 520px\)/.test(block), "нет точной высоты в dvh");
  assert(/overflow-y: auto/.test(block), "меню не прокручивается внутри");
});

/* ---------- 3. Новые инструменты в меню ---------- */
await test("в меню есть «Инструменты», и они открываются", async () => {
  assert(/data-more="tools"/.test(html), "нет пункта «Инструменты»");
  assert(/act === "tools"\) openTools\(\)/.test(html), "пункт не открывает окно");
  assert(/id="toolsModal"/.test(html), "нет окна инструментов");
});

await test("под ответом сразу видны «Копировать» и «Короче»", async () => {
  const fn = html.slice(html.indexOf("function answerActionsHtml"), html.indexOf("function wireAnswerActions"));
  assert(fn.includes('data-act="copy"'), "нет «Копировать»");
  assert(fn.includes('data-act="shorter"'), "«Короче» спрятали обратно");
  assert(fn.includes('data-act="longer"'), "нет «Подробнее»");
  assert(fn.includes('data-act="bookmark"'), "нет «В закладки»");
  const extra = fn.slice(fn.indexOf('class="act-extra"'));
  assert(extra.includes('data-act="longer"'), "«Подробнее» должно быть за «Ещё»");
});

/* ---------- 4. Живой прогон в jsdom ---------- */
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
    win.confirm = () => true;
    win.URL.createObjectURL = () => "blob:iskra-test";
    win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () { win.__downloaded = this.download; };
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

/* Чат с двумя сообщениями: приветствие прячем, как это делает сайт */
window.eval(`
  currentChatId = "chat-1";
  chats = { "chat-1": { id: "chat-1", title: "Проверка", createdAt: Date.now(), updatedAt: Date.now(),
    messages: [
      { id: "m1", role: "user", content: "привет", ts: Date.now() - 2000 },
      { id: "m2", role: "assistant", content: "здравствуй, человек", ts: Date.now() - 1000 }
    ] } };
  renderMessages();
`);

const msgs = doc.getElementById("messages");

await test("человек отлистал вверх — автопрокрутка не тянет его обратно", async () => {
  Object.defineProperty(msgs, "scrollHeight", { value: 3000, configurable: true });
  Object.defineProperty(msgs, "clientHeight", { value: 600, configurable: true });
  msgs.scrollTop = 300;
  window.eval("stickBottom = false");
  window.eval("scrollToBottom()");
  await new Promise((r) => setTimeout(r, 40));
  assert(msgs.scrollTop === 300, "страница уехала вниз вопреки листанию: " + msgs.scrollTop);
});

await test("и показывает кнопку «К ответу»", async () => {
  const jump = doc.getElementById("jumpLatest");
  assert(jump, "нет кнопки");
  assert(jump.classList.contains("show"), "кнопка не появилась");
});

await test("кнопка «К ответу» возвращает вниз и прячется", async () => {
  const jump = doc.getElementById("jumpLatest");
  jump.click();
  await new Promise((r) => setTimeout(r, 40));
  assert(msgs.scrollTop === 3000, "не вернуло вниз: " + msgs.scrollTop);
  assert(!jump.classList.contains("show"), "кнопка осталась висеть");
  assert(window.eval("stickBottom") === true, "флаг прокрутки не вернулся");
});

await test("пока человек внизу, новые куски ответа прокручивают вниз", async () => {
  msgs.scrollTop = 3000;
  window.eval("stickBottom = true");
  window.eval("scrollToBottom()");
  await new Promise((r) => setTimeout(r, 40));
  assert(msgs.scrollTop === 3000, "не держится низ: " + msgs.scrollTop);
  assert(!doc.getElementById("jumpLatest").classList.contains("show"), "кнопка висит зря");
});

/* ---------- 5. Шаблоны ---------- */
await test("шаблонов восемь и они вставляются в поле ввода", async () => {
  window.eval("openTools()");
  const grid = doc.getElementById("toolsTemplates");
  const cards = grid.querySelectorAll("[data-tpl]");
  assert(cards.length === 8, "шаблонов " + cards.length + ", ожидалось 8");
  cards[2].click();
  const input = doc.getElementById("input");
  assert(input.value.includes("Объясни простыми словами"), "шаблон не попал в поле: " + input.value.slice(0, 40));
  assert(!doc.getElementById("toolsModal").classList.contains("open"), "окно не закрылось после вставки");
});

/* ---------- 6. Закладки ---------- */
await test("закладка сохраняется, показывается и удаляется", async () => {
  window.eval("addBookmark('Первый важный ответ')");
  const list = window.eval("getBookmarks()");
  assert(list.length === 1, "закладка не сохранилась");
  window.eval("openTools(); document.getElementById('toolsBookmarks').click()");
  const box = doc.getElementById("toolsBookmarksList");
  assert(!box.hidden, "список закладок не открылся");
  assert(/Первый важный ответ/.test(box.textContent), "закладки нет в списке");
  box.querySelector("[data-bm-drop]").click();
  assert(window.eval("getBookmarks()").length === 0, "закладка не удалилась");
});

await test("одну и ту же закладку дважды не добавляет", async () => {
  window.eval("addBookmark('Дубль'); addBookmark('Дубль')");
  assert(window.eval("getBookmarks()").length === 1, "появился дубль");
  window.eval("settings.bookmarks = []; saveSettings()");
});

/* ---------- 7. Экспорт ---------- */
await test("разговор сохраняется файлом .md", async () => {
  window.eval("exportChat()");
  assert(window.__downloaded, "файл не скачался");
  assert(/\.md$/.test(window.__downloaded), "не .md: " + window.__downloaded);
});

/* ---------- 8. Версия ---------- */
await test("версия сайта и кэша — 1.24.0", async () => {
  assert(pkg.version === "1.24.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.24\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round22: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

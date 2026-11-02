/**
 * Раунд 18: меньше кнопок, плотнее экран, полезные действия под ответом.
 *
 * 1) В шапке осталось две кнопки: «Ещё» и настройки. База знаний, память и тема
 *    переехали в меню «Ещё» — те же самые кнопки с теми же id, ничего не сломалось.
 * 2) Компактный вид включён по умолчанию: и у новых, и у старых настроек.
 * 3) Под ответом видно две кнопки, остальное — за «Ещё»: «Короче», «Проще», «Перегенерить».
 *    На телефоне (без наведения) действия вообще не прячутся.
 *
 * Запуск: node tests/round18.test.mjs
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

/* Шапка целиком: от .topbar до начала сообщений. Раньше здесь стоял
   жёсткий отрезок в 4000 знаков — он ломался, как только меню «⋯» подросло. */
const topbar = (() => {
  const i = html.indexOf('<div class="topbar">');
  const end = html.indexOf('<div class="messages"', i);
  assert(i > -1 && end > i, "не нашёл шапку в разметке");
  return html.slice(i, end);
})();

console.log("round18: меньше кнопок, плотнее, полезнее");

/* ---------- Шапка ---------- */
await test("в шапке две кнопки вместо четырёх", async () => {
  /* .menu-btn — гамбургер, он виден только на телефоне вместо сайдбара */
  const icons = (topbar.match(/class="icon-btn[^"]*"/g) || []).filter(c => !c.includes("menu-btn"));
  assert(icons.length === 2, "кнопок в шапке: " + icons.length + ", ожидалось 2");
  assert(topbar.includes('id="moreBtn"'), "нет кнопки «Ещё»");
  assert(topbar.includes('id="settingsIcon"'), "нет кнопки настроек");
});

await test("база знаний, память и тема живут в меню «Ещё»", async () => {
  assert(topbar.includes('id="moreMenu"'), "нет меню «Ещё»");
  ["kbTop", "memoryTop", "themeBtn"].forEach((id) => {
    assert(topbar.includes('id="' + id + '"'), "в меню нет " + id);
  });
});

await test("меню работает: открывается, закрывается, закрывается по Esc", async () => {
  const vc = new VirtualConsole();
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
    }
  });
  await new Promise((r) => setTimeout(r, 700));
  const win = dom.window;
  const doc = win.document;
  const btn = doc.getElementById("moreBtn");
  const menu = doc.getElementById("moreMenu");
  assert(menu.hidden === true, "меню должно быть закрыто при открытии страницы");

  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(menu.hidden === false, "по клику меню не открылось");
  assert(btn.getAttribute("aria-expanded") === "true", "не выставлен aria-expanded");

  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
  assert(menu.hidden === true, "по Esc меню не закрылось");

  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  doc.getElementById("kbTop").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(menu.hidden === true, "после выбора пункта меню не закрылось");

  win.close();
});

/* ---------- Действия под ответом ---------- */
await test("под ответом две кнопки, остальное за «Ещё»", async () => {
  assert(/function answerActionsHtml/.test(html), "нет сборки кнопок ответа");
  const fn = html.slice(html.indexOf("function answerActionsHtml"), html.indexOf("function wireAnswerActions"));
  assert(fn.includes('data-act="copy"'), "нет «Копировать»");
  assert(fn.includes('data-act="more"'), "нет «Ещё»");
  assert(fn.includes('class="act-extra"'), "нет блока скрытых действий");
  assert(!/data-act="regen"[^`]*<\/span>/s.test("") , "пустая проверка");
});

await test("«Короче» и «Проще» действительно отправляют запрос", async () => {
  assert(/data-act="shorter"/.test(html), "нет кнопки «Короче»");
  assert(/data-act="simpler"/.test(html), "нет кнопки «Проще»");
  const act = html.slice(html.indexOf("function onMsgAction"), html.indexOf("function resendLast"));
  assert(/act === "shorter"/.test(act), "«Короче» не обрабатывается");
  assert(/act === "simpler"/.test(act), "«Проще» не обрабатывается");
  assert(/sendMessage\("Сократи последний ответ/.test(act), "«Короче» ничего не отправляет");
  assert(/sendMessage\("Объясни то же самое проще/.test(act), "«Проще» ничего не отправляет");
});

await test("скрытые действия не видны, пока не нажали «Ещё»", async () => {
  assert(/\.msg \.actions:not\(\[data-open="1"\]\) \.act-extra \{ display: none; \}/.test(html),
    "скрытые действия не прячутся");
});

await test("на телефоне действия под ответом не прячутся совсем", async () => {
  assert(/@media \(hover: none\) \{\s*\.msg \.actions \{ opacity: 1; \}/.test(html),
    "на сенсорном экране кнопок под ответом не видно — наведения там нет");
});

/* ---------- Плотность ---------- */
await test("компактный вид включён по умолчанию", async () => {
  assert(/compact:\s*true/.test(html), "в настройках по умолчанию не compact:true");
  assert(/if \(typeof settings\.compact !== "boolean"\) settings\.compact = true;/.test(html),
    "старые настройки не получают компактный вид");
});

await test("шапка стала плотнее", async () => {
  const css = html.slice(html.indexOf(".topbar {"), html.indexOf(".topbar {") + 200);
  assert(/padding: 10px 16px/.test(css), "отступы шапки не уменьшены: " + css.slice(0, 80));
  assert(/\.icon-btn \{\s*width: 38px; height: 38px;/.test(html), "кнопки шапки не уменьшены");
});

/* ---------- Версии ---------- */
await test("версия сайта поднята", async () => {
  assert(pkg.version === "1.21.0", "версия сайта: " + pkg.version);
});

await test("новый тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round18.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round18: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

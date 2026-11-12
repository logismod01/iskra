/**
 * Раунд 20: отдельный интерфейс для телефона.
 *
 * Что было не так (по скриншоту с телефона):
 * в шапке пять элементов в ряд и всё сжато; приветствие занимает весь экран,
 * поле ввода уезжает вниз; кнопки под полем ввода переносятся на вторую строку
 * (глобус висит один); в настройках предлагается скачать агента для Windows.
 *
 * Что проверяем:
 * 1) На телефоне в шапке остаются меню, название и «⋯» — остальное спрятано в меню.
 * 2) Приветствие короче: меньше логотип, меньше заголовок, без подписей под карточками.
 * 3) Кнопки под полем ввода в один ряд (nowrap) и меньше размером.
 * 4) Поле ввода 16 px — иначе iPhone увеличивает страницу при фокусе.
 * 5) Учтены «безопасные зоны» (чёлка и полоса жестов).
 * 6) Агент Sye (программа для Windows) на телефоне не показывается.
 * 7) Пункты «Аккаунт», «Искра Про», «Настройки» есть в меню и работают.
 * 8) На компьютере всё осталось как было: пункты «только для телефона» скрыты.
 *
 * Запуск: node tests/round20.test.mjs
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

/* Телефонная часть стилей: от заголовка блока до конца <style> */
const mobileCss = (() => {
  const i = html.indexOf("Телефон: отдельный, спокойный интерфейс");
  assert(i > -1, "нет блока стилей для телефона");
  return html.slice(i, html.indexOf("</style>", i));
})();

console.log("round20: телефон — отдельный интерфейс");

/* ---------- 1. Шапка ---------- */
await test("на телефоне шапка прячет аккаунт, версию и шестерёнку", async () => {
  ["profile-btn", "model-chip", "#settingsIcon"].forEach((sel) => {
    assert(mobileCss.includes(sel), "в телефонных стилях не спрятан " + sel);
  });
  assert(/@media \(max-width: 700px\)/.test(mobileCss), "нет медиазапроса под телефон");
});

await test("в шапке на телефоне видно название «Искра»", async () => {
  assert(/\.topbar \.title \{[^}]*display: block/.test(mobileCss), "название спрятано и на телефоне");
});

/* ---------- 2. Приветствие ---------- */
await test("приветствие на телефоне короче: логотип, заголовок, карточки", async () => {
  assert(/\.welcome \.big-logo \{[^}]*width: 52px/.test(mobileCss), "логотип не уменьшен");
  assert(/\.welcome h1 \{[^}]*font-size: 22px/.test(mobileCss), "заголовок не уменьшен");
  assert(/\.wa-d \{ display: none/.test(mobileCss), "подписи под карточками не убраны");
  assert(/\.welcome-actions \{[^}]*grid-template-columns: repeat\(2/.test(mobileCss), "карточки не в две колонки");
});

await test("фон-узоры на телефоне выключены", async () => {
  assert(/\.ambient \{ display: none/.test(mobileCss), "узорчатый фон остался");
});

/* ---------- 3. Поле ввода ---------- */
await test("кнопки под полем ввода в один ряд и не переносятся", async () => {
  assert(/\.comp-tools \{[^}]*flex-wrap: nowrap/.test(mobileCss), "кнопки всё ещё переносятся");
  assert(/\.comp-tools \.tool-btn \{[^}]*width: 34px/.test(mobileCss), "кнопки не уменьшены");
});

await test("поле ввода 16 px — иначе iPhone зумит страницу", async () => {
  assert(/#input \{ font-size: 16px/.test(mobileCss), "размер поля не 16 px");
});

await test("учтены безопасные зоны телефона (чёлка, полоса жестов)", async () => {
  assert(/env\(safe-area-inset-top\)/.test(mobileCss), "не учтена верхняя безопасная зона");
  assert(/env\(safe-area-inset-bottom\)/.test(mobileCss), "не учтена нижняя безопасная зона");
});

await test("подпись под полем ввода не растягивает низ", async () => {
  assert(/\.composer-note \{[\s\S]*?-webkit-line-clamp: 2/.test(mobileCss), "подпись не ограничена двумя строками");
});

/* ---------- 4. Агент ---------- */
await test("агент Sye на телефоне не показывается", async () => {
  assert(/\.agent-card,[\s\S]{0,80}display: none !important/.test(mobileCss), "карточка агента видна на телефоне");
  assert(/\.look-sye/.test(mobileCss), "карточка про маскота агента видна на телефоне");
});

/* ---------- 5. Меню ---------- */
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
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

const click = (id) => doc.getElementById(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

await test("в меню есть «Новый чат», «Аккаунт», «Искра Про» и «Настройки» — только для телефона", async () => {
  const items = [...doc.querySelectorAll("#moreMenu [data-more]")].map(b => b.dataset.more);
  ["newchat", "account", "pro", "settings"].forEach((a) => assert(items.includes(a), "в меню нет пункта " + a));
  ["newChatTop", "acctTop", "proTop", "setTop"].forEach((id) => {
    const el = doc.getElementById(id);
    assert(el, "нет кнопки " + id);
    assert(el.classList.contains("only-phone"), "кнопка " + id + " видна и на компьютере");
  });
});

await test("на компьютере телефонные пункты скрыты", async () => {
  assert(/\.more-item\.only-phone \{ display: none; \}/.test(html), "пункты не скрыты вне телефона");
  assert(/\.more-sep\.only-phone \{ display: none; \}/.test(html), "разделитель не скрыт вне телефона");
});

await test("«Настройки» из меню открывают настройки", async () => {
  click("moreBtn");
  click("setTop");
  assert(doc.getElementById("settingsModal").classList.contains("open"), "настройки не открылись");
  window.eval("closeSettings()");
});

await test("«Искра Про и тарифы» открывает тарифы", async () => {
  click("moreBtn");
  click("proTop");
  assert(doc.getElementById("proModal").classList.contains("open"), "тарифы не открылись");
  doc.getElementById("proModal").classList.remove("open");
});

await test("«Аккаунт» не падает и что-то открывает", async () => {
  click("moreBtn");
  click("acctTop");
  const opened = ["accountModal", "authModal"]
    .filter(id => doc.getElementById(id))
    .some(id => doc.getElementById(id).classList.contains("open"));
  assert(opened, "по «Аккаунт» ничего не открылось");
});

await test("меню закрывается после выбора телефонного пункта", async () => {
  const menu = doc.getElementById("moreMenu");
  click("moreBtn");
  assert(menu.hidden === false, "меню не открылось");
  click("setTop");
  assert(menu.hidden === true, "меню осталось открытым");
  window.eval("closeSettings()");
});

/* ---------- 6. Версия ---------- */
await test("версия поднята, кэш обновлён", async () => {
  assert(pkg.version === "1.30.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.30\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("новый тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round20.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round20: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

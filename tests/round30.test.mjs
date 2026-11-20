/**
 * Раунд 30: крупный текст больше не запирает пользователя.
 *
 * Как было: пункт «Крупный текст» ставил zoom: 1.16 на всю страницу.
 * Раскладка становилась шире окна, правый край шапки уезжал за экран
 * вместе с кнопкой «⋯». Включил — и выключить нечем.
 *
 * Как стало:
 *   1) увеличивается только текст, раскладка та же, ничего не обрезается;
 *   2) пока крупный текст включён, в шапке висит кнопка «Аа» — вернуть обычный;
 *   3) состояние сохраняется и восстанавливается при запуске.
 *
 * Запуск: node tests/round30.test.mjs
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

console.log("round30: крупный текст и выход из него");

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
    win.fetch = async () => { throw new Error("offline"); };
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));
const ev = (code) => window.eval(code);

await test("в стилях больше нет zoom на всю страницу — из-за него уезжала шапка", async () => {
  assert(!/html\.big-text\s*\{[^}]*zoom\s*:/i.test(html), "zoom на html.big-text вернулся");
  assert(!/html\.big-text\s*\{\s*zoom/i.test(html), "zoom на html.big-text вернулся");
});

await test("крупный текст увеличивает сам текст ответа и поля ввода", async () => {
  assert(/html\.big-text \.msg \.content \{[^}]*font-size:\s*18\.5px/.test(html), "текст ответа не увеличивается");
  assert(/html\.big-text \.composer textarea,\s*\n?\s*html\.big-text #input \{[^}]*font-size:\s*18px/.test(html) ||
    /html\.big-text #input \{ font-size: 18px/.test(html), "поле ввода не увеличивается");
});

await test("кнопка «Аа» есть в шапке и по умолчанию спрятана", async () => {
  const btn = doc.querySelector("#bigTextOff");
  assert(btn, "кнопки #bigTextOff нет в шапке");
  assert(btn.hidden, "кнопка видна, хотя крупный текст выключен");
  assert(btn.textContent.trim() === "Аа", "на кнопке не «Аа»");
  assert(btn.title.includes("обычный текст"), "у кнопки нет подсказки");
});

await test("включили — кнопка появилась, выключили — спряталась", async () => {
  ev(`applyBigText(true)`);
  assert(doc.documentElement.classList.contains("big-text"), "класс big-text не встал");
  assert(!doc.querySelector("#bigTextOff").hidden, "кнопка выхода не появилась");
  ev(`applyBigText(false)`);
  assert(!doc.documentElement.classList.contains("big-text"), "класс big-text не снялся");
  assert(doc.querySelector("#bigTextOff").hidden, "кнопка выхода не спряталась");
});

await test("нажатие на «Аа» сразу возвращает обычный текст", async () => {
  ev(`settings.bigText = true; saveSettings(); applyBigText(true);`);
  const btn = doc.querySelector("#bigTextOff");
  assert(!btn.hidden, "кнопка выхода не появилась");
  btn.click();
  await new Promise((r) => setTimeout(r, 30));
  assert(ev(`settings.bigText`) === false, "настройка не выключилась");
  assert(!doc.documentElement.classList.contains("big-text"), "крупный текст остался на экране");
  assert(btn.hidden, "кнопка выхода осталась висеть");
});

await test("состояние запоминается в настройках", async () => {
  ev(`settings.bigText = false; saveSettings();`);
  ev(`toggleBigText()`);
  await new Promise((r) => setTimeout(r, 30));
  assert(ev(`settings.bigText`) === true, "не включилось");
  const saved = JSON.parse(window.localStorage.getItem("iskra.settings.v1") || "{}");
  assert(saved.bigText === true, "в сохранённых настройках нет bigText");
  ev(`toggleBigText()`);
  await new Promise((r) => setTimeout(r, 30));
  assert(ev(`settings.bigText`) === false, "повторное нажатие не выключает");
});

await test("пункт «Крупный текст» в меню «⋯» по-прежнему на месте", async () => {
  assert(doc.querySelector('#bigTextTop[data-more="bigtext"]'), "пункт меню пропал");
});

await test("версия сайта и кэша — 1.57.0", async () => {
  assert(pkg.version === "1.57.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.57\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round30: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

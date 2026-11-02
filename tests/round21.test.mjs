/**
 * Раунд 21: баги с телефона.
 *
 * По скриншоту «⋯»:
 * 1) меню просвечивало — текст чата рисовался ПОВЕРХ него, а поле ввода
 *    обрезало последние пункты. Причина: шапка, чат и поле ввода были в одном
 *    слое (z-index 1), и побеждал тот, кто позже в разметке;
 * 2) меню уходило за нижний край экрана — последние пункты были недоступны;
 * 3) на пустом чате список прокручивался вниз и срезал логотип с заголовком;
 * 4) из общей базы в браузер попадали только 500 тем из 1141 — остальные
 *    не находились ни поиском, ни в окне знаний.
 *
 * Запуск: node tests/round21.test.mjs
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

console.log("round21: баги с телефона");

/* ---------- 1. Слои ---------- */
await test("шапка выше чата и поля ввода — меню больше не уходит под текст", async () => {
  const layer = (sel) => {
    const re = new RegExp("\\" + sel + "[^{]*\\{[^}]*z-index:\\s*(\\d+)");
    const m = html.match(re);
    assert(m, "не нашёл слой для " + sel);
    return Number(m[1]);
  };
  const top = layer(".main > .topbar");
  const msgs = layer(".main > .messages");
  const comp = layer(".main > .composer-wrap");
  assert(top > msgs, `шапка (${top}) не выше чата (${msgs})`);
  assert(top > comp, `шапка (${top}) не выше поля ввода (${comp})`);
  assert(comp > msgs, `поле ввода (${comp}) не выше чата (${msgs})`);
});

await test("порядок слоёв записан словами, чтобы не сломали молча", async () => {
  assert(/Раньше все три были в слое 1/.test(html), "нет объяснения, почему так");
});

/* ---------- 2. Меню ---------- */
await test("меню не обрезается: ограничение высоты и прокрутка", async () => {
  const block = html.slice(html.indexOf(".more-menu {"), html.indexOf(".more-menu[hidden]"));
  assert(/max-height:/.test(block), "нет ограничения высоты");
  assert(/overflow-y: auto/.test(block), "нет прокрутки внутри меню");
  assert(/overscroll-behavior: contain/.test(block), "прокрутка меню тянет страницу");
});

await test("на телефоне меню — шторка снизу, на всю ширину", async () => {
  const i = html.indexOf("Телефон: отдельный, спокойный интерфейс");
  const mobile = html.slice(i, html.indexOf("Пункты меню, которые нужны только на телефоне"));
  const block = mobile.slice(mobile.indexOf(".more-menu {"), mobile.indexOf("@keyframes moreSheetUp"));
  assert(/position: fixed/.test(block), "меню не закреплено");
  assert(/bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\)/.test(block), "нет отступа от низа экрана");
  assert(/left: 8px; right: 8px/.test(block), "меню не на всю ширину");
  assert(/max-height: min\(72dvh, 520px\)/.test(block), "нет ограничения высоты шторки");
});

/* ---------- 3. Прокрутка пустого чата ---------- */
const vc = new VirtualConsole();
const errs = [];
vc.on("jsdomError", (e) => errs.push(e.message));
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

await test("на пустом чате прокрутка не уводит приветствие за верх", async () => {
  const m = doc.getElementById("messages");
  Object.defineProperty(m, "scrollHeight", { value: 2000, configurable: true });
  m.scrollTop = 0;
  window.eval("scrollToBottom()");
  await new Promise((r) => setTimeout(r, 60));
  assert(m.scrollTop === 0, "список уехал вниз: " + m.scrollTop);
});

await test("при открытии нового чата список возвращается наверх", async () => {
  const m = doc.getElementById("messages");
  m.scrollTop = 500;
  window.eval("renderMessages()");
  assert(m.scrollTop === 0, "новый чат открылся не сверху: " + m.scrollTop);
});

/* ---------- 4. Общая база целиком ---------- */
await test("общая база грузится страницами, а не первыми 500 темами", async () => {
  const total = 1141;
  const calls = [];
  window.fetch = async (url) => {
    calls.push(String(url));
    const u = new URL(String(url));
    const limit = Number(u.searchParams.get("limit"));
    const offset = Number(u.searchParams.get("offset") || 0);
    const left = Math.max(0, total - offset);
    const n = Math.min(limit, left);
    const rows = Array.from({ length: n }, (_, i) => ({
      topic: "Тема " + (offset + i + 1),
      body: "Текст темы номер " + (offset + i + 1) + " — достаточно длинный, чтобы попасть в базу.",
      tags: "проверка",
      source: "",
      updated_at: "2026-11-01"
    }));
    return { ok: true, json: async () => rows };
  };
  window.eval("_sharedKb = null; _sharedKbAt = 0;");
  const got = await window.eval("sharedKbRefresh(true).then(x => x.length)");
  assert(got === total, "загружено тем: " + got + ", а в базе " + total);
  assert(calls.length === 3, "запросов: " + calls.length + ", ожидалось 3 (500+500+141)");
  assert(calls[0].includes("offset=0"), "нет первого запроса");
  assert(calls[1].includes("offset=500"), "нет второго запроса");
  assert(calls[2].includes("offset=1000"), "нет третьего запроса");
});

await test("счётчик в меню показывает все темы, а не 500", async () => {
  window.eval("updateMoreCounts()");
  const n = Number(doc.getElementById("moreKbCount").textContent);
  const builtin = window.eval("kbBuiltinPack().length");
  assert(n >= 1141 + builtin, "в меню " + n + ", а должно быть не меньше " + (1141 + builtin));
});

await test("поиск по общей базе находит тему из конца списка", async () => {
  window.eval("renderKnowledgePanel()");
  window.eval(`kbView.q = "Тема 1141"; kbView.cat = "all"; kbView.open = ""; renderKbCards();`);
  const text = doc.getElementById("kbCards").textContent;
  assert(text.includes("Тема 1141"), "тема из конца списка не находится");
  window.eval(`kbView.q = ""; renderKbCards();`);
});

await test("сбой сети не стирает уже сохранённую базу", async () => {
  window.fetch = async () => { throw new Error("offline"); };
  const n = await window.eval("sharedKbRefresh(true).then(x => x.length)");
  assert(n === 1141, "после сбоя тем: " + n);
});

if (!process.exitCode) console.log("round21: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

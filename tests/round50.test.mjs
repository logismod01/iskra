/**
 * Тест пятидесятого круга: «10 000 токенов в день и индекс тем».
 *
 * Что проверяем:
 *  • бесплатная норма — 10 000 токенов КАЖДЫЙ день, остаток не сгорает;
 *  • одно сообщение по-прежнему 1 500–5 000 токенов;
 *  • индекс тем: загрузка файла, поиск по стране, городу, языку, элементу;
 *  • индекс отвечает фактами из открытых данных и попадает в конспект обучения;
 *  • вместе с конспектами набирается больше 50 000 тем;
 *  • индекс не ломает страницу, если файла нет (офлайн, старый кэш);
 *  • версия 1.57.
 *
 * Запуск: node tests/round50.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const indexJson = JSON.parse(fs.readFileSync(new URL("../topic-index.json", import.meta.url), "utf8"));
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
const ev = (code) => window.eval(code);
const j = (code) => JSON.parse(ev(`JSON.stringify(${code})`));
const evAsync = async (code) => JSON.parse(await window.eval(`(async () => JSON.stringify(${code}))()`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Сеть: отдаём индекс, остальное — как в жизни (нет сети) */
const realFetch = window.fetch;
window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("topic-index.json")) {
    return { ok: true, status: 200, json: async () => indexJson, text: async () => JSON.stringify(indexJson) };
  }
  try { return await realFetch(url, opts); } catch (e) { return { ok: false, status: 503, json: async () => ({}), text: async () => "" }; }
};
await wait(500);

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name + "\n    " + (e && e.message)]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "условие не выполнено"); }

/* ------------------- 1. Токены: каждый день, а не раз в 5 дней ------------------- */
await test("бесплатные токены приходят каждый день, а не раз в 5 дней", () => {
  ev(`localStorage.clear(); _memoCache = null;`);
  const w = j("walletState()");
  assert(w.freeLeft === 10000, "норма: " + w.freeLeft);
  const until = new Date(w.freeReset);
  assert(until.getHours() === 0 && until.getMinutes() === 0, "сброс не в полночь: " + until.toString());
  const hours = (w.freeReset - Date.now()) / 36e5;
  assert(hours > 0 && hours <= 24.1, "до сброса часов: " + hours);
});

await test("потраченное возвращается на следующий день, остаток не сгорает", () => {
  ev(`localStorage.clear();`);
  ev(`tokenCharge(7000, "тест")`);
  assert(j("walletLeft()") === 3000, "после траты: " + j("walletLeft()"));
  /* переносим сброс в прошлое — как будто наступил новый день */
  ev(`(() => { const all = walletAll(); const w = all[walletAccId()]; w.freeReset = Date.now() - 1000; walletPersist(all); })()`);
  assert(j("walletLeft()") === 10000, "наутро не восстановилось: " + j("walletLeft()"));
  /* если не тратил — доливки сверх нормы нет */
  ev(`(() => { const all = walletAll(); const w = all[walletAccId()]; w.freeReset = Date.now() - 1000; walletPersist(all); })()`);
  assert(j("walletLeft()") === 10000, "накапало больше нормы: " + j("walletLeft()"));
});

await test("в панели тарифов написано «каждый день»", () => {
  ev(`openPayPanel()`);
  const txt = window.document.getElementById("payBody").textContent;
  assert(/каждый день/.test(txt), "нет слова «каждый день»");
  assert(!/раз в 5 дней/.test(txt), "осталось «раз в 5 дней»");
  assert(/1 500/.test(txt) && /5 000/.test(txt), "нет цены сообщения");
});

/* ------------------- 2. Индекс тем ------------------- */
await test("индекс грузится и считает темы", async () => {
  const ix = await evAsync(`await topicIndexLoad().then(x => x ? x.counts : null)`);
  assert(ix, "индекс не загрузился");
  assert(ix.countries >= 200, "стран: " + ix.countries);
  assert(ix.cities >= 20000, "городов: " + ix.cities);
  assert(ix.langs >= 5000, "языков: " + ix.langs);
  assert(ix.elements === 118, "элементов: " + ix.elements);
  assert(ev("topicIndexCount()") > 30000, "всего в индексе: " + ev("topicIndexCount()"));
});

await test("вместе с конспектами набирается больше 50 000 тем", () => {
  const kb = j("KNOWLEDGE_PACK.items.length");
  const total = ev("topicIndexTotal()");
  assert(kb >= 18000, "конспектов: " + kb);
  assert(total >= 50000, "всего тем: " + total);
});

await test("страна: столица, валюта, площадь", () => {
  const hit = j(`topicIndexFind("Россия")`);
  assert(hit && hit.kind === "страна", "не нашла Россию: " + JSON.stringify(hit));
  assert(/Москва|Moscow/.test(hit.text), "нет столицы: " + hit.text);
  assert(/рубл/i.test(hit.text), "нет валюты: " + hit.text);
  assert(/км²/.test(hit.text), "нет площади: " + hit.text);
});

await test("город: страна и население", () => {
  const hit = j(`topicIndexFind("Шанхай")`);
  assert(hit && hit.kind === "город", "не нашла Шанхай: " + JSON.stringify(hit));
  assert(/Кита/i.test(hit.text), "страна не та: " + hit.text);
  assert(/население/i.test(hit.text), "нет населения: " + hit.text);
  const en = j(`topicIndexFind("Istanbul")`);
  assert(en && en.kind === "город", "латиница не ищется");
});

await test("язык и химический элемент", () => {
  const lang = j(`topicIndexFind("Swahili")`);
  assert(lang && lang.kind === "язык", "язык не найден: " + JSON.stringify(lang));
  assert(/swa/i.test(lang.text), "нет кода ISO: " + lang.text);
  const el = j(`topicIndexFind("железо")`);
  assert(el && el.kind === "элемент", "элемент не найден: " + JSON.stringify(el));
  assert(/26/.test(el.text) && /Fe/.test(el.text), "не те данные: " + el.text);
});

await test("чего не знает — не выдумывает", () => {
  assert(ev(`topicIndexFind("квантовая пена времени")`) === null, "нашла то, чего нет");
  assert(ev(`topicIndexFind("а")`) === null, "ищет по одной букве");
});

await test("справка из индекса попадает в системный промпт", () => {
  ev(`settings.apiKey = "";`);
  const p = ev(`buildSystemPrompt("сколько людей живёт в Шанхае?")`);
  assert(/Шанхай/.test(p), "в промпте нет данных о городе");
  const p2 = ev(`buildSystemPrompt("расскажи про фотосинтез")`);
  assert(!/ИНДЕКСА ТЕМ/.test(p2), "индекс влез в вопрос, где его нет");
});

await test("обучение берёт факты из индекса", async () => {
  const r = await evAsync(`await learnCore("Шанхай").then(x => x && x.ok ? { ok: x.ok, title: x.title, text: x.text, note: x.note } : x)`);
  assert(r && r.ok, "не выучила: " + JSON.stringify(r));
  assert(/Шанхай/.test(r.text), "текст не про город: " + r.text.slice(0, 80));
  assert(/индекс/i.test(r.note || ""), "не сказано, откуда: " + r.note);
});

await test("в «Моих знаниях» видно общее число тем", () => {
  ev(`openKnow()`);
  const txt = window.document.getElementById("knowBody").textContent;
  assert(/Индекс тем/.test(txt), "нет строки индекса");
  assert(/50 0|56 |50 тыс/.test(txt.replace(/\u00a0/g, " ")) || /Всё вместе/.test(txt), "нет общего числа");
});

/* ------------------- 3. Офлайн: файла нет ------------------- */
await test("без файла индекса страница работает и не врёт", async () => {
  ev(`_topicIndex = null; _topicIndexLoading = null; _topicIndexTried = false;`);
  const old = window.fetch;
  window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
  const r = await evAsync(`await topicIndexLoad()`);
  window.fetch = old;
  assert(r === null, "индекс появился из ниоткуда");
  assert(ev("topicIndexCount()") === 0, "считает темы без файла");
  assert(ev(`topicIndexFind("Россия")`) === null, "ищет без файла");
  /* вернули индекс обратно для остальных проверок */
  window.fetch = async (url, opts) => (String(url).includes("topic-index.json")
    ? { ok: true, status: 200, json: async () => indexJson, text: async () => "" }
    : old(url, opts));
  await evAsync(`await topicIndexLoad()`);
  assert(ev("topicIndexCount()") > 30000, "индекс не вернулся");
});

/* ------------------- 4. Версия ------------------- */
await test("версия 1.57 в файлах и кэше", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert(pkg.version === "1.58.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.58\.0"/.test(sw), "кэш не обновлён");
  assert(/topic-index\.json/.test(sw), "индекс не кэшируется офлайн");
  assert(pkg.scripts.test.includes("tests/round50.test.mjs"), "тест не подключён к npm test");
});

await test("за всю работу не было ошибок JS", () => {
  const bad = errors.filter((e) => !/Could not load|not implemented|Not implemented/i.test(e));
  assert(bad.length === 0, bad.slice(0, 2).join(" | "));
});

let failed = 0;
for (const [mark, name] of results) {
  if (mark === "✗") failed++;
  console.log("  " + mark + " " + name);
}
console.log("\nГотово: " + (results.length - failed) + " проверок пройдено");
if (failed) process.exit(1);
process.exit(0);

/**
 * Тест восьмого круга: два ключа сразу, запасные модели одного сервиса
 * и подбор бесплатной модели, когда её имя поменялось.
 *
 * Запуск: node tests/round8.test.mjs
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
const window = dom.window;
const $ = (s) => window.document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name); console.error("    " + (e && e.message)); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

const GROQ = "gsk_" + "a".repeat(40);
const OR = "sk-or-v1-" + "b".repeat(48);

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.slice(0, 3).join(" | "));
});

await test("два ключа в одном поле распознаются оба", () => {
  const keys = JSON.parse(window.eval(`JSON.stringify(parseKeys(${JSON.stringify(GROQ + "\n" + OR)}))`));
  assert(keys.length === 2, "распознано ключей: " + keys.length);
  assert(keys[0] === GROQ && keys[1] === OR, "порядок ключей потерялся");
  const withJunk = JSON.parse(window.eval(`JSON.stringify(parseKeys("моё " + ${JSON.stringify(GROQ + ", " + OR)} + " конец"))`));
  assert(withJunk.length === 2, "мусор вокруг ключей ломает разбор: " + withJunk.length);
  assert(JSON.parse(window.eval('JSON.stringify(parseKeys("просто текст"))')).length === 0, "текст приняли за ключ");
});

await test("второй ключ становится запасным движком, а не теряется", () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ + "\n" + OR)}; settings.baseUrl = ""; settings.customModel = "";`);
  const list = JSON.parse(window.eval("JSON.stringify(keyEngines().map(e=>e.id+':'+(e.key||'').slice(0,7)))"));
  assert(list.length >= 2, "движков от двух ключей: " + list.length);
  assert(list[0].startsWith("key:"), "первым должен идти первый ключ: " + list[0]);
  assert(list.some((x) => x.endsWith("sk-or-v")), "второй ключ не попал в очередь");
  const ids = list.map((x) => x.split(":")[0]);
  assert(new Set(ids).size === ids.length, "повторяются id движков: " + ids.join(","));
});

await test("у одного ключа несколько моделей — есть чем заменить при отказе", () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)};`);
  const models = JSON.parse(window.eval("JSON.stringify(keyEngines().map(e=>e.model))"));
  assert(models.length >= 2, "моделей у ключа: " + models.length);
  assert(new Set(models).size === models.length, "модели повторяются");
  assert(models.every(Boolean), "есть движок с пустой моделью");
});

await test("бесплатная модель OpenRouter подбирается у сервиса", async () => {
  window.eval(`settings.apiKey = ${JSON.stringify(OR)}; _freeModelsCache = null; _freeModelsAt = 0;`);
  window.fetch = async () => new Response(JSON.stringify({
    data: [
      { id: "big/model:free", context_length: 128000, architecture: { input_modalities: ["text"] } },
      { id: "paid/model", context_length: 200000 },
      { id: "tiny:free", context_length: 4000 }
    ]
  }), { status: 200 });
  const list = JSON.parse(await window.eval("resolveKeyEngines(keyEngines(), false).then(x=>JSON.stringify(x.map(e=>e.id+':'+e.model)))"));
  assert(list[0].endsWith("big/model:free"), "взяли не ту модель: " + list[0]);
  assert(!list.some((x) => /paid\/model/.test(x)), "в очередь попала платная модель");
  assert(!list.some((x) => /tiny:free/.test(x)), "взяли модель с коротким контекстом");
});

await test("если список моделей недоступен — остаются запасные имена", async () => {
  window.eval(`_freeModelsCache = null; _freeModelsAt = 0;`);
  window.fetch = async () => { throw new Error("offline"); };
  const list = JSON.parse(await window.eval("resolveKeyEngines(keyEngines(), false).then(x=>JSON.stringify(x.map(e=>e.model)))"));
  assert(list.length > 0, "движков не осталось");
  assert(list.every(Boolean), "у движка пустая модель — запрос уйдёт в никуда");
});

await test("ключ не попадает в системный промпт", () => {
  const sys = window.eval(`buildSystemPrompt("починить баг")`);
  assert(!sys.includes(GROQ), "ключ утёк в промпт");
  assert(!sys.includes(OR), "ключ утёк в промпт");
  assert(!window.document.querySelector("#settingsModal").textContent.includes(GROQ), "ключ виден в интерфейсе");
});

await test("в настройках сказано, что можно два ключа", () => {
  assert(/два ключа сразу/i.test(html), "нет подсказки про два ключа");
  assert(/по одному в строке/i.test(html), "не сказано, как разделять ключи");
});

await test("кнопка «Проверить ключ» проверяет оба ключа и говорит правду", async () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ + "\n" + OR)};`);
  const inputs = window.document.querySelector("#apiKey");
  inputs.value = GROQ + "\n" + OR;
  const seen = [];
  window.fetch = async (url, opt) => {
    seen.push(String(url));
    const auth = (opt && opt.headers && opt.headers.Authorization) || "";
    if (auth.includes("a".repeat(40))) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 401 });
  };
  await window.eval("testConnection()");
  const text = window.document.querySelector("#connResult").textContent;
  assert(seen.length === 2, "проверено ключей: " + seen.length);
  assert(/Рабочих ключей: 1 из 2/.test(text), "не сказала, что рабочий только один: " + text);
});

try { window.close(); } catch (e) {}
console.log(`\nГотово: ${passed} проверок пройдено` + (failed ? `, ${failed} провалено` : ""));
process.exit(failed ? 1 : 0);

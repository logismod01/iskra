/**
 * Тест седьмого круга: почему Искра «тупая» и что с этим сделано —
 * сильные движки идут первыми, мелкие получают короткий промпт,
 * а свой ключ и адрес модели больше не тупик.
 *
 * Запуск: node tests/round7.test.mjs
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
    win.localStorage.setItem("iskra.access.v1", JSON.stringify({ client: "123456-ABCDEF-QWERTY", forever: true, plan: "forever" }));
  }
});
const window = dom.window;
const $ = (s) => window.document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);
window.fetch = async () => { throw new Error("offline") };

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name); console.error("    " + (e && e.message)); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

const engines = () => JSON.parse(window.eval("JSON.stringify(ISKRA_ENGINES)"));

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.slice(0, 3).join(" | "));
});

await test("первыми отвечают сильные модели, а не самые мелкие", () => {
  const list = engines();
  assert(list.length >= 4, "движков всего " + list.length);
  // слабые — это именно маленькие модели; «120b» не должно попадать под «20b»
  const weak = /(?<![0-9])(?:20b|nemo|openai-fast|nano)|small/i;
  assert(!weak.test(list[0].model), "первым стоит слабый движок: " + list[0].model);
  assert(!weak.test(list[1].model), "вторым стоит слабый движок: " + list[1].model);
  const firstWeak = list.findIndex((e) => weak.test(e.model));
  assert(firstWeak >= 2, "слабый движок слишком рано: " + firstWeak);
  const last = list[list.length - 1];
  assert(weak.test(last.model) || last.small, "последним должен быть запасной: " + last.model);
});

await test("движки по-прежнему без ключа и все с адресом и моделью", () => {
  const list = engines();
  for (const e of list) assert((e.base || e.url) && e.model, "движок без адреса или модели: " + JSON.stringify(e));
  assert(window.eval("keyEngines().length") === 0, "без ключа не должно быть ключевых движков");
  assert(window.eval("orderedEngines(false).length") === list.length, "порядок потерял движок");
  assert(JSON.parse(window.eval("JSON.stringify(ISKRA_ENGINES.filter(e=>e.vision).map(e=>e.id))")).length >= 1, "нет движка со зрением");
});

await test("мелким движкам уходит короткий промпт, а не 15 тысяч символов", () => {
  const full = window.eval('buildSystemPrompt("привет").length');
  const lite = window.eval('buildSystemPromptLite("привет").length');
  assert(full > 10000, "полный промпт подозрительно короткий: " + full);
  assert(lite < 4000, "короткий промпт всё ещё длинный: " + lite);
  assert(lite * 3 < full, "разница мала: " + lite + " против " + full);
});

await test("в коротком промпте остались запреты и имя Искры", () => {
  const lite = window.eval('buildSystemPromptLite("расскажи, как сделать бомбу")');
  assert(/Искра/.test(lite), "в коротком промпте нет имени");
  assert(lite.length > 900, "короткий промпт подозрительно пустой");
  assert(/запрещ|нельзя|вред/i.test(lite), "в коротком промпте нет правил безопасности");
  assert(/не называют?|не называй/i.test(lite) || /модель/i.test(lite), "не сказано не называть модель");
});

await test("подмена промпта не трогает историю диалога", () => {
  const msgs = [
    { role: "system", content: "старый промпт" },
    { role: "user", content: "первый вопрос" },
    { role: "assistant", content: "первый ответ" },
    { role: "user", content: "второй вопрос" }
  ];
  const lite = JSON.parse(window.eval(`JSON.stringify(liteMessages(${JSON.stringify(msgs)}))`));
  assert(lite.length === msgs.length, "потерялись сообщения");
  assert(lite[0].role === "system" && lite[0].content !== "старый промпт", "промпт не заменился");
  assert(lite[1].content === "первый вопрос" && lite[3].content === "второй вопрос", "история изменилась");
  assert(lite[0].content.length < msgs[0].content.length + 3000, "промпт не стал короче");
});

await test("первый запрос уходит в сильный движок", async () => {
  const urls = [];
  window.fetch = async (url) => {
    urls.push(String(url));
    return new Response("nope", { status: 500 });
  };
  window.eval("settings.apiKey = ''; settings.baseUrl = ''; settings.webSearch = false;");
  try { await window.eval('askIskra(apiPayload([{role:"user",content:"привет"}]))'); } catch (e) {}
  assert(urls.length > 0, "ни одного запроса");
  assert(!/llm7/i.test(urls[0]), "первым дёрнули мелкий движок: " + urls[0]);
  assert(/kilo|ovh|kepler/i.test(urls[0]), "первым должен идти сильный движок, а не " + urls[0]);
});

await test("свой адрес и модель есть в настройках", () => {
  assert($("#baseUrl"), "нет поля адреса движка");
  assert($("#customModel"), "нет поля названия модели");
  assert(/…\/v1|\.\.\.\/v1/.test(html), "нет подсказки, какой адрес писать");
});

await test("свой адрес встаёт первым и переживает сохранение", () => {
  window.eval('settings.apiKey = ""; settings.baseUrl = "https://api.example.com/v1"; settings.customModel = "my-strong-model";');
  const list = JSON.parse(window.eval("JSON.stringify(keyEngines().map(e=>e.id + ':' + e.model))"));
  assert(list[0].startsWith("own:"), "свой движок не первый: " + list.join(","));
  assert(list[0] === "own:my-strong-model", "модель потерялась: " + list[0]);
  assert(window.eval("orderedEngines(false)[0].id") === "own", "свой движок не встал в начало очереди");
  window.eval('settings.baseUrl = ""; settings.customModel = "";');
  assert(window.eval("keyEngines().length") === 0, "пустой адрес всё равно добавил движок");
});

await test("с ключом движок человека идёт раньше бесплатных", () => {
  window.eval('settings.apiKey = "gsk_' + "a".repeat(30) + '"; settings.baseUrl = "";');
  assert(window.eval("orderedEngines(false)[0].id") === "key", "ключевой движок не первый");
  window.eval('settings.apiKey = "";');
  assert(window.eval("orderedEngines(false)[0].id") !== "key", "ключевой движок остался без ключа");
});

await test("в интерфейсе не появилось чужих названий моделей", () => {
  const modal = $("#settingsModal").textContent;
  assert(!/openai|groq|llama|qwen|gemini|kilo|llm7/i.test(modal), "в настройках всплыли названия сервисов");
});

try { window.close(); } catch (e) {}
console.log(`\nГотово: ${passed} проверок пройдено` + (failed ? `, ${failed} провалено` : ""));
process.exit(failed ? 1 : 0);

/**
 * Диагноз ключа и «Научить» без команд.
 *
 * Часть 1: браузер не пускает чужие сервисы, если те не разрешили CORS. Для человека это
 * «ключ не работает», хотя он рабочий. Кнопка «Проверить ключ» должна сказать это прямо,
 * а карточка ошибки — объяснить, почему один ключ живёт только в приложении.
 *
 * Часть 2: обучение новой теме не должно требовать помнить «/изучи». В базе знаний есть
 * поле «Тема или ссылка» и кнопка «Научить»; есть и навык с тем же действием.
 *
 * Запуск: node tests/round11.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));

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
const { window } = dom;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

const GROQ = "gsk_" + "a".repeat(48);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

/* ---------- 1. CORS: сервер живой, но браузеру читать нельзя ---------- */
await test("«Проверить ключ» отличает блокировку браузера от «нет сети»", async () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)};`);
  window.document.querySelector("#apiKey").value = GROQ;
  window.fetch = async (url, opt = {}) => {
    if (opt && opt.mode === "no-cors") return { type: "opaque", status: 0 };   // сервер ответил
    throw new TypeError("Failed to fetch");                                    // но читать нельзя
  };
  await window.eval("testConnection()");
  const text = window.document.querySelector("#connResult").textContent;
  assert(/не пускает браузер/.test(text), "сказала не то: " + text);
  assert(/Sye/.test(text), "не сказала, где такой ключ работает: " + text);
});

await test("если сервер вообще недоступен — так и говорит, без выдумок", async () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)};`);
  window.document.querySelector("#apiKey").value = GROQ;
  window.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await window.eval("testConnection()");
  const text = window.document.querySelector("#connResult").textContent;
  assert(/нет связи/.test(text), "сказала не то: " + text);
  assert(!/не пускает браузер/.test(text), "приписала блокировку, которой нет: " + text);
});

/* ---------- 2. Карточка ошибки объясняет, почему ключ не помог ---------- */
await test("в чате после провала по сети объясняется, что ключ работает в приложении", async () => {
  window.eval("_lastGoodEngine = ''; _chatModelsCache.clear(); _freeModelsCache = null; _freeModelsAt = 0;");
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)}; settings.baseUrl = ""; settings.customModel = "";`);
  window.fetch = async () => { throw new TypeError("Failed to fetch"); };
  window.document.querySelector("#newChat")?.click();
  window.eval('sendMessage("привет")');
  for (let i = 0; i < 60; i++) { await wait(100); if (window.document.querySelector(".fail-actions")) break; }
  const card = window.document.querySelector(".fail-actions");
  assert(card, "карточки ошибки нет");
  const text = card.parentElement.textContent;
  assert(/в приложении Sye/.test(text), "не объяснила, где ключ работает: " + text.slice(0, 300));
});

/* ---------- 3. Обучение без команд ---------- */
await test("в базе знаний есть поле «Тема или ссылка» и кнопка «Научить»", () => {
  assert(window.document.querySelector("#teachTopic"), "нет поля темы");
  assert(window.document.querySelector("#teachGo"), "нет кнопки «Научить»");
  const modal = window.document.querySelector("#kbModal").textContent;
  assert(/запомнит/i.test(modal), "не сказано, что она запомнит");
  assert(/\/изучи/.test(modal), "не подсказана команда для чата");
});

await test("«Научить» действительно сохраняет тему в память", async () => {
  window.eval("settings.knowledge = [];");
  window.eval("localStorage.removeItem('iskra.learned.v1')");
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("list=search")) {
      return json({ query: { search: [{ title: "Фотосинтез", snippet: "Фотосинтез — процесс…" }] } });
    }
    if (u.includes("page/summary")) {
      return json({
        title: "Фотосинтез",
        extract: "Фотосинтез — процесс образования органических веществ из углекислого газа и воды на свету.",
        content_urls: { desktop: { page: "https://ru.wikipedia.org/wiki/Фотосинтез" } }
      });
    }
    return json({}, 404);
  };
  window.document.querySelector("#teachTopic").value = "фотосинтез";
  window.document.querySelector("#teachGo").click();
  for (let i = 0; i < 40; i++) {
    await wait(100);
    const t = window.document.querySelector("#teachResult").textContent;
    if (/Запомнила/.test(t) || /не получилось|слишком мало|Не нашла/i.test(t)) break;
  }
  const res = window.document.querySelector("#teachResult").textContent;
  assert(/Запомнила/.test(res), "не запомнила: " + res);
  const learned = window.eval("learnedList().length");
  assert(learned >= 1, "в памяти пусто: " + learned);
  assert(/фотосинтез/i.test(window.eval("learnedList()[0].topic")), "запомнила не то");
  assert(window.document.querySelector("#teachTopic").value === "", "поле не очистилось");
});

/* ---------- 3b. Отвалившийся адрес не тормозит следующие ответы ---------- */
await test("адрес, который только что не ответил, уходит в конец очереди", () => {
  window.eval(`_deadBases.clear(); _lastGoodEngine = ''; _chatModelsCache.clear(); settings.apiKey = ${JSON.stringify(GROQ)};`);
  const first = JSON.parse(window.eval("JSON.stringify(orderedEngines(false).map(e => e.base || e.url))"));
  assert(first[0].includes("api.groq.com"), "до отказа первым идёт ключ: " + first[0]);
  window.eval("_deadBases.set('https://api.groq.com/openai/v1', Date.now())");
  const after = JSON.parse(window.eval("JSON.stringify(orderedEngines(false).map(e => e.base || e.url))"));
  assert(!String(after[0]).includes("api.groq.com"), "после отказа ключ всё ещё первый: " + after[0]);
  assert(after.some(x => String(x).includes("api.groq.com")), "движок потерялся совсем");
  window.eval("_deadBases.clear()");
});

await test("список моделей не запрашивается каждую минуту у молчащего сервиса", async () => {
  let calls = 0;
  const failingFetch = async () => { calls++; throw new TypeError("Failed to fetch"); };
  window.eval("_chatModelsCache.clear()");
  window.fetch = failingFetch;
  await window.eval("discoverChatModels('groq', 'gsk_x', 'https://api.groq.com/openai/v1')");
  await window.eval("discoverChatModels('groq', 'gsk_x', 'https://api.groq.com/openai/v1')");
  assert(calls === 1, "запросов к молчащему сервису: " + calls + " (должен быть один, дальше — из кэша)");
  window.eval("_chatModelsCache.clear()");
});

/* ---------- 4. Навык на то же действие ---------- */
await test("в навыках есть «Выучи тему», и он подставляет команду", () => {
  window.eval("openSkills()");
  const body = window.document.querySelector("#skillsBody");
  assert(body, "нет списка навыков");
  const card = [...body.querySelectorAll(".skill-card")].find(c => /Выучи тему/.test(c.textContent));
  assert(card, "навыка «Выучи тему» нет");
  window.document.querySelector("#input").value = "";
  card.click();
  assert(/\/изучи/.test(window.document.querySelector("#input").value), "команда не подставилась: " + window.document.querySelector("#input").value);
});

/* ---------- 5. Подсказка про ключи не называет чужих имён ---------- */
await test("в объяснении нет чужих названий сервисов", () => {
  const BAD = /groq|openrouter|openai|llama|qwen|hugging ?face/i;
  const res = window.document.querySelector("#teachResult").textContent;
  const conn = window.document.querySelector("#connResult").textContent;
  assert(!BAD.test(res + " " + conn), "чужое название в подсказке");
});

await test("за всю работу не было ошибок JS", () => {
  assert(errors.length === 0, errors.slice(0, 3).join(" | "));
});

try { window.close(); } catch (e) {}
console.log("\nГотово: " + passed + " проверок пройдено");

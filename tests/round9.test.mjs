/**
 * Сквозная проверка «человек вставил ключи — Искра отвечает».
 *
 * Это не проверка разбора строки, а прогон настоящего пути ответа: сборка запроса,
 * отправка, чтение потока, запасные модели и второй ключ. Сеть подменяется так же,
 * как отвечают настоящие сервисы: 429 на лимит, 401 на плохой ключ, 404 на несуществующую
 * модель, SSE-поток на успех.
 *
 * Запуск: node tests/round9.test.mjs
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
const OR = "sk-or-v1-" + "b".repeat(48);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
});
function sse(text) {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      c.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const err = (status, code) => json({ error: { message: String(code), code } }, status);

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

/* Каждый тест ставит свою «сеть». calls собирает, что и куда уходило. */
let calls = [];
function setNet(handler) {
  calls = [];
  window.fetch = async (url, opt = {}) => {
    const u = String(url);
    const body = opt.body ? JSON.parse(opt.body) : null;
    const auth = (opt.headers || {}).Authorization || "";
    const rec = { url: u, model: body && body.model, auth, headers: Object.assign({}, opt.headers || {}), stream: !!(body && body.stream) };
    calls.push(rec);
    return handler(rec, u, body);
  };
}
const lastAnswer = () => {
  const box = window.document.querySelector(".messages");
  if (!box) return null;
  const ai = [...box.querySelectorAll(".msg.assistant")];
  return ai.length ? ai[ai.length - 1] : null;
};
const failCards = () => window.document.querySelectorAll(".fail-actions").length;

async function ask(text) {
  window.document.querySelector("#newChat")?.click();
  window.eval(`sendMessage(${JSON.stringify(text)})`);
  for (let i = 0; i < 40; i++) {
    await wait(100);
    const el = lastAnswer();
    if (el && !el.classList.contains("thinking") && el.textContent.trim().length > 20) return el;
    if (failCards()) return el;
  }
  return lastAnswer();
}

/* ---------- 1. Ключ работает, первая модель занята ---------- */
await test("ответ приходит через ключ, даже если первая модель упёрлась в лимит", async () => {
  window.eval("_freeModelsCache = null; _freeModelsAt = 0; _lastGoodEngine = '';");
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)}; settings.baseUrl = ""; settings.customModel = "";`);
  setNet((rec) => {
    if (rec.model === "openai/gpt-oss-120b") return err(429, "rate_limit_exceeded");
    if (rec.model === "openai/gpt-oss-20b") return sse("Привет! Это ответ через ключ.");
    return err(404, "model_not_found");
  });
  const el = await ask("привет, как дела?");
  assert(el, "ответа нет вовсе");
  assert(/ответ через ключ/.test(el.textContent), "ответ не появился: " + (el && el.textContent.slice(0, 120)));
  assert(failCards() === 0, "показала карточку ошибки, хотя ответ был");
  const models = calls.filter((c) => c.model).map((c) => c.model);
  assert(models[0] === "openai/gpt-oss-120b" && models[1] === "openai/gpt-oss-20b",
    "порядок моделей: " + models.join(" → "));
});

/* ---------- 2. Первый ключ мёртв — отвечает второй ---------- */
await test("если первый ключ отозван, отвечает второй", async () => {
  window.eval("_freeModelsCache = null; _freeModelsAt = 0; _lastGoodEngine = '';");
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ + "\n" + OR)};`);
  setNet((rec, u) => {
    if (u.includes("openrouter.ai/api/v1/models")) {
      return json({ data: [
        { id: "paid/model", context_length: 200000, architecture: { input_modalities: ["text"] } },
        { id: "big/free-model:free", context_length: 131072, architecture: { input_modalities: ["text"] } }
      ] });
    }
    if (u.includes("api.groq.com")) return err(401, "invalid_api_key");   // ключ отозван
    if (u.includes("openrouter.ai")) return sse("Отвечаю со второго ключа.");
    return err(502, "no_host");
  });
  const el = await ask("сколько будет два плюс два?");
  assert(el && /второго ключа/.test(el.textContent), "второй ключ не спас: " + (el && el.textContent.slice(0, 120)));
  assert(failCards() === 0, "карточка ошибки, хотя второй ключ ответил");
  const usedKeys = [...new Set(calls.filter((c) => c.stream).map((c) => c.auth.slice(7, 15)))];
  assert(usedKeys.length === 2, "пробовала ключей: " + usedKeys.length);
});

/* ---------- 3. Склеенные ключи из старого поля ---------- */
await test("ключи, склеенные старым однострочным полем, работают без повторного ввода", async () => {
  const glued = GROQ + OR;
  const parsed = JSON.parse(window.eval(`JSON.stringify(parseKeys(${JSON.stringify(glued)}))`));
  assert(parsed.length === 2, "распознано: " + parsed.length);
  window.eval(`settings.apiKey = ${JSON.stringify(glued)}; _lastGoodEngine = '';`);
  const engines = JSON.parse(window.eval("JSON.stringify(keyEngines().map(e => e.id))"));
  assert(engines.length >= 2, "движков от ключей: " + engines.length);
  setNet((rec, u) => {
    if (u.includes("api.groq.com")) return err(401, "invalid_api_key");
    if (u.includes("openrouter.ai/api/v1/models")) return json({ data: [] });
    if (u.includes("openrouter.ai")) return sse("Склеенные ключи распознаны.");
    return err(502, "no_host");
  });
  const el = await ask("проверка склеенных ключей");
  assert(el && /Склеенные ключи/.test(el.textContent), "не ответила: " + (el && el.textContent.slice(0, 120)));
});

/* ---------- 4. Проверка ключа честно говорит про модель ---------- */
await test("«Проверить ключ» отличает «ключ принят» от «ключ отвечает»", async () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)};`);
  window.document.querySelector("#apiKey").value = GROQ;
  setNet((rec, u) => {
    if (u.endsWith("/models")) return json({ data: [] });
    return err(404, "model_not_found");   // ключ принят, но модели нет
  });
  await window.eval("testConnection()");
  const text = window.document.querySelector("#connResult").textContent;
  assert(/принят, но ни одна модель/.test(text), "сказала не то: " + text);
});

/* ---------- 5. Живая проверка: ключ отвечает ---------- */
await test("«Проверить ключ» подтверждает живой ответ, а не только список моделей", async () => {
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ + "\n" + OR)};`);
  window.document.querySelector("#apiKey").value = GROQ + "\n" + OR;
  setNet((rec, u) => (u.endsWith("/models") || u.includes("chat/completions")) ? json({ choices: [{ message: { content: "привет" } }] }) : err(502, "no_host"));
  await window.eval("testConnection()");
  const text = window.document.querySelector("#connResult").textContent;
  assert(/оба отвечают/.test(text), "сказала не то: " + text);
  const chats = calls.filter((c) => c.url.includes("chat/completions"));
  assert(chats.length === 2, "живых запросов: " + chats.length);
  assert(chats.every((c) => c.stream === false), "проверка не должна просить поток");
});

/* ---------- 6. Зашитые имена моделей устарели ---------- */
await test("если зашитых моделей у сервиса больше нет, берётся та, что есть", async () => {
  window.eval("_freeModelsCache = null; _freeModelsAt = 0; _lastGoodEngine = ''; _chatModelsCache.clear();");
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ)};`);
  setNet((rec, u) => {
    if (u.endsWith("/models")) {
      // сервис обновился: старых имён нет, есть новые и служебные
      return json({ data: [{ id: "whisper-large-v3" }, { id: "brand-new-chat-model" }] });
    }
    if (rec.model === "brand-new-chat-model") return sse("Отвечаю живой моделью сервиса.");
    return err(404, "model_not_found");
  });
  const el = await ask("что умеет эта модель?");
  assert(el && /живой моделью сервиса/.test(el.textContent), "не нашла рабочую модель: " + (el && el.textContent.slice(0, 140)));
  const tried = calls.filter((c) => c.stream).map((c) => c.model);
  assert(tried[0] === "brand-new-chat-model", "первым делом пошла не туда: " + tried.join(" → "));
  assert(!tried.some((m) => /whisper/.test(m || "")), "полезла в служебную модель: " + tried.join(" → "));
});

/* ---------- 7. Запрос не ломается из-за лишних заголовков ---------- */
await test("в запросе только ключ и тип содержимого — браузер не заблокирует", async () => {
  window.eval("_freeModelsCache = null; _freeModelsAt = 0; _chatModelsCache.clear(); _lastGoodEngine = '';");
  window.eval(`settings.apiKey = ${JSON.stringify(OR)};`);
  const headerSets = [];
  setNet((rec, u, body) => {
    if (u.includes("openrouter.ai/api/v1/models")) return json({ data: [{ id: "big/free-model:free", context_length: 131072, architecture: { input_modalities: ["text"] } }] });
    headerSets.push(rec.headers || {});
    return sse("Отвечаю без лишних заголовков.");
  });
  const el = await ask("проверка заголовков");
  assert(el && /без лишних заголовков/.test(el.textContent), "не ответила: " + (el && el.textContent.slice(0, 120)));
  for (const h of headerSets) {
    for (const name of Object.keys(h)) {
      assert(/^(authorization|content-type)$/i.test(name), "лишний заголовок в запросе: " + name);
    }
  }
});

await test("за всю работу не было ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

try { window.close(); } catch (e) {}
console.log("\nГотово: " + passed + " проверок пройдено");

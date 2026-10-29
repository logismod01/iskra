/**
 * Тест «ключ есть — и Искра отвечает»:
 * ключ в настройках сам включает своего провайдера, чужая модель заменяется родной,
 * при отказе основного движка включается запасной, а карточка ошибки говорит правду.
 *
 * Запуск: node tests/round3.test.mjs
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
const { window } = dom;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Ответ-стрим в формате OpenAI SSE */
function sseResponse(text) {
  const chunks = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    "data: [DONE]\n\n"
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/* Управляемый «интернет» */
let routes = {};
window.fetch = async (url, opts = {}) => {
  const u = String(url);
  for (const [needle, handler] of Object.entries(routes)) {
    if (u.includes(needle)) return handler(u, opts);
  }
  throw new Error("offline: " + u);
};

await wait(500);

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => window.document.querySelectorAll(s);
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

const HF_KEY = "hf_" + "a".repeat(34);
const GROQ_KEY = "gsk_" + "b".repeat(40);

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("ключ Hugging Face сам включает Hugging Face вместо «Без ключа»", () => {
  const r = window.eval(`(() => {
    settings.provider = "demo";
    settings.model = "openai-fast";
    settings.apiKey = ${JSON.stringify(HF_KEY)};
    const sw = syncProviderWithKey();
    return { provider: settings.provider, model: settings.model, sw };
  })()`);
  assert(r.provider === "huggingface", "провайдер остался " + r.provider + " — ключ снова лежал бы без дела");
  assert(r.model === "meta-llama/Llama-3.3-70B-Instruct", "модель не подставилась: " + r.model);
  assert(r.sw && r.sw.to === "huggingface", "не сказала, что переключилась");
});

await test("ключ Groq включает Groq", () => {
  window.eval(`settings.provider = "demo"; settings.model = "openai-fast"; settings.apiKey = ${JSON.stringify(GROQ_KEY)}; syncProviderWithKey();`);
  assert(window.eval("settings.provider") === "groq", "Groq не включился");
});

await test("чужая модель заменяется родной, а не даёт 404", () => {
  window.eval(`settings.provider = "demo"; settings.apiKey = ""; settings.model = "meta-llama/Llama-3.3-70B-Instruct";`);
  assert(window.eval("modelOwner(settings.model)") === "huggingface", "не поняла, чья это модель");
  const fixed = window.eval("ensureModelForProvider()");
  assert(fixed === true, "модель не исправлена");
  assert(window.eval("settings.model") === "openai-fast", "модель демо должна быть openai-fast, а не " + window.eval("settings.model"));
});

await test("карточка ошибки говорит правду, а не «обе модели заняты»", () => {
  window.eval(`(() => {
    settings.provider = "huggingface";
    settings.apiKey = ${JSON.stringify(HF_KEY)};
    const box = document.createElement("div");
    const msg = { id: "x", role: "assistant", content: "" };
    showFailCard(box, msg, "привет", new ApiError(401, "invalid token"));
    window.__failText = box.textContent;
  })()`);
  const text = window.eval("window.__failText");
  assert(/401/.test(text), "нет кода 401 в карточке");
  assert(/ключ не принят/i.test(text), "не сказала, что ключ не принят: " + text.slice(0, 120));
  assert(!/обе бесплатные модели заняты/i.test(text), "остался старый выдуманный текст");
  assert(/Проверить ключ/.test(text), "нет кнопки «Проверить ключ» при сохранённом ключе");
});

await test("без ключа карточка предлагает ключ, а не врёт про 401", () => {
  window.eval(`(() => {
    settings.provider = "demo";
    settings.apiKey = "";
    const box = document.createElement("div");
    const msg = { id: "y", role: "assistant", content: "" };
    showFailCard(box, msg, "привет", new ApiError(429, "rate limit"));
    window.__failText2 = box.textContent;
  })()`);
  const text = window.eval("window.__failText2");
  assert(/лимит запросов/i.test(text), "не назвала реальную причину: " + text.slice(0, 120));
  assert(/Ввести ключ/.test(text), "нет кнопки ввода ключа");
});

await test("если основной движок молчит — отвечает запасной, ответ доходит", async () => {
  routes = {
    "router.huggingface.co": () => new Response("invalid token", { status: 401 }),
    "api.llm7.io": () => sseResponse("Привет! Это ответ запасного движка."),
    "wikipedia.org": () => new Response("{}", { status: 404 })
  };
  window.eval(`(() => {
    settings.provider = "huggingface";
    settings.model = "meta-llama/Llama-3.3-70B-Instruct";
    settings.apiKey = ${JSON.stringify(HF_KEY)};
    settings.webSearch = false;
  })()`);
  window.eval('sendMessage("привет")');
  for (let i = 0; i < 80; i++) {
    await wait(200);
    if (/запасного движка/.test($("#messages").textContent)) break;
  }
  const text = $("#messages").textContent;
  assert(/Привет! Это ответ запасного движка/.test(text), "ответ запасной модели не дошёл: " + text.slice(-200));
  assert(!/не могу ответить/i.test(text), "показала ошибку вместо ответа");
});

await test("если не ответил вообще никто — карточка с настоящей причиной", async () => {
  routes = {
    "router.huggingface.co": () => new Response("invalid token", { status: 401 }),
    "api.llm7.io": () => new Response("nope", { status: 401 }),
    "text.pollinations.ai": () => new Response("nope", { status: 401 }),
    "wikipedia.org": () => new Response("{}", { status: 404 })
  };
  window.eval('sendMessage("расскажи про Марс")');
  for (let i = 0; i < 100; i++) {
    await wait(200);
    if ($("#messages .fail-actions")) break;
  }
  const text = $("#messages").textContent;
  assert(/401/.test(text), "нет настоящей ошибки в карточке: " + text.slice(-200));
  assert($("#messages .fail-actions"), "карточка ошибки не появилась");
});

await test("спасательная цепочка не ломает настройки пользователя", () => {
  assert(window.eval("settings.provider") === "huggingface", "провайдер изменился после спасения: " + window.eval("settings.provider"));
  assert(window.eval("settings.model") === "meta-llama/Llama-3.3-70B-Instruct", "модель изменилась после спасения");
  assert(window.eval("settings.apiKey") === HF_KEY, "ключ потерялся после спасения");
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
process.exit(process.exitCode || 0);

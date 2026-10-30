/**
 * Тест «Искра отвечает без ключа»:
 * движки работают анонимно, ключ только ускоряет, при отказе основного движка
 * включается запасной, а карточка ошибки говорит правду.
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

const GROQ_KEY = "gsk_" + "b".repeat(40);
const HF_KEY = "hf_" + "a".repeat(34);

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("в интерфейсе только Искра и Искра Про", () => {
  const text = [...window.document.querySelectorAll("body *")]
    .filter(el => !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName))
    .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" "))
    .join(" ");
  const bad = ["Puter", "Pollinations", "Stable Horde", "Groq", "Hugging Face", "OpenRouter", "OpenAI", "ChatGPT", "Claude", "Gemini", "DeepSeek", "Llama", "Qwen"];
  const found = bad.filter(w => new RegExp(w, "i").test(text));
  assert(!found.length, "в интерфейсе чужие имена: " + found.join(", "));
  assert(window.eval('modelDisplayName("iskra")') === "Искра", "бесплатная версия называется не Искра");
  assert(window.eval('modelDisplayName("iskra-pro")') === "Искра Про", "Pro называется не «Искра Про»");
  assert(window.eval('modelDisplayName("meta-llama/Llama-3.3-70B-Instruct")') === "Искра", "чужая модель просочилась в имя");
});

await test("без ключа есть запасные движки, и все они анонимные", () => {
  const n = window.eval("ISKRA_ENGINES.length");
  assert(n >= 4, "движков всего " + n);
  const list = JSON.parse(window.eval("JSON.stringify(ISKRA_ENGINES)"));
  assert(list.every(e => (e.base || e.url) && e.model), "у движка нет адреса или модели");
  assert(!window.eval("keyEngines().length"), "без ключа не должно быть ключевых движков");
  assert(window.eval("orderedEngines(false).length") === n, "порядок движков потерял часть списка");
});

await test("ключ распознаётся и встаёт первым, но не обязателен", () => {
  const kind = window.eval(`detectKeyKind(${JSON.stringify(GROQ_KEY)})`);
  assert(kind && kind.provider === "groq", "ключ не распознан");
  window.eval(`settings.apiKey = ${JSON.stringify(GROQ_KEY)};`);
  const first = window.eval("orderedEngines(false)[0].id");
  assert(first === "key", "ключевой движок не первый, а " + first);
  window.eval('settings.apiKey = "";');
  assert(window.eval("orderedEngines(false)[0].id") !== "key", "без ключа остался ключевой движок");
});

await test("карточка ошибки называет настоящую причину и предлагает ключ", () => {
  window.eval(`(() => {
    settings.apiKey = "";
    const box = document.createElement("div");
    const msg = { id: "y", role: "assistant", content: "" };
    showFailCard(box, msg, "привет", new ApiError(429, "rate limit"));
    window.__failText2 = box.textContent;
  })()`);
  const text = window.eval("window.__failText2");
  assert(/лимит запросов/i.test(text), "не назвала реальную причину: " + text.slice(0, 140));
  assert(/Ввести свой ключ/.test(text), "нет кнопки ввода ключа");
});

await test("карточка с ключом предлагает его сменить, а не врёт про 401 при ключе", () => {
  window.eval(`(() => {
    settings.apiKey = ${JSON.stringify(HF_KEY)};
    const box = document.createElement("div");
    const msg = { id: "x", role: "assistant", content: "" };
    showFailCard(box, msg, "привет", new ApiError(401, "invalid token"));
    window.__failText = box.textContent;
  })()`);
  const text = window.eval("window.__failText");
  assert(/ключ не принят/i.test(text), "не сказала, что ключ не принят: " + text.slice(0, 140));
  assert(/Сменить ключ/.test(text), "нет кнопки «Сменить ключ» при сохранённом ключе");
  window.eval('settings.apiKey = "";');
});

await test("если основной движок молчит — отвечает запасной, ответ доходит", async () => {
  routes = {
    "api.llm7.io": () => new Response("too many", { status: 429 }),
    "api.kilo.ai": () => sseResponse("Привет! Это ответ запасного движка."),
    "oai.endpoints.kepler.ai.cloud.ovh.net": () => sseResponse("ответ ovh"),
    "wikipedia.org": () => new Response("{}", { status: 404 })
  };
  window.eval("settings.apiKey = ''; settings.webSearch = false;");
  window.eval('sendMessage("привет")');
  for (let i = 0; i < 80; i++) {
    await wait(200);
    if (/запасного движка/.test($("#messages").textContent)) break;
  }
  const text = $("#messages").textContent;
  assert(/Привет! Это ответ запасного движка/.test(text), "ответ запасного движка не дошёл: " + text.slice(-200));
  assert(!/не могу ответить/i.test(text), "показала ошибку вместо ответа");
});

await test("если не ответил вообще никто — карточка с настоящей причиной", async () => {
  routes = {
    "api.llm7.io": () => new Response("nope", { status: 401 }),
    "api.kilo.ai": () => new Response("nope", { status: 401 }),
    "oai.endpoints.kepler.ai.cloud.ovh.net": () => new Response("nope", { status: 401 }),
    "wikipedia.org": () => new Response("{}", { status: 404 })
  };
  window.eval('sendMessage("расскажи про Марс")');
  for (let i = 0; i < 120; i++) {
    await wait(200);
    if ($("#messages .fail-actions")) break;
  }
  const text = $("#messages").textContent;
  assert(/401|ключ не принят/i.test(text), "нет настоящей ошибки в карточке: " + text.slice(-200));
  assert($("#messages .fail-actions"), "карточка ошибки не появилась");
});

await test("без ключа чат не просит регистрацию и не ломает настройки", () => {
  assert(window.eval("settings.apiKey") === "", "ключ появился сам");
  assert(window.eval("typeof ISKRA_ENGINES") === "object", "движки пропали после ошибок");
  assert(!!window.eval("document.querySelector('#input')"), "поле ввода пропало");
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
process.exit(process.exitCode || 0);

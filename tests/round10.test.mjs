/**
 * Код в ответе выглядит кодом: блоки, обрыв по лимиту длины, кнопка «Продолжить».
 *
 * История: человек попросил код, а получил простыню с ```python и слипшимися строками.
 * Причина была не в модели: ответ обрывался на лимите 1200 токенов, закрывающей ``` не было,
 * и разметка не превращала блок в код. Плюс пробел после языка ломал разбор.
 *
 * Запуск: node tests/round10.test.mjs
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

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
const render = (md) => window.eval(`renderMarkdown(${JSON.stringify(md)})`);

const CODE = "import numpy as np\nfrom PIL import Image\n\nWIDTH, HEIGHT = 800, 600\n\n\ndef mandelbrot(c: complex) -> int:";

/* ---------- 1. Обычный блок ---------- */
await test("блок кода превращается в код, а не в текст с бэктиками", () => {
  const out = render("Вот код:\n\n```python\n" + CODE + "\n```\n");
  assert((out.match(/<pre/g) || []).length === 1, "блоков кода: " + (out.match(/<pre/g) || []).length);
  assert(!/```/.test(out.replace(/<[^>]+>/g, "")), "бэктики остались в тексте");
  assert(/<code[^>]*>import numpy as np\nfrom PIL import Image/.test(out), "переводы строк внутри кода потерялись");
  assert(/Скачать \.py/.test(out), "нет кнопки скачать .py");
});

/* ---------- 2. Пробел после языка ---------- */
await test("пробел после слова «python» не ломает блок", () => {
  const out = render("```python \nprint(1)\n```");
  assert((out.match(/<pre/g) || []).length === 1, "блок не распознан");
  assert(!/```/.test(out.replace(/<[^>]+>/g, "")), "бэктики остались");
});

/* ---------- 3. Обрезанный ответ ---------- */
await test("ответ обрезался на середине кода — код всё равно показывается кодом", () => {
  const cut = "**Код (Python 3)**\n\n```python\n" + CODE;   // закрывающей ``` нет
  const out = render(cut);
  assert((out.match(/<pre/g) || []).length === 1, "обрезанный блок показан текстом");
  assert(!/```/.test(out.replace(/<[^>]+>/g, "")), "бэктики остались в тексте: " + out.slice(0, 200));
  assert(/<code[^>]*>[^<]*WIDTH, HEIGHT = 800, 600/.test(out), "строки кода слиплись");
  assert(/def mandelbrot/.test(out), "последняя строка потерялась");
});

/* ---------- 4. Код не ломает страницу ---------- */
await test("опасный код в блоке остаётся текстом, а не HTML", () => {
  const out = render("```html\n<script>alert(1)</script>\n```");
  assert(!/<script/i.test(out), "блок кода вставил настоящий script");
  assert(/&lt;script&gt;/.test(out), "код не экранирован");
});

/* ---------- 5. Запас длины ---------- */
await test("бесплатной версии с ключом хватает длины на код", () => {
  window.eval("settings.edition = 'free'; settings.apiKey = 'gsk_' + 'a'.repeat(40); settings.deepThink = false; settings.riskMode = false;");
  const msgs = [{ role: "user", content: "напиши код визуализации множества Мандельброта" }];
  const payload = JSON.parse(window.eval(`JSON.stringify(apiPayload(${JSON.stringify(msgs)}))`));
  assert(payload.max_tokens >= 4096, "лимит длины: " + payload.max_tokens + " — код снова обрежется");
  assert(payload.stream === true, "ответ должен идти потоком");
});

/* ---------- 6. Весь путь: обрез и кнопка «Продолжить» ---------- */
function sseCut(text) {
  const body = JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "length" }] });
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${body}\n\n`));
      c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      c.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
function sse(text, finish = "stop") {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`));
      c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      c.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

await test("обрыв по лимиту: в чате появляется «Продолжить», и по нажатию приходит продолжение", async () => {
  window.eval("_lastGoodEngine = ''; _chatModelsCache.clear(); _freeModelsCache = null; _freeModelsAt = 0;");
  window.eval("settings.apiKey = 'gsk_' + 'a'.repeat(40); settings.baseUrl = ''; settings.customModel = '';");
  let n = 0;
  window.fetch = async (url) => {
    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "openai/gpt-oss-120b" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    n++;
    return n === 1
      ? sseCut("```python\nimport numpy as np\nWIDTH = 800")
      : sse("for i in range(MAX_ITER):\n    z = z * z + c\n```\nГотово.");
  };
  window.document.querySelector("#newChat")?.click();
  window.eval('sendMessage("напиши код для множества Мандельброта")');
  await wait(900);
  const box = window.document.querySelector(".messages");
  const cont = box.querySelector('[data-act="continue"]');
  assert(cont, "кнопки «Продолжить» нет");
  assert((box.innerHTML.match(/<pre/g) || []).length >= 1, "срезанный код не показан блоком");
  cont.click();
  await wait(900);
  const answers = [...box.querySelectorAll(".msg.assistant")];
  assert(answers.length >= 2, "продолжение не пришло отдельным ответом: " + answers.length);
  assert(/Готово/.test(answers[answers.length - 1].textContent), "продолжение пустое");
  assert(n >= 2, "второго запроса не было");
});

/* ---------- 7. Обычный ответ не получает лишнюю кнопку ---------- */
await test("обычный ответ без обрыва не показывает «Продолжить»", async () => {
  window.eval("_lastGoodEngine = '';");
  window.fetch = async () => sse("Короткий ответ без обрыва.");
  window.document.querySelector("#newChat")?.click();
  window.eval('sendMessage("привет")');
  await wait(900);
  const box = window.document.querySelector(".messages");
  assert(!box.querySelector('[data-act="continue"]'), "кнопка «Продолжить» появилась без обрыва");
});

await test("за всю работу не было ошибок JS", () => {
  assert(errors.length === 0, errors.slice(0, 3).join(" | "));
});

try { window.close(); } catch (e) {}
console.log("\nГотово: " + passed + " проверок пройдено");

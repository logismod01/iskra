/**
 * Раунд 39: новые ключи Google (AQ.…) и сильная модель на сложных задачах (1.41.0).
 *
 * Что было не так:
 *   человек вставил ключ из кабинета Google, а он начинается на AQ.…, а не на
 *   AIza…. Сайт такой ключ не узнавал вовсе. Плюс ключ был бесполезен по уму:
 *   отвечала та же слабая модель, что и без ключа.
 *
 * Запуск: node tests/round39.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));

const site = () => new JSDOM(html, {
  runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole()
}).window;

const AQ = "AQ.Ab8RN6" + "x".repeat(30);
const AIZA = "AIza" + "B".repeat(35);

console.log("round39: ключи AQ.… и сильная модель — " + pkg.version);

await test("ключ AQ.… узнаётся как ключ Google", async () => {
  const w = site();
  const kind = w.eval('detectKeyKind("' + AQ + '")');
  assert(kind, "ключ не распознан вовсе");
  assert(kind.provider === "gemini", "не тот сервис: " + kind.provider);
  assert(kind.native === "gemini", "не помечен как родной путь");
  assert(/generativelanguage\.googleapis\.com\/v1beta$/.test(kind.base), "адрес не родной: " + kind.base);
});

await test("старый ключ AIza… по-прежнему узнаётся", async () => {
  const w = site();
  const kind = w.eval('detectKeyKind("' + AIZA + '")');
  assert(kind && kind.provider === "gemini", "старый ключ потерялся");
});

await test("два новых ключа в одном поле не слипаются", async () => {
  const w = site();
  const second = "AQ.Ab9ZZ9" + "y".repeat(28);
  const keys = w.eval("parseKeys(" + JSON.stringify(AQ + "\n" + second) + ")");
  assert(keys.length === 2, "нашёл " + keys.length + " ключей вместо двух: " + JSON.stringify(keys));
});

await test("движок ходит родным адресом и отдельным заголовком", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  const list = w.keyEngines();
  const e = list.find(x => x.native === "gemini" && !x.pro);
  assert(e, "нет движка с родным путём: " + JSON.stringify(list.map(x => x.id)));
  assert(/generativelanguage\.googleapis\.com\/v1beta$/.test(e.base), "адрес движка не родной: " + e.base);
  assert(/^gemini-/.test(e.model), "модель не названа: " + e.model);
});

await test("сильная модель есть в списке, но только как запасная для сложного", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  const pro = w.keyEngines().find(x => x.pro);
  assert(pro, "сильной модели нет в движках");
  assert(pro.model === "gemini-2.5-pro", "не та сильная модель: " + pro.model);
  assert(pro.vision === true, "сильная модель не помечена как зрячая");
});

await test("на простой вопрос сильную модель не зовём, на сложный — она первая", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  const easy = w.orderedEnginesFor({ messages: [{ role: "user", content: "привет" }] }, false);
  assert(!easy.some(x => x.pro), "на «привет» позвали сильную модель");
  const hard = w.orderedEnginesFor({ messages: [{ role: "user", content: "реши задачу: докажи, что сумма углов равна 180" }] }, false);
  assert(hard[0] && hard[0].pro, "на сложном первым стоит не сильная модель: " + (hard[0] && hard[0].id));
});

await test("запрос переводится на язык родного адреса: роли, картинка, система", async () => {
  const w = site();
  const body = w.eval(`JSON.stringify(geminiNativeBody({
    messages: [
      { role: "system", content: "Ты — Искра" },
      { role: "user", content: [
        { type: "text", text: "что на фото?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }
      ] },
      { role: "assistant", content: "Смотрю" }
    ],
    temperature: 0.4
  }, {}))`);
  const j = JSON.parse(body);
  assert(j.systemInstruction && /Искра/.test(j.systemInstruction.parts[0].text), "системная подсказка потерялась");
  assert(Array.isArray(j.contents) && j.contents[0].role === "user", "нет первой реплики человека");
  const img = j.contents[0].parts.find(p => p.inlineData);
  assert(img && img.inlineData.mimeType === "image/png", "картинка не переведена");
  assert(j.contents[1] && j.contents[1].role === "model", "ответ Искры не стал model");
  assert(j.generationConfig && j.generationConfig.temperature === 0.4, "температура потерялась");
});

await test("адрес родного запроса собирается без ключа внутри", async () => {
  const w = site();
  const url = w.geminiNativeUrl("gemini-2.5-pro", "generateContent");
  assert(/\/models\/gemini-2\.5-pro:generateContent$/.test(url), "адрес неверный: " + url);
  assert(!/key=/i.test(url), "ключ попал в адрес");
});

await test("проверка ключа спрашивает у сервиса живой ответ", async () => {
  const w = site();
  const calls = [];
  w.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), headers: opts.headers || {} });
    if (String(url).includes("/models")) {
      return {
        ok: true, status: 200,
        json: async () => ({ models: [
          { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-2", supportedGenerationMethods: ["generateContent"] }
        ] })
      };
    }
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "привет" }] } }] }) };
  };
  const r = await w.probeKey(AQ);
  assert(r.state === "ok", "ключ не проверен: " + JSON.stringify(r));
  assert(r.model === "gemini-3.8-flash", "проверил не ту модель: " + r.model);
  const gen = calls.find(c => /:generateContent/.test(c.url));
  assert(gen, "живой запрос не отправлялся");
  assert(gen.headers["x-goog-api-key"] === AQ, "ключ ушёл не в заголовке: " + JSON.stringify(gen.headers));
  assert(!calls.some(c => /embedding/.test(c.url)), "проверял модель без ответов");
});

await test("неверный ключ AQ.… честно называется неверным", async () => {
  const w = site();
  w.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const r = await w.probeKey(AQ);
  assert(r.state === "auth", "ошибка названа неверно: " + JSON.stringify(r));
});

await test("ответ родного адреса читается по кускам", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  const engine = w.keyEngines().find(x => x.native === "gemini" && !x.pro);
  w.TextDecoder = TextDecoder;
  w.TextEncoder = TextEncoder;
  const enc = new TextEncoder();
  const chunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"При"}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"вет"}]},"finishReason":"STOP"}]}\n\n'
  ];
  let i = 0;
  const urls = [];
  w.fetch = async (url, opts = {}) => {
    urls.push({ url: String(url), headers: opts.headers || {}, body: opts.body });
    return {
      ok: true, status: 200,
      headers: { get: () => "text/event-stream" },
      body: { getReader: () => ({ read: async () => i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { value: undefined, done: true } }) }
    };
  };
  let got = "";
  const r = await w.streamOnce(engine, { messages: [{ role: "user", content: "привет" }] }, d => { got += d; });
  assert(r.text === "Привет", "текст склеился неверно: " + JSON.stringify(r.text));
  assert(got === "Привет", "куски не дошли до экрана: " + JSON.stringify(got));
  const call = urls.find(u => /streamGenerateContent/.test(u.url));
  assert(call, "поток не запрашивался: " + JSON.stringify(urls.map(u => u.url)));
  assert(/streamGenerateContent\?alt=sse$/.test(call.url), "адрес потока неверный: " + call.url);
  assert(call.headers["x-goog-api-key"] === AQ, "ключ не в заголовке");
  assert(!/Authorization/.test(JSON.stringify(call.headers)), "лишний старый заголовок авторизации");
});

await test("имя модели обновляется, даже если ключ уже проверен", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  w.markKeyWorking("gemini-3.8-flash");
  w.markKeyWorking("gemini-2.5-pro");
  assert(w.eval("settings.keyModel") === "gemini-2.5-pro", "старая модель осталась в настройках");
});

await test("в подсказке и плашке видно новый формат ключа", async () => {
  assert(/AQ\.…/.test(html), "в интерфейсе нет упоминания AQ.…");
  const i = html.indexOf("три шага");
  assert(i > 0 && /AQ\.…/.test(html.slice(i, i + 1600)), "в трёх шагах нет нового формата");
  assert(/Без лишних обещаний/.test(html), "нет честной строки о том, что даёт ключ");
});

if (!process.exitCode) console.log("round39: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

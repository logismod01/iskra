/**
 * Раунд 40: ключ должен давать ум, и это должно быть видно (1.42.0).
 *
 * Что было не так:
 *   «Проверить ключ» проверял только быструю модель. Человек вставлял ключ,
 *   видел «Ключ работает» — и думал, что Искра поумнела на сложных задачах.
 *   А сильная модель (gemini-2.5-pro) могла быть недоступна или стоять в
 *   лимите, и никто об этом не говорил. Плюс на сложной задаче первая
 *   попытка тратилась на модель, которая заведомо в лимите.
 *
 * Запуск: node tests/round40.test.mjs
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

console.log("round40: ключ даёт ум — " + pkg.version);

await test("по умолчанию про сильную модель ничего не выдумано", async () => {
  const w = site();
  assert(w.eval("settings.keyPro") === null, "статус сильной модели выдуман заранее");
  assert(w.eval("settings.keyProModel") === "", "модель проставлена без проверки");
});

await test("проверка сильной модели стучится именно в неё и родным заголовком", async () => {
  const w = site();
  const calls = [];
  w.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), headers: opts.headers || {} });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "привет" }] } }] }) };
  };
  const kind = w.eval("detectKeyKind(" + JSON.stringify(AQ) + ")");
  const r = await w.probeProModel(AQ, kind);
  assert(r.state === "ok", "сильная модель не проверена: " + JSON.stringify(r));
  assert(r.model === "gemini-2.5-pro", "проверяли не ту модель: " + r.model);
  const call = calls[0];
  assert(/gemini-2\.5-pro:generateContent$/.test(call.url), "адрес не тот: " + call.url);
  assert(call.headers["x-goog-api-key"] === AQ, "ключ ушёл не в заголовке");
  assert(!/key=/i.test(call.url), "ключ попал в адрес");
});

await test("лимит сильной модели называется лимитом, а не поломкой ключа", async () => {
  const w = site();
  w.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const kind = w.eval("detectKeyKind(" + JSON.stringify(AQ) + ")");
  const r = await w.probeProModel(AQ, kind);
  assert(r.state === "limit", "429 не распознан как лимит: " + JSON.stringify(r));
});

await test("недоступная модель не выдаётся за рабочую", async () => {
  const w = site();
  w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const kind = w.eval("detectKeyKind(" + JSON.stringify(AQ) + ")");
  const r = await w.probeProModel(AQ, kind);
  assert(r.state === "no", "404 выдан за успех: " + JSON.stringify(r));
});

await test("у чужого ключа сильную модель не спрашиваем", async () => {
  const w = site();
  const calls = [];
  w.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({}) }; };
  const kind = w.eval('detectKeyKind("gsk_' + "a".repeat(30) + '")');
  const r = await w.probeProModel("gsk_" + "a".repeat(30), kind);
  assert(r.state === "none", "для чужого сервиса полезли за сильной моделью");
  assert(!calls.some(u => /2\.5-pro/.test(u)), "стучались в сильную модель чужого сервиса: " + JSON.stringify(calls));
});

await test("«Проверить ключ» проверяет и быструю, и сильную модель", async () => {
  const w = site();
  const seen = [];
  w.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    if (u.includes("/models")) {
      return { ok: true, status: 200, json: async () => ({ models: [
        { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] }
      ] }) };
    }
    if (/2\.5-pro/.test(u)) return { ok: true, status: 200, json: async () => ({ candidates: [] }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "привет" }] } }] }) };
  };
  const box = { className: "", textContent: "" };
  w.document.querySelector = (sel) => (sel === "#apiKey" ? { value: AQ } : sel === "#connResult" ? box : null);
  w.document.getElementById = () => null;
  await w.testConnection();
  assert(seen.some(u => /2\.5-pro/.test(u)), "сильную модель не проверяли: " + JSON.stringify(seen));
  assert(w.eval("settings.keyPro") === "ok", "результат про сильную модель не сохранён: " + w.eval("settings.keyPro"));
  assert(/сильная|Сильная/.test(box.textContent), "человеку не сказали про сильную модель: " + box.textContent);
});

await test("если ключ не отвечает, про сильную модель ничего не выдумываем", async () => {
  const w = site();
  w.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const box = { className: "", textContent: "" };
  w.document.querySelector = (sel) => (sel === "#apiKey" ? { value: AQ } : sel === "#connResult" ? box : null);
  w.document.getElementById = () => null;
  await w.testConnection();
  assert(w.eval("settings.keyPro") === null, "статус проставлен при нерабочем ключе");
  assert(!/сильная модель .*отвечает/i.test(box.textContent), "пообещали ум, которого нет: " + box.textContent);
});

await test("смена ключа сбрасывает статус сильной модели", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  w.eval('settings.keyPro = "ok"; settings.keyProModel = "gemini-2.5-pro"');
  w.eval("rememberKey('AQ.Ab9ZZ9" + "y".repeat(28) + "')");
  assert(w.eval("settings.keyPro") === null, "старый статус переехал на новый ключ");
  assert(w.eval("settings.keyProModel") === "", "старая модель переехала на новый ключ");
});

await test("тот же ключ не сбрасывает статус", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  w.eval('settings.keyPro = "ok"');
  w.eval("rememberKey(" + JSON.stringify(AQ) + ")");
  assert(w.eval("settings.keyPro") === "ok", "сбросили статус того же ключа");
});

await test("при лимите сильной модели она не зовётся первой на сложном", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  w.eval('settings.keyPro = "limit"');
  const list = w.orderedEnginesFor({ messages: [{ role: "user", content: "докажи теорему по шагам" }] }, false);
  assert(list.length > 0, "движков нет вовсе");
  assert(!list[0].pro, "первым всё равно сильная модель: " + list[0].id);
  assert(list.some(x => x.pro), "сильная модель пропала совсем — пусть будет последней");
});

await test("когда сильная подтверждена, на сложном она первая", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  w.eval('settings.keyPro = "ok"');
  const list = w.orderedEnginesFor({ messages: [{ role: "user", content: "докажи теорему по шагам" }] }, false);
  assert(list[0] && list[0].pro, "на сложном первым не сильная: " + (list[0] && list[0].id));
});

await test("на простом вопросе сильная по-прежнему молчит", async () => {
  const w = site();
  w.eval("settings.apiKey = " + JSON.stringify(AQ));
  w.eval('settings.keyPro = "ok"');
  const list = w.orderedEnginesFor({ messages: [{ role: "user", content: "как дела?" }] }, false);
  assert(!list.some(x => x.pro), "на болтовню позвали сильную модель");
});

await test("в настройках честно написано, что даёт ключ", async () => {
  assert(/сильная модель/.test(html), "не сказано про сильную модель");
  assert(/Проверка честная/.test(html), "нет честной оговорки про проверку");
  assert(/сильная упёрлась в лимит/.test(html), "не сказано, что бывает лимит");
});

await test("в настройках нет чужих названий сервисов", async () => {
  const raw = html.slice(html.indexOf("Свой ключ доступа"), html.indexOf("Что даёт ключ") + 900);
  /* ссылку на страницу с ключом не считаем: человеку видно только подпись */
  const box = raw.replace(/href="[^"]*"/g, "");
  assert(!/gemini|google|openai/i.test(box), "название сервиса попало в настройки");
});

await test("версия поднята до 1.51.0", async () => {
  assert(pkg.version === "1.51.0", "версия не поднята: " + pkg.version);
});

if (!process.exitCode) console.log("round40: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

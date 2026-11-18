/**
 * Раунд 43: «Искра не может ответить» — почему и что теперь.
 *
 * Что было не так:
 *   1) движки шли строго по очереди: шесть молчащих адресов держали человека
 *      до полутора минут и всё равно заканчивались «нет связи»;
 *   2) когда запрос вообще не уходил из браузера (блокировщик, сеть), карточка
 *      врала общей фразой «интернет, блокировка или фильтр»;
 *   3) причину нельзя было увидеть: что ответил каждый движок — нигде;
 *   4) не было ни одного пути без «предварительного» OPTIONS-запроса, который
 *      чаще всего и режут блокировщики.
 *
 * Запуск: node tests/round43.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");

console.log("round43: движки, гонка и честная причина 1.51.0");

const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.ReadableStream = ReadableStream;
    win.Response = Response;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
    win.confirm = () => true;
    win.fetch = async () => { throw new Error("offline"); };
  }
});
const { window } = dom;
const w = window;
await new Promise((r) => setTimeout(r, 900));
const ev = (code) => w.eval(code);

/* Поток «как у настоящего движка» */
function sseResponse(chunks) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      for (const t of chunks) c.enqueue(enc.encode(t));
      c.close();
    }
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const sse = (texts) => sseResponse(texts.map(t => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).concat(["data: [DONE]\n\n"]));
const payload = () => ({ messages: [{ role: "user", content: "привет" }] });

/* ---------- 1. Путь без OPTIONS ---------- */

await test("есть движок простым GET: без заголовков и без тела запроса", async () => {
  const list = JSON.parse(ev("JSON.stringify(ISKRA_ENGINES)"));
  const plain = list.filter(e => e.plain);
  assert(plain.length >= 1, "движка с обычным GET нет");
  const e = plain[0];
  assert(/^https:\/\//.test(e.url), "у GET-движка нет адреса");
  assert(e.model, "у GET-движка нет модели");
  assert(e.timeout <= 20, "слишком долгий таймаут: " + e.timeout);
});

await test("GET-движок собирает адрес из вопроса, а не из пустоты", async () => {
  const url = ev(`plainAskUrl(ISKRA_ENGINES.find(e => e.plain), { messages: [{ role: "user", content: "Столица Франции?" }] })`);
  assert(typeof url === "string" && /^https:\/\/text\.pollinations\.ai\//.test(url), "адрес не тот: " + url);
  assert(!/\s/.test(url), "в адресе остались пробелы — запрос сломается");
  assert(/model=openai-fast/.test(url), "модель не передана");
  const decoded = decodeURIComponent(url);
  assert(decoded.includes("Столица Франции?"), "вопроса нет в адресе");
  assert(url.length < 4000, "адрес слишком длинный для GET: " + url.length);
});

await test("длинный вопрос в адрес не влезает — режется, а не ломается", async () => {
  const long = "объясни " + "очень подробно ".repeat(400) + "конец вопроса";
  const url = ev(`plainAskUrl(ISKRA_ENGINES.find(e => e.plain), { messages: [{ role: "user", content: ${JSON.stringify(long)} }] })`);
  assert(url.length < 4000, "адрес всё равно длинный: " + url.length);
  const decoded = decodeURIComponent(url);
  assert(decoded.includes("объясни"), "начало вопроса потерялось");
  assert(decoded.includes("конец вопроса"), "конец вопроса потерялся");
});

await test("GET-движок читает обычный текст в потоке", async () => {
  const engine = JSON.parse(ev("JSON.stringify(ISKRA_ENGINES.find(e => e.plain))"));
  w.fetch = async () => new Response("Париж.", { status: 200 });
  let got = "";
  const r = await w.streamOnce(engine, payload(), (d) => { got += d; });
  w.fetch = async () => { throw new Error("offline"); };
  assert(r.text === "Париж.", "текст не прочитан: " + JSON.stringify(r.text));
  assert(got === "Париж.", "куски не дошли: " + JSON.stringify(got));
});

/* ---------- 2. Гонка ---------- */

await test("движки стартуют гонкой: ответ приходит от первого, а не от шестого", async () => {
  const urls = [];
  w.fetch = async (u0) => {
    const u = String(u0);
    urls.push(u);
    if (u.includes("api.kilo.ai")) return sse(["Го", "тово"]);
    return new Promise((_, rej) => setTimeout(() => rej(new TypeError("Failed to fetch")), 40));
  };
  let out = "";
  const r = await ev("askIskra")(payload(), (d) => { out += d; });
  w.fetch = async () => { throw new Error("offline"); };
  assert(r.text === "Готово", "ответ собрался неверно: " + JSON.stringify(r.text));
  assert(out === "Готово", "на экран ушло не то: " + JSON.stringify(out));
  const firstRound = urls.slice(0, 3);
  assert(firstRound.length >= 2, "вторая попытка не началась: " + urls.join(", "));
  assert(/api\.kilo\.ai/.test(urls[0]), "первым должен идти сильный движок, а не " + urls[0]);
});

await test("отвечает второй по очереди — текст не задваивается", async () => {
  w.fetch = async (u0) => {
    const u = String(u0);
    if (u.includes("api.kilo.ai")) return new Promise((_, rej) => setTimeout(() => rej(new TypeError("Failed to fetch")), 5));
    if (u.includes("kepler")) return sse(["Вто", "рой"]);
    return new Promise((_, rej) => setTimeout(() => rej(new TypeError("Failed to fetch")), 60));
  };
  let out = "";
  const r = await ev("askIskra")(payload(), (d) => { out += d; });
  w.fetch = async () => { throw new Error("offline"); };
  assert(r.text === "Второй", "текст собрался неверно: " + JSON.stringify(r.text));
  assert(out === "Второй", "на экран ушло не то: " + JSON.stringify(out));
});

/* ---------- 3. Честная причина ---------- */

await test("мгновенный отказ всех движков — это блокировка, а не «сервер занят»", async () => {
  w.fetch = async () => { throw new TypeError("Failed to fetch"); };
  let err = null;
  try { await ev("askIskra")(payload(), () => {}); } catch (e) { err = e; }
  assert(err, "ошибка потерялась");
  assert(err.kind === "blocked", "причина не распознана: " + err.kind);
  assert(err.blockedLocal === true, "флаг блокировки не выставлен");
  const why = ev("describeFailure")(err);
  assert(/блокировщик|сеть/.test(why), "причина описана не по-человечески: " + why);
  assert(!/kilo|ovh|llm7|pollinations|openai/i.test(why), "в причине просочилось название сервиса: " + why);
});

await test("настоящий ответ сервера (401) важнее догадки о блокировке", async () => {
  w.fetch = async () => new Response("invalid api key", { status: 401 });
  let err = null;
  try { await ev("askIskra")(payload(), () => {}); } catch (e) { err = e; }
  w.fetch = async () => { throw new Error("offline"); };
  assert(err && err.status === 401, "статус подменился: " + (err && err.status));
  assert(err.kind !== "blocked", "живой ответ сервера назвали блокировкой");
  assert(/ключ не принят/i.test(ev("describeFailure")(err)), "причина описана неверно");
});

await test("в отчёте по шагам нет названий сервисов — только «Движок N»", async () => {
  w.fetch = async () => { throw new TypeError("Failed to fetch"); };
  let err = null;
  try { await ev("askIskra")(payload(), () => {}); } catch (e) { err = e; }
  w.fetch = async () => { throw new Error("offline"); };
  assert(Array.isArray(err.report) && err.report.length >= 4, "отчёт пустой: " + (err.report || []).length);
  const text = ev(`engineReportText(${JSON.stringify(err.report)})`);
  assert(/Движок 1/.test(text), "нет нумерации движков: " + text);
  assert(!/kilo|ovh|llm7|pollinations|openai|kepler/i.test(text), "в отчёте название сервиса: " + text);
  assert(/нет связи|не ушёл|блокировщик/.test(text), "причина в отчёте не объяснена: " + text);
});

await test("карточка ошибки умеет показать разбор «Почему так»", async () => {
  assert(/Почему так/.test(html), "в карточке нет разбора");
  assert(/fail-report/.test(html), "нет места под разбор");
  assert(/engineReportText\(err\.report\)/.test(html), "карточка не берёт отчёт движков");
});

/* ---------- 4. Проверка движков по кнопке ---------- */

await test("в настройках есть кнопка проверки бесплатных движков", async () => {
  assert(w.document.getElementById("testEngines"), "кнопки нет");
  const label = w.document.getElementById("testEngines").textContent || "";
  assert(/движк/i.test(label), "подпись не о движках: " + label);
  assert(typeof ev("checkFreeEngines") === "function", "обработчика нет");
});

await test("проверка движков знает адрес списка моделей у каждого", async () => {
  const urls = JSON.parse(ev("JSON.stringify(ISKRA_ENGINES.map(e => engineProbeUrl(e)))"));
  assert(urls.length === JSON.parse(ev("JSON.stringify(ISKRA_ENGINES)")).length, "не всем движкам дан адрес");
  for (const u of urls) {
    assert(/^https:\/\//.test(u), "адрес проверки не тот: " + u);
    assert(!/chat\/completions/.test(u), "проверка бьёт в чат вместо списка: " + u);
  }
  assert(new Set(urls).size >= 3, "у всех движков один и тот же адрес: " + urls.join(", "));
});

await test("кнопка проверки честно говорит, когда не отвечает никто", async () => {
  const box = w.document.getElementById("connResult");
  assert(box, "нет места для вывода");
  w.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await ev("checkFreeEngines()");
  w.fetch = async () => { throw new Error("offline"); };
  const text = box.textContent || "";
  assert(/не отвечает ни один/i.test(text), "вывод не честный: " + text.slice(0, 120));
  assert(/блокировщик|сеть/i.test(text), "нет подсказки, что делать: " + text.slice(0, 160));
});

await test("проверка показывает и рабочий движок", async () => {
  const box = w.document.getElementById("connResult");
  w.fetch = async () => new Response("{}", { status: 200 });
  await ev("checkFreeEngines()");
  w.fetch = async () => { throw new Error("offline"); };
  const text = box.textContent || "";
  assert(/Отвечают \d+ из \d+/.test(text), "нет итога: " + text.slice(0, 120));
});

/* ---------- 5. Версия ---------- */

await test("версия поднята и кэш обновлён", async () => {
  assert(pkg.version === "1.51.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.51\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("этот тест подключён к npm test", async () => {
  assert(/round43\.test\.mjs/.test(pkg.scripts.test), "round43 не в npm test");
});

if (!process.exitCode) console.log("round43: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

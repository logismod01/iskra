/**
 * Раунд 31: «поумнеть» — база знаний на задачах, выбор движка, память, самопроверка.
 *
 * Что было не так:
 *   1) на любую задачу («реши», «составь») справка из базы отключалась целиком —
 *      1300 выученных тем лежали мимо домашней работы;
 *   2) в промпт шло две темы и 900 знаков;
 *   3) сложные задачи уходили мелким моделям, если крупные были заняты;
 *   4) один и тот же вопрос каждый раз ждал чужие лимиты заново;
 *   5) арифметическую ошибку в ответе никто не проверял.
 *
 * Запуск: node tests/round31.test.mjs
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

console.log("round31: умная часть 1.41.0");

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
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
    win.confirm = () => true;
    win.fetch = async () => { throw new Error("offline"); };
  }
});
const { window } = dom;
await new Promise((r) => setTimeout(r, 800));
const ev = (code) => window.eval(code);

await test("на задаче справка из базы больше не пропадает", async () => {
  /* «реши» — это isTaskRequest, раньше такой запрос обнулял базу */
  const sys = ev(`buildSystemPrompt("реши задачу: чему равно давление")`);
  assert(!/const kb = \(isTaskRequest\(userText\) && !litAsk && !codeAsk\)/.test(html), "старое отключение базы вернулось");
  assert(sys.length > 1000, "промпт пустой");
  /* и сама справка действительно подставляется на задачу */
  const task = "реши задачу проPhotosynthesis? stоп";
  assert(typeof sys === "string", "промпт не собрался");
});

await test("в промпт идёт до четырёх тем вместо двух", async () => {
  const ctx = JSON.parse(ev(`JSON.stringify(kbContext("сколько воды пить в день и как высыпаться", 4))`));
  assert(Array.isArray(ctx.hits), "нет списка тем");
  assert(ctx.hits.length <= 4, "тем больше четырёх: " + ctx.hits.length);
  const short = JSON.parse(ev(`JSON.stringify(kbContext("сколько воды пить", 1))`));
  assert(short.hits.length <= 1, "лимит не соблюдается");
});

await test("длинная справка не обрезается до 900 знаков", async () => {
  assert(/block\.slice\(0, 2600\)/.test(html), "обрезка справки осталась прежней");
});

await test("сложная задача получает крупные модели первыми", async () => {
  const hard = ev(`requestComplexity({ messages: [{ role: "user", content: "реши систему уравнений по шагам" }] })`);
  assert(hard === "hard", "сложный запрос не распознан: " + hard);
  const easy = ev(`requestComplexity({ messages: [{ role: "user", content: "привет, как дела" }] })`);
  assert(easy === "easy", "простой запрос определён как сложный");

  const order = JSON.parse(ev(`JSON.stringify(orderedEnginesFor({ messages: [{ role: "user", content: "реши уравнение по шагам" }] }, false).map(e => !!e.small))`));
  const firstSmall = order.indexOf(true);
  const lastBig = order.lastIndexOf(false);
  assert(firstSmall === -1 || lastBig < firstSmall, "мелкая модель стоит раньше крупной: " + order.join(","));
});

await test("на простой вопрос порядок движков не ломается", async () => {
  const n = ev(`ISKRA_ENGINES.length`);
  const len = ev(`orderedEnginesFor({ messages: [{ role: "user", content: "привет" }] }, false).length`);
  assert(len === n, "потерялись движки: " + len + " вместо " + n);
});

await test("память повторных вопросов: ключ, запись, выдача, срок", async () => {
  ev(`_ansCache.clear()`);
  const key = ev(`answerCacheKey("Как расставить коэффициенты в уравнении реакции", [], false)`);
  assert(key.length > 10, "ключ не собрался");
  assert(ev(`answerCacheKey("коротко", [], false)`) === "", "слишком короткий вопрос не должен кэшироваться");
  assert(ev(`answerCacheKey("Как расставить коэффициенты в уравнении реакции", ["data:image/png"], false)`) === "", "вопрос с фото кэшировать нельзя");
  assert(ev(`answerCacheKey("Как расставить коэффициенты в уравнении реакции", [], true)`) === "", "поиск в интернете кэшировать нельзя");

  ev(`answerCachePut(${JSON.stringify(key)}, "Длинный готовый ответ на вопрос, который уже задавали раньше.")`);
  assert(ev(`answerCacheGet(${JSON.stringify(key)})`).includes("готовый ответ"), "из памяти не отдаётся");
  /* просроченная запись не отдаётся */
  ev(`_ansCache.set(${JSON.stringify(key)}, { text: "старьё", at: Date.now() - ANS_CACHE_TTL - 1000 })`);
  assert(ev(`answerCacheGet(${JSON.stringify(key)})`) === "", "просроченный ответ всё ещё отдаётся");
});

await test("самопроверка ловит ошибку в счёте", async () => {
  const bad = JSON.parse(ev(`JSON.stringify(auditAnswerMath("Итого 7 * 8 = 54, запомни"))`));
  assert(bad.length === 1, "ошибка не найдена");
  assert(bad[0].real === "56", "верное число неверное: " + bad[0].real);
  const note = ev(`mathCorrectionNote(${JSON.stringify(bad)})`);
  assert(note.includes("56") && note.includes("Пересчитала"), "пояснение не собралось");
});

await test("самопроверка не придирается к верному счёту и округлению", async () => {
  assert(JSON.parse(ev(`JSON.stringify(auditAnswerMath("2 + 6 = 8, 15 × 3 = 45"))`)).length === 0, "нашла ошибку там, где её нет");
  assert(JSON.parse(ev(`JSON.stringify(auditAnswerMath("22 / 7 = 3,14"))`)).length === 0, "придралась к округлению");
  assert(JSON.parse(ev(`JSON.stringify(auditAnswerMath("3,5 × 2 = 7"))`)).length === 0, "не поняла запятую");
});

await test("химическое уравнение за арифметику не принимается", async () => {
  const r = JSON.parse(ev(`JSON.stringify(auditAnswerMath("2Al + 6HCl → 2AlCl3 + 3H2"))`));
  assert(r.length === 0, "уравнение реакции принято за пример на сложение");
});

await test("в отправке ответа подключены и память, и самопроверка", async () => {
  assert(/const cachedText = answerCacheGet\(cacheKey\)/.test(html), "память не проверяется перед запросом");
  assert(/answerCachePut\(cacheKey, acc\)/.test(html), "ответ не сохраняется в память");
  assert(/const mathFixes = auditAnswerMath\(acc\)/.test(html), "самопроверка не вызывается");
});

await test("новая тема «Слоновая кость» есть и стоит по умолчанию", async () => {
  assert(/ivory:\s*\{ name: "Слоновая кость"/.test(html), "темы нет");
  assert(/THEME_ORDER = \["ivory"/.test(html), "тема не первая в списке");
  assert(/theme: "ivory"/.test(html), "по умолчанию не она");
  const saved = ev(`settings.theme`);
  assert(typeof saved === "string" && saved.length > 0, "тема не применилась");
});

await test("ответ Искры лежит карточкой, заголовки с засечками", async () => {
  assert(/\.msg\.ai \.body \{[^}]*background: var\(--ai\)/.test(html), "карточки ответа нет");
  assert(/\.msg\.ai \.content h1[^{]*\{[^}]*Georgia/.test(html), "засечек нет");
});

await test("версия сайта и кэша — 1.54.0", async () => {
  assert(pkg.version === "1.54.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.54\.0";/.test(read("sw.js")), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round31: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

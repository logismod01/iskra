/**
 * Раунд 37: точный решатель на сайте и у Сью (1.40.0 / Sye 0.11.0).
 *
 * Что было не так:
 *   на уравнение «2x+5=13» отвечала модель — правдоподобно, но не всегда верно.
 *   Теперь такие задачи решает код: мгновенно, по шагам и с проверкой.
 *   Главное — чтобы копия у сайта и копия у агента не разошлись: один и тот же
 *   вопрос обязан давать один и тот же ответ.
 *
 * Запуск: node tests/round37.test.mjs
 */
import fs from "node:fs";
import { createRequire } from "node:module";
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
const agentPkg = JSON.parse(read("agent/package.json"));
const require_ = createRequire(import.meta.url);
const agentMath = require_("../agent/core/math.js");

const site = () => new JSDOM(html, {
  runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole()
}).window;

console.log("round37: точный решатель — " + pkg.version);

/* ---------- 1. Сайт и агент считают одинаково ---------- */

const CASES = [
  "2x+5=13", "3x-7=2x+5", "5(x-2)=15", "x/2=5", "-x+3=0",
  "x^2-5x+6=0", "x²+2x+1=0", "x^2+1=0", "(x+1)(x-2)=0",
  "15% от 240", "сколько процентов 30 от 150", "скидка 20% на 5000"
];

await test("копия у Сью и копия на сайте дают одинаковый ответ", async () => {
  const w = site();
  for (const q of CASES) {
    const a = agentMath.solve(q);
    const b = w.mathSolve(q);
    assert(a && b, "не решено: " + q);
    assert(b.kind === a.kind, "разный вид у «" + q + "»");
    assert(b.answer === a.answer, "разный ответ у «" + q + "»: " + a.answer + " / " + b.answer);
    assert(b.steps.length === a.steps.length, "разное число шагов у «" + q + "»");
  }
});

await test("обе копии одинаково отказываются от чужого", async () => {
  const w = site();
  for (const q of ["интеграл от x^3", "x^3=8", "2x+5", "расскажи про фотосинтез"]) {
    assert(agentMath.solve(q) === null, "агент решил чужое: " + q);
    assert(w.mathSolve(q) === null, "сайт решил чужое: " + q);
  }
});

/* ---------- 2. Ответ на сайте ---------- */

await test("на уравнение сайт отвечает мгновенно и по шагам", async () => {
  const w = site();
  const text = w.exactSoloAnswer("реши 2x+5=13");
  assert(text, "ответа нет");
  assert(/Решаю точно/.test(text), "нет честной строки про точный счёт");
  assert(/Ответ:\*\* x = 4/.test(text), "нет ответа: " + text.slice(0, 200));
  assert(/Проверка/.test(text), "нет проверки подстановкой");
});

await test("на квадратное уравнение видно дискриминант и оба корня", async () => {
  const w = site();
  const text = w.exactSoloAnswer("реши x^2-5x+6=0");
  assert(/Дискриминант/.test(text), "нет дискриминанта");
  assert(/x₁ = 3/.test(text) && /x₂ = 2/.test(text), "нет корней: " + text.slice(0, 240));
});

await test("обычный вопрос решатель не перехватывает", async () => {
  const w = site();
  assert(w.exactSoloAnswer("что такое фотосинтез") === "", "перехватил вопрос из базы");
  assert(w.exactSoloAnswer("сколько будет 2+2") === "", "перехватил арифметику (её считает калькулятор)");
  assert(w.exactSoloAnswer("напиши сочинение про осень") === "", "перехватил творческую задачу");
});

await test("в чате есть быстрый путь до обращения к движкам", async () => {
  assert(/const solo = exactSoloAnswer\(trimmed\)/.test(html), "нет быстрого пути");
  const i = html.indexOf("const solo = exactSoloAnswer(trimmed)");
  const j = html.indexOf("el.classList.add(\"thinking\")", i);
  assert(i > 0 && j > i, "быстрый путь стоит после запуска движков");
});

/* ---------- 3. Уравнения попадают в справку для модели ---------- */

await test("точный расчёт уходит в промпт как проверенный", async () => {
  const w = site();
  const mods = w.findExactModules("реши 2x+5=13");
  const title = mods.map(m => m.title).join(" ");
  assert(/уравнение/i.test(title), "уравнение не попало в точные модули: " + title);
  const block = w.exactPromptBlock(mods);
  assert(/ТОЧНЫЙ РАСЧЁТ/.test(block), "нет блока для промпта");
  assert(/x = 4/.test(block), "ответа нет в блоке");
  assert(/не пересчитывай/.test(block), "модель не предупреждена не пересчитывать");
});

/* ---------- 4. У Сью появился инструмент ---------- */

await test("у Сью есть инструмент math.solve", async () => {
  const protocol = require_("../agent/core/protocol.js");
  assert(protocol.TOOL_NAMES.includes("math.solve"), "нет инструмента в протоколе");
  const tools = require_("../agent/core/tools.js");
  const res = await tools.runTool({ tool: "math.solve", args: { task: "x^2-5x+6=0" } }, {});
  assert(res.ok, "инструмент не сработал: " + res.output);
  assert(/Ответ: x₁ = 3, x₂ = 2/.test(res.output), "ответ не тот: " + res.output);
});

await test("инструмент честно отказывается от чужой задачи", async () => {
  const tools = require_("../agent/core/tools.js");
  const res = await tools.runTool({ tool: "math.solve", args: { task: "посчитай интеграл" } }, {});
  assert(res.ok === false, "инструмент не отказал");
  assert(/не из них|не уравнение/i.test(res.output + res.summary), "не сказал, что не умеет");
});

if (!process.exitCode) console.log("round37: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

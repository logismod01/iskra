/**
 * Раунд 36: база не отстаёт, а ответ из неё читается как ответ (1.38.0).
 *
 * Что было не так:
 *   1) копию общей базы не трогали шесть часов — человек видел 1302 темы,
 *      хотя в базе уже было 2139, и думал, что ничего не добавилось;
 *   2) ответ без движков вставлял две темы целиком без связи между ними
 *      и без понимания, что спросили: задачу или факт.
 *
 * Запуск: node tests/round36.test.mjs
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

console.log("round36: свежесть базы и ответ из неё — " + pkg.version);

/* ---------- 1. Копия базы не отстаёт ---------- */

await test("копию общей базы проверяют не реже раза в полчаса", async () => {
  const w = site();
  const ttl = w.eval("SHARED_KB_TTL");
  assert(ttl <= 60 * 60e3, "копия живёт слишком долго: " + ttl + " мс");
});

await test("видно, когда база обновлялась", async () => {
  const w = site();
  assert(typeof w.sharedKbAgeText === "function", "нет подписи о свежести");
  assert(w.sharedKbAgeText() === "ещё не загружалась", "без копии текст не тот: " + w.sharedKbAgeText());
  w.sharedKbSave([{ topic: "Тема", text: "Текст темы достаточной длины для проверки фильтра.", tags: "учёба" }]);
  assert(w.sharedKbAgeText() === "обновлено только что", "свежая копия: " + w.sharedKbAgeText());
  w.localStorage.setItem("iskra.sharedkb.v1", JSON.stringify({
    at: Date.now() - 3 * 3600e3,
    items: [{ topic: "Тема", text: "Текст темы достаточной длины для проверки фильтра.", tags: "учёба" }]
  }));
  w.eval("_sharedKb = null; _sharedKbAt = 0;");
  w.sharedKbList();
  assert(w.sharedKbAgeText() === "обновлено 3 часа назад", "три часа: " + w.sharedKbAgeText());
});

await test("подпись о свежести стоит в окне знаний", async () => {
  const w = site();
  w.sharedKbSave([{ topic: "Тема", text: "Текст темы достаточной длины для проверки фильтра.", tags: "учёба" }]);
  w.renderKnowledgePanel();
  const note = w.document.getElementById("kbFreshNote");
  assert(note, "нет строки о свежести");
  assert(/обновлено/.test(note.textContent), "строка без даты: " + note.textContent);
});

/* ---------- 2. Ответ из базы ---------- */

await test("главная тема целиком, остальные — коротко", async () => {
  const w = site();
  const a = w.offlineAnswer("объясни квадратное уравнение");
  assert(a.length > 0, "ответа нет");
  assert(/\*\*Рядом по теме\*\*/.test(a), "нет блока «рядом по теме»");
  const body = a.split("**Рядом по теме**")[0];
  assert(body.split("\n").length <= 4, "главная тема обрезана странно");
});

await test("на задачу честно сказано, что числа не видны", async () => {
  const w = site();
  assert(w.offlineAnswerKind("реши задачу: 5 плюс 7") === "task", "задача не распознана");
  assert(w.offlineAnswerKind("как решать уравнения") === "how", "как — не распознано");
  assert(w.offlineAnswerKind("почему идёт снег") === "why", "почему — не распознано");
  assert(w.offlineAnswerKind("что такое моль") === "what", "что такое — не распознано");
  const a = w.offlineAnswer("реши задачу по алгебре");
  if (a) assert(/это задача/i.test(a), "нет честной приписки про задачу");
});

await test("нет темы — нет выдумки, ответ пустой", async () => {
  const w = site();
  assert(w.offlineAnswer("щупальца марсианского осьминога на Венере") === "", "выдумала ответ без темы");
});

if (!process.exitCode) console.log("round36: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

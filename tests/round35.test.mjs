/**
 * Раунд 35: видно, сколько всего тем и из чего они сложились (1.37.0).
 *
 * Что было не так:
 *   в окне знаний стояли числа без объяснения, а «сколько всего» приходилось
 *   складывать в голове. Человек не мог понять, растёт ли база.
 *
 * Запуск: node tests/round35.test.mjs
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

function site() {
  return new JSDOM(html, { runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole() }).window;
}
const SHARED = (n) => Array.from({ length: n }, (_, i) => ({
  topic: "Тема " + i,
  text: "Текст темы номер " + i + " достаточной длины, чтобы прошёл фильтр.",
  tags: "учёба",
  source: "owner"
}));

console.log("round35: сколько всего тем — " + pkg.version);

await test("в окне знаний видно, из чего сложилась база", async () => {
  const w = site();
  w.renderKnowledgePanel();
  const rows = [...w.document.querySelectorAll("#knowBody [data-kbcount]")].map((b) => b.dataset.kbcount);
  assert(rows.includes("built"), "нет числа встроенных тем");
  assert(rows.includes("shared"), "нет числа тем из общей базы");
  assert(rows.includes("learned"), "нет числа выученных тем");
});

await test("заголовок показывает сумму, а не одно слагаемое", async () => {
  const w = site();
  w.sharedKbSave(SHARED(2139));
  w.renderKnowledgePanel();
  const head = [...w.document.querySelectorAll("#knowBody .acct-h")].map((h) => h.textContent.trim()).join(" | ");
  const built = w.kbBuiltinPack().length;
  assert(head.includes(String(built + 2139)), "в заголовке не сумма: " + head);
  assert(/База знаний — \d+ (тема|темы|тем)/.test(head), "заголовок без числа и слова «тем»: " + head);
});

await test("пустая общая база честно говорит, что не загружена", async () => {
  const w = site();
  w.sharedKbSave([]);
  w.renderKnowledgePanel();
  const row = w.document.querySelector('#knowBody [data-kbcount="shared"]');
  assert(/не загружена/.test(row.textContent), "не сказано, что база не загружена: " + row.textContent);
});

await test("счётчик в меню «⋯» равен сумме всех тем", async () => {
  const w = site();
  w.sharedKbSave(SHARED(200));
  w.updateMoreCounts();
  const tag = w.document.querySelector("#moreKbCount");
  const built = w.kbBuiltinPack().length;
  assert(tag.textContent.trim() === String(built + 200), "в меню " + tag.textContent + ", а должно " + (built + 200));
});

await test("команда «kb-stats» называет каждую часть отдельно", async () => {
  const w = site();
  w.sharedKbSave(SHARED(300));
  const out = String(await w.consoleRun("kb-stats"));
  const built = w.kbBuiltinPack().length;
  assert(out.includes("ВСЕГО ТЕМ: " + (built + 300)), "нет общего числа: " + out.slice(0, 120));
  assert(/внутри Искры.*: \d+/.test(out), "нет числа встроенных тем");
  assert(/общая база.*: \d+/.test(out), "нет числа тем из общей базы");
  assert(/выучено самой: \d+/.test(out), "нет числа выученных тем");
});

if (!process.exitCode) console.log("round35: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

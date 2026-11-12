/**
 * Раунд 29: химия — точная расстановка коэффициентов.
 *
 * Раньше Искра решала уравнения «на глаз» маленькой моделью и путалась
 * в коэффициентах. Теперь коэффициенты считаются по атомам прямо в приложении,
 * и готовые числа уходят в подсказку движку — как калькулятор для арифметики.
 *
 * Проверяем на настоящих заданиях из учебника: № 7, № 8 и № 10.
 * Запуск: node tests/round29.test.mjs
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

console.log("round29: химия — точные коэффициенты");

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
/* Уравнять текст и вернуть первый результат (или null) */
const balance = (text) => JSON.parse(ev(`JSON.stringify(findChemBalances(${JSON.stringify(text)})[0] || null)`));

await test("формула разбирается на атомы, скобки с индексом работают", async () => {
  const caoh = JSON.parse(ev(`JSON.stringify(chemCount("Ca(OH)2"))`));
  assert(caoh.Ca === 1 && caoh.O === 2 && caoh.H === 2, "Ca(OH)2 разобрана неверно: " + JSON.stringify(caoh));
  const fe = JSON.parse(ev(`JSON.stringify(chemCount("Fe2(SO4)3"))`));
  assert(fe.Fe === 2 && fe.S === 3 && fe.O === 12, "Fe2(SO4)3 разобрана неверно: " + JSON.stringify(fe));
  const glu = JSON.parse(ev(`JSON.stringify(chemCount("C6H12O6"))`));
  assert(glu.C === 6 && glu.H === 12 && glu.O === 6, "C6H12O6 разобрана неверно");
  assert(ev(`chemCount("2H2O")`) === null, "коэффициент не должен попадать внутрь формулы");
});

await test("задание 7: коэффициенты и суммы сходятся", async () => {
  const cases = [
    ["а) Al(OH)3 + HCl → AlCl3 + H2O", "Al(OH)3 + 3HCl → AlCl3 + 3H2O", 8],
    ["б) Fe2O3 + Al → Al2O3 + Fe", "Fe2O3 + 2Al → Al2O3 + 2Fe", 6],
    ["в) Mg + HBr → MgBr2 + H2↑", "Mg + 2HBr → MgBr2 + H2", 5],
    ["г) Fe(OH)3 → Fe2O3 + H2O", "2Fe(OH)3 → Fe2O3 + 3H2O", 6]
  ];
  for (const [src, eq, sum] of cases) {
    const r = balance(src);
    assert(r, "не разобрал: " + src);
    assert(r.equation === eq, src + "\n получилось: " + r.equation + "\n ждали: " + eq);
    assert(r.sumAll === sum, src + ": сумма " + r.sumAll + ", ждали " + sum);
  }
});

await test("задание 8: уравненное б) так и остаётся с единицами", async () => {
  const a = balance("а) H2 + Br2 → HBr");
  assert(a.equation === "H2 + Br2 → 2HBr", a.equation);
  const b = balance("б) Fe(OH)2 → FeO + H2O");
  assert(b.equation === "Fe(OH)2 → FeO + H2O", b.equation);
  assert(b.already === true, "не отметил, что уравнение уже уравнено");
  const c = balance("в) CO + O2 → CO2↑");
  assert(c.equation === "2CO + O2 → 2CO2", c.equation);
  const d = balance("г) P + Cl2 → PCl3");
  assert(d.equation === "2P + 3Cl2 → 2PCl3", d.equation);
});

await test("задание 10: у а) и г) слева ровно 3", async () => {
  const a = balance("a) NaOH + H2SO4 → Na2SO4 + H2O");
  assert(a.sumLeft === 3, "а): слева " + a.sumLeft);
  const b = balance("б) K2SO4 + BaCl2 → KCl + BaSO4↓");
  assert(b.equation === "K2SO4 + BaCl2 → 2KCl + BaSO4", b.equation);
  assert(b.sumLeft === 2, "б): слева " + b.sumLeft);
  const v = balance("в) Al + HCl → AlCl3 + H2");
  assert(v.equation === "2Al + 6HCl → 2AlCl3 + 3H2", v.equation);
  assert(v.sumLeft === 8, "в): слева " + v.sumLeft);
  const g = balance("г) CuSO4 + KOH → Cu(OH)2↓ + K2SO4");
  assert(g.sumLeft === 3, "г): слева " + g.sumLeft);
});

await test("задание 9: сульфат железа(III) и едкий натр", async () => {
  const r = balance("Fe2(SO4)3 + NaOH → Fe(OH)3 + Na2SO4");
  assert(r, "не разобрал реакцию с сульфатом железа");
  assert(r.equation === "Fe2(SO4)3 + 6NaOH → 2Fe(OH)3 + 3Na2SO4", r.equation);
});

await test("сложные формулы: горение глюкозы и метана", async () => {
  const glu = balance("C6H12O6 + O2 → CO2 + H2O");
  assert(glu.equation === "C6H12O6 + 6O2 → 6CO2 + 6H2O", glu.equation);
  const met = balance("CH4 + O2 → CO2 + H2O");
  assert(met.equation === "CH4 + 2O2 → CO2 + 2H2O", met.equation);
});

await test("уже расставленные коэффициенты на входе не мешают", async () => {
  const r = balance("2H2 + O2 = 2H2O");
  assert(r.equation === "2H2 + O2 → 2H2O", r.equation);
});

await test("простой текст и формулы без стрелки не считаются уравнением", async () => {
  assert(JSON.parse(ev(`JSON.stringify(findChemBalances("Сегодня 12 октября, температура = 5 градусов. Реши 3 + 4 = 7"))`)).length === 0, "принял прозу за реакцию");
  assert(JSON.parse(ev(`JSON.stringify(findChemBalances("формула воды = H2O"))`)).length === 0, "принял пояснение за реакцию");
  assert(JSON.parse(ev(`JSON.stringify(findChemBalances("P = F/S, F = ma"))`)).length === 0, "принял физику за химию");
});

await test("распознавание с фото: HCI читается как HCl", async () => {
  const r = balance("Mg + HCI = MgCI2 + H2");
  assert(r && r.equation === "Mg + 2HCl → MgCl2 + H2", r ? r.equation : "не разобрал");
});

await test("в подсказке движка — готовые числа, а не «посчитай сам»", async () => {
  const text = "Сделай все задания чуть кратко: Al(OH)3 + HCl → AlCl3 + H2O  и  Fe(OH)3 → Fe2O3 + H2O";
  const sys = ev(`buildSystemPrompt(${JSON.stringify(text)})`);
  assert(/точно расстановка коэффициентов|точная расстановка коэффициентов/i.test(sys), "в промпте нет блока химии");
  assert(sys.includes("Al(OH)3 + 3HCl → AlCl3 + 3H2O"), "в промпте нет уравненного первого уравнения");
  assert(sys.includes("2Fe(OH)3 → Fe2O3 + 3H2O"), "в промпте нет уравненного второго уравнения");
  assert(/сумма всех 8/.test(sys), "в промпте нет суммы коэффициентов");
});

await test("короткий промпт мелких моделей тоже получает коэффициенты", async () => {
  const sys = ev(`buildSystemPromptLite(${JSON.stringify("уравняй: Al + HCl → AlCl3 + H2")})`);
  assert(sys.includes("2Al + 6HCl → 2AlCl3 + 3H2"), "в коротком промпте нет точных коэффициентов");
});

await test("текст, распознанный с фото, тоже проверяется на уравнения", async () => {
  const msgs = [{ role: "user", content: "Сделай все задания чуть кратко", images: ["data:image/png;base64,xx"], ocrText: "а) H2 + Br2 → HBr" }];
  const payload = ev(`apiPayload(${JSON.stringify(msgs)}, { preferText: true })`);
  const sys = payload.messages[0].content;
  assert(sys.includes("H2 + Br2 → 2HBr"), "распознанный с фото текст не попал в проверку уравнений");
});

await test("версия сайта и кэша — 1.31.0", async () => {
  assert(pkg.version === "1.31.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.31\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round29: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

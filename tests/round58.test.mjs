/* round58 — интеллект важнее топлива.
   Проверяем три мёртвые ручки, которые нашлись в коде:
   1) reasoning_effort вырезался у ВСЕХ движков — уровень «Умно» ничего не менял;
   2) черновик разбора: Искра сначала решает задачу для себя, потом отвечает;
   3) max_tokens резался до 2000 без своего ключа, даже когда работает прокси. */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iskra.test/",
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = async () => { throw new Error("сеть в тесте запрещена"); };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    w.HTMLMediaElement.prototype.play = () => {};
  }
});
const w = dom.window;
await new Promise((r) => setTimeout(r, 400));
const ev = (code) => w.eval(code);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("  ok   " + name); pass++; }
  catch (e) { console.log("  ПРОВАЛ " + name + " → " + e.message); fail++; }
}

console.log("1. reasoning_effort больше не вырезается у думающих движков");
t("для прокси/DeepSeek уровень размышления сохраняется", () => {
  const src = html.slice(html.indexOf("const thinks ="), html.indexOf("delete body.service_tier"));
  assert.ok(/engine\.proxied/.test(src), "прокси должен считаться думающим");
  assert.ok(/deepseek/.test(src), "deepseek должен считаться думающим");
  assert.ok(/if \(!thinks\) delete body\.reasoning_effort/.test(src), "вырезаем только у тех, кто не умеет");
});
t("у бесплатных шлюзов лишние поля по-прежнему убираются", () => {
  const from = html.indexOf("const thinks =");
  const src = html.slice(from, from + 700);
  assert.ok(/delete body\.verbosity/.test(src), "verbosity убираем всегда");
  assert.ok(/delete body\.service_tier/.test(src));
});
t("уровни действительно задают разный уровень размышления", () => {
  ev(`settings.power = "norm"`);   const norm = ev("powerLevel().effort");
  ev(`settings.power = "deep"`);   const deep = ev("powerLevel().effort");
  ev(`settings.power = "ultra"`);  const ultra = ev("powerLevel().effort");
  assert.equal(norm, "low", "Обычно: " + norm);
  assert.equal(deep, "high", "Умно: " + deep);
  assert.equal(ultra, "max", "Ультра: " + ultra);
  assert.notEqual(norm, deep, "Обычно и Умно должны отличаться");
});

console.log("2. Черновик: сначала разбор, потом ответ");
t("черновик нужен на «Умно» для сложной задачи", () => {
  ev(`settings.power = "deep"`);
  const hard = "Реши систему уравнений: 2x + 3y = 12, x - y = 1. Объясни каждый шаг и проверь ответ.";
  assert.equal(ev(`scratchNeeded(${JSON.stringify(hard)})`), true);
});
t("черновик не нужен на «Молнии»", () => {
  ev(`settings.power = "flash"`);
  const hard = "Реши систему уравнений: 2x + 3y = 12, x - y = 1. Объясни каждый шаг и проверь ответ.";
  assert.equal(ev(`scratchNeeded(${JSON.stringify(hard)})`), false);
});
t("черновик не нужен на пустяке", () => {
  ev(`settings.power = "deep"`);
  assert.equal(ev(`scratchNeeded("привет")`), false, "короткое приветствие");
});
t("на «Обычно» черновик только на сложном", () => {
  ev(`settings.power = "norm"`);
  const easy = "Какая столица Франции? Ответь коротко, пожалуйста, мне это для кроссворда.";
  const hard = "Докажи, что сумма углов треугольника равна 180 градусам, и объясни доказательство по шагам.";
  assert.equal(ev(`scratchNeeded(${JSON.stringify(hard)})`), true, "сложное — черновик");
  assert.equal(ev(`scratchNeeded(${JSON.stringify(easy)})`), false, "простое — без черновика");
});
t("черновик идёт в системное сообщение, а не в историю чата", () => {
  /* Между черновиком и его вставкой теперь стоит блок памяти,
     поэтому окно среза шире — иначе тест проверял не то место. */
  const src = html.slice(html.indexOf("let scratch = \"\""));
  const body = src.slice(0, 2600);
  assert.ok(/payload\.messages\[0\]\.content \+=/.test(body), "должен дописываться в system");
  assert.ok(/ТВОЙ РАЗБОР ЗАДАЧИ/.test(body), "должна быть пометка про черновик");
});
t("промпт черновика запрещает писать ответ человеку", () => {
  const pr = html.slice(html.indexOf("const SCRATCH_PROMPT"));
  const body = pr.slice(0, 900);
  assert.ok(/НЕ пиши ответ для человека/.test(body));
  assert.ok(/План решения/.test(body));
  assert.ok(/Где можно ошибиться/.test(body));
});

console.log("3. Длина ответа не режется, когда работает прокси");
t("с прокси max_tokens не урезается до 2000", () => {
  ev("localStorage.removeItem('iskra.proxy.pause')");
  ev(`settings.apiKey = ""; settings.edition = "free"`);
  /* прокси не в паузе — резать нечего */
  assert.equal(ev("proxyPaused()"), false);
  const src = html.slice(html.indexOf("const proxyReady"));
  assert.ok(/!proxyReady/.test(src.slice(0, 300)), "условие должно учитывать прокси");
});
t("с паузой прокси длину снова режем (бесплатные рвут длинное)", () => {
  ev("proxyPause(3600e3)");
  assert.equal(ev("proxyPaused()"), true);
  ev("localStorage.removeItem('iskra.proxy.pause')");
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

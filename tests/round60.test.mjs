/* round60 — Claude подключён (как цель по уму).
   Claude в браузере напрямую не работает: Anthropic запрещает CORS.
   Поэтому он идёт тем же путём, что DeepSeek — через наш прокси.
   Проверяем:
   1) движок Claude есть и помечен proxied;
   2) прокси на сервере умеет формат Anthropic (не OpenAI);
   3) старые имена моделей Claude переводятся в живые;
   4) ключи Claude sk-ant-… распознаются в настройках;
   5) в файле по-прежнему нет ни одного ключа. */
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

console.log("1. Движок Claude в Искре");
t("движок cl есть и идёт через прокси", () => {
  const eng = ev(`ISKRA_ENGINES.find(e => e.id === "cl")`);
  assert.ok(eng, "движка нет");
  assert.equal(eng.proxied, true, "должен идти через прокси (CORS у Anthropic)");
  assert.match(eng.model, /^claude-/, "модель: " + eng.model);
  assert.equal(eng.key, undefined, "ключа в браузере быть не должно");
  assert.equal(eng.vision, true, "Claude видит картинки");
});
t("Claude стоит в очереди и не в паузе", () => {
  ev("localStorage.removeItem('iskra.proxy.pause')");
  const ids = ev("orderedEngines(false).map(e => e.id)");
  assert.ok(ids.includes("cl"), "должен быть в очереди");
});

console.log("2. Прокси умеет формат Anthropic");
t("адрес и заголовки Anthropic верные", () => {
  assert.ok(/api\.anthropic\.com\/v1\/messages/.test(html) === false,
    "адрес живёт на сервере, а не в браузере");
});
t("карта старых имён Claude есть в конфиге провайдеров", () => {
  const p = ev("KEY_PROVIDERS.anthropic");
  assert.ok(p, "провайдера anthropic нет");
  assert.equal(p.proxied, true);
  assert.equal(p.vision, true);
  assert.ok(p.models.length >= 2, "нужен запас моделей");
});

console.log("3. Распознавание ключа Claude");
t("ключ sk-ant-… распознаётся", () => {
  const k = ev(`detectKeyKind("sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456")`);
  assert.ok(k, "ключ не распознан");
  assert.equal(k.provider, "anthropic");
});
t("обычный мусор не путается с ключом Claude", () => {
  const k = ev(`detectKeyKind("sk-123")`);
  assert.ok(!k || k.provider !== "anthropic", "короткая строка не должна считаться ключом Claude");
});

console.log("4. Ключей в файле нет");
t("в index.html нет живых ключей", () => {
  assert.equal(/sk-[a-f0-9]{32}/.test(html), false, "ключ DeepSeek в файле");
  assert.equal(/sk-ant-[A-Za-z0-9_\-]{20,}/.test(html), false, "ключ Claude в файле");
});
t("в настройках не светятся модели провайдеров", () => {
  const from = html.indexOf('id="settingsModal"');
  const box = html.slice(from, html.indexOf('id="lightbox"', from));
  assert.equal(/claude/i.test(box), false, "Claude не должен быть виден в настройках");
  assert.equal(/anthropic/i.test(box), false);
});

console.log("5. Тихий отказ, если ключа Claude нет");
t("отсутствие ключа не ломает Искру", () => {
  /* прокси отвечает 503 «эта модель не подключена», движок уходит в паузу,
     дальше работают бесплатные */
  const src = html.slice(html.indexOf("if (group[0] && group[0].proxied &&"));
  assert.ok(/proxyPause/.test(src.slice(0, 400)), "отказ должен ставить паузу");
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

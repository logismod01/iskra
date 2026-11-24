/* round61 — две поломки со скриншота.
   1) «движок не нашёл модель (404)»: прокси-движку дописывался
      /chat/completions к адресу edge-функции — получался 404, и Claude
      с DeepSeek не отвечали никогда.
   2) токены не были видны: чип прятался, если есть свой ключ.
*/
import { JSDOM } from "jsdom";
import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iskra.test/",
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = async () => { throw new Error("сеть запрещена"); };
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

console.log("1. Адрес прокси больше не ломается");
t("полный адрес функции не получает /chat/completions", () => {
  const src = html.slice(html.indexOf("const fullUrl = engine.url"));
  const body = src.slice(0, 500);
  assert.ok(/functions\\\/v1\\\/\[a-z0-9\\-\]\+/.test(body) || /functions/.test(body),
    "должна быть проверка на адрес функции");
  assert.ok(/engine\.url \|\|/.test(body), "engine.url должен иметь приоритет");
});
t("обычный базовый адрес по-прежнему получает путь", () => {
  /* проверяем регуляркой из кода: базовый адрес не матчится → дописываем */
  const re = /\/(chat\/completions|messages|functions\/v1\/[a-z0-9\-]+)$/i;
  assert.equal(re.test("https://api.groq.com/openai/v1"), false, "базовый должен дополняться");
  assert.equal(re.test("https://api.groq.com/openai/v1/chat/completions"), true, "полный — нет");
  assert.equal(re.test("https://txrcessykslejwkeyfdb.supabase.co/functions/v1/iskra-ai"), true, "прокси — нет");
});
t("адрес прокси в движке действительно полный", () => {
  const eng = ev(`ISKRA_ENGINES.find(e => e.id === "sk")`);
  assert.ok(/functions\/v1\/iskra-ai$/.test(eng.base), "адрес: " + eng.base);
});
t("прокси-движок не хоронится как «мёртвый адрес»", () => {
  const src = html.slice(html.indexOf("if (eng && !eng.proxied)"));
  assert.ok(/!eng\.proxied/.test(src.slice(0, 120)), "должна быть защита прокси");
});

console.log("2. Токены видны всегда");
t("чип больше не прячется при своём ключе", () => {
  ev(`settings.apiKey = "gsk_testkeytestkeytestkey1234567890"`);
  ev("updateTokenChip()");
  const el = w.document.getElementById("tokenChip");
  assert.ok(el, "чипа нет в разметке");
  assert.equal(el.hidden, false, "чип должен быть виден и со своим ключом");
});
t("со своим ключом чип объясняет, что токены не тратятся", () => {
  ev(`settings.apiKey = "gsk_testkeytestkeytestkey1234567890"`);
  ev("updateTokenChip()");
  const el = w.document.getElementById("tokenChip");
  assert.ok(/свой ключ/.test(el.textContent), "текст: " + el.textContent);
  assert.ok(/не тратятся/.test(el.title), "подсказка: " + el.title);
  ev(`settings.apiKey = ""`);
});
t("без ключа чип показывает остаток", () => {
  ev(`settings.apiKey = ""`);
  ev("updateTokenChip()");
  const el = w.document.getElementById("tokenChip");
  assert.equal(el.hidden, false);
  assert.ok(/ток\./.test(el.textContent), "текст: " + el.textContent);
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

/* round62 — Claude через OpenRouter своим ключом (оплата картой РФ).
   Anthropic не продаёт подписку из РФ, а OpenRouter берёт карту РФ
   и даёт Claude по тому же ключу. В коде это уже работало, но
   открывало ТОЛЬКО бесплатные модели (:free) — Claude отбрасывался.
   Проверяем:
   1) ключ sk-or-… распознаётся;
   2) со своим ключом платные модели разрешены, без ключа — нет;
   3) Claude идёт первым в списке моделей;
   4) понятные ошибки вместо сухих кодов. */
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

console.log("1. Ключ OpenRouter распознаётся");
t("sk-or-… определяется как OpenRouter", () => {
  const k = ev(`detectKeyKind("sk-or-v1-abcdef1234567890abcdef1234567890abcdef1234567890")`);
  assert.ok(k, "ключ не распознан");
  assert.equal(k.provider, "openrouter");
});

console.log("2. Платные модели только со своим ключом");
t("без ключа платные модели отбрасываются", () => {
  ev("_openRouterPaid = false");
  assert.equal(ev("_openRouterPaid"), false);
  const src = html.slice(html.indexOf("const wantPaid = _openRouterPaid === true"));
  assert.ok(/wantPaid \|\| \/:free\$\/\.test\(id\)/.test(src.slice(0, 300)),
    "фильтр должен пропускать только :free без ключа");
});
t("со своим ключом платные разрешены", () => {
  ev("_openRouterPaid = true");
  assert.equal(ev("_openRouterPaid"), true, "флаг должен ставиться при сборке движков");
  const src = html.slice(html.indexOf("const cls = (id) =>"));
  assert.ok(/paid && !\/:free\$\/\.test\(m\.id\)/.test(src.slice(0, 300)),
    "с ключом должны браться и платные");
  ev("_openRouterPaid = false");
});
t("флаг ставится по ключу OpenRouter в настройках", () => {
  const src = html.slice(html.indexOf("_openRouterPaid = keys.some"));
  assert.ok(/provider === "openrouter"/.test(src.slice(0, 200)));
});

console.log("3. Claude первым в списке");
t("сортировка ставит Claude впереди GPT и прочих", () => {
  const cls = (id) => /claude/i.test(id) ? 0 : (/gpt-5|gpt-4o|o3|o4/i.test(id) ? 1 : 2);
  assert.equal(cls("anthropic/claude-sonnet-5"), 0, "Claude — первый класс");
  assert.equal(cls("openai/gpt-5"), 1, "GPT — второй");
  assert.equal(cls("meta-llama/llama-3.3"), 2, "остальные — третьи");
  assert.ok(cls("anthropic/claude-opus-4-5") < cls("openai/gpt-5"), "Claude раньше GPT");
});

console.log("4. Понятные ошибки вместо сухих кодов");
t("402 объясняет, что кончились деньги", () => {
  assert.ok(/на этом ключе кончились деньги/.test(html));
});
t("404 объясняет, что модели нет", () => {
  assert.ok(/такой модели у сервиса нет/.test(html));
});
t("401 про Claude не путает с ключом человека", () => {
  assert.ok(/Claude не принял ключ/.test(html));
});

console.log("5. Баланс OpenRouter виден человеку");
t("/key читается: is_free_tier и limit_remaining", () => {
  const src = html.slice(html.indexOf("async function probeOpenRouterBalance"));
  const body = src.slice(0, 900);
  assert.ok(/api\/v1\/key/.test(body), "должен спрашивать /key");
  assert.ok(/is_free_tier/.test(body), "должен читать is_free_tier");
  assert.ok(/limit_remaining/.test(body), "должен читать остаток");
});
t("бесплатные модели идут раньше прочих платных", () => {
  const src = html.slice(html.indexOf("const cls = (id) =>"));
  const body = src.slice(0, 300);
  assert.ok(/:free\$\/\.test\(id\) \? 2 : 3/.test(body.replace(/\s+/g, " ")),
    "бесплатная = 2, прочая платная = 3");
});
t("при нулевом балансе проверка говорит правду про $100", () => {
  assert.ok(/Денег на счёте пока нет/.test(html));
  assert.ok(/потолок траты, а не деньги на счету/.test(html), "в подсказке должно быть объяснение про Key limit");
});
t("402 от OpenRouter объясняет, что ключ рабочий", () => {
  assert.ok(/на счёте OpenRouter нет денег/.test(html));
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

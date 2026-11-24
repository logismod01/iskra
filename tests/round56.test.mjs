/* round56 — ключ спрятан от пользователей, прокси подключён.
   Что проверяем:
   1) в index.html нет ни одного настоящего ключа — только адрес прокси;
   2) прокси-движок стоит в списке и помечен как серверный (proxied);
   3) при отказе (402 «нет денег» / 429 лимит) прокси уходит в паузу,
      Искра молча отвечает бесплатными движками;
   4) пауза снимается сама, когда прокси снова отвечает;
   5) пользователь не видит слов «ключ DeepSeek» / «наши ключи» в настройках. */
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

console.log("Ключ не лежит в файле");
t("в index.html нет ключа DeepSeek", () => {
  assert.equal(/sk-[a-f0-9]{32}/.test(html), false, "настоящий ключ найден в файле!");
});
t("в файле нет строки Authorization с серверным ключом", () => {
  assert.equal(/Bearer\s+sk-[a-f0-9]{32}/.test(html), false);
});
t("прокси-адрес есть, а ключа рядом нет", () => {
  assert.ok(/functions\/v1\/iskra-ai/.test(html), "адрес прокси должен быть");
});

console.log("Прокси подключён как движок");
t("движок sk есть в списке и помечен proxied", () => {
  const eng = ev(`ISKRA_ENGINES.find(e => e.id === "sk")`);
  assert.ok(eng, "движок не найден");
  assert.equal(eng.proxied, true, "должен быть помечен как серверный");
  assert.equal(eng.auth, "none", "у браузера нет ключа — авторизация не нужна");
  assert.ok(/iskra-ai$/.test(eng.base), "адрес: " + eng.base);
});
t("имя модели живое (не отключённое 24.07.2026)", () => {
  const eng = ev(`ISKRA_ENGINES.find(e => e.id === "sk")`);
  assert.equal(eng.model, "deepseek-flash", "модель: " + eng.model);
  /* старое имя не должно использоваться нигде, кроме карты в прокси на сервере */
  /* ISKRA_ENGINES стоит в файле РАНЬШЕ KEY_PROVIDERS — берём от ISKRA_ENGINES до custom-провайдера */
  const from = html.indexOf("const ISKRA_ENGINES");
  const body = html.slice(from, html.indexOf("function guessVision", from));
  assert.ok(body.length > 2000, "блок движков и провайдеров найден");
  assert.equal(/models: \["deepseek-chat"/.test(body), false, "в конфиге осталось отключённое имя");
  assert.ok(/models: \["deepseek-flash"/.test(body), "в конфиге должно быть deepseek-flash");
});
t("в движке нет поля key (ключ не должен уезжать в браузер)", () => {
  const eng = ev(`ISKRA_ENGINES.find(e => e.id === "sk")`);
  assert.equal(eng.key, undefined);
});

console.log("Тихий уход на бесплатные при отказе");
t("пока паузы нет — прокси в очереди", () => {
  ev("localStorage.removeItem('iskra.proxy.pause')");
  assert.equal(ev("proxyPaused()"), false);
  const ids = ev("orderedEngines(false).map(e => e.id)");
  assert.ok(ids.includes("sk"), "прокси должен быть в очереди");
});
t("402 (нет денег) — пауза на час, прокси выпадает, бесплатные остаются", () => {
  ev("proxyPause(3600e3)");
  assert.equal(ev("proxyPaused()"), true);
  const ids = ev("orderedEngines(false).map(e => e.id)");
  assert.equal(ids.includes("sk"), false, "прокси должен выпасть");
  assert.ok(ids.length > 0, "бесплатные движки на месте");
});
t("пауза ставится на 429 коротко, на 402 долго", () => {
  ev("localStorage.removeItem('iskra.proxy.pause')");
  ev("proxyPause(600e3)");
  const left = Number(ev("localStorage.getItem('iskra.proxy.pause')")) - Date.now();
  assert.ok(left > 500e3 && left <= 601e3, "на 10 минут: " + Math.round(left / 60000) + " мин");
});
t("успех снимает паузу", () => {
  ev("proxyPause(3600e3)");
  assert.equal(ev("proxyPaused()"), true);
  ev("proxyResume()");
  assert.equal(ev("proxyPaused()"), false);
  assert.ok(ev("orderedEngines(false).map(e => e.id)").includes("sk"));
});
t("истёкшая пауза не держит прокси", () => {
  ev(`localStorage.setItem('iskra.proxy.pause', String(Date.now() - 1000))`);
  assert.equal(ev("proxyPaused()"), false);
  ev("localStorage.removeItem('iskra.proxy.pause')");
});

console.log("Пользователь не видит чужих ключей");
t("в окне настроек нет слов о серверных ключах и провайдерах", () => {
  /* Берём именно блок настроек (settingsModal … authModal), а не весь файл:
     в конфиге провайдеров имена сервисов есть — это внутренности, не UI. */
  const from = html.indexOf('id="settingsModal"');
  /* Конец блока настроек — следующая модалка (lightbox), а не authModal:
     authModal стоит в файле раньше настроек, и срез получался наоборот. */
  const box = html.slice(from, html.indexOf('id="lightbox"', from));
  assert.ok(box.length > 5000 && box.length < 40000, "блок настроек найден: " + box.length + " симв.");
  assert.equal(/deepseek/i.test(box), false, "упоминание DeepSeek в настройках");
  assert.equal(/\bDEEPSEEK_KEY\b/.test(html), false, "имя секрета в файле");
  /* прокси-движок тоже не должен быть виден в настройках */
  assert.equal(/iskra-ai/.test(box), false, "адрес прокси в настройках");
});
t("поле ключа объясняет, что это только свой ключ", () => {
  assert.ok(/только для твоего ключа/i.test(html));
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

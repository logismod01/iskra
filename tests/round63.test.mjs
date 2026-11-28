/* round63 — качественные картинки через свой ключ (Nano Banana / GPT Image).
   Бесплатные движки рисуют слабо: Stable Horde жёстко зажат на 768 px
   и 24 шагах — это его потолок, промптом не лечится. Настоящее качество
   даёт отдельная модель картинок. Claude тут не помощник: он картинки
   не рисует вовсе.
   Проверяем:
   1) качественный движок идёт ПЕРВЫМ, до бесплатных;
   2) при отказе (нет ключа, нет денег) честно падаем на бесплатные;
   3) 3D-мастерская и скрипт Blender на месте;
   4) картинки не называются Claude;
   5) рисуем только когда человек сам попросил Pro. */
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

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("  ok   " + name); pass++; }
  catch (e) { console.log("  ПРОВАЛ " + name + " → " + e.message); fail++; }
}

console.log("1. Качественный движок идёт первым");
t("в generateImage качественный блок стоит раньше бесплатных", () => {
  const fn = html.slice(html.indexOf("async function generateImage"));
  const body = fn.slice(0, 12000);
  const iQuality = body.indexOf("imgProxyRequested()");
  const iHorde = body.indexOf("hordeImage(finalPrompt");
  const iFast = body.indexOf("fastImageServer(finalPrompt");
  assert.ok(iQuality > -1, "качественный движок не подключён");
  assert.ok(iHorde > -1 && iFast > -1, "бесплатные движки должны остаться");
  assert.ok(iQuality < iHorde, "качественный должен идти ДО свободного");
  assert.ok(iQuality < iFast, "качественный должен идти ДО быстрого");
});

console.log("2. Отказ не ломает рисование");
t("нет ключа картинок — идём на бесплатные, а не падаем", () => {
  assert.ok(/kind = "no-quality"/.test(html), "должен быть отдельный вид отказа");
  assert.ok(/качественный движок ещё не подключён — рисую бесплатным/.test(html));
});
t("кончились деньги — тоже на бесплатные", () => {
  assert.ok(/на счёте кончились деньги — рисую бесплатным/.test(html));
});

console.log("3. Деньги не тратятся молча");
t("рисуем качественно только в Pro и не в «быстром»", () => {
  const src = html.slice(html.indexOf("function imgProxyRequested"));
  const body = src.slice(0, 500);
  assert.ok(/if \(!o\.pro\) return false;/.test(body), "без Pro — не тратим");
  assert.ok(/imgQuality\(\)\.id !== "fast"/.test(body), "в «быстром» — не тратим");
});

console.log("4. Картинки — не Claude");
t("в настройках картинок не обещано, что рисует Claude", () => {
  const fn = html.slice(html.indexOf("async function proxyImage"));
  const body = fn.slice(0, 2000);
  assert.ok(!/claude/i.test(body), "Claude не рисует — не должно быть в коде картинок");
  assert.ok(/Nano Banana|banana/.test(body + html.slice(html.indexOf("const IMG_PROXY"), html.indexOf("const IMG_PROXY") + 1500)));
});

console.log("5. 3D на месте");
t("3D-мастерская и режим Blender не пропали", () => {
  assert.ok(/3D-мастерская/.test(html), "мастерская есть");
  assert.ok(/id="makerBtn"/.test(html), "кнопка 3D есть");
  assert.ok(/blender: \{/.test(html), "режим Blender есть");
  assert.ok(/bpy/.test(html), "скрипт Blender упомянут");
});

console.log("6. Бесплатные движки честно слабые");
t("кап 768 px у свободного движка не притворяется качеством", () => {
  assert.ok(/const cap = 768;/.test(html), "потолок бесплатного движка на месте");
});

console.log("7. Свой ключ рисует напрямую, без сервера");
t("картинки идут своим ключом первыми", () => {
  const src = html.slice(html.indexOf("async function proxyImage"));
  const body = src.slice(0, 400);
  assert.ok(/if \(ownOpenRouterKey\(\)\) return ownKeyImage/.test(body),
    "свой ключ должен быть первым путём");
});
t("свой ключ берётся из настроек человека", () => {
  const src = html.slice(html.indexOf("function ownOpenRouterKey"));
  const body = src.slice(0, 500);
  assert.ok(/parseKeys\(settings\.apiKey\)/.test(body));
  assert.ok(/provider === "openrouter"/.test(body));
});
t("нет денег на своём ключе — честная причина", () => {
  const src = html.slice(html.indexOf("async function ownKeyImage"));
  const body = src.slice(0, 3000);
  assert.ok(/on the счёте|на счёте OpenRouter нет денег/.test(body) || /kind = "img-limit"/.test(body));
  assert.ok(/kind = "no-quality"/.test(body), "неизвестная модель — тоже не приговор");
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

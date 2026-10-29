/**
 * Тест генерации картинок:
 * плакат «Free limit reached» не выдаётся за картинку, лимит считается по-человечески,
 * а нормальный рисунок показывается как рисунок.
 *
 * Запуск: node tests/images.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
virtualConsole.on("error", (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
  }
});
const { window } = dom;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

window.HTMLCanvasElement.prototype.getContext = () => null;   // без нативного canvas в jsdom
window.Image = class {
  constructor() { this.naturalWidth = 1024; this.naturalHeight = 1024; }
  set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
  get src() { return this._src; }
};

let calls = [];
window.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push(u);
  if (u.includes("image.pollinations.ai")) {
    if (imageReply) return imageReply(u);
    throw new Error("offline image");
  }
  throw new Error("offline: " + u);
};

await wait(400);

const $ = (s) => window.document.querySelector(s);
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

let imageReply = null;
const pngOf = (bytes) => ({
  ok: true, status: 200,
  headers: { get: () => "image/png" },
  blob: async () => new window.Blob([new Uint8Array(bytes)], { type: "image/png" })
});
const limitRes = (retry) => ({
  ok: false, status: 402,
  headers: { get: (k) => (k.toLowerCase() === "retry-after" ? String(retry) : "application/json") },
  blob: async () => new window.Blob([])
});

/* Готовим «Pro»-режим и прямой движок Pollinations, без токена */
window.eval(`
  settings.edition = "pro";
  settings.imageEngine = "pollinations";
  settings.pollinationsToken = "";
  localStorage.removeItem("iskra.imgNextAt");
`);
// перевод промпта не ходит в сеть
window.toEnglishPrompt = async () => "a german shepherd dog lying on a sofa, warm light, photo";
const gen = (p) => window.eval(`generateImage(${JSON.stringify(p)})`);
const shown = () => !!$(".gen-img");
const text = () => $("#messages").textContent;

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("плакат-заглушка не выдаётся за картинку", async () => {
  imageReply = () => pngOf(9000);                    // лёгкий рекламный плакат
  await gen("овчарка на диване");
  await wait(60);
  assert(!shown(), "плакат показали как картинку");
  assert(/лимит/i.test(text()), "нет честного сообщения про лимит: " + text().slice(-160));
});

await test("402 с Retry-After превращается в понятный отсчёт", async () => {
  window.eval('localStorage.removeItem("iskra.imgNextAt")');
  imageReply = () => limitRes(30);
  await gen("кот на подоконнике");
  await wait(60);
  assert(!shown(), "при 402 показали картинку");
  assert(/30/.test(text()), "не показала время ожидания из Retry-After: " + text().slice(-200));
});

await test("нормальный рисунок показывается как рисунок", async () => {
  window.eval('localStorage.removeItem("iskra.imgNextAt")');
  imageReply = () => pngOf(220000);                  // настоящая картинка
  await gen("овчарка на диване");
  for (let i = 0; i < 50 && !shown(); i++) await wait(100);
  assert(shown(), "картинка не появилась: " + text().slice(-200));
  const src = $(".gen-img").getAttribute("src");
  assert(src && src.startsWith("data:"), "картинка не встроена в страницу: " + String(src).slice(0, 40));
});

await test("после удачной картинки лимит не прожигается второй раз", async () => {
  const before = calls.filter((u) => u.includes("image.pollinations.ai")).length;
  await gen("овчарка на диване");
  await wait(80);
  const after = calls.filter((u) => u.includes("image.pollinations.ai")).length;
  assert(after === before, "полезла в сервис повторно, хотя лимит ещё идёт (" + before + "→" + after + ")");
  assert(/лимит/i.test(text().slice(-400)), "не сказала про лимит");
});

console.log("\nГотово: " + passed + " проверок пройдено");
if (errors.length) { console.error("Ошибки JS:\n" + errors.join("\n")); process.exitCode = 1; }
process.exit(process.exitCode ? 1 : 0);

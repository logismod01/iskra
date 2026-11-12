/**
 * Раунд 25: региональные ограничения.
 *
 * Правило владельца:
 *   — полный запрет: Чили, Гондурас, Монголия, ОАЭ, Польша, Эстония, Албания,
 *     Люксембург, Новая Зеландия, Австралия, Ирландия, Исландия, Афганистан,
 *     Саудовская Аравия, Ватикан;
 *   — половина функций: вся Африка и Индия;
 *   — минус 75%: Греция;
 *   — Россия работает.
 *
 * Уровни: 0 — всё работает, 50 — нет картинок/видео/поиска,
 * 75 — только текстовый чат, 100 — сайт не открывается.
 *
 * Запуск: node tests/round25.test.mjs
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

console.log("round25: региональные ограничения");

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
    // Сеть «молчит»: страну не узнать — сайт должен работать как обычно
    win.fetch = async () => { throw new Error("offline"); };
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

/* ---------- 1. Уровни по странам ---------- */
await test("закрытые страны — полный запрет", async () => {
  const banned = ["CL","HN","MN","AE","PL","EE","AL","LU","NZ","AU","IE","IS","AF","SA","VA"];
  for (const c of banned) {
    assert(window.eval(`regionLevel("${c}")`) === 100, c + " не закрыта");
  }
});

await test("Африка и Индия — половина функций", async () => {
  const half = ["NG","EG","ZA","KE","MA","ET","GH","TZ","DZ","SN","IN"];
  for (const c of half) {
    assert(window.eval(`regionLevel("${c}")`) === 50, c + " получила не 50%");
  }
});

await test("Греция — минус 75%", async () => {
  assert(window.eval(`regionLevel("GR")`) === 75, "у Греции не 75%");
});

await test("Россия работает, и незнакомая страна тоже", async () => {
  assert(window.eval(`regionLevel("RU")`) === 0, "Россию случайно закрыли");
  assert(window.eval(`regionLevel("KZ")`) === 0, "Казахстан закрыт без причины");
  assert(window.eval(`regionLevel("")`) === 0, "без страны сайт закрылся");
  assert(window.eval(`regionLevel("ZZ")`) === 0, "неизвестная страна закрыта");
});

await test("уровень не зависит от регистра кода", async () => {
  assert(window.eval(`regionLevel("pl")`) === 100, "строчные буквы не распознаны");
});

/* ---------- 2. Что именно отключается ---------- */
await test("на 50% нет картинок, видео и поиска — чат работает", async () => {
  window.eval(`state.region = "IN"`);
  assert(window.eval(`regionAllowedFeature("картинки")`) === false, "картинки разрешены");
  assert(window.eval(`regionAllowedFeature("видео")`) === false, "видео разрешено");
  assert(window.eval(`regionAllowedFeature("поиск в интернете")`) === false, "поиск разрешён");
  assert(window.eval(`regionAllowedFeature("документы")`) === true, "документы зря отключены");
});

await test("на 75% остаётся только текстовый чат", async () => {
  window.eval(`state.region = "GR"`);
  assert(window.eval(`regionAllowedFeature("документы")`) === false, "документы работают в Греции");
  assert(window.eval(`regionAllowedFeature("база знаний")`) === false, "знания работают в Греции");
  assert(window.eval(`regionAllowedFeature("чат")`) === true, "чат зря отключён");
});

await test("в закрытой стране запрещено всё", async () => {
  window.eval(`state.region = "PL"`);
  assert(window.eval(`regionAllowedFeature("чат")`) === false, "в Польше работает чат");
});

/* ---------- 3. Экран вместо сайта ---------- */
await test("в закрытой стране показывается экран, а не чат", async () => {
  window.eval(`showRegionGate("PL")`);
  const gate = doc.getElementById("regionGate");
  assert(gate.hidden === false, "экран не показался");
  assert(/Польша/.test(doc.getElementById("regionTitle").textContent), "не назвала страну");
  assert(doc.documentElement.classList.contains("region-blocked"), "страница не помечена закрытой");
  window.eval(`hideRegionGate()`);
  assert(gate.hidden === true, "экран не убирается");
});

await test("отправка сообщения в закрытой стране не проходит", async () => {
  window.eval(`state.region = "AE"`);
  const before = window.eval(`Object.keys(chats).length`);
  await window.eval(`sendMessage("привет")`);
  assert(window.eval(`Object.keys(chats).length`) === before, "чат всё-таки начался");
});

await test("в частично ограниченной стране видна плашка", async () => {
  window.eval(`showRegionBanner("IN", 50)`);
  const banner = doc.getElementById("regionBanner");
  assert(banner.hidden === false, "плашки нет");
  const text = doc.getElementById("regionBannerText").textContent;
  assert(/Индия/.test(text), "не назвала страну");
  assert(/картинки/.test(text), "не сказала, что именно отключено");
  assert(/50%/.test(text), "не указала долю");
  banner.hidden = true;
});

/* ---------- 4. Сеть молчит — сайт работает ---------- */
await test("если страну не узнать, доступ не закрывается", async () => {
  const code = await window.eval(`regionCheck(true)`);
  assert(code === "", "страна всё-таки определилась при молчащей сети");
  assert(doc.getElementById("regionGate").hidden === true, "закрыла доступ без причины");
  assert(window.eval(`state.region`) === "", "состояние региона испорчено");
});

/* ---------- 5. Источники и кэш ---------- */
await test("страну спрашивают у нескольких сервисов по очереди", async () => {
  const block = html.slice(html.indexOf("const REGION_SOURCES"), html.indexOf("async function regionDetect"));
  const n = (block.match(/url: "https/g) || []).length;
  assert(n >= 3, "источников мало: " + n);
});

await test("ответ про страну запоминается на 12 часов", async () => {
  window.eval(`regionToCache({ country: "KZ", ipTz: "" })`);
  assert(window.eval(`regionFromCache().country`) === "KZ", "страна не запомнилась");
  window.localStorage.setItem(window.eval(`REGION_CACHE_KEY`), JSON.stringify({ country: "KZ", ipTz: "", at: Date.now() - 13 * 3600e3 }));
  assert(window.eval(`regionFromCache()`) === null, "старая запись не протухла");
  window.localStorage.removeItem(window.eval(`REGION_CACHE_KEY`));
});

/* ---------- 6. Версия ---------- */
await test("версия сайта и кэша — 1.30.0", async () => {
  assert(pkg.version === "1.30.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.30\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round25: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

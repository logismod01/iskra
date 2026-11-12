/**
 * Раунд 26: вход определяется и через VPN.
 *
 * Бесплатно узнать «это VPN» по списку адресов нельзя — такие базы платные
 * (у ipwho.is это прямо вынесено в платный тариф). Зато часовой пояс
 * на устройстве подделать сложнее, чем адрес: человек из закрытой страны
 * прячется за разрешённым IP, но его Windows/Android по-прежнему живёт
 * в Europe/Warsaw. Это и есть главный признак.
 *
 * Что проверяем:
 * 1) пояс устройства против страны IP — совпадает / не совпадает;
 * 2) при обходе страна берётся из пояса, а не из IP (Польша через Германию — блок);
 * 3) обратный случай: Россия через польский VPN остаётся Россией — доступ есть;
 * 4) неоднозначный пояс (Europe/Berlin = DE DK NO SE SJ) не блокирует зря;
 * 5) таблица поясов полная и без опечаток;
 * 6) экран объясняет, что страна определена по поясу;
 * 7) кэш v2 хранит и страну, и пояс;
 * 8) версия 1.28.0.
 *
 * Запуск: node tests/round26.test.mjs
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

console.log("round26: вход определяется и через VPN");

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
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

/* Подменяем часовой пояс «устройства» и считаем проверку */
const vpnFor = (tz, ipCountry, ipTz) => JSON.parse(
  window.eval(`JSON.stringify(regionVpnCheck(
    { country: ${JSON.stringify(ipCountry)}, ipTz: ${JSON.stringify(ipTz || "")} },
    false
  ))`)
);
const withTz = (tz, fn) => {
  const orig = window.Intl.DateTimeFormat;
  window.Intl.DateTimeFormat = function () {
    return { resolvedOptions: () => ({ timeZone: tz }) };
  };
  try { return fn(); } finally { window.Intl.DateTimeFormat = orig; }
};

/* ---------- 1. Таблица поясов ---------- */
await test("таблица поясов на месте и полная", async () => {
  const zones = window.eval(`Object.keys(TZ_COUNTRIES).length`);
  assert(zones >= 300, "зон мало: " + zones);
  assert(window.eval(`TZ_COUNTRIES["Europe/Warsaw"]`) === "PL", "Варшава не Польша");
  assert(window.eval(`TZ_COUNTRIES["Europe/Moscow"]`) === "RU", "Москва не Россия");
  assert(window.eval(`TZ_COUNTRIES["Asia/Kolkata"]`) === "IN", "Калькутта не Индия");
});

await test("старые названия поясов понимаются", async () => {
  assert(window.eval(`JSON.stringify(tzCountries("Asia/Calcutta"))`) === '["IN"]', "старое имя Индии не работает");
  assert(window.eval(`JSON.stringify(tzCountries("Europe/Kiev"))`) === '["UA"]', "старое имя Украины не работает");
});

await test("неизвестный пояс не ломает проверку", async () => {
  assert(window.eval(`JSON.stringify(tzCountries("Mars/Olympus"))`) === "[]", "выдуманный пояс что-то вернул");
});

/* ---------- 2. Совпадение ---------- */
await test("свой пояс и свой IP — VPN нет", async () => {
  const r = withTz("Europe/Warsaw", () => vpnFor("Europe/Warsaw", "PL", "Europe/Warsaw"));
  assert(r.vpn === false, "ложное срабатывание: " + JSON.stringify(r.reasons));
  assert(r.real === "", "зря подменила страну");
});

await test("многозначный пояс принимает любую свою страну", async () => {
  const r = withTz("Europe/Berlin", () => vpnFor("Europe/Berlin", "NO", "Europe/Berlin"));
  assert(r.vpn === false, "Норвегия в берлинском поясе сочлена VPN");
});

/* ---------- 3. Обход ---------- */
await test("Польша через немецкий VPN — всё равно Польша", async () => {
  const r = withTz("Europe/Warsaw", () => vpnFor("Europe/Warsaw", "DE", "Europe/Berlin"));
  assert(r.vpn === true, "обход не замечен");
  assert(r.real === "PL", "страна определена неверно: " + r.real);
  assert(window.eval(`regionLevel("${r.real}")`) === 100, "Польша не закрыта");
});

await test("Австралия через американский VPN — всё равно Австралия", async () => {
  const r = withTz("Australia/Sydney", () => vpnFor("Australia/Sydney", "US", "America/New_York"));
  assert(r.real === "AU", "Австралия не распознана: " + r.real);
});

await test("Индия через британский VPN — Индия, а не Британия", async () => {
  const r = withTz("Asia/Kolkata", () => vpnFor("Asia/Kolkata", "GB", "Europe/London"));
  assert(r.real === "IN", "Индия не распознана: " + r.real);
  assert(window.eval(`regionLevel("${r.real}")`) === 50, "у Индии не половина функций");
});

/* ---------- 4. Обратный случай: Россия через чужой VPN ---------- */
await test("Россия через польский VPN остаётся Россией", async () => {
  const r = withTz("Europe/Moscow", () => vpnFor("Europe/Moscow", "PL", "Europe/Warsaw"));
  assert(r.vpn === true, "VPN не замечен");
  assert(r.real === "RU", "Россию закрыли за VPN: " + r.real);
  assert(window.eval(`regionLevel("${r.real}")`) === 0, "из-за VPN Россия стала закрытой");
});

/* ---------- 5. Не блокировать зря ---------- */
await test("неоднозначный пояс не блокирует зря", async () => {
  // Europe/Berlin = DE DK NO SE SJ — все открыты, значит подменять страну нельзя
  const r = withTz("Europe/Berlin", () => vpnFor("Europe/Berlin", "US", "America/New_York"));
  assert(r.vpn === true, "признак обхода не найден");
  assert(r.real === "", "подменила страну на одну из пяти наугад: " + r.real);
});

await test("если сервис прямо сказал «VPN», признак тоже учитывается", async () => {
  const r = JSON.parse(window.eval(`JSON.stringify(regionVpnCheck({ country: "NL", ipTz: "" }, true))`));
  assert(r.vpn === true, "флаг сервиса проигнорирован");
  assert(r.reasons.includes("сервис"), "не записала причину");
});

await test("без страны IP ничего не выдумывает", async () => {
  const r = JSON.parse(window.eval(`JSON.stringify(regionVpnCheck({ country: "", ipTz: "" }, true))`));
  assert(r.vpn === false, "без данных назначила VPN");
  assert(r.real === "", "без данных назначила страну");
});

/* ---------- 6. Экран и кэш ---------- */
await test("экран объясняет, что страна определена по поясу", async () => {
  window.eval(`showRegionGate("PL", true)`);
  const text = doc.getElementById("regionText").textContent;
  assert(/через VPN/.test(text), "не сказала про VPN: " + text.slice(0, 60));
  assert(/часовому поясу/.test(text), "не объяснила, как определила");
  window.eval(`hideRegionGate()`);
  window.eval(`showRegionGate("CL", false)`);
  assert(!/через VPN/.test(doc.getElementById("regionText").textContent), "обычный текст испорчен");
  window.eval(`hideRegionGate()`);
});

await test("кэш хранит и страну, и пояс адреса", async () => {
  window.eval(`regionToCache({ country: "KZ", ipTz: "Asia/Almaty" })`);
  const got = JSON.parse(window.eval(`JSON.stringify(regionFromCache())`));
  assert(got.country === "KZ" && got.ipTz === "Asia/Almaty", "кэш потерял данные: " + JSON.stringify(got));
  window.localStorage.removeItem(window.eval(`REGION_CACHE_KEY`));
});

await test("проверка VPN идёт и для данных из кэша", async () => {
  assert(/vpn = regionVpnCheck\(info, false\)/.test(html), "из кэша VPN не проверяется");
});

/* ---------- 7. Версия ---------- */
await test("версия сайта и кэша — 1.28.0", async () => {
  assert(pkg.version === "1.28.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.28\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round26: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

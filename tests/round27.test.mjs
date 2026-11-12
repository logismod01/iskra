/**
 * Раунд 27: страна записывается в профиль один раз и навсегда.
 *
 * Идея: гость проверяется по адресу и часовому поясу при каждом входе, а у
 * зарегистрированного страна записана в профиль при создании аккаунта.
 * Дальше её не переписывает ни VPN, ни переезд, ни смена сети — поэтому
 * «спрятаться за VPN» после регистрации нельзя в принципе.
 *
 * Что проверяем:
 * 1) страну для профиля берём по поясу устройства, а не по адресу;
 * 2) многозначный пояс (Europe/Berlin) — не выдумываем страну;
 * 3) в аккаунт пишется один раз и больше не меняется;
 * 4) это видно человеку: окно входа, «Готово», меню профиля, «Мой аккаунт»;
 * 5) из закрытой по профилю страны есть выход — «Выйти из аккаунта»;
 * 6) после выхода сайт снова работает как гость;
 * 7) страна уходит и в Supabase (метаданные пользователя);
 * 8) старым аккаунтам страна дописывается при первом входе;
 * 9) версия 1.29.0.
 *
 * Запуск: node tests/round27.test.mjs
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");

console.log("round27: страна в профиле — один раз и навсегда");

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

const origIntl = window.Intl.DateTimeFormat;
const setTz = (tz) => {
  window.Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ timeZone: tz }) }; };
};
const resetTz = () => { window.Intl.DateTimeFormat = origIntl; };

const fresh = () => {
  window.eval(`localStorage.removeItem("iskra.accounts.v1"); localStorage.removeItem("iskra.session.v1");`);
  window.eval(`state.region = ""; state.regionIp = ""; state.regionVpn = false;`);
  window.eval(`hideRegionGate()`);
};

/* ---------- 1. Как выбирается страна ---------- */
await test("страну для профиля берём по поясу, а не по адресу", async () => {
  setTz("Europe/Warsaw");
  window.eval(`state.region = "DE"; state.regionIp = "DE";`);
  const now = JSON.parse(window.eval(`JSON.stringify(regionCountryNow())`));
  assert(now.code === "PL", "взяла адрес вместо пояса: " + now.code);
  assert(now.src === "tz", "не записала, откуда страна: " + now.src);
  resetTz();
});

await test("многозначный пояс страну не выдумывает", async () => {
  setTz("Europe/Berlin");
  window.eval(`state.region = "DE"; state.regionIp = "DE";`);
  const now = JSON.parse(window.eval(`JSON.stringify(regionCountryNow())`));
  assert(now.code === "DE", "взяла одну из пяти стран наугад: " + now.code);
  resetTz();
  window.eval(`state.region = ""; state.regionIp = "";`);
});

await test("флаг и название страны по-русски", async () => {
  assert(window.eval(`regionFlag("PL")`) === "🇵🇱", "флаг Польши не тот");
  assert(window.eval(`regionFlag("")`) === "🌍", "без страны нет значка");
  assert(window.eval(`regionCountryName("IN")`) === "Индия", "Индия названа неверно");
  assert(window.eval(`regionCountryName("PL")`) === "Польша", "Польша названа неверно");
  assert(window.eval(`regionCountryName("JP")`).length > 0, "незнакомая страна осталась без названия");
});

await test("что доступно в стране — коротко и понятно", async () => {
  assert(window.eval(`regionStatusText("RU")`) === "доступно всё", "Россия не «всё»");
  assert(window.eval(`regionStatusText("PL")`) === "доступ закрыт", "Польша не закрыта");
  assert(window.eval(`regionStatusText("IN")`) === "доступна половина функций", "Индия не половина");
  assert(window.eval(`regionStatusText("GR")`) === "доступна четверть функций", "Греция не четверть");
});

/* ---------- 2. Запись в аккаунт ---------- */
await test("страна пишется в аккаунт при создании", async () => {
  fresh();
  setTz("Europe/Warsaw");
  const acc = window.eval(`authCreate({ method: "pass", name: "Пётр", email: "p@mail.ru" })`);
  assert(acc.country === "PL", "страна не записалась: " + acc.country);
  assert(acc.countrySrc === "tz", "не записала способ: " + acc.countrySrc);
  assert(acc.countryAt > 0, "не записала дату");
  resetTz();
});

await test("страна больше не меняется — ни VPN, ни переездом", async () => {
  fresh();
  setTz("Europe/Warsaw");
  const acc = window.eval(`authCreate({ method: "pass", name: "Анна", email: "a@mail.ru" })`);
  assert(acc.country === "PL", "начальная страна не та");
  setTz("America/New_York");
  window.eval(`regionRecordProfile(currentAccount())`);
  window.eval(`regionAdoptProfile()`);
  assert(window.eval(`currentAccount().country`) === "PL", "страну переписали");
  resetTz();
});

await test("старым аккаунтам страна дописывается при первом входе", async () => {
  fresh();
  window.eval(`localStorage.setItem("iskra.accounts.v1", JSON.stringify([{ id: "u_old", method: "email", name: "Старый", email: "old@mail.ru", country: "", created: Date.now() }]))`);
  window.eval(`localStorage.setItem("iskra.session.v1", JSON.stringify({ id: "u_old", ts: Date.now() }))`);
  window.eval(`state.region = ""; state.regionIp = "";`);
  setTz("Europe/Moscow");
  await window.eval(`regionCheck(true)`);
  assert(window.eval(`currentAccount().country`) === "RU", "страна не дописалась: " + window.eval(`currentAccount().country`));
  resetTz();
});

/* ---------- 3. Ограничения по профилю ---------- */
await test("закрытая по профилю страна закрывает сайт", async () => {
  fresh();
  setTz("Europe/Warsaw");
  window.eval(`authCreate({ method: "pass", name: "Олег", email: "o@mail.ru" })`);
  const code = await window.eval(`regionCheck(true)`);
  assert(code === "PL", "проверка вернула не профиль: " + code);
  assert(doc.getElementById("regionGate").hidden === false, "экран блокировки не показан");
  assert(/профил/i.test(doc.getElementById("regionText").textContent), "не объяснила, что дело в профиле");
  resetTz();
});

await test("из закрытой по профилю страны есть выход", async () => {
  const out = doc.getElementById("regionLogout");
  const retry = doc.getElementById("regionRetry");
  assert(out && out.hidden === false, "нет кнопки «Выйти из аккаунта» — человек заперт");
  assert(retry.hidden === true, "предлагает проверить снова, а это ничего не изменит");
});

await test("выход из аккаунта возвращает обычную проверку", async () => {
  window.eval(`authSetSession(null)`);
  await wait(120);
  assert(doc.getElementById("regionGate").hidden === true, "после выхода экран остался");
  assert(window.eval(`currentAccount()`) === null, "аккаунт не отключился");
  assert(window.eval(`document.getElementById("regionRetry").hidden`) === false, "кнопка проверки не вернулась");
  assert(window.eval(`document.getElementById("regionLogout").hidden`) === true, "кнопка выхода осталась на экране гостя");
});

await test("в профиле у закрытой страны — плашка, а не экран", async () => {
  fresh();
  window.eval(`localStorage.setItem("iskra.accounts.v1", JSON.stringify([{ id: "u_in", method: "email", name: "Индиец", email: "in@mail.ru", country: "IN", countryAt: Date.now(), countrySrc: "tz" }]))`);
  window.eval(`localStorage.setItem("iskra.session.v1", JSON.stringify({ id: "u_in", ts: Date.now() }))`);
  await window.eval(`regionCheck(true)`);
  assert(doc.getElementById("regionGate").hidden === true, "Индию закрыла целиком");
  const banner = doc.getElementById("regionBanner");
  assert(banner.hidden === false, "плашки нет");
  const text = doc.getElementById("regionBannerText").textContent;
  assert(/Индия/.test(text), "не назвала страну");
  assert(/профил/i.test(text), "не сказала, что это из профиля");
  banner.hidden = true;
  fresh();
});

/* ---------- 4. Видно человеку ---------- */
await test("в окне входа страна показана до создания аккаунта", async () => {
  fresh();
  setTz("Europe/Warsaw");
  window.eval(`state.region = "PL"`);
  window.eval(`openAuth()`);
  const box = doc.getElementById("authRegion");
  assert(box && box.hidden === false, "строчки про страну нет");
  assert(/Польша/.test(doc.getElementById("authRegionName").textContent), "страна не названа: " + doc.getElementById("authRegionName").textContent);
  assert(/навсегда/.test(doc.getElementById("authRegionHint").textContent), "не предупредила, что навсегда");
  window.eval(`closeAuth()`);
  resetTz();
  window.eval(`state.region = ""`);
});

await test("на экране «Готово» страна тоже видна", async () => {
  fresh();
  setTz("Europe/Warsaw");
  window.eval(`authCreate({ method: "email", name: "Готов", email: "g@mail.ru" })`);
  window.eval(`authAfterSignup(currentAccount(), false)`);
  resetTz();
  const box = doc.getElementById("authDoneRegion");
  assert(box.hidden === false, "строчки нет");
  assert(/Польша|страна/i.test(doc.getElementById("authDoneRegionName").textContent), "не показала страну");
  window.eval(`closeAuth()`);
});

await test("в меню профиля — флажок и страна", async () => {
  window.eval(`renderProfile()`);
  const menu = doc.getElementById("profileMenu");
  assert(/🇵🇱/.test(menu.innerHTML) || /Польша/.test(menu.innerHTML), "в меню нет страны");
});

await test("в «Моём аккаунте» есть паспорт страны", async () => {
  window.eval(`openAccountPanel()`);
  const body = doc.getElementById("acctBody").textContent;
  assert(/Страна/.test(body), "нет раздела про страну");
  assert(/Польша/.test(body), "не назвала страну");
  assert(/один раз|не меняется/i.test(body), "не сказала, что страна записывается один раз");
  assert(/часовому поясу|адресу/.test(body), "не сказала, как определили");
});

/* ---------- 5. Сервер и мелочи ---------- */
await test("страна уходит и в Supabase", async () => {
  assert(/async function sbSetUserCountry/.test(html), "нет отправки страны на сервер");
  assert(/data: \{ country:/.test(html), "в запросах регистрации нет страны");
});

await test("выход не теряет страну в аккаунте", async () => {
  window.eval(`authSetSession(null)`);
  await wait(80);
  const raw = window.eval(`JSON.parse(localStorage.getItem("iskra.accounts.v1") || "[]")`);
  assert(raw.length && raw[0].country === "PL", "страна стёрлась из аккаунта: " + JSON.stringify(raw.map(a => a.country)));
  fresh();
});

/* ---------- 6. Версия ---------- */
await test("версия сайта и кэша — 1.29.0", async () => {
  assert(pkg.version === "1.29.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.29\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round27: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

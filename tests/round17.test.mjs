/**
 * Раунд 17: вид, маскот и честные ошибки.
 *
 * 1) Сайт: компактный вид и выключатель анимаций — переключатели в настройках,
 *    классы на <html>, правила в css. Оба значения живут в настройках и не теряются.
 * 2) Сайт: ошибка проверки доступа больше не проглатывается пустым catch —
 *    причина видна и в тосте, и в панели доступа.
 * 3) Sye: маскот Сью (рыжий, спокойный) в шапке, на стартовом экране и в окне входа.
 * 4) Sye: те же переключатели вида + отдельные сообщения на «нет связи»,
 *    «сервер не настроен» и «пароль не подошёл».
 *
 * Запуск: node tests/round17.test.mjs
 */
import fs from "node:fs";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const agentHtml = read("agent/renderer/index.html");
const agentApp = read("agent/renderer/app.js");
const agentCss = read("agent/renderer/styles.css");
const keysJs = read("agent/core/keys.js");
const accountJs = read("agent/core/account.js");
const brandJs = read("agent/core/brand.js");
const mainJs = read("agent/main.js");
const pkg = JSON.parse(read("package.json"));

console.log("round17: вид, маскот и честные ошибки");

/* ---------- Сайт: компактность и анимации ---------- */
await test("в настройках по умолчанию есть compact и animations", async () => {
  assert(/compact:\s*false/.test(html), "нет compact:false в настройках по умолчанию");
  assert(/animations:\s*true/.test(html), "нет animations:true в настройках по умолчанию");
});

await test("старые настройки чинятся при запуске", async () => {
  assert(/typeof settings\.compact !== "boolean"/.test(html), "нет миграции compact");
  assert(/typeof settings\.animations !== "boolean"/.test(html), "нет миграции animations");
});

await test("applyLook ставит классы compact и no-anim на <html>", async () => {
  assert(/function applyLook\(\)/.test(html), "нет функции applyLook");
  assert(/classList\.toggle\("compact", settings\.compact === true\)/.test(html), "нет переключения compact");
  assert(/classList\.toggle\("no-anim", settings\.animations === false\)/.test(html), "нет переключения no-anim");
});

await test("правила компактного вида и выключения анимаций есть в css", async () => {
  assert(html.includes("html.compact .messages"), "нет правил компактного вида");
  assert(html.includes("html.no-anim *"), "нет правил выключения анимаций");
});

await test("переключатели в панели «Вид» присутствуют и подключены", async () => {
  assert(html.includes('id="compactToggle"'), "нет переключателя компактности");
  assert(html.includes('id="animToggle"'), "нет переключателя анимаций");
  assert(/wireLookControls/.test(html), "переключатели не подключены");
  assert(/applyLook\(\);\n  \$\("#webBtn"\)/.test(html) || /applyTheme\(settings\.theme\);\n  applyLook\(\);/.test(html),
    "вид не применяется при запуске");
});

/* ---------- Сайт: ошибки не проглатываются ---------- */
await test("проверка доступа не молчит при ошибке", async () => {
  assert(html.includes("let accessProblem"), "нет переменной accessProblem");
  assert(/accessProblem = sbMissingFunction\(e\)/.test(html), "нет разбора «сервер не настроен»");
  assert(!/\} catch \(e\) \{\}\n\}\n\n\/\* ---------- Экран «Доступ по ключу»/.test(html),
    "пустой catch в syncAccess остался");
});

await test("причина видна в панели доступа", async () => {
  assert(/accessProblem \? `<div class="acct-note"/.test(html), "панель не показывает причину");
});

/* ---------- Маскот ---------- */
await test("маскот Сью есть в сайте и в агенте", async () => {
  const check = (src, name) => {
    assert(src.includes("sye-mascot"), name + ": нет svg маскота");
    assert(src.includes("sye-eye"), name + ": нет глаз");
    assert(src.includes("sye-tuft"), name + ": нет хохолка");
  };
  check(html, "сайт");
  check(agentHtml, "агент");
  assert(agentApp.includes("sye-mascot"), "агент: стартовый экран без маскота");
});

await test("у маскота есть состояния и он не мешает движению", async () => {
  assert(html.includes('.sye-wrap[data-mood="work"]'), "сайт: нет состояния «работает»");
  assert(agentApp.includes('mascotMood(on ? "work" : "idle")'), "агент: маскот не реагирует на задачу");
  assert(agentApp.includes('mascotMood("error")'), "агент: маскот не реагирует на ошибку");
  assert(agentCss.includes("prefers-reduced-motion"), "агент: нет уважения к «уменьшить движение»");
});

/* ---------- Агент: вид ---------- */
await test("в агенте те же переключатели вида", async () => {
  assert(agentHtml.includes('id="compactToggle"'), "нет переключателя компактности");
  assert(agentHtml.includes('id="animToggle"'), "нет переключателя анимаций");
  assert(/function applyLook\(\)/.test(agentApp), "нет applyLook");
  assert(/saveSettings\(\{ compact: !!cp\.checked \}\)/.test(agentApp), "компактность не сохраняется");
  assert(/saveSettings\(\{ animations: !!an\.checked \}\)/.test(agentApp), "анимации не сохраняются");
  assert(/compact:\s*false/.test(mainJs) && /animations:\s*true/.test(mainJs), "нет значений по умолчанию");
});

/* ---------- Агент: понятные ошибки ---------- */
await test("«функции нет в базе» отличается от «нет интернета»", async () => {
  assert(/function isMissingFunction/.test(keysJs), "нет определения isMissingFunction");
  assert(/isMissingFunction/.test(keysJs.split("module.exports")[1]), "не экспортируется");
  assert(/isMissingFunction\(e\)/.test(accountJs), "аккаунт не различает причину");
  assert(/нет функций доступа/.test(accountJs), "нет человеческого текста про sql");
  assert(/за 12 секунд/.test(accountJs), "таймаут не объясняется");
});

await test("про пароль сказано, что его может не быть вовсе", async () => {
  assert(/«Войти по коду из письма»/.test(accountJs), "нет подсказки про вход кодом");
});

/* ---------- Версии ---------- */
await test("версии подняты", async () => {
  assert(pkg.version === "1.16.0", "версия сайта: " + pkg.version);
  assert(/version:\s*"0\.4\.5"/.test(brandJs), "версия Sye не 0.4.5");
});

await test("новый тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round17.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round17: " + passed + " проверок пройдено");

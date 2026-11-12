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
  assert(/compact:\s*true/.test(html), "нет compact:true в настройках по умолчанию");
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

await test("вид действительно включается в живом окне", async () => {
  const boot = async (saved) => {
    const vc = new VirtualConsole();
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
        if (saved) win.localStorage.setItem("iskra.settings.v1", JSON.stringify(saved));
      }
    });
    await new Promise((r) => setTimeout(r, 700));
    const doc = dom.window.document;
    const html_cls = doc.documentElement.classList;
    const stored = JSON.parse(dom.window.localStorage.getItem("iskra.settings.v1") || "{}");
    const res = { compact: html_cls.contains("compact"), noAnim: html_cls.contains("no-anim"), stored, doc };
    dom.window.close();
    return res;
  };

  const plain = await boot(null);
  assert(plain.compact, "свежие настройки должны открываться в компактном виде");
  assert(!plain.noAnim, "анимации по умолчанию включены");

  const old = await boot({ theme: "claude" });
  assert(old.stored.compact === true, "старые настройки должны получить compact=true");
  assert(old.stored.animations === true, "старые настройки должны получить animations=true");

  const tight = await boot({ theme: "claude", compact: true, animations: false });
  assert(tight.compact, "компактный вид не включился");
  assert(tight.noAnim, "выключение анимаций не сработало");

  /* щёлкаем переключатели в открытых настройках */
  const vc = new VirtualConsole();
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
    }
  });
  await new Promise((r) => setTimeout(r, 700));
  const win = dom.window;
  const doc = win.document;
  win.openSettings("look");
  const cp = doc.getElementById("compactToggle");
  const an = doc.getElementById("animToggle");
  assert(cp && an, "переключатели не нашлись в настройках после открытия");
  assert(cp.checked && an.checked, "переключатели не отражают настройки по умолчанию");

  cp.checked = true; cp.dispatchEvent(new win.Event("change"));
  an.checked = false; an.dispatchEvent(new win.Event("change"));
  await new Promise((r) => setTimeout(r, 50));

  assert(doc.documentElement.classList.contains("compact"), "щёлкнутый переключатель не включил компактный вид");
  assert(doc.documentElement.classList.contains("no-anim"), "щёлкнутый переключатель не выключил анимации");
  const savedNow = JSON.parse(win.localStorage.getItem("iskra.settings.v1") || "{}");
  assert(savedNow.compact === true && savedNow.animations === false, "выбор вида не сохранился: " + JSON.stringify({ c: savedNow.compact, a: savedNow.animations }));

  cp.checked = false; cp.dispatchEvent(new win.Event("change"));
  an.checked = true; an.dispatchEvent(new win.Event("change"));
  await new Promise((r) => setTimeout(r, 50));
  assert(!doc.documentElement.classList.contains("compact"), "компактный вид не выключился");
  assert(!doc.documentElement.classList.contains("no-anim"), "анимации не вернулись");
  win.close();
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

await test("проверка «сервер готов?» тоже не молчит", async () => {
  const block = html.slice(html.indexOf("async function accessServerReady"));
  const cut = block.slice(0, block.indexOf("\n}\n"));
  assert(!/catch \(e\) \{ _accessServer = false; \}/.test(cut), "в проверке сервера остался молчащий catch");
  assert(/accessProblem = sbMissingFunction\(e\)/.test(cut), "нет объяснения «sql не выполнен»");
  assert(/Ключи, уже сохранённые в браузере, продолжают работать/.test(cut), "не сказано, что ключи не сломались");
});

await test("три беды в агенте — три разных ответа", async () => {
  const src = read("agent/core/account.js");
  assert(/Нет связи с сервером Искры/.test(src), "нет ответа про интернет");
  assert(/не ответил за 12 секунд/.test(src), "нет ответа про таймаут");
  assert(/в базе нет функций доступа/.test(src), "нет ответа про не выполненный sql");
  assert(/fetch failed/.test(src), "не распознаётся сетевой сбой node (fetch failed)");
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

await test("account.access объясняет причину, а не «ничего не произошло»", async () => {
  const { createAccount } = await import("../agent/core/account.js");
  const st = { email: "a@b.ru", userId: "u1", client: "123456-abc123-slovo", accessToken: "tok", refreshToken: "r", tokenAt: Date.now() };
  const mk = (fetchAccess) => createAccount({ read: () => st, write: () => {}, fetchAccess });

  const noSql = await mk(async () => {
    const e = new Error("Could not find the function public.iskra_access(p_client) in the schema cache");
    e.code = "PGRST202";
    throw e;
  }).access();
  assert(!noSql.ok && /нет функций доступа/.test(noSql.msg), "не распознан не выполненный sql: " + noSql.msg);

  const timeout = await mk(async () => {
    const e = new Error("The operation was aborted");
    e.name = "AbortError";
    throw e;
  }).access();
  assert(/12 секунд/.test(timeout.msg), "таймаут не объяснён: " + timeout.msg);

  const offline = await mk(async () => { throw new TypeError("fetch failed"); }).access();
  assert(/Нет связи с сервером Искры/.test(offline.msg), "сетевой сбой не объяснён: " + offline.msg);

  const live = await mk(async () => ({ ok: true, active: true, forever: false, expiresAt: Date.now() + 86400000, plan: "month" })).access();
  assert(live.ok && live.active, "живой ключ не распознан");
});

/* ---------- Версии ---------- */
await test("версии подняты", async () => {
  assert(pkg.version === "1.26.0", "версия сайта: " + pkg.version);
  assert(/version:\s*"0\.7\.0"/.test(brandJs), "версия Sye не 0.7.0");
});

await test("новый тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round17.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round17: " + passed + " проверок пройдено");
/* jsdom держит таймеры — закрываемся сами, иначе npm test висит */
setTimeout(() => process.exit(process.exitCode || 0), 50);

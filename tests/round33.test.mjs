/**
 * Раунд 33: скорость, шесть маскотов и вся база у агента (1.41.0 / Sye 0.11.0).
 *
 * Что было не так:
 *   1) окно тормозило: в потоке ответа каждый кусочек текста перерисовывал
 *      всю ленту, а в списке чатов висело всё сразу;
 *   2) маскот был один — Сью, и картинка лежала в разметке шесть раз;
 *   3) агент забирал из общей базы только 500 тем из 1356: остальные
 *      до него просто не доезжали.
 *
 * Запуск: node tests/round33.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM, VirtualConsole } from "jsdom";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const agentPkg = JSON.parse(read("agent/package.json"));
const agentMain = read("agent/main.js");
const agentHtml = read("agent/renderer/index.html");
const agentApp = read("agent/renderer/app.js");
const agentPreload = read("agent/preload.js");
const petJs = read("agent/renderer/pet.js");

const require_ = createRequire(import.meta.url);
const mascots = require_("../agent/core/mascots.js");
const shared = require_("../agent/core/shared.js");

console.log("round33: скорость, маскоты, вся база — " + pkg.version);

/* ---------- 1. Скорость сайта ---------- */
await test("поток ответа не перерисовывает ленту на каждый кусочек", async () => {
  assert(/function paintStream\(/.test(html), "нет отложенной отрисовки потока");
  assert(/function paintStreamNow\(/.test(html), "нет немедленной отрисовки (нужна в конце)");
  /* onDelta обязан копить текст и звать отрисовку не чаще, чем раз в интервал */
  const idx = html.indexOf("const onDelta = (delta)");
  assert(idx > 0, "нет обработчика потока");
  const body = html.slice(idx, idx + 400);
  assert(/paintStream\(/.test(body), "onDelta не использует отложенную отрисовку");
  assert(!/innerHTML\s*=\s*renderMarkdown/.test(body), "onDelta снова собирает весь markdown");
});

await test("в списке сообщений рисуется хвост, а не всё сразу", async () => {
  assert(/msgRenderLimit/.test(html), "нет ограничения числа сообщений в DOM");
  assert(/msg-more/.test(html), "нет кнопки «показать раньше»");
});

await test("копирование кода — один обработчик, а не на каждую кнопку", async () => {
  assert(/closest\(["'][^"']*copy/i.test(html), "копирование не делегировано");
  assert(!/querySelectorAll\(["']\.copy-btn["']\)/.test(html), "осталась привязка кнопок по одной");
});

await test("лёгкий режим выключает тяжёлые эффекты", async () => {
  assert(/html\.perf/.test(html), "нет класса perf");
  assert(/function liteModeOn\(/.test(html), "нет решения о лёгком режиме");
  assert(/function deviceLooksWeak\(/.test(html), "не учитывается слабое устройство");
  assert(/id="liteSelect"/.test(html), "нет переключателя скорости");
  assert(/backdrop-filter:\s*none/.test(html), "perf не убирает размытие");
});

/* ---------- 2. Маскоты на сайте ---------- */
await test("на сайте шесть маскотов с именами", async () => {
  const ids = ["spark", "sye", "ember", "ray", "pixel", "owl"];
  for (const id of ids) assert(new RegExp("\\b" + id + ":\\s*\\{").test(html), "нет маскота " + id);
  assert(/const MASCOT_ORDER = \["spark", "sye", "ember", "ray", "pixel", "owl"\]/.test(html), "порядок маскотов другой");
  for (const name of ["Искра", "Сью", "Уголёк", "Лучик", "Пиксель", "Сова Глаша"]) {
    assert(html.includes('"' + name + '"'), "нет имени " + name);
  }
  assert(/function setMascot\(/.test(html), "маскота нельзя выбрать");
  assert(/settings\.mascot/.test(html), "выбор не сохраняется");
});

/* ---------- 3. Маскоты у агента: тот же набор ---------- */
await test("у агента те же шесть маскотов и те же имена", async () => {
  const site = [...html.matchAll(/(\w+):\s*\{\s*name:\s*"([^"]+)"/g)]
    .filter((m) => ["spark", "sye", "ember", "ray", "pixel", "owl"].includes(m[1]))
    .map((m) => m[1] + "=" + m[2]);
  const agent = mascots.ORDER.map((id) => id + "=" + mascots.name(id));
  assert(site.length === 6, "на сайте не шесть имён: " + site.join(", "));
  assert(site.join("|") === agent.join("|"), "имена разошлись:\n  сайт: " + site.join(", ") + "\n  агент: " + agent.join(", "));
});

await test("картинка маскота у агента лежит в одном месте", async () => {
  const copies = (agentHtml.match(/class="sye-mascot"/g) || []).length;
  assert(copies === 0, "в разметке остались вкопированные картинки: " + copies);
  assert(/function paintMascots\(/.test(agentApp), "нет функции, которая расставляет маскота");
  assert(agentHtml.includes('id="mascotGrid"'), "в настройках нет выбора маскота");
  assert(/paintMascotGrid/.test(agentApp), "сетка выбора не рисуется");
});

await test("выбор маскота доходит до рабочего стола", async () => {
  assert(/DEFAULT_SETTINGS[\s\S]{0,1200}mascot:\s*"sye"/.test(agentMain), "нет маскота по умолчанию");
  assert(/mascots\.has\(p\.mascot\)/.test(agentMain), "неизвестный маскот не отсекается");
  assert(/pet:mascot-info/.test(agentMain) && /petMascot/.test(agentPreload), "окно на столе не спросит маскота");
  assert(/onPetMascot/.test(petJs), "смена маскота не доходит до рабочего стола");
});

await test("неизвестный маскот не роняет окно", async () => {
  assert(mascots.name("нет-такого") === "Искра", "на неизвестном id нет запасного маскота");
  assert(mascots.svg("нет-такого").length > 50, "у запасного маскота нет картинки");
  assert(mascots.all().length === 6, "в наборе не шесть маскотов");
});

/* ---------- 4. Агент видит всю базу ---------- */
await test("агент забирает всю базу, а не первые 500 тем", async () => {
  const rows = Array.from({ length: 2345 }, (_, i) => ({
    topic: "Тема " + (i + 1),
    body: "Текст темы номер " + (i + 1) + ", достаточно длинный для базы",
    tags: "учёба"
  }));
  let pages = 0;
  const fake = async (url) => {
    pages++;
    const u = new URL(url);
    const off = Number(u.searchParams.get("offset"));
    const lim = Number(u.searchParams.get("limit"));
    return { ok: true, status: 200, json: async () => rows.slice(off, off + lim) };
  };
  shared.reset();
  const got = await shared.refresh({ fetchImpl: fake, force: true });
  assert(got.length === 2345, "забрано " + got.length + " из 2345");
  assert(pages >= 3, "запрос ушёл одной страницей: " + pages);
  assert(shared.search("Тема 2344", 1)[0].topic === "Тема 2344", "последняя тема не находится");
});

await test("если сервер молчит, старые темы не стираются", async () => {
  shared.reset();
  shared.setItems([{ topic: "Смеситель", body: "Перекрыть воду и заменить прокладку в кране, потом проверить.", tags: "ремонт" }]);
  const before = shared.list().length;
  const broken = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const got = await shared.refresh({ fetchImpl: broken, force: true });
  assert(got.length === before, "ошибка сервера стёрла базу: было " + before + ", стало " + got.length);
  assert(shared.error().includes("503"), "ошибка не запомнена: " + shared.error());
});

await test("тема из общей базы попадает в промпт агента", async () => {
  shared.reset();
  shared.setItems([
    { topic: "Смеситель течёт", body: "Сначала перекрыть вентиль. Потом разобрать кран и заменить прокладку.", tags: "ремонт" },
    { topic: "Стихи Пушкина", body: "Евгений Онегин написан строфой из 14 строк, роман в стихах.", tags: "литература" }
  ]);
  assert(shared.search("течёт смеситель", 1)[0].topic === "Смеситель течёт", "поиск не нашёл тему");
  assert(shared.search("стихи Пушкина", 1)[0].topic === "Стихи Пушкина", "поиск путает темы");
  assert(/прокладку/.test(shared.promptBlock("у меня течёт смеситель", 1200)), "тема не попала в промпт");
  shared.reset();
});


/* ---------- 6. Старт страницы ---------- */
await test("база знаний не разбирается при загрузке", async () => {
  assert(/<script type="application\/json" id="kbPack">/.test(html), "база снова лежит обычным скриптом");
  assert(/function kbPack\(/.test(html), "нет ленивого разбора базы");
  assert(/Object\.defineProperty\(window, "KNOWLEDGE_PACK"/.test(html), "KNOWLEDGE_PACK больше не подменяется лениво");
  /* сам JSON должен быть валидным — иначе разбор молча вернёт пустоту */
  const m = html.match(/<script type="application\/json" id="kbPack">([\s\S]*?)<\/script>/);
  assert(m, "JSON-блок базы не найден");
  const pack = JSON.parse(m[1]);
  assert(pack.items.length > 700, "в базе меньше 700 тем: " + pack.items.length);
});

await test("вечные анимации не крутятся постоянно", async () => {
  assert(!/\.brand-logo[^{]*\{[^}]*animation:\s*gradShift 7s ease infinite/.test(html), "логотип снова переливается вечно");
  assert(/html\.quiet \.ambient/.test(html), "нет тихого режима для фона");
  assert(/function quietWake\(/.test(html), "нет пробуждения из тихого режима");
  assert(/visibilitychange/.test(html), "скрытая вкладка не переводит сайт в тихий режим");
  assert(/QUIET_IDLE/.test(html), "нет времени до тихого режима");
});

await test("тихий режим не срабатывает на каждое движение мыши", async () => {
  assert(/QUIET_STEP/.test(html), "движение мыши переставляет таймер без ограничения");
});


/* ---------- 7. Память и обновление у агента ---------- */
await test("агент помнит, что делал в этой папке", async () => {
  assert(agentHtml.includes('id="memList"'), "в настройках нет раздела памяти");
  assert(/function renderMemory\(/.test(agentApp), "память не показывается");
  assert(/memory\.promptBlock/.test(agentMain) || /memory\.promptBlock/.test(read("agent/core/agent.js")),
    "память не попадает в промпт");
  assert(/memory\.remember\(/.test(agentMain), "задачи не записываются в память");
  assert(/memory\.setDir\(USER_DIR\)/.test(agentMain), "память не сохраняется между запусками");
});

await test("память можно стереть, и она не уходит в сеть", async () => {
  assert(/memory:forget/.test(agentMain), "нет канала очистки памяти");
  assert(agentHtml.includes('id="memForgetAllBtn"'), "нет кнопки «забыть всё»");
  const mem = read("agent/core/memory.js");
  assert(!/fetch\(|https?:\/\//.test(mem), "память ходит в сеть");
});

await test("«повторить» подставляет задачу, но не запускает её сама", async () => {
  assert(/memorySimilar|memory:similar/.test(agentMain), "нет поиска похожей задачи");
  assert(/Повторить/.test(agentApp), "нет кнопки «Повторить»");
  /* подставленная задача попадает в поле ввода, а отправляет её человек */
  const i = agentApp.indexOf("function renderMemory");
  const body = agentApp.slice(i, i + 2600);
  assert(/input\.value\s*=\s*it\.task/.test(body), "задача не подставляется в поле ввода");
  assert(!/startTask\(/.test(body), "память запускает задачу сама");
});

await test("обновление проверяется, но не ставится само", async () => {
  assert(/update:check/.test(agentMain), "нет проверки обновлений");
  assert(agentApp.includes('id="updCheckBtn"') || agentApp.includes("updCheckBtn"), "нет кнопки проверки");
  assert(read("agent/core/version.js").includes("isNewer"), "нет сравнения версий");
  assert(!/autoUpdater|electron-updater/.test(agentMain), "появилось авто-обновление без спроса");
});

await test("версии агента совпадают в трёх местах", async () => {
  const brand = read("agent/core/brand.js");
  const info = JSON.parse(read("agent-version.json"));
  const v = (brand.match(/version:\s*"([^"]+)"/) || [])[1];
  assert(v, "в brand.js нет версии");
  assert(v === agentPkg.version, "brand.js и package.json разошлись: " + v + " / " + agentPkg.version);
  assert(v === info.version, "agent-version.json отстал: " + info.version + " вместо " + v);
});

/* ---------- 5. Версии ---------- */
await test("версии подняты", async () => {
  assert(pkg.version === "1.54.0", "версия сайта: " + pkg.version);
  assert(agentPkg.version === "0.11.0", "версия агента: " + agentPkg.version);
});

if (!process.exitCode) console.log("round33: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

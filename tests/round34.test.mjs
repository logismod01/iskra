/**
 * Раунд 34: цвет маскотов, прошлый логотип, связи тем, телефон
 * и офлайн-пакет у Сью (1.37.0 / Sye 0.10.0).
 *
 * Что было не так:
 *   1) маскоты были только «в цвет темы» — поменять цвет было нельзя;
 *   2) в логотипе стояла звезда с лицом — вернули прежнюю гранёную звезду;
 *   3) темы в базе знаний лежали по одной: рядом с «Пифагором» не было
 *      ни синусов, ни Виета;
 *   4) на телефоне поля были мелкими, а кнопки — в палец толщиной;
 *   5) агент без сети не знал ни одной темы: пакета с собой не было,
 *      а о проваленных темах он не помнил.
 *
 * Запуск: node tests/round34.test.mjs
 */
import fs from "node:fs";
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

const require_ = createRequire(import.meta.url);
const shared = require_("../agent/core/shared.js");
const memory = require_("../agent/core/memory.js");

console.log("round34: цвет, логотип, связи тем, телефон, офлайн-пакет — " + pkg.version);

/* ---------- 1. Цвет маскотов ---------- */

await test("в настройках есть выбор цвета маскотов", async () => {
  assert(/id="mskColorOwn"/.test(html), "нет своего выбора цвета");
  assert(/id="mskColors"/.test(html), "нет палитры цветов");
  assert(/id="mskColorReset"/.test(html), "нет сброса на цвет темы");
  assert(/function applyMascotColor\(/.test(html), "цвет не применяется");
  assert(/--msk-soft/.test(html), "нет мягкого оттенка для градиента");
});

await test("цвет маскотов живёт в настройках, а не в разметке", async () => {
  assert(/mascotColor:\s*""/.test(html), "в настройках нет поля mascotColor");
  assert(/settings\.mascotColor\s*=/.test(html), "выбранный цвет не сохраняется");
  /* перекрашиваются маскоты через переменную, а не заменой svg по одному */
  assert(/var\(--msk[,)]/.test(html), "маскоты не берут цвет из --msk");
});

await test("свой цвет даёт мягкий оттенок темнее, а сброс возвращает тему", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole() });
  const w = dom.window;
  assert(typeof w.setMascotColor === "function", "нет функции смены цвета");
  w.setMascotColor("#5b8dd6");
  const root = w.document.documentElement;
  assert(root.style.getPropertyValue("--msk").trim() === "#5b8dd6", "цвет не встал: " + root.style.getPropertyValue("--msk"));
  const soft = root.style.getPropertyValue("--msk-soft").trim();
  assert(/^#[0-9a-f]{6}$/i.test(soft), "мягкий оттенок не цвет: " + soft);
  assert(soft.toLowerCase() !== "#5b8dd6", "мягкий оттенок совпал с основным");
  w.setMascotColor("");
  assert(root.style.getPropertyValue("--msk").trim() === "", "сброс не очистил свой цвет");
  dom.window.close();
});

/* ---------- 2. Логотип ---------- */

await test("в шапке прежняя гранёная звезда, а не маскот с лицом", async () => {
  assert(/function logoStar\(/.test(html), "нет функции логотипа-звезды");
  assert(/M12 2 L13\.5 9\.5 L21 12/.test(html), "вернули не ту звезду");
  assert(/brand-logo[\s\S]{0,200}logoStar\(/.test(html) || /logoStar\(20\)/.test(html), "логотип не рисуется звездой");
});

/* ---------- 3. Связи тем ---------- */

await test("у открытой темы есть связанные темы", async () => {
  assert(/function kbRelated\(/.test(html), "нет подбора связанных тем");
  assert(/Связанные темы/.test(html), "нет заголовка блока");
  assert(/data-kbrel/.test(html), "по связанной теме нельзя перейти");
});

await test("связанные темы не показывают саму тему и знают про Пифагора", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const pack = w.kbPack();
  assert(pack && Array.isArray(pack.items), "пакет не загрузился");
  const titles = pack.items.map((x) => x.title);
  assert(titles.includes("Теорема Пифагора"), "в пакете нет теоремы Пифагора");
  const flat = w.KNOWLEDGE_PACK && w.KNOWLEDGE_PACK.items ? w.KNOWLEDGE_PACK.items : pack.items;
  const pif = flat.find((x) => x.title === "Теорема Пифагора") || flat.find((x) => x.topic === "Теорема Пифагора");
  assert(pif, "в пакете нет теоремы Пифагора");
  const rel = w.kbRelated(pif, 4).map((x) => x.title || x.topic);
  assert(Array.isArray(rel) && rel.length > 0, "связей у Пифагора нет");
  assert(!rel.some((x) => x === "Теорема Пифагора"), "тема связана сама с собой");
  dom.window.close();
});

await test("в пакете нет повторов по названию", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole() });
  const pack = dom.window.kbPack();
  const titles = pack.items.map((x) => x.title);
  assert(new Set(titles).size === titles.length, "есть повторы: " + (titles.length - new Set(titles).size));
  for (const it of pack.items) {
    assert(it.text && it.text.length >= 120, "короткий текст у темы " + it.title);
  }
  dom.window.close();
});

/* ---------- 4. Телефон ---------- */

await test("на телефоне поля не мельче 16 px и кнопки не мельче 44 px", async () => {
  const i = html.search(/@media \(max-width:\s*700px\)\s*\{\s*\/\* Поле ввода/);
  assert(i > 0, "нет телефонного блока");
  const block = html.slice(i, i + 4000);
  assert(/font-size:\s*16px/.test(block), "поля мельче 16 px — браузер зумит");
  assert(/min-height:\s*44px/.test(block), "кнопки мельче 44 px — не попасть пальцем");
  assert(/safe-area-inset/.test(block), "нет отступа под экранную кнопку");
});

/* ---------- 5. Сью: офлайн-пакет и пробелы ---------- */

await test("у Сью есть свой пакет тем и он совпадает с сайтом", async () => {
  const pack = JSON.parse(read("agent/data/kb-pack.json"));
  assert(Array.isArray(pack.items) && pack.items.length >= 863, "пакет меньше базы сайта");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole() });
  const site = dom.window.kbPack();
  assert(pack.items.length === site.items.length, "у агента " + pack.items.length + " тем, у сайта " + site.items.length);
  const siteTitles = new Set(site.items.map((x) => x.title));
  const lost = pack.items.filter((x) => !siteTitles.has(x.topic));
  assert(lost.length === 0, "в пакете агента лишние темы: " + lost.slice(0, 3).map((x) => x.topic).join(", "));
  dom.window.close();
});

await test("без сети агент берёт темы из пакета, а не остаётся пустым", async () => {
  const dead = async () => { throw new Error("нет сети"); };
  shared.reset();
  await shared.loadPack(new URL("../agent/data/kb-pack.json", import.meta.url).pathname);
  assert(shared.list().length >= 863, "пакет не прочитался");
  assert(shared.search("фотосинтез", 1).length === 1, "по пакету не ищется");
  await shared.refresh({ fetchImpl: dead, force: true });
  assert(shared.list().length >= 863, "без сети темы стёрлись");
  assert(shared.error().length > 0, "ошибка сети не записана");
  shared.reset();
});

await test("проваленные темы запоминаются по папке и не растут без конца", async () => {
  memory.reset();
  memory.noteGap("/work/a", "квантовая запутанность");
  memory.noteGap("/work/a", "Квантовая запутанность");
  const list = memory.gaps("/work/a");
  assert(list.length === 1 && list[0].times === 2, "повтор считается дважды");
  assert(memory.gapBlock("/work/a").includes("квантовая"), "пробел не попал в промпт");
  for (let i = 0; i < 12; i++) memory.noteGap("/work/b", "тема " + i);
  assert(memory.gaps("/work/b", 20).length === memory.GAPS_MAX, "пробелы не ограничены");
  memory.reset();
});

await test("вопрос, на который есть тема, пробелом не считается", async () => {
  shared.reset();
  await shared.loadPack(new URL("../agent/data/kb-pack.json", import.meta.url).pathname);
  assert(shared.miss("объясни теорему пифагора") === "", "тема есть, а записан пробел");
  assert(shared.miss("расскажи про квантовую запутанность") .length > 0, "темы нет, а пробел не найден");
  shared.reset();
});

/* ---------- 6. Версии ---------- */

await test("версии совпадают в трёх местах", async () => {
  const brand = read("agent/core/brand.js");
  const info = JSON.parse(read("agent-version.json"));
  const v = (brand.match(/version:\s*"([^"]+)"/) || [])[1];
  assert(v === agentPkg.version, "brand.js и package.json разошлись: " + v + " / " + agentPkg.version);
  assert(v === info.version, "agent-version.json отстал: " + info.version + " вместо " + v);
});

if (!process.exitCode) console.log("round34: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

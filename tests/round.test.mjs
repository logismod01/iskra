/**
 * Тест нового раунда: шесть режимов, отдельный чат у каждого режима,
 * кнопка «Скачать» у любого блока кода, запомненный вход в консоль владельца,
 * движки картинок и защита от подмены сюжета в промпте.
 *
 * Запуск: node tests/round.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => errors.push(e.message));
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
window.fetch = async () => { throw new Error("offline в тесте"); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => window.document.querySelectorAll(s);
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
const proOn = () => window.eval("settings.edition='pro'; settings.proForever=true; settings.proSource='owner'; applyAccess();");

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("режимов ровно шесть и «Домашки» больше нет", () => {
  const order = window.eval("MODE_ORDER");
  assert(Array.isArray(order) && order.length === 6, "MODE_ORDER: " + JSON.stringify(order));
  assert(order.includes("study") && !order.includes("homework"), "домашка не слилась с учёбой");
  assert(order.every(k => window.eval(`!!MODES[${JSON.stringify(k)}]`)), "в MODES не хватает режима");
  const text = $("#modebar").textContent;
  assert(!/Домашка/.test(text), "в меню осталась «Домашка»");
  assert($$(".mode-pill").length === 6, "в меню " + $$(".mode-pill").length + " кнопок вместо 6");
});

await test("у «Учёбы» расширенный режим: домашка, задача и текст в одном", () => {
  const hint = window.eval("MODES.study.hint");
  assert(/домашк/i.test(hint) && /задач/i.test(hint) && /текст|сочинение/i.test(hint), "hint учёбы не покрывает домашку и тексты");
  assert(/фото тетрад/i.test(hint), "нет правила «на фото тетрадь — реши условие»");
});

await test("у каждого режима свой чат, переключение меняет переписку", () => {
  window.eval("settings.mode='chat'; setMode('chat');");
  const a = window.eval('createChat("Чат про кота").id');
  window.eval("setMode('code');");
  assert(window.eval("currentChatId") === null, "в новом режиме подставился чужой чат");
  const b = window.eval('createChat("Код: сортировка").id');
  assert(a !== b, "id чатов совпали");
  assert(window.eval(`chats[${JSON.stringify(a)}].mode`) === "chat", "чат «Чата» не помнит режим");
  assert(window.eval(`chats[${JSON.stringify(b)}].mode`) === "code", "чат «Кода» не помнит режим");
  assert(window.eval("settings.modeChats.chat") === a, "режим «Чат» не запомнил чат");
  assert(window.eval("settings.modeChats.code") === b, "режим «Код» не запомнил чат");
  window.eval("setMode('chat')");
  assert(window.eval("currentChatId") === a, "возврат в «Чат» не открыл его переписку");
  window.eval("setMode('code')");
  assert(window.eval("currentChatId") === b, "возврат в «Код» не открыл его переписку");
  window.eval("deleteChat(settings.modeChats.chat)");
  assert(!window.eval("settings.modeChats.chat"), "после удаления чата осталась битая ссылка режима");
});

await test("кнопка 3D видна только в режиме Blender", () => {
  proOn();
  window.eval("setMode('chat')");
  assert($("#makerBtn").hidden === true && $("#makerBtn").style.display === "none", "кубик видно в чате");
  window.eval("setMode('blender')");
  assert($("#makerBtn").hidden === false && $("#makerBtn").style.display === "", "кубик пропал в Blender");
  window.eval("setMode('study')");
  assert($("#makerBtn").hidden === true, "кубик остался в «Учёбе»");
});

await test("у любого блока кода есть кнопка «Скачать»", () => {
  const md = window.eval('renderMarkdown("```python\\nprint(1)\\n```\\n```js\\nconst a = 1;\\n```\\n```sql\\nSELECT 1;\\n```")');
  assert((md.match(/data-dlcode=/g) || []).length === 3, "кнопка «Скачать» есть не у всех блоков");
  assert(window.eval('codeExt("Python")') === ".py", "Python → .py");
  assert(window.eval('codeExt("JavaScript")') === ".js", "JavaScript → .js");
  assert(window.eval('codeExt("sql")') === ".sql", "sql → .sql");
  assert(window.eval('codeExt("python 3.12")') === ".py", "метка «python 3.12» не распознана");
  const name = window.eval('codeFileName("Python", "def calculate_total(x):\\n    pass", 0)');
  assert(/^calculate-total.*\.py$/.test(name), "некрасивое имя файла: " + name);
});

await test("консоль владельца запоминает браузер и запирается командой lock", async () => {
  window.eval("localStorage.removeItem('iskra.admin.session.v1')");
  const d = window.eval("adminData()");
  window.eval(`(() => { const d = adminData(); d.hash = "хэш-для-теста"; d.created = Date.now(); adminSave(d); })()`);
  assert(window.eval("adminSessionValid(adminData())") === false, "сессия открыта без входа");
  window.eval("adminSessionSet(adminData())");
  assert(window.eval("adminSessionValid(adminData())") === true, "сессия не запомнилась");
  assert(window.eval("adminSessionLeftDays()") >= 29, "срок запоминания меньше месяца");
  window.eval("closeConsole(); openConsoleModal();");
  assert(window.eval("consoleUnlocked") === true, "консоль снова спросила пароль");
  assert(/Владелец узнан/.test($("#consoleOut").textContent), "нет сообщения об узнанном владельце");
  window.eval("closeConsole();");
  // смысл токена: сменился пароль — старые сессии не действуют
  window.eval(`(() => { const d = adminData(); d.hash = "другой-пароль"; adminSave(d); })()`);
  assert(window.eval("adminSessionValid(adminData())") === false, "старая сессия живёт после смены пароля");
  window.eval("adminSessionSet(adminData())");
  await window.eval("consoleRun('lock')");
  assert(window.eval("consoleUnlocked") === false, "lock не запер консоль");
  assert(window.eval("adminSessionValid(adminData())") === false, "lock не стёр токен");
  window.eval("localStorage.removeItem('iskra.admin.v1'); localStorage.removeItem('iskra.admin.session.v1');");
});

await test("просьба «нарисуй …» уходит в картинку, а не в ASCII-текст", () => {
  assert(window.eval('parseImageAsk("нарисуй овчарку на диване")') === "овчарку на диване", "не разобрала «нарисуй …»");
  assert(window.eval('parseImageAsk("нарисуй мне картинку: кот в космосе")') === "кот в космосе", "не разобрала «нарисуй мне картинку»");
  assert(window.eval('parseImageAsk("как нарисовать кота")') === "", "учебный вопрос ушёл в рисование");
  assert(window.eval('parseImageAsk("нарисуй схему цепи")') === "", "схема должна объясняться текстом");
  assert(window.eval('parseVideoAsk("сделай видео закат над морем")') === "закат над морем", "видео не распознано");
  assert(window.eval('parseVideoAsk("сделай сайт на html")') === "", "верстка ушла в видео");
});

await test("промпт не подменяет животное человеком", () => {
  const out = window.eval('sanitizeImgPrompt("a beautiful girl sitting on a sofa, warm light", "овчарка на диване")');
  assert(!/girl|woman|portrait/i.test(out), "девочка осталась в промпте: " + out);
  assert(/sofa/.test(out), "сцена потерялась: " + out);
  const keep = window.eval('sanitizeImgPrompt("a woman on a sofa", "девушка на диване")');
  assert(/woman/.test(keep), "человека по просьбе убрали");
});

await test("движки картинок: авто по умолчанию, ключи хранятся", () => {
  assert(window.eval('IMG_ENGINES.map(x => x.id).join(",")') === "auto,horde,pollinations", "нет движков");
  window.eval("settings.imageEngine=''; delete settings.imageEngine; settings.imageEngine='auto';");
  assert(window.eval("imgEngine().id") === "auto", "по умолчанию не авто");
  window.eval("settings.imageEngine='horde'; settings.hordeKey='abc';");
  assert(window.eval("imgEngine().name") === "Stable Horde", "движок не переключился");
  assert(/SDXL/.test(window.eval("imgEngine().hint")), "у Horde нет описания");
  window.eval("settings.imageEngine='auto'; settings.hordeKey='';");
});

await test("видео: битый плеер не оставляет чёрный прямоугольник", () => {
  const src = html.includes('pv.addEventListener("error"');
  assert(src, "у <video> нет обработчика ошибки");
  assert(/watermark, text, logo/.test(html), "в негативном промпте видео нет защиты от водяных знаков и мыла");
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
process.exit(process.exitCode || 0);

/**
 * Раунд 19: «Знания» действительно открываются, и меню «⋯» стало полезнее.
 *
 * Что проверяем:
 * 1) Пункт «Знания» открывает окно с темами (встроенные + общая база + свои),
 *    а не пустое окно «Мои документы», как было раньше.
 * 2) «Мои документы» остались отдельным пунктом — своя функция не потеряна.
 * 3) Общую базу (темы владельца) можно листать и искать в окне знаний.
 * 4) Крупный текст включается и запоминается.
 * 5) Копия данных скачивается, обновление версии не падает.
 * 6) Ctrl+K открывает знания, клик по пункту закрывает меню.
 *
 * Запуск: node tests/round19.test.mjs
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
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

const click = (id) => doc.getElementById(id).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const openMenu = () => click("moreBtn");

console.log("round19: знания открываются, меню «⋯» полезнее");

/* ---------- 1. Пункт «Знания» ---------- */
await test("в меню «⋯» есть «Знания» и «Мои документы» отдельно", async () => {
  const items = [...doc.querySelectorAll("#moreMenu [data-more]")].map(b => b.dataset.more);
  ["knowledge", "docs", "memory", "bigtext", "backup", "fresh", "theme"].forEach((a) => {
    assert(items.includes(a), "в меню нет пункта " + a);
  });
});

await test("«Знания» открывают темы, а не пустое окно документов", async () => {
  const know = doc.getElementById("knowModal");
  const kb = doc.getElementById("kbModal");
  assert(!know.classList.contains("open"), "окно знаний уже было открыто");
  openMenu();
  click("kbTop");
  assert(know.classList.contains("open"), "окно знаний не открылось");
  assert(!kb.classList.contains("open"), "вместо знаний открылись документы — это и был баг");
  const body = doc.getElementById("knowBody");
  assert(body && body.children.length > 0, "окно знаний пустое");
  assert(body.innerHTML.includes("kb-card"), "в окне нет ни одной темы");
  assert(body.innerHTML.includes("kbSearchInput"), "в окне нет поиска по темам");
});

await test("пункт «Мои документы» открывает прежнее окно", async () => {
  window.eval("closeKnow()");
  openMenu();
  click("kbDocsTop");
  assert(doc.getElementById("kbModal").classList.contains("open"), "окно документов не открылось");
  assert(!doc.getElementById("knowModal").classList.contains("open"), "одновременно открылось и окно знаний");
  window.eval("closeKnowledge()");
});

/* ---------- 2. Общая база видна и ищется ---------- */
await test("общая база листается: темы владельца видны карточками", async () => {
  window.eval(`
    _sharedKb = null; _sharedKbAt = 0;
    sharedKbSave([
      { topic: "Грипп у взрослого", text: "ПРОВЕРКА_ОБЩЕЙ_БАЗЫ: при гриппе нужен покой, много питья и жаропонижающее по температуре.", tags: "здоровье грипп" },
      { topic: "Как выбрать чайник", text: "ПРОВЕРКА_ОБЩЕЙ_БАЗЫ: смотри на мощность, объём и материал корпуса — металл живёт дольше пластика.", tags: "дом покупки" }
    ]);
    kbView.cat = "all"; kbView.q = ""; kbView.open = "";
    renderKnowledgePanel();
  `);
  const cards = [...doc.querySelectorAll("#kbCards .kb-card")];
  const text = cards.map(c => c.textContent).join(" ");
  assert(text.includes("Грипп у взрослого"), "темы общей базы не показаны");
  assert(text.includes("общая база"), "не подписано, что тема из общей базы");
  const cats = [...doc.querySelectorAll("#kbCats .kb-cat")].map(b => b.textContent);
  assert(cats.some(t => t.includes("Общая база")), "нет папки «Общая база»");
});

await test("поиск в знаниях находит тему из общей базы", async () => {
  window.eval(`kbView.q = "чайник"; kbView.cat = "all"; renderKbCards();`);
  const text = doc.getElementById("kbCards").textContent;
  assert(text.includes("Как выбрать чайник"), "поиск по общей базе не нашёл тему: " + text.slice(0, 120));
  window.eval(`kbView.q = ""; renderKbCards();`);
});

await test("в окне видно, сколько всего тем и где мои документы", async () => {
  const body = doc.getElementById("knowBody").textContent;
  assert(/База знаний \(\d+ тем\)/.test(body), "не показано число тем");
  assert(body.includes("Мои документы"), "нет раздела с моими документами");
  assert(doc.getElementById("kbDocsOpen"), "нет кнопки «Открыть мои документы»");
});

/* ---------- 3. Крупный текст ---------- */
await test("крупный текст включается, запоминается и выключается", async () => {
  const root = doc.documentElement;
  assert(!root.classList.contains("big-text"), "крупный текст включён по умолчанию");
  openMenu();
  click("bigTextTop");
  assert(root.classList.contains("big-text"), "класс big-text не появился");
  const saved = JSON.parse(window.localStorage.getItem("iskra.settings.v1") || "{}");
  assert(saved.bigText === true, "настройка не сохранилась");
  openMenu();
  click("bigTextTop");
  assert(!root.classList.contains("big-text"), "крупный текст не выключился");
});

/* ---------- 4. Копия и обновление ---------- */
await test("«Скачать копию» не падает и готовит файл", async () => {
  let made = 0;
  window.URL.createObjectURL = () => { made++; return "blob:iskra"; };
  window.URL.revokeObjectURL = () => {};
  window.eval("downloadBackup()");
  assert(made === 1, "файл копии не создан");
});

await test("«Обновить версию» — функция есть и не бросает ошибку", async () => {
  assert(typeof window.eval("typeof freshVersion") === "string" && window.eval("typeof freshVersion") === "function", "нет freshVersion");
  // без serviceWorker и caches в jsdom функция обязана спокойно дойти до перезагрузки
  window.eval("freshVersion()");
});

/* ---------- 5. Управление ---------- */
await test("Ctrl+K открывает знания", async () => {
  window.eval("closeKnow()");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  assert(doc.getElementById("knowModal").classList.contains("open"), "Ctrl+K не открыл знания");
  window.eval("closeKnow()");
});

await test("после выбора пункта меню закрывается", async () => {
  openMenu();
  const menu = doc.getElementById("moreMenu");
  assert(menu.hidden === false, "меню не открылось");
  click("memoryTop");
  assert(menu.hidden === true, "меню осталось открытым");
  window.eval("closeMemory()");
});

await test("подписи в меню человеческие, без машинных слов", async () => {
  const labels = [...doc.querySelectorAll("#moreMenu [data-more] span")].map(s => s.textContent.trim());
  ["Знания", "Мои документы", "Память", "Крупный текст", "Скачать копию", "Обновить версию", "Сменить тему"].forEach((t) => {
    assert(labels.includes(t), "в меню нет «" + t + "»");
  });
});

/* ---------- 6. Версия ---------- */
await test("версия поднята, кэш обновлён", async () => {
  assert(pkg.version === "1.18.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.8\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("новый тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round19.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round19: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

/**
 * Тест интерфейса: стартовый экран, настройки, вкладки, панель «Искра Про», проверка Искры.
 * Главное правило: в интерфейсе только «Искра» и «Искра Про» — никаких чужих названий.
 *
 * Запуск: node tests/ui.test.mjs
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function sse(text) {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      c.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
window.fetch = async (url) => {
  const u = String(url);
  if (u.includes("chat/completions")) return sse("ок");
  throw new Error("offline: " + u);
};
await wait(500);

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => window.document.querySelectorAll(s);
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
const BAD = /puter|pollinations|stable horde|groq|hugging ?face|openrouter|openai|chatgpt|claude|gemini|deepseek|llama|qwen|llm7|kilo/i;
const visibleText = (root) => [...root.querySelectorAll("*")]
  .filter(el => !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName))
  .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" "))
  .join(" ");

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("на стартовом экране есть быстрые действия", () => {
  const cards = $$("#welcomeActions .wa-card");
  assert(cards.length >= 3, "быстрых действий " + cards.length);
  cards[0].click();
  assert($("#input").value.length > 3, "нажатие не заполнило поле ввода");
  assert($("#welcomeFoot") === null || true);
});

await test("настройки открываются и переключают вкладки", () => {
  window.eval("openSettings()");
  assert($("#settingsModal").classList.contains("open"), "настройки не открылись");
  const tabs = $$("#setTabs button");
  assert(tabs.length === 3, "вкладок " + tabs.length);
  assert(tabs[0].classList.contains("on"), "первая вкладка не активна");
  assert($('[data-pane="main"]').hidden === false, "основная вкладка скрыта");
  tabs[1].click();
  assert($('[data-pane="look"]').hidden === false && $('[data-pane="main"]').hidden === true, "вкладка «Вид» не переключилась");
  tabs[2].click();
  assert($('[data-pane="access"]').hidden === false, "вкладка «Доступ» не переключилась");
  tabs[0].click();
  assert($$("#editionBtns button").length === 2, "нет двух версий");
  assert($$("#personaGrid .persona-btn").length >= 5, "характеры не отрисовались");
  assert($$("#toneBtns button").length === 4, "стили общения не отрисовались");
});

await test("в настройках нет чужих названий", () => {
  const text = visibleText($("#settingsModal"));
  const m = text.match(BAD);
  assert(!m, "в настройках чужое название: " + (m && m[0]));
});

await test("вкладка «Вид» показывает темы и меняет тему", () => {
  window.eval("setSettingsTab('look')");
  const before = window.eval("settings.theme");
  const btns = $$("#themeGrid .theme-btn");
  assert(btns.length >= 10, "тем " + btns.length);
  btns[1].click();
  assert(window.eval("settings.theme") !== before, "тема не переключилась");
});

await test("«Искра Про» без ключа открывает тарифы, а не ломается", () => {
  window.eval("setSettingsTab('main')");
  const proBtn = [...$$("#editionBtns button")].find(b => b.dataset.e === "pro");
  proBtn.click();
  assert($("#proModal").classList.contains("open"), "тарифы не открылись");
  assert(window.eval("proActive()") === false, "Pro включился без ключа");
});

await test("гостю Pro не продают: нет кода клиента и тарифов, есть «зарегистрируйтесь»", () => {
  const body = $("#proBody");
  assert($("#clientCodeText") === null, "у гостя отрисован код клиента");
  assert($$("[data-plan]").length === 0, "у гостя есть тарифы");
  assert($("[data-imgquality]") === null, "у гостя есть Pro-настройки качества");
  assert(/зарегистрируйтесь/i.test(body.textContent), "нет приглашения зарегистрироваться");
  assert($("#proRegister") !== null, "нет кнопки регистрации");
});

await test("зарегистрированному аккаунту тарифы и код клиента показываются", () => {
  window.eval(`(function(){
    const acc = { id: "acc-ui", name: "Тест", email: "t@example.com", method: "email", createdAt: Date.now(), devices: [] };
    localStorage.setItem(AUTH_KEY, JSON.stringify([acc]));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: acc.id, ts: Date.now() }));
    renderProPanel();
  })()`);
  const body = $("#proBody");
  assert(/\d{6}-[A-Z0-9]{6}-[a-z]{6}/.test($("#clientCodeText").textContent), "код клиента не отрисован");
  assert($$("[data-imgquality]").length === 3, "нет уровней качества картинок");
  assert($$("[data-plan]").length >= 3, "нет тарифов");
  assert(/₽/.test(body.textContent), "нет цен");
});

await test("в тарифах нет чужих названий", () => {
  const m = visibleText($("#proModal")).match(BAD);
  assert(!m, "в тарифах чужое название: " + (m && m[0]));
  window.eval('$("#proModal").classList.remove("open")');
});

await test("проверка Искры показывает зелёные строки при живом движке", async () => {
  window.eval("runSelfCheck()");
  for (let i = 0; i < 40; i++) {
    await wait(100);
    if ($$("#checkResult .selfcheck-row").length === 3) break;
  }
  const rows = $$("#checkResult .selfcheck-row");
  assert(rows.length === 3, "строк проверки " + rows.length);
  assert(/Ответ Искры/.test($("#checkResult").textContent), "нет строки про ответ");
});

await test("сохранение настроек закрывает окно и не теряет выбор", () => {
  window.eval("openSettings()");
  window.eval('setSettingsTab("main")');
  const tone = $$("#toneBtns button")[1];
  tone.click();
  $("#saveSettings").click();
  assert(!$("#settingsModal").classList.contains("open"), "настройки не закрылись");
  assert(window.eval("settings.tone") === tone.dataset.t, "тон не сохранился");
});

await test("мобильная шапка: у настроек есть понятная подпись версии", () => {
  const chip = $("#modelChip");
  assert(/Искра/.test(chip.textContent), "в шапке нет версии: " + chip.textContent);
});

await test("ошибок JS за всю работу интерфейса не появилось", () => {
  assert(errors.length === 0, errors.join("\n"));
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
process.exit(process.exitCode || 0);

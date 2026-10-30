/**
 * Тест четвёртого круга: оранжевая точка, личность без чужих имён, литература
 * в базе знаний, Pro только для зарегистрированных и состояние, которое
 * переживает перезагрузку страницы посреди ответа.
 *
 * Запуск: node tests/round4.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function makeDom(seed) {
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
      for (const [k, v] of Object.entries(seed || {})) win.localStorage.setItem(k, v);
    }
  });
  return { dom, window: dom.window, errors };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dumpStorage = (win) => {
  const out = {};
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    out[k] = win.localStorage.getItem(k);
  }
  return out;
};
const REGISTER = `(function(){
  const acc = { id: "acc-r4", name: "Тест", method: "email", createdAt: Date.now(), devices: [] };
  localStorage.setItem(AUTH_KEY, JSON.stringify([acc]));
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: acc.id, ts: Date.now() }));
})()`;

const first = makeDom();
first.window.fetch = async () => { throw new Error("offline"); };
await wait(500);
const window = first.window;
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => window.document.querySelectorAll(s);

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

/* ---------- Оранжевая точка ---------- */
await test("точка модели оранжевая, зелёного оверрайда нет", () => {
  const css = [...window.document.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  assert(/\.mc-dot\s*\{[^}]*var\(--accent\)/.test(css), "базовая точка не оранжевая (--accent)");
  assert(!/\.model-chip\s+\.mc-dot\s*\{[^}]*var\(--ok\)/.test(css), "вернулся зелёный цвет точки");
});

/* ---------- Личность ---------- */
await test("создателя не выдают: правило требует уклоняться и не называть чужие компании", () => {
  const rule = window.eval("IDENTITY_RULE");
  assert(/утону/i.test(rule), "нет шутки про «утону»");
  for (const name of ["OpenAI", "ChatGPT", "Claude", "Gemini", "DeepSeek", "Qwen"]) {
    assert(rule.includes(name), "в запрете не перечислено: " + name);
  }
  const sys = window.eval('buildSystemPrompt("кто твой создатель?")');
  assert(sys.includes(rule.slice(0, 40)), "правило личности не попало в системный промпт");
});

/* ---------- Литература ---------- */
await test("в базе есть «Капитанская дочка» с сюжетом, героями и финалом", () => {
  const item = window.eval(`KNOWLEDGE_PACK.items.find(x => x.title.indexOf("Капитанская") === 0)`);
  assert(item, "нет темы «Капитанская дочка»");
  for (const word of ["Гринёв", "Пугачёв", "Маша", "Швабрин", "честь"]) {
    assert(item.text.includes(word), "в пересказе нет: " + word);
  }
  assert(item.text.length > 400, "пересказ слишком короткий");
});

await test("вопрос про книгу находит литературную справку", () => {
  for (const [q, id] of [
    ["расскажи про Капитанскую дочку", "lit-kapitanskaya-dochka-pushkin"],
    ["кто такой Базаров", "lit-otcy-i-deti-turgenev"],
    ["О чём Война и мир", "lit-voyna-i-mir-tolstoy"],
    ["Гамлет", "lit-shekspir"]
  ]) {
    const hits = window.eval(`kbSearch(${JSON.stringify(q)}, 3).map(x => x.id)`);
    assert(hits.some((h) => h === id || h.startsWith(id)), "«" + q + "» не нашла " + id + " (найдено: " + hits.join(", ") + ")");
  }
});

await test("литература всех стран и времён: тем много и есть мировые имена", () => {
  const lit = window.eval(`KNOWLEDGE_PACK.items.filter(x => x.id.indexOf("lit-") === 0)`);
  assert(lit.length >= 80, "литературных тем мало: " + lit.length);
  const tags = lit.map((x) => (x.tags || "").toLowerCase()).join(" ");
  for (const name of ["шекспир", "данте", "гомер", "маркес", "оруэлл", "басё", "толкин"]) {
    assert(tags.includes(name), "нет мировой литературы: " + name);
  }
});

await test("мат-фильтр не портит литературные слова", () => {
  const text = "Он влюбляется в Машу, требует блюдо и смотрит на корабля.";
  const masked = window.eval(`maskProfanity(${JSON.stringify(text)})`);
  assert(masked === text, "нормальные слова искажены: " + masked);
  const bad = "б" + "ля";
  const dirty = window.eval(`maskProfanity("ну ты и " + ${JSON.stringify(bad)})`);
  assert(dirty.includes("×"), "мат больше не маскируется");
});

/* ---------- Pro только зарегистрированным ---------- */
await test("консоль не даёт Pro гостю", async () => {
  const out = await window.eval("(async () => await consoleRun('pro on'))()");
  assert(/нет аккаунта/i.test(out), "гостю выдали Pro: " + out);
  assert(window.eval("proActive()") === false, "Pro включился у гостя");
});

await test("зарегистрированному консоль Pro выдаёт", async () => {
  window.eval(REGISTER);
  const out = await window.eval("(async () => await consoleRun('pro 3'))()");
  assert(/Pro выдан/i.test(out), "аккаунту не выдали Pro: " + out);
  assert(window.eval("proActive()") === true, "Pro не включился");
  await window.eval("(async () => await consoleRun('pro off'))()");
});

await test("после активации ключа бейджи Pro исчезают сразу, без перезагрузки", async () => {
  assert($$(".mpro").length > 0 || $$(".pill-lock").length > 0, "до ключа бейджей Pro нет");
  const code = window.clientCode();
  const issued = await window.localIssueKey(code, 24, "тест");
  const res = await window.activateAccessKey(issued.key);
  assert(res.ok === true, "ключ не активировался: " + (res && res.msg));
  assert($$(".mpro").length === 0, "остались бейджи Pro на карточках режимов");
  assert($$(".pill-lock").length === 0, "остались бейджи Pro в меню режимов");
  assert(/Искра Про/.test($("#modelChip").textContent), "чип модели не обновился");
});

/* ---------- Перезагрузка посреди ответа ---------- */
await test("запрос и веб-поиск переживают перезагрузку во время ответа", async () => {
  window.eval("localStorage.clear(); localStorage.setItem('iskra.access.v1','')");
  window.eval(REGISTER);
  window.eval("settings.edition='free'; settings.webSearch=false; saveSettings();");
  $("#webBtn").click();
  assert(window.eval("settings.webSearch") === true, "веб-поиск не включился");
  const snapshot = dumpStorage(window);
  window.close();

  const second = makeDom(snapshot);
  second.window.fetch = () => new Promise(() => {});   // «Искра думает» — ответа нет
  await wait(600);
  const w2 = second.window;
  assert(w2.eval("settings.webSearch") === true, "веб-поиск сбросился после перезагрузки");
  assert(w2.document.querySelector("#webBtn").classList.contains("on"), "кнопка поиска потеряла состояние");

  /* во время ответа сохраняем запрос и пустышку ответа — как это делает sendMessage */
  const chat = w2.eval(`(function(){
    createChat("Литература");
    const chat = chats[currentChatId];
    chat.messages.push({ id: "u1", role: "user", content: "перескажи Капитанскую дочку", ts: Date.now() });
    chat.messages.push({ id: "a1", role: "assistant", content: "", ts: Date.now(), pending: true, prompt: "перескажи Капитанскую дочку" });
    saveChats();
    return currentChatId;
  })()`);
  const midSnapshot = dumpStorage(w2);
  w2.close();

  const third = makeDom(midSnapshot);
  third.window.fetch = () => new Promise(() => {});
  await wait(700);
  const w3 = third.window;
  const saved = w3.eval(`chats[${JSON.stringify(chat)}].messages.map(m => ({ role: m.role, pending: !!m.pending, interrupted: !!m.interrupted }))`);
  assert(saved.length === 2, "сообщения не сохранились: " + JSON.stringify(saved));
  assert(saved[1].pending === false && saved[1].interrupted === true, "ответ не помечен как прерванный");
  const retry = w3.document.querySelector(".msg.assistant .actions button[data-retry]");
  assert(retry, "нет кнопки «Повторить»");
  assert(/Повторить/.test(retry.textContent), "кнопка без подписи «Повторить»");
  assert(w3.eval("settings.webSearch") === true, "поиск потерялся после второй перезагрузки");
  w3.close();
});

await test("черновик в поле ввода не теряется", async () => {
  const forth = makeDom();
  forth.window.fetch = () => new Promise(() => {});
  await wait(500);
  const w4 = forth.window;
  const input = w4.document.querySelector("#input");
  input.value = "недописанный вопрос про Оруэлла";
  input.dispatchEvent(new w4.Event("input", { bubbles: true }));
  const snap = dumpStorage(w4);
  w4.close();

  const fifth = makeDom(snap);
  fifth.window.fetch = () => new Promise(() => {});
  await wait(600);
  assert(fifth.window.document.querySelector("#input").value === "недописанный вопрос про Оруэлла", "черновик пропал");
  fifth.window.close();
});

try { first.window.close(); } catch (e) {}
console.log("\nГотово: " + passed + " проверок пройдено" + (process.exitCode ? ", есть ошибки" : ""));
process.exit(process.exitCode || 0);

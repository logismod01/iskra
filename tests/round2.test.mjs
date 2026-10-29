/**
 * Тест второго раунда: удаление чата во время ответа, тарифы в звёздах/USDT/TON,
 * вход через Google/GitHub всегда даёт аккаунт, свой код клиента у каждого аккаунта,
 * лимит 2 аккаунта на IP, защита старых телефонов.
 *
 * Запуск: node tests/round2.test.mjs
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

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("на старом телефоне страница не падает: нет lookbehind, есть защита", () => {
  assert(!/\(\?<=/.test(html) && !/\(\?<!/.test(html), "в коде остался regex-lookbehind — Safari до 16.4 упадёт парсером");
  assert($("#crashBar"), "нет полосы «не запустилось»");
  assert(/AbortSignal\.timeout !== "function"/.test(html), "нет полифилла AbortSignal.timeout");
  assert(window.eval("typeof splitSentences") === "function", "нет безопасного деления на предложения");
  const parts = window.eval('splitSentences("Первое. Второе! Третье?")');
  assert(parts.length === 3 && parts[0] === "Первое.", "splitSentences сломан: " + JSON.stringify(parts));
});

await test("удаление чата во время ответа не обрывает генерацию", async () => {
  const r = window.eval(`(() => {
    settings.mode = "chat";
    const c = createChat("Тест удаления");
    const u = { id: "u1", role: "user", content: "Расскажи про Марс", ts: Date.now() };
    const a = { id: "a1", role: "assistant", content: "", ts: Date.now() };
    c.messages.push(u, a);
    currentChatId = c.id;
    renderMessages();
    liveStream = { chatId: c.id, userId: "u1", aiId: "a1", contentEl: document.querySelector('.msg[data-id="a1"] .content') };
    const oldId = c.id;
    deleteChat(oldId);
    const now = chats[currentChatId];
    return {
      oldGone: !chats[oldId],
      chatId: currentChatId,
      streamChat: liveStream && liveStream.chatId,
      count: now ? now.messages.length : -1,
      sameAi: now ? now.messages.some(m => m.id === "a1") : false,
      contentEl: !!(liveStream && liveStream.contentEl),
      linked: settings.modeChats.chat === currentChatId
    };
  })()`);
  assert(r.oldGone, "старый чат не удалился");
  assert(r.chatId && r.streamChat === r.chatId, "ответ не переехал в новый чат");
  assert(r.count === 2 && r.sameAi, "сообщения потерялись при переезде: " + r.count);
  assert(r.contentEl, "потерян элемент, куда рисовать ответ");
  assert(r.linked, "режим не переключился на новый чат");
  window.eval("liveStream = null");
});

await test("удаление обычного чата ничего не придумывает", () => {
  const before = window.eval("Object.keys(chats).length");
  window.eval("const c2 = createChat('Обычный'); window.__c2 = c2.id;");
  window.eval("deleteChat(window.__c2)");
  assert(window.eval("Object.keys(chats).length") === before, "появился лишний чат при обычном удалении");
});

await test("тарифы показаны в звёздах, USDT и TON", () => {
  const m = window.eval("moneyFor(450)");
  assert(m.stars === Math.ceil(450 / 1.35), "звёзды считаются неверно: " + m.stars);
  assert(Math.abs(m.usdt - 450 / 95) < 0.001, "USDT считаются неверно");
  const short = window.eval("moneyShort(99)");
  assert(/⭐/.test(short) && /USDT/.test(short) && /TON/.test(short), "нет трёх валют: " + short);
  window.eval("settings.edition='free'; renderProPanel();");
  const text = $("#proPanel") ? $("#proPanel").textContent : window.document.body.textContent;
  assert(/⭐/.test(text) && /USDT/.test(text), "в панели тарифов нет звёзд и USDT");
  assert($$(".plan-alt").length === window.eval("accessPlans().length"), "не у всех тарифов есть строка с валютами");
});

await test("курс можно поменять командой rate", async () => {
  await window.eval("consoleRun('rate star 1.5')");
  assert(window.eval("RUB_PER_STAR") === 1.5, "курс звезды не поменялся");
  await window.eval("consoleRun('rate usdt 100')");
  assert(window.eval("RUB_PER_USD") === 100, "курс USDT не поменялся");
  await window.eval("consoleRun('rate star 1.35')");
  await window.eval("consoleRun('rate usdt 95')");
});

await test("вход через Google создаёт аккаунт, а не пустоту", async () => {
  window.eval("localStorage.removeItem('iskra.accounts.v1'); localStorage.removeItem('iskra.session.v1');");
  window.eval("openAuth(); oauthStart('google');");
  await wait(60);
  const input = $("#authOauthName");
  assert(input, "нет поля имени на экране входа через Google");
  input.value = "Маша";
  await window.eval("oauthGo()");
  await wait(60);
  const acc = window.eval("currentAccount()");
  assert(acc, "аккаунт через Google не создался");
  assert(acc.method === "google", "способ входа не сохранился: " + acc.method);
  assert(window.eval("localStorage.getItem('iskra.oauth.pending')") === acc.id, "не запомнили, к какому аккаунту привязать серверный вход");
});

await test("у каждого аккаунта свой код клиента", () => {
  const first = window.eval("clientCode()");
  window.eval("localStorage.removeItem('iskra.session.v1')");
  window.eval("authCreate({ method: 'pass', name: 'Второй', email: 'two@mail.ru' })");
  const second = window.eval("clientCode()");
  assert(first && second && first !== second, "коды совпали: " + first + " / " + second);
  window.eval("localStorage.setItem('iskra.session.v1', '')");
});

await test("больше двух аккаунтов с одного IP не создать", async () => {
  window.eval("localStorage.setItem('iskra.signups.v1', JSON.stringify([{key:'a', ip:'10.0.0.1', ts:1},{key:'b', ip:'10.0.0.1', ts:2}]))");
  window.eval("sessionStorage.setItem('iskra.ip.v1', '10.0.0.1')");
  const blocked = await window.eval("canCreateAccount('третий@mail.ru')");
  assert(blocked === false, "третий аккаунт с того же IP разрешили");
  const other = window.eval("(async () => { sessionStorage.setItem('iskra.ip.v1','10.0.0.2'); return await canCreateAccount('другой@mail.ru'); })()");
  assert((await other) === true, "аккаунт с другого IP не создаётся");
  window.eval("localStorage.removeItem('iskra.signups.v1')");
});

await test("кнопки «У меня есть другой код» больше нет", () => {
  assert(!$("#changeClient"), "кнопка смены кода осталась в панели");
  assert(!html.includes("У меня есть другой код"), "текст кнопки остался в index.html");
  assert(/поменять его нельзя/.test(html), "нет объяснения, почему код постоянный");
});

await test("письмо не пришло — код на экране всё равно работает", async () => {
  assert(/Письмо не пришло\?/.test(html), "нет запасного кода на экране");
  window.eval("openAuth(); authShow('authEmail'); document.querySelector('#authEmailInput').value='test@mail.ru';");
  await window.eval("sendEmailCode()");
  await wait(30);
  const shown = $("#authEmailNote").textContent;
  assert(/\d{6}/.test(shown), "шестизначный код не показан: " + shown.slice(0, 80));
});

await test("анимации и плавность на месте", () => {
  assert(/@keyframes modalPop/.test(html), "нет анимации окон");
  assert(/@keyframes rowIn/.test(html), "нет анимации списка чатов");
  assert(/prefers-reduced-motion/.test(html), "нет уважения к «уменьшить движение»");
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
process.exit(process.exitCode || 0);

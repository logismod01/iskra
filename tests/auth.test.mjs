/**
 * Тест регистрации и входа: код почты, пароль, восстановление, лимит аккаунтов.
 * Проверяем, что вход не создаёт двойников и не падает.
 *
 * Запуск: node tests/auth.test.mjs
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
await wait(400);

const $ = (s) => window.document.querySelector(s);
const ev = (code) => window.eval(code);
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("окно входа открывается, шаг «почта» доступен", () => {
  ev("openAuth()");
  assert($("#authModal").classList.contains("open"), "окно входа не открылось");
  ev('authShow("authEmail")');
  assert($("#authEmail").classList.contains("on"), "шаг «почта» не показался");
  ev("closeAuth()");
});

await test("регистрация по коду почты создаёт один аккаунт", async () => {
  ev('localStorage.removeItem("iskra.accounts.v1"); signupSave([]);');
  $("#authEmailInput").value = "student@example.com";
  await ev("sendEmailCode()");
  const code = ev("authPending.code");
  assert(/^\d{6}$/.test(code), "код не сгенерирован: " + code);
  $("#authCodeInput").value = code;
  await ev("checkEmailCode()");
  const n = ev("authAccounts().length");
  assert(n === 1, "аккаунтов " + n);
});

await test("повторный вход тем же кодом не создаёт двойника", async () => {
  const id = ev("authAccounts()[0].id");
  $("#authEmailInput").value = "student@example.com";
  await ev("sendEmailCode()");
  $("#authCodeInput").value = ev("authPending.code");
  await ev("checkEmailCode()");
  assert(ev("authAccounts().length") === 1, "создался второй аккаунт");
  assert(ev("authAccounts()[0].id") === id, "аккаунт подменился");
});

await test("регистрация по паролю и повторный вход", async () => {
  ev("passToggleMode()");
  $("#authLogin").value = "nick@example.com";
  $("#authPassword").value = "secret123";
  await ev("passSubmit()");
  const n = ev("authAccounts().length");
  assert(n === 2, "парольный аккаунт не создан: " + n);
  ev("passToggleMode()");
  $("#authLogin").value = "nick@example.com";
  $("#authPassword").value = "wrongpass";
  await ev("passSubmit()");
  assert(/не подошёл|Не пустило/i.test($("#authPassErr").textContent), "пустило с неверным паролем");
});

await test("восстановление по коду аккаунта работает", () => {
  const code = ev("authAccounts().find(a => a.email === 'student@example.com').recovery");
  assert(/^[A-Z0-9-]{8,}$/.test(code), "код восстановления не создан: " + code);
});

await test("лимит: третий аккаунт не создаётся", async () => {
  ev("passToggleMode()");
  $("#authLogin").value = "third@example.com";
  $("#authPassword").value = "secret123";
  await ev("passSubmit()");
  assert(ev("authAccounts().length") === 2, "лимит 2 аккаунта не работает");
});

await test("ошибок JS за всю регистрацию не появилось", () => {
  assert(errors.length === 0, errors.join("\n"));
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");
process.exit(process.exitCode || 0);

/**
 * Тесты модуля доступа по ключу.
 * Модуль живёт внутри index.html — вырезаем его по маркерам и гоняем в vm.
 *
 * Запуск: node tests/access.test.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const mark = html.indexOf("   ДОСТУП ПО КЛЮЧУ");
assert.ok(mark > 0, "в index.html не найден блок «ДОСТУП ПО КЛЮЧУ»");
const start = html.lastIndexOf("/* ============================================================", mark);
const end = html.indexOf("/* ---------- Экран «Доступ по ключу» ---------- */", start);
assert.ok(start > 0 && end > start, "не найдены границы модуля доступа");
const source = html.slice(start, end);

/* Текущий аккаунт для clientCode(): у гостя его нет, у зарегистрированного — есть */
const accountState = { acc: null };

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const RealDate = Date;
let fakeNow = RealDate.now();
class FakeDate extends RealDate {
  static now() { return fakeNow; }
}

const context = {
  window: { crypto: webcrypto },
  crypto: webcrypto,
  TextEncoder,
  AbortSignal,
  localStorage,
  Date: FakeDate,
  settings: { edition: "free", proUntil: 0, mat: false, nuke: false },
  saveSettings() {},
  renderEditionUI() {},
  renderProfile() {},
  updateAccessBadge() {},
  supabaseConfigured: () => false,
  SB: () => "https://example.supabase.co",
  SUPABASE_CONFIG: { url: "", anonKey: "" },
  hashPass: async (t) => "legacy-" + t,
  $: () => null,
  $$: () => [],
  esc: (s) => String(s),
  toast: () => {},
  fetch: async () => { throw new Error("offline"); },
  PAY_TON_ADDRESS: "",
  PAY_TG: "@test",
  PAY_PRICE_RUB: 450,
  PAY_PRICE_TON: "1",
  accessServerReady: async () => false,
  console,
  /* Аккаунт подставляется тестом: код клиента существует только у зарегистрированных */
  currentAccount: () => accountState.acc
};
vm.createContext(context);
vm.runInContext(
  source +
  `
  this.__api = {
    canonClient, makeClientCode, clientCode, setClientCode,
    localIssueKey, localVerifyKey,
    accessState, saveAccessState, accessActive, accessLeft, applyAccess,
    ACCESS, CLIENT_WORDS
  };
  `,
  context
);
const api = context.__api;

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log("  ✓ " + name); })
    .catch((e) => { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; });
}

/* ---------- Код клиента ---------- */
const CODE_RE = /^\d{6}-[A-Z0-9]{6}-[a-z]{6}$/;

await test("код клиента собирается по формату 123456-AB12CD-word", async () => {
  const code = api.makeClientCode();
  assert.match(code, CODE_RE);
  const word = code.split("-")[2];
  assert.ok(api.CLIENT_WORDS.includes(word), "слово должно быть из списка 6-буквенных");
  assert.equal(word.length, 6);
});

await test("канонизация: регистр и лишние пробелы приводятся к виду", async () => {
  assert.equal(api.canonClient(" 123456-ab12cd-ORANGE "), "123456-AB12CD-orange");
  assert.equal(api.canonClient("123456-AB12CD-orange\n"), "123456-AB12CD-orange");
});

await test("неверные форматы отвергаются", async () => {
  for (const bad of ["", "12345-AB12CD-orange", "123456-AB12C-orange", "123456-AB12CD-orangen",
                     "123456-AB12CD-123456", "123456AB12CDorange", "123456-AB-CD-orange", null]) {
    assert.equal(api.canonClient(bad), "", "должно быть отвергнуто: " + bad);
  }
});

await test("без аккаунта код клиента не создаётся", async () => {
  accountState.acc = null;
  assert.equal(api.clientCode(), "", "гостю код клиента не выдаётся");
  assert.equal(localStorage.getItem(api.ACCESS.clientStore), null, "в хранилище ничего не пишется");
});

await test("clientCode() генерируется один раз и не меняется", async () => {
  accountState.acc = { id: "acc-test" };
  const a = api.clientCode();
  const b = api.clientCode();
  assert.match(a, CODE_RE);
  assert.equal(a, b);
  assert.equal(localStorage.getItem(api.ACCESS.clientStore + ".acc.acc-test"), a);
});

await test("setClientCode сохраняет валидный код и отвергает мусор", async () => {
  const okCode = "482913-K7M2QX-orange";
  const r = api.setClientCode(okCode);
  assert.equal(r.ok, true);
  assert.equal(api.clientCode(), okCode);
  const bad = api.setClientCode("не-код");
  assert.equal(bad.ok, false);
  assert.equal(api.clientCode(), okCode);
});

/* ---------- Офлайн-ключи ---------- */
await test("офлайн-ключ выдаётся и проверяется для того же кода", async () => {
  const client = api.clientCode();
  const issued = await api.localIssueKey(client, 24, "тест");
  assert.equal(issued.ok, true);
  assert.match(issued.key, /^ISKRA-L-[0-9A-F]{6}-[0-9A-Z]{2}-[0-9A-Z]{6}-[0-9A-F]{8}$/);
  const v = await api.localVerifyKey(issued.key, client);
  assert.equal(v.ok, true);
  assert.equal(v.hours, 24);
});

await test("ключ не подходит к чужому коду клиента", async () => {
  const issued = await api.localIssueKey("123456-AB12CD-orange", 24);
  const v = await api.localVerifyKey(issued.key, "654321-ZZ99YY-butter".replace("butter", "bottle"));
  assert.equal(v.ok, false);
});

await test("испорченный ключ не проходит", async () => {
  const client = api.clientCode();
  const issued = await api.localIssueKey(client, 24);
  const broken = issued.key.slice(0, -1) + (issued.key.endsWith("A") ? "B" : "A");
  const v = await api.localVerifyKey(broken, client);
  assert.equal(v.ok, false);
});

await test("офлайн-ключ старше 7 дней не активируется", async () => {
  const client = api.clientCode();
  fakeNow -= 8 * 864e5;
  const old = await api.localIssueKey(client, 24);
  fakeNow += 8 * 864e5;
  const v = await api.localVerifyKey(old.key, client);
  assert.equal(v.ok, false);
});

/* ---------- Состояние доступа ---------- */
await test("accessLeft правильно считает остаток", async () => {
  assert.equal(api.accessLeft(3700 * 1000), "1 ч 1 мин");
  assert.equal(api.accessLeft(90 * 1000), "1 мин");
  assert.equal(api.accessLeft(0), "0 с");
});

await test("состояние доступа сохраняется и снимается по времени", async () => {
  api.saveAccessState({ client: api.clientCode(), expiresAt: RealDate.now() + 3600e3, hours: 1 });
  assert.equal(api.accessActive(), true);
  api.saveAccessState({ client: api.clientCode(), expiresAt: RealDate.now() - 1000, hours: 1 });
  assert.equal(api.accessActive(), false);
  api.saveAccessState(null);
  assert.equal(api.accessState(), null);
});

await test("одинаковые первые 12 знаков не повторяются в 300 генерациях", async () => {
  const heads = new Set();
  for (let i = 0; i < 300; i++) {
    const code = api.makeClientCode();
    const head = code.slice(0, 12);
    assert.ok(!heads.has(head), "повтор первых 12 знаков: " + head);
    heads.add(head);
  }
});

console.log(`\nГотово: ${passed} проверок пройдено${process.exitCode ? ", есть ошибки" : ""}`);

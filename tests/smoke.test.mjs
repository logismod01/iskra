/**
 * Дымовой тест страницы: загружаем index.html в jsdom и проверяем,
 * что приложение стартует, экран ключа открывается, а ключ активируется.
 *
 * Запуск: node tests/smoke.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => errors.push(e.message + (e.detail ? "\n" + e.detail : "")));
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

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
await wait(600);

const $ = (s) => window.document.querySelector(s);
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (e) {
    console.error("  ✗ " + name);
    console.error("    " + (e && e.message));
    process.exitCode = 1;
  }
}

await test("страница загрузилась без ошибок JS", () => {
  assert.deepEqual(errors, []);
});

await test("ключевые элементы на месте", () => {
  for (const id of ["#accessChip", "#proBody", "#openAccessBtn", "#proModal", "#checkAll", "#editionBtns"]) {
    assert.ok($(id), "нет элемента " + id);
  }
});

await test("код клиента сгенерирован и по формату", () => {
  const code = window.clientCode();
  assert.match(code, /^\d{6}-[A-Z0-9]{6}-[a-z]{6}$/);
  assert.equal($("#accessChip").textContent.trim(), "Бесплатная");
});

await test("экран «Доступ по ключу» открывается и показывает код", () => {
  window.openAccessPanel();
  assert.ok($("#proModal").classList.contains("open"));
  const text = $("#proBody").textContent;
  assert.ok(text.includes("Мой код клиента"), "нет блока с кодом клиента");
  assert.ok(text.includes(window.clientCode()), "код клиента не выведен");
  assert.ok($("#accessKeyInput"), "нет поля для ключа");
});

await test("кнопка «Искра Pro» не включает Pro без ключа", () => {
  window.document.querySelector('#editionBtns button[data-e="pro"]').click();
  assert.equal(window.proActive(), false);
  assert.equal($('#editionBtns button[data-e="pro"]').classList.contains("active"), false);
  assert.ok($("#proModal").classList.contains("open"), "должен открыться экран ключа");
});

await test("офлайн-ключ активируется и включает Pro", async () => {
  const client = window.clientCode();
  const issued = await window.localIssueKey(client, 24, "smoke");
  assert.equal(issued.ok, true);
  const res = await window.activateAccessKey(issued.key);
  assert.equal(res.ok, true);
  assert.ok(window.accessActive());
  assert.equal(window.proActive(), true);
  assert.match($("#accessChip").textContent, /^Pro · /);
});

await test("ключ для чужого кода не активируется", async () => {
  window.localStorage.removeItem("iskra.access.v1");
  window.applyAccess();                    // снимаем Pro, выданный ключом
  const other = await window.localIssueKey("111111-AAAAAA-orange", 24);
  const res = await window.activateAccessKey(other.key);
  assert.equal(res.ok, false);
  assert.equal(window.proActive(), false);
});

await test("серверный ключ активируется через Supabase RPC", async () => {
  const expiry = new Date(Date.now() + 24 * 3600e3).toISOString();
  window.fetch = async (url) => {
    assert.match(String(url), /\/rest\/v1\/rpc\/iskra_activate_key$/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true, key: "ISKRA-24-AAAA-BBBB-CCCC", client: window.clientCode(),
        hours: 24, activated_at: new Date().toISOString(), expires_at: expiry, label: "тест"
      })
    };
  };
  const res = await window.activateAccessKey("ISKRA-24-AAAA-BBBB-CCCC");
  assert.equal(res.ok, true);
  assert.equal(res.engine, "server");
  assert.equal(window.accessActive(), true);
  const st = window.accessState();
  assert.equal(st.engine, "server");
  assert.equal(st.label, "тест");
  assert.ok($("#accessChip").textContent.startsWith("Pro · "));
  window.fetch = async () => { throw new Error("offline в тесте"); };
});

await test("чужой серверный ключ не принимается", async () => {
  window.localStorage.removeItem("iskra.access.v1");
  window.applyAccess();
  window.fetch = async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ ok: false, error: "Ключ выдан для другого кода клиента" })
  });
  const res = await window.activateAccessKey("ISKRA-24-DDDD-EEEE-FFFF");
  assert.equal(res.ok, false);
  assert.match(res.msg, /другого кода/);
  assert.equal(window.accessActive(), false);
  window.fetch = async () => { throw new Error("offline в тесте"); };
});

await test("Puter без входа не открывает окно, а берёт бесплатный движок", async () => {
  let signInCalled = false;
  window.loadPuter = async () => ({
    auth: { isSignedIn: async () => false, signIn: async () => { signInCalled = true; } },
    ai: { chat: async () => { throw new Error("puter.ai не должен вызываться без входа"); } }
  });
  const signed = await window.puterSignedInCached(true);
  assert.equal(signed, false);
  assert.equal(signInCalled, false, "окно входа Puter не должно открываться само");
  assert.equal(typeof window.streamChat, "function");
});

console.log(`\nГотово: ${passed} проверок пройдено${process.exitCode ? ", есть ошибки" : ""}`);
await wait(800);            // даём фоновым запросам (курс TON) спокойно завершиться
window.close();

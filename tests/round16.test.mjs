/**
 * Раунд 16: третья порция тем для общей базы + проверка «а знает ли Искра?».
 *
 * 1) SQL-файл порции: те же грабли, что и раньше — число колонок и значений,
 *    повторный запуск, финальный счётчик.
 * 2) В «Мои знания» появилось поле проверки: оно обязано показывать, откуда тема
 *    (общая база, выучено, встроенная) и честно говорить, когда темы нет.
 *
 * Запуск: node tests/round16.test.mjs
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

/* ---------- 1. SQL-порция ---------- */
const sqlPath = new URL("../supabase/iskra-shared-kb-batch3.sql", import.meta.url);
const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, "utf8") : "";
const header = sql.slice(sql.indexOf("insert into"), sql.indexOf("values"));
const columns = header.slice(header.indexOf("(") + 1, header.indexOf(")")).split(",").map((c) => c.trim());
const lines = sql.split("\n").filter((l) => l.startsWith("  ('"));
const rows = lines.map((line) => [...line.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]));

await test("порция тем на месте и собрана без ошибок", async () => {
  assert(sql.length > 1000, "нет файла supabase/iskra-shared-kb-batch3.sql");
  assert(columns.join(",") === "topic,topic_norm,body,tags", "колонки: " + columns.join(","));
  assert(rows.length >= 55, "тем в порции: " + rows.length);
});

await test("в каждой строке ровно 4 значения", async () => {
  const bad = rows.filter((r) => r.length !== 4);
  assert(bad.length === 0, "строк с другим числом значений: " + bad.length);
});

await test("темы не пустые, не повторяются и длиннее 120 символов", async () => {
  assert(new Set(rows.map((r) => r[0].toLowerCase())).size === rows.length, "есть повтор темы внутри порции");
  assert(rows.every((r) => r[0].length >= 4), "слишком короткое название");
  assert(rows.every((r) => r[2].length >= 120), "слишком короткий текст темы");
  assert(rows.every((r) => r[3].length >= 3), "нет слов для поиска");
});

await test("повторный запуск безопасен, в конце честный счётчик", async () => {
  assert(/on conflict \(topic_norm\) do update/i.test(sql), "нужен on conflict (topic_norm) do update");
  const tail = sql.trim().split("\n").slice(-3).join("\n");
  assert(/select count\(\*\) as тем_в_общей_базе/i.test(tail), "нет финального select count(*)");
  assert(/where active/i.test(tail), "счётчик должен брать только активные темы");
  assert(!/sk_live|service_role|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(sql), "в SQL попали ключи");
});

/* ---------- 2. Панель «Мои знания» ---------- */
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
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
  }
});
const { window } = dom;
await new Promise((r) => setTimeout(r, 400));

await test("в «Мои знания» есть поле проверки", async () => {
  window.eval("renderKnowledgePanel()");
  const box = window.document.querySelector("#knowBody");
  assert(box && box.querySelector("#kbCheckInput"), "нет поля проверки");
  assert(box.querySelector("#kbCheckGo"), "нет кнопки «Проверить»");
  assert(box.querySelector("#kbCheckOut"), "нет места для результата");
});

await test("проверка показывает тему и откуда она", async () => {
  window.eval(`
    _sharedKb = null; _sharedKbAt = 0;
    sharedKbSave([{ topic: "Давление", text: "ПРОВЕРКА_БАЗЫ: для взрослого высокое давление — от 140/90, измерять в покое.", tags: "здоровье" }]);
    renderKnowledgePanel();
    kbCheckRun("давление");
  `);
  const out = window.document.querySelector("#kbCheckOut").textContent;
  assert(out.includes("Давление"), "тема не показана: " + out.slice(0, 120));
  assert(out.includes("общая база"), "не сказано, что тема из общей базы: " + out.slice(0, 160));
});

await test("если темы нет — это сказано прямо, без выдумок", async () => {
  window.eval(`renderKnowledgePanel(); kbCheckRun("зюзьга пупырчатая");`);
  const out = window.document.querySelector("#kbCheckOut").textContent;
  assert(out.includes("нет ни в одной базе"), "нет честного сообщения: " + out.slice(0, 120));
});

await test("пустой ввод не запускает поиск", async () => {
  window.eval(`renderKnowledgePanel(); kbCheckRun("");`);
  const out = window.document.querySelector("#kbCheckOut").textContent;
  assert(out.includes("Напиши хотя бы слово"), "нет подсказки на пустой ввод: " + out.slice(0, 120));
});

try { window.close(); } catch (e) {}
console.log("round16: " + passed + " проверок, тем в порции: " + rows.length + " — ок");

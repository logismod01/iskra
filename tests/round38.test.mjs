/**
 * Раунд 38: подключение своего ключа — понятно и проверяемо (1.40.0).
 *
 * Что было не так:
 *   человек вписывал ключ и не понимал, работает тот или нет. Пометка
 *   «ключ работает» жила только до перезагрузки, а в настройках не было
 *   ни плашки, ни понятных шагов — только абзац мелкого текста.
 *
 * Запуск: node tests/round38.test.mjs
 */
import fs from "node:fs";
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

const site = () => new JSDOM(html, {
  runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole()
}).window;

console.log("round38: свой ключ — " + pkg.version);

await test("в настройках есть плашка о состоянии ключа", async () => {
  const w = site();
  assert(w.document.getElementById("keyState"), "нет плашки");
  assert(/key-state/.test(html), "нет стиля плашки");
});

await test("без ключа плашка честно говорит, что ключ не нужен", async () => {
  const w = site();
  w.paintKeyStatus();
  const text = w.document.getElementById("keyState").textContent;
  assert(/бесплатных движках/i.test(text), "не сказано, что работает и так: " + text);
});

await test("ключ вписан, но не проверен — так и написано", async () => {
  const w = site();
  w.eval('settings.apiKey = "gsk_testKeyForCheck1234567890"');
  w.paintKeyStatus();
  const box = w.document.getElementById("keyState");
  assert(/ещё ни разу не отвечал/i.test(box.textContent), "нет честного «не проверен»: " + box.textContent);
  assert(/wait/.test(box.className), "нет состояния ожидания");
});

await test("после первого ответа пометка сохраняется и видна везде", async () => {
  const w = site();
  w.eval('settings.apiKey = "gsk_testKeyForCheck1234567890"');
  assert(w.keyIsVerified() === false);
  w.markKeyWorking("openai/gpt-oss-120b");
  assert(w.keyIsVerified() === true, "пометка не встала");
  const saved = JSON.parse(w.localStorage.getItem("iskra.settings.v1") || "{}");
  assert(saved.keyVerified, "пометка не сохранилась в настройках");
  assert(saved.keyModel === "openai/gpt-oss-120b", "модель не запомнилась");
  w.paintKeyStatus();
  assert(/Ключ работает/.test(w.document.getElementById("keyState").textContent), "плашка не обновилась");
  w.updateComposerNote();
  assert(/твоим ключом/.test(w.document.querySelector(".composer-note").textContent), "строка под полем не обновилась");
});

await test("пометка сбрасывается на другом ключе", async () => {
  const w = site();
  w.eval('settings.apiKey = "gsk_testKeyForCheck1234567890"');
  w.markKeyWorking("m1");
  assert(w.keyIsVerified() === true);
  w.eval('settings.apiKey = "gsk_ДругойКлюч0000000000000000"');
  assert(w.keyIsVerified() === false, "чужой ключ считает проверенным");
});

await test("в настройках есть три шага, а не стена текста", async () => {
  assert(/три шага/i.test(html), "нет пошаговой подсказки");
  const i = html.indexOf("три шага");
  const block = html.slice(i, i + 1400);
  assert(/1\./.test(block) && /2\./.test(block) && /3\./.test(block), "нет нумерованных шагов");
  assert(/Проверить ключ/.test(block), "не сказано нажать проверку");
});

await test("сказано честно: если сервис закрыт для страны — обойти нельзя", async () => {
  assert(/не открывается из твоей страны/i.test(html), "нет честного предупреждения");
  assert(/обойти это нельзя/i.test(html), "нет честного «обойти нельзя»");
});

await test("убрать ключ сбрасывает и пометку", async () => {
  const idx = html.indexOf('settings.keyVerified = "";');
  assert(idx > 0, "при очистке ключа пометка не сбрасывается");
});

if (!process.exitCode) console.log("round38: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

/**
 * Раунд 23: фото перестало теряться.
 *
 * По скриншотам: человек прислал фото домашки, а Искра ответила
 * «Привет! Я Искра — ваш ИИ-ассистент. Чем могу помочь?» и потом
 * «у меня нет твоих заданий».
 *
 * Причина: сообщение с картинкой хранится не строкой, а списком частей
 * (текст + картинка). Перед отправкой всё прогонялось через sanitizeMessages,
 * и там стояло «content не строка — значит пусто» → сообщение вместе с фото
 * ВЫБРАСЫВАЛОСЬ. Движок получал пустоту (или один обрывок) и отвечал
 * приветствием из шаблона.
 *
 * Что проверяем:
 * 1) сообщение с фото доходит до движка и содержит картинку;
 * 2) правило «домашка по фото» реально попадает в системный промпт;
 * 3) слепому движку фото не отдаётся — вместо вранья честная карточка;
 * 4) ключ Gemini распознаётся, и Gemini/Groq умеют смотреть фото;
 * 5) «Повторить» больше не теряет картинку.
 *
 * Запуск: node tests/round23.test.mjs
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

console.log("round23: Искра снова видит фото");

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
    win.fetch = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=";

/* ---------- 1. Главный баг: фото выживает при очистке сообщений ---------- */
await test("сообщение с фото не выбрасывается перед отправкой", async () => {
  const out = window.eval(`JSON.stringify(sanitizeMessages([
    { role: "system", content: "ты Искра" },
    { role: "user", content: [
      { type: "text", text: "Сделай все задания" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } }
    ] }
  ]))`);
  const msgs = JSON.parse(out);
  const user = msgs.find(m => m.role === "user");
  assert(user, "сообщение с фото потерялось целиком");
  assert(Array.isArray(user.content), "фото превратилось в пустую строку");
  assert(user.content.some(p => p.type === "image_url"), "в сообщении нет картинки");
  assert(user.content.some(p => p.type === "text" && p.text.includes("Сделай")), "нет текста задания");
});

await test("обычные текстовые сообщения по-прежнему склеиваются", async () => {
  const out = window.eval(`JSON.stringify(sanitizeMessages([
    { role: "system", content: "с" },
    { role: "user", content: "раз" },
    { role: "user", content: "два" }
  ]))`);
  const msgs = JSON.parse(out);
  assert(msgs.length === 2, "склейка сломалась: " + msgs.length);
  assert(msgs[1].content === "раз\n\nдва", "текст склеился неправильно: " + msgs[1].content);
});

/* ---------- 2. Сборка запроса ---------- */
await test("apiPayload кладёт фото в запрос и включает правило про домашку", async () => {
  window.eval(`settings.mode = "chat"; settings.memory = []; settings.knowledge = [];`);
  const out = window.eval(`JSON.stringify(apiPayload([
    { role: "user", content: "реши задания", images: [${JSON.stringify(PHOTO)}] }
  ]))`);
  const body = JSON.parse(out);
  const user = body.messages.find(m => m.role === "user");
  assert(Array.isArray(user.content), "фото не попало в запрос");
  assert(user.content.some(p => p.type === "image_url"), "нет картинки в запросе");
  const sys = body.messages.find(m => m.role === "system").content;
  assert(/ДОМАШКА ПО ФОТО/.test(sys), "правило «домашка по фото» не включилось");
});

await test("без фото запрос остаётся текстовым", async () => {
  const out = window.eval(`JSON.stringify(apiPayload([{ role: "user", content: "привет" }]))`);
  const body = JSON.parse(out);
  const user = body.messages.find(m => m.role === "user");
  assert(typeof user.content === "string", "текстовый запрос стал массивом");
  const sys = body.messages.find(m => m.role === "system").content;
  assert(!/ДОМАШКА ПО ФОТО/.test(sys), "правило про фото влезло в обычный чат");
});

/* ---------- 3. Слепому движку фото не отдаём ---------- */
await test("если зрячих движков нет — честная ошибка, а не выдуманный ответ", async () => {
  let called = 0;
  window.fetch = async () => { called++; return new Response("{}", { status: 200 }); };
  window.eval(`orderedEngines = () => ([
    { id: "blind1", base: "https://blind.example/v1", model: "gpt-oss-20b" },
    { id: "blind2", base: "https://blind2.example/v1", model: "mistral-nemo" }
  ]);`);
  let kind = "";
  try {
    await window.eval(`askIskra({ messages: [{ role: "user", content: [
      { type: "text", text: "реши" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } }
    ] }] })`);
  } catch (e) { kind = e && e.kind; }
  assert(kind === "no-vision", "ошибка не та: " + kind);
  assert(called === 0, "слепому движку всё-таки отправили запрос");
});

await test("зрячий движок в списке остаётся", async () => {
  window.eval(`orderedEngines = () => ([
    { id: "blind", base: "https://blind.example/v1", model: "gpt-oss-20b" },
    { id: "eye", base: "https://eye.example/v1", model: "gemini-2.5-flash", vision: true }
  ]);`);
  const kept = await window.eval(`(async () => {
    let list = await resolveKeyEngines(orderedEngines(true), true);
    return list.filter(e => e.vision || guessVision(e.model)).map(e => e.id);
  })()`);
  assert(kept.length === 1 && kept[0] === "eye", "осталось: " + JSON.stringify(kept));
});

/* ---------- 4. Честная карточка ---------- */
await test("вместо «нет твоих заданий» — «я не вижу фотографии»", async () => {
  const err = window.eval(`new ApiError(415, "нет движка", "no-vision")`);
  const content = doc.createElement("div");
  const aiMsg = { id: "x", role: "assistant", content: "" };
  window.showFailCard(content, aiMsg, "реши задания", err, [PHOTO]);
  assert(/Фотографию я разобрать не смогла/.test(aiMsg.content), "не сказала честно: " + aiMsg.content.slice(0, 80));
  assert(/AIza/.test(aiMsg.content), "не подсказала, какой ключ включает зрение");
  const buttons = [...content.querySelectorAll("button")].map(b => b.textContent.trim());
  assert(buttons.some(b => /Написать задание словами/.test(b)), "нет выхода «напиши текстом»: " + buttons.join(", "));
  assert(buttons.some(b => /Ввести ключ/.test(b)), "нет кнопки ключа");
});

await test("«Повторить» не теряет картинку", async () => {
  const start = html.indexOf("function showFailCard");
  const src = html.slice(start, html.indexOf("\nfunction ", start + 10));
  assert(!/sendMessage\(question, \[\], false, true\)/.test(src), "повтор всё ещё без фото");
  assert(/sendMessage\(question, images \|\| \[\], false, true\)/.test(src), "повтор не передаёт фото");
});

/* ---------- 5. Ключи: Gemini и зрячий Groq ---------- */
await test("ключ Gemini распознаётся по виду", async () => {
  const key = "AIza" + "B".repeat(35);
  const kind = window.eval(`JSON.stringify(detectKeyKind(${JSON.stringify(key)}))`);
  const k = JSON.parse(kind);
  assert(k && k.provider === "gemini", "ключ не распознан: " + kind);
  assert(/generativelanguage\.googleapis\.com\/v1beta\/openai/.test(k.base), "адрес Gemini не тот: " + k.base);
});

await test("у Gemini и Groq есть зрячие модели", async () => {
  const providers = window.eval("JSON.stringify(KEY_PROVIDERS)");
  const p = JSON.parse(providers);
  assert(p.gemini && p.gemini.vision === true, "Gemini не помечен как зрячий");
  assert(p.groq.models.some(m => /llama-4-scout/.test(m)), "у Groq нет зрячей модели");
  assert(window.eval(`guessVision("meta-llama/llama-4-scout-17b-16e-instruct")`) === true, "scout не считается зрячим");
  assert(window.eval(`guessVision("gemini-2.5-flash")`) === true, "gemini не считается зрячим");
});

/* ---------- 6. Версия ---------- */
await test("версия сайта и кэша — 1.31.0", async () => {
  assert(pkg.version === "1.31.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.31\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round23: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

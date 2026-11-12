/**
 * Раунд 24: фото читается без ключей.
 *
 * Задача: человек фотографирует страницу с заданиями, а бесплатные движки
 * картинок не видят. Раньше был тупик: либо платный (по факту — недоступный
 * из России) ключ, либо «напиши словами».
 *
 * Теперь текст со снимка читает сам браузер: библиотека распознавания лежит
 * рядом с сайтом (vendor/tesseract), снимок никуда не уходит. Дальше обычная
 * текстовая модель решает задание.
 *
 * Что проверяем:
 * 1) файлы распознавания лежат в сайте и не битые;
 * 2) текст с фото подставляется в запрос вместо картинки (preferText);
 * 3) в промпт попадает правило «прочитала с фото, проверь»;
 * 4) мусор от распознавания не выдаётся за текст;
 * 5) если зрение не сработало, сайт сам переходит на распознавание;
 * 6) лимиты: картинка готовится крупнее и чёрно-белой;
 * 7) версия 1.24.0.
 *
 * Запуск: node tests/round24.test.mjs
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

const root = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const sizeOf = (p) => fs.statSync(new URL(p, root)).size;
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");

console.log("round24: фото читается без ключей");

/* ---------- 1. Файлы библиотеки на месте ---------- */
await test("библиотека распознавания лежит рядом с сайтом", async () => {
  const files = [
    "vendor/tesseract/tesseract.min.js",
    "vendor/tesseract/worker.min.js",
    "vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
    "vendor/tesseract/tesseract-core-simd-lstm.wasm",
    "vendor/tesseract/tesseract-core-lstm.wasm.js",
    "vendor/tesseract/tesseract-core-lstm.wasm",
    "vendor/tesseract/lang/rus.traineddata.gz"
  ];
  for (const f of files) {
    assert(sizeOf(f) > 1000, "файл пустой: " + f);
  }
});

await test("русский язык и ядро весят разумно (телефон потянет)", async () => {
  assert(sizeOf("vendor/tesseract/lang/rus.traineddata.gz") < 6e6, "язык слишком тяжёлый");
  assert(sizeOf("vendor/tesseract/tesseract-core-simd-lstm.wasm") < 4e6, "ядро слишком тяжёлое");
});

await test("у библиотеки не стёрли лицензию", async () => {
  assert(sizeOf("vendor/tesseract/LICENSE-core.txt") > 500, "нет лицензии ядра");
});

/* ---------- 2. Логика ---------- */
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
await new Promise((r) => setTimeout(r, 800));

await test("текст с фото уходит вместо картинки", async () => {
  const out = window.eval(`JSON.stringify(toApiMsg({
    role: "user", content: "реши задания",
    images: ["data:image/jpeg;base64,AAA"],
    ocrText: "1) 2+2 2) 5*3"
  }, true))`);
  const msg = JSON.parse(out);
  assert(typeof msg.content === "string", "всё ещё массив с картинкой");
  assert(msg.content.includes("2+2"), "текста с фото нет в запросе");
  assert(!msg.content.includes("image_url"), "осталась картинка");
});

await test("без просьбы о тексте картинка остаётся картинкой", async () => {
  const out = window.eval(`JSON.stringify(toApiMsg({
    role: "user", content: "реши", images: ["data:image/jpeg;base64,AAA"], ocrText: "текст"
  }, false))`);
  const msg = JSON.parse(out);
  assert(Array.isArray(msg.content), "картинка потерялась");
  assert(msg.content.some(p => p.type === "image_url"), "нет картинки");
});

await test("apiPayload с распознанным текстом не просит движок со зрением", async () => {
  const out = window.eval(`JSON.stringify(apiPayload([{
    role: "user", content: "реши", images: ["data:image/jpeg;base64,AAA"], ocrText: "Упражнение 12: 3x=9"
  }], { preferText: true }))`);
  const body = JSON.parse(out);
  const user = body.messages.find(m => m.role === "user");
  assert(typeof user.content === "string", "запрос всё ещё с картинкой");
  assert(user.content.includes("3x=9"), "условие не попало в запрос");
  const sys = body.messages.find(m => m.role === "system").content;
  assert(/ПРОЧИТАННОЕ ПРОГРАММОЙ РАСПОЗНАВАНИЯ/.test(sys), "нет правила «проверь распознанное»");
  assert(/Прочитала с фото так/.test(sys), "нет требования пересказать условие");
});

await test("без фото правило про распознавание не лезет", async () => {
  const sys = window.eval(`buildSystemPrompt("привет", false, false)`);
  assert(!/ПРОЧИТАННОЕ ПРОГРАММОЙ РАСПОЗНАВАНИЯ/.test(sys), "правило попало в обычный чат");
});

/* ---------- 3. Мусор не выдаём за текст ---------- */
await test("каша из символов не считается текстом", async () => {
  assert(window.eval(`ocrReadable("§$%&//\\\\|@#~^*()_=+[]{}<>")`) === false, "мусор принят за текст");
  assert(window.eval(`ocrReadable("")`) === false, "пустота принята за текст");
  assert(window.eval(`ocrReadable("Упражнение 12. Реши уравнения: а) 3x = 9, б) 2y + 4 = 10")`) === true, "нормальный текст отвергнут");
  assert(window.eval(`ocrReadable("коротко")`) === false, "обрезанный обрывок принят за текст");
});

await test("распознанный текст чистится: переносы через дефис, лишние пустые строки", async () => {
  const out = window.eval(`ocrClean("Зада-\\nча 1.\\n\\n\\n\\nУсловие    тут")`);
  assert(out.includes("Задача 1"), "перенос через дефис не склеен: " + out);
  assert(!/\n{3,}/.test(out), "остались тройные переносы");
  assert(!/ {2,}/.test(out), "остались двойные пробелы");
});

await test("длинный текст обрезается, чтобы не съесть лимит модели", async () => {
  const out = window.eval(`ocrClean(${JSON.stringify("а".repeat(20000))})`);
  assert(out.length <= 8000, "текст не обрезан: " + out.length);
});

/* ---------- 4. Запасной путь включён ---------- */
await test("если зрение не сработало, сайт сам читает текст с фото", async () => {
  assert(/ocrWithProgress\(images, streamEl, signal\)/.test(html), "нет перехода на распознавание");
  assert(/pendingOcr = ocrImages\(images, null, signal\)/.test(html), "нет раннего чтения, пока движок молчит");
  assert(/preferText: true/.test(html), "повтор идёт без распознанного текста");
  assert(/userMsg\.ocrText = ocrText/.test(html), "текст не сохраняется — «Повторить» снова упрётся в фото");
});

await test("человек видит, что идёт чтение с фото", async () => {
  assert(/Читаю текст с фотографии/.test(html), "нет сообщения о распознавании");
  assert(/ocr-note/.test(html), "нет пометки под ответом");
});

await test("карточка отказа больше не отправляет искать ключ", async () => {
  const start = html.indexOf("if (err && err.kind === \"no-vision\")");
  const block = html.slice(start, start + 1600);
  assert(/Пересними ближе и ровно/.test(block), "нет совета переснять");
  assert(/продиктуй голосом/.test(block), "нет совета про диктовку");
  assert(!/^2\) Включи свой ключ/.test(block), "ключ по-прежнему первый совет");
});

await test("ответ «фото не пришло» не считается ответом", async () => {
  assert(window.eval(`ocrSaysNoImage("Привет! Я не вижу фото, пришли его ещё раз")`) === true, "пропустила отказ");
  assert(window.eval(`ocrSaysNoImage("Изображение не загрузилось, попробуй снова")`) === true, "пропустила отказ");
  assert(window.eval(`ocrSaysNoImage("Упражнение 12. 3x = 9, значит x = 3")`) === false, "съела нормальный ответ");
  assert(window.eval(`ocrSaysNoImage("На фото плохо видно условие, пересними")`) === false, "съела честный разбор фото");
});

await test("после такого ответа сайт читает фото и спрашивает заново", async () => {
  assert(/if \(images\.length && !signal\.aborted && ocrSaysNoImage\(acc\)\)/.test(html),
    "нет проверки ответа на «фото не пришло»");
  assert(/if \(!\(await retryWithOcr\(\)\)\) throw visionErr/.test(html), "нет повтора после отказа зрения");
  assert(/let ocrRetried = false/.test(html), "повтор может зациклиться");
});

/* ---------- 5. Картинка готовится правильно ---------- */
await test("снимок увеличивается и становится чёрно-белым", async () => {
  const fn = html.slice(html.indexOf("function ocrPrepare"), html.indexOf("function ocrClean"));
  assert(/maxSide = 2400/.test(fn), "нет увеличения снимка");
  assert(/0\.299 \* px\[i\]/.test(fn), "нет перевода в серый");
  assert(/toDataURL\("image\/jpeg"/.test(fn), "снимок не пересобирается");
});

await test("ядро выбирается по поддержке SIMD", async () => {
  assert(/WebAssembly\.validate/.test(html), "нет проверки SIMD");
  assert(/tesseract-core-simd-lstm\.wasm\.js/.test(html), "нет быстрого ядра");
  assert(/tesseract-core-lstm\.wasm\.js/.test(html), "нет запасного ядра");
});

/* ---------- 6. Версия ---------- */
await test("версия сайта и кэша — 1.26.0", async () => {
  assert(pkg.version === "1.26.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.26\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round24: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

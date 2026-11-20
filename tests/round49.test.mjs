/**
 * Тест сорок девятого круга: переводчик, память переписки, токены и ключи.
 *
 * Что проверяем:
 *  • токены: бесплатные 10 000 на 5 дней, сообщение стоит 1 500–5 000;
 *  • свой ключ снимает лимиты, покупка и коды активации работают;
 *  • тарифы отличаются от бесплатного и начисляют токены;
 *  • память запоминает всё, что пишут, и ищет по словам;
 *  • ключи: кончился лимит — следующий ключ идёт первым;
 *  • переводчик: автоопределение языка, сленг и правила;
 *  • экраны и пункты меню на месте.
 *
 * Запуск: node tests/round49.test.mjs
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
const ev = (code) => window.eval(code);
const j = (code) => JSON.parse(ev(`JSON.stringify(${code})`));
const evAsync = async (code) => JSON.parse(await window.eval(`(async () => JSON.stringify(${code}))()`));
const K1 = "gsk_" + "a1b2c3d4e5".repeat(4);
const K2 = "sk-or-v1-" + "f6e7d8c9b0".repeat(4);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(400);

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(["✓", name]);
  } catch (e) {
    results.push(["✗", name + "\n    " + (e && e.message)]);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "условие не выполнено");
}

/* ------------------------- 1. Токены и лимиты ------------------------- */
await test("бесплатный тариф: 10 000 токенов на 5 дней", () => {
  ev(`localStorage.clear(); _memoCache = null;`);
  const w = j("walletState()");
  assert(w.freeLeft === 10000, "бесплатных токенов: " + w.freeLeft);
  assert(w.plan === "free", "тариф по умолчанию: " + w.plan);
  const days = (w.freeReset - Date.now()) / 864e5;
  assert(days > 4.9 && days <= 5.01, "срок бесплатных: " + days);
});

await test("сообщение стоит от 1 500 до 5 000 токенов по сложности", () => {
  const simple = j(`msgTokenCost("привет", {})`);
  const hard = j(`msgTokenCost("реши задачу по шагам и докажи теорему, напиши код на python и объясни подробно. " + "Разбери каждый шаг и покажи, почему он верный, а потом проверь ответ ещё раз по-другому. ".repeat(14), { images: true, power: "ultra", mode: "code" })`);
  assert(simple === 1500, "простое сообщение: " + simple);
  assert(hard === 5000, "сложное сообщение: " + hard);
  const mid = j(`msgTokenCost("объясни, как устроен двигатель внутреннего сгорания, коротко", {})`);
  assert(mid >= 1500 && mid <= 5000, "среднее сообщение: " + mid);
});

await test("лимит срабатывает, когда токенов не хватает", () => {
  ev(`localStorage.clear(); _memoCache = null; settings.apiKey = "";`);
  ev(`tokenCharge(walletLeft(), "тест")`);
  const gate = j(`tokenGate("привет", {})`);
  assert(gate.ok === false, "пустила без токенов");
  assert(gate.left === 0, "остаток: " + gate.left);
  const w = j("walletState()");
  assert(w.freeLeft === 0, "бесплатные не обнулились");
});

await test("свой ключ снимает лимиты и не списывает токены", () => {
  ev(`settings.apiKey = "gsk_test1234567890abcdefghijklmnopqrstuvwxyz";`);
  const gate = j(`tokenGate("привет", {})`);
  assert(gate.ok === true && gate.own === true, "свой ключ не снял лимит");
  assert(gate.cost === 0, "со своим ключом списывает: " + gate.cost);
  ev(`settings.apiKey = "";`);
});

await test("неудачный ответ возвращает токены", () => {
  ev(`localStorage.clear(); _memoCache = null;`);
  const before = j("walletLeft()");
  ev(`tokenCharge(2000, "тест")`);
  const mid = j("walletLeft()");
  assert(mid === before - 2000, "не списалось: " + before + " → " + mid);
  ev(`tokenRefund(2000, "тест")`);
  assert(j("walletLeft()") === before, "возврат не сработал");
});

/* ------------------------- 2. Покупка и тарифы ------------------------- */
await test("пакеты: от 10 000 за 20 ₽ до триллиона за 3 500 ₽", () => {
  const packs = j("TOKEN_PACKS");
  assert(packs.length >= 8, "пакетов: " + packs.length);
  assert(packs[0].tokens === 10000 && packs[0].price === 20, "первый пакет: " + JSON.stringify(packs[0]));
  const last = packs[packs.length - 1];
  assert(last.tokens === 1e12, "последний пакет: " + last.tokens);
  assert(last.price === 3500, "цена триллиона: " + last.price);
  const cheaper = packs[1].price / packs[1].tokens < packs[0].price / packs[0].tokens;
  assert(cheaper, "крупный пакет не выгоднее мелкого");
});

await test("тарифы отличаются от бесплатного и начисляют токены", () => {
  const plans = j("TOKEN_PLANS");
  const paid = plans.filter((p) => p.id !== "free");
  assert(paid.length >= 3, "платных тарифов: " + paid.length);
  assert(paid.every((p) => p.tokens > 10000), "тариф не больше бесплатного");
  ev(`localStorage.clear();`);
  ev(`walletSetPlan("pro", 30)`);
  const w = j("walletState()");
  assert(w.plan === "pro", "тариф не встал: " + w.plan);
  assert(w.paid >= 1000000, "токенов по тарифу: " + w.paid);
  const days = (w.planUntil - Date.now()) / 864e5;
  assert(days > 29 && days < 31, "срок тарифа: " + days);
});

await test("код активации начисляет токены и не срабатывает дважды", () => {
  ev(`localStorage.clear();`);
  const code = ev(`tokenMakeCode(100000)`);
  const n = j(`tokenReadCode(${JSON.stringify(code)})`);
  assert(n === 100000, "код читается как: " + n);
  const before = j("walletLeft()");
  const ok = j(`tokenRedeem(${JSON.stringify(code)})`);
  assert(ok.ok === true, "код не принят: " + JSON.stringify(ok));
  assert(j("walletLeft()") === before + 100000, "начислено: " + j("walletLeft()"));
  const again = j(`tokenRedeem(${JSON.stringify(code)})`);
  assert(again.ok === false, "один код сработал дважды");
  const fake = j(`tokenRedeem("ISKRA-T100000-zzzz")`);
  assert(fake.ok === false, "поддельный код принят");
});

/* ------------------------- 3. Память переписки ------------------------- */
await test("запоминает всё, что пишут, и находит по словам", () => {
  ev(`localStorage.clear(); _memoCache = null;`);
  ev(`memoAdd("у меня дача в Иркутске, поливаю огурцы", "c1")`);
  ev(`memoAdd("работаю на заводе, смена с восьми утра", "c1")`);
  const found = j(`memoSearch("огурцы")`);
  assert(found.length === 1, "нашлось: " + found.length);
  assert(/огурцы/.test(found[0].text), "не та запись");
  const again = j(`memoSearch("огурцы")`);
  assert(again.length === 1, "задублировалось");
});

await test("память попадает в системный промпт только по теме", () => {
  ev(`localStorage.clear(); _memoCache = null;`);
  ev(`memoAdd("мою машину зовут Ласточка", "c1")`);
  ev(`memoAdd("сын учится в пятом классе", "c1")`);
  const p = ev(`memoPrompt("как назвать машину?")`);
  assert(/Ласточка/.test(p), "про машину не вспомнила: " + p);
  assert(!/пятом классе/.test(p), "притащила лишнее: " + p);
});

await test("пустой вопрос не тянет память", () => {
  assert(ev(`memoPrompt("")`) === "", "память без вопроса");
  assert(ev(`memoPrompt("а")`) === "", "память на одну букву");
});

/* ------------------------- 4. Ключи ------------------------- */
await test("ключ с лимитом уходит в конец — автопереключение", () => {
  ev(`localStorage.clear();`);
  ev(`keyMark(${JSON.stringify(K1)}, 401)`);
  const order = j(`keysByHealth([${JSON.stringify(K1)}, ${JSON.stringify(K2)}])`);
  assert(order[0] === K2, "первым идёт не второй ключ");
  ev(`settings.apiKey = ${JSON.stringify(K1 + "\n" + K2)};`);
  const list = j(`keyStatusList()`);
  assert(list.length === 2, "ключей в списке: " + list.length);
  ev(`settings.apiKey = "";`);
  assert(list.some((k) => k.status === "bad"), "статуса нет: " + JSON.stringify(list));
});

await test("429 на конкретную модель не блокирует ключ", () => {
  ev(`localStorage.clear();`);
  ev(`settings.apiKey = ${JSON.stringify(K1)};`);
  ev(`keyMark(${JSON.stringify(K1)}, 429, "rate limit for model gpt-oss-120b")`);
  const list = j(`keyStatusList()`);
  assert(!list.some((k) => k.status === "limit"), "ключ заблокирован из-за модели");
  ev(`keyMark(${JSON.stringify(K1)}, 429, "insufficient quota for your key")`);
  const list2 = j(`keyStatusList()`);
  assert(list2.some((k) => k.status === "limit"), "квота ключа не отмечена");
});

/* ------------------------- 5. Переводчик ------------------------- */
await test("язык определяется сам: русский, английский, китайский", () => {
  assert(ev(`trDetect("привет, как дела? пойдём гулять")`) === "ru", "русский");
  assert(ev(`trDetect("hello there, how are you doing today?")`) === "en", "английский");
  assert(ev(`trDetect("你好，今天怎么样")`) === "zh", "китайский");
  assert(ev(`trDetect("hola, ¿cómo estás?")`) === "es", "испанский");
});

await test("в переводчике 30 языков и сленг по смыслу", () => {
  const langs = j("TR_LANGS");
  assert(langs.length === 30, "языков: " + langs.length);
  assert(ev(`TR_SLANG.length`) >= 30, "сленг-пар: " + ev(`TR_SLANG.length`));
  const hits = j(`trSlangHits("это было очень круто, я в восторге", "ru", "en")`);
  assert(hits.length > 0, "сленг не распознан");
  const rules = j("TR_RULES");
  assert(rules.length >= 6, "правил: " + rules.length);
});

await test("перевод идёт без ключа через открытые сервисы", async () => {
  const calls = [];
  window.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("mymemory")) return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: "It was very cool" } }), text: async () => "" };
    throw new Error("no host");
  };
  const out = await evAsync(`await trTranslate("это было очень круто", "auto", "en", {})`);
  assert(out && out.ok, "перевода нет: " + JSON.stringify(out));
  assert(/cool/i.test(out.text), "текст перевода: " + out.text);
  assert(out.from === "ru", "язык определён как: " + out.from);
  assert(out.via, "не сказано, через что переведено");
  assert(calls.length >= 1, "в сеть не ходила");
});

await test("известная фраза переводится по смыслу, без словаря", async () => {
  window.fetch = async () => { throw new Error("offline"); };
  const out = await evAsync(`await trTranslate("ни пуха ни пера", "auto", "en", {})`);
  assert(out && out.ok, "нет ответа: " + JSON.stringify(out));
  assert(/break a leg/i.test(out.text), "перевод: " + out.text);
  assert(out.notes && out.notes.length, "нет пояснения к сленгу");
});

await test("если все открытые сервисы молчат — честно говорит", async () => {
  window.fetch = async () => { throw new Error("offline"); };
  const out = await evAsync(`await trTranslate("обычный текст без идиом про погоду", "ru", "en", {})`);
  assert(out && out.ok === false, "выдумала перевод: " + JSON.stringify(out));
  assert(/не ответил/i.test(out.msg || ""), "сообщение: " + out.msg);
});

/* ------------------------- 6. Интерфейс ------------------------- */
await test("экраны переводчика, тарифов и памяти на месте", () => {
  ["trModal", "trInput", "trFrom", "trTo", "trGo", "trModel", "trResult", "trClose",
   "payModal", "payBody", "payClose", "tokenChip"].forEach((id) => {
    assert(window.document.getElementById(id), "нет элемента #" + id);
  });
  assert(window.document.getElementById("memoryBody"), "нет #memoryBody");
});

await test("пункты меню открывают переводчик и тарифы", () => {
  ev(`runMoreAction("translate")`);
  assert(window.document.getElementById("trModal").classList.contains("open"), "переводчик не открылся");
  ev(`runMoreAction("pay")`);
  assert(window.document.getElementById("payModal").classList.contains("open"), "тарифы не открылись");
  assert(/Токены|токен/i.test(window.document.getElementById("payBody").textContent), "в панели пусто");
});

await test("в настройках есть «сначала открытые источники» и «помнить переписку»", () => {
  assert(window.document.getElementById("freeFirst"), "нет галочки источников");
  assert(window.document.getElementById("memoOn"), "нет галочки памяти");
});

await test("память в настройках показывает и факты, и переписку", () => {
  ev(`localStorage.clear(); _memoCache = null; memoAdd("купил новый ноутбук", "c1")`);
  ev(`openMemory()`);
  const body = window.document.getElementById("memoryBody");
  assert(/Всё, что мне писали/.test(body.textContent), "нет раздела переписки");
  assert(/ноутбук/.test(body.textContent), "переписка не показана: " + body.textContent.slice(0, 120));
  assert(window.document.getElementById("memInput"), "нет поля факта");
});

await test("за всю работу не было ошибок JS", () => {
  const bad = errors.filter((e) => !/Could not load|not implemented|Not implemented/i.test(e));
  assert(bad.length === 0, bad.slice(0, 2).join(" | "));
});

let failed = 0;
for (const [mark, name] of results) {
  if (mark === "✗") failed++;
  console.log("  " + mark + " " + name);
}
console.log("\nГотово: " + (results.length - failed) + " проверок пройдено");
if (failed) process.exit(1);
process.exit(0);

/**
 * Тест пятьдесят первого круга: «21 тысяча конспектов и раздел „Страны“».
 *
 * Что проверяем:
 *  • конспектов стало больше 20 000 — новая волна карточек реально попала в пак;
 *  • индекс не сломался: 250 стран, 30 000 городов, 7 256 языков, 118 элементов;
 *  • у русских городов есть русские названия — и руками вписанные, и полученные
 *    обратной транслитерацией (Ангарск, Шелехов, Черемхово, Якутск);
 *  • столицы, языки и телефонные коды — по-русски и без ошибок (Россия «+7», не «+73»);
 *  • в «Мои знания» появился раздел «Страны»: карточки, флаг, поиск, «показать ещё»;
 *  • карточка страны подставляет вопрос в чат;
 *  • версия 1.58.
 *
 * Запуск: node tests/round51.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const indexJson = JSON.parse(fs.readFileSync(new URL("../topic-index.json", import.meta.url), "utf8"));
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const realFetch = window.fetch;
window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("topic-index.json")) {
    return { ok: true, status: 200, json: async () => indexJson, text: async () => JSON.stringify(indexJson) };
  }
  try { return await realFetch(url, opts); } catch (e) { return { ok: false, status: 503, json: async () => ({}), text: async () => "" }; }
};
await wait(500);

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name + "\n    " + (e && e.message)]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "условие не выполнено"); }

/* ------------------- 1. Конспекты ------------------- */
await test("конспектов больше 20 000 и пак пересобран", () => {
  const pack = j("KNOWLEDGE_PACK");
  assert(pack.items.length > 20000, "конспектов: " + pack.items.length);
  assert(pack.version >= 25, "версия пака: " + pack.version);
  assert(pack.updated === "2026-10-29", "дата пака: " + pack.updated);
});

await test("новая волна карточек на месте", () => {
  const titles = new Set(j("KNOWLEDGE_PACK").items.map((x) => x.title.toLowerCase()));
  const must = [
    "инсульт: признаки", "как заварить чай", "куликовская битва (1380)",
    "пушкин: «евгений онегин»", "фотосинтез", "байкал", "как найти процент от числа",
    "английский: артикли", "права ребёнка: главное", "как выбрать профессию",
    "что такое искусство", "общий анализ крови", "что такое блокчейн",
    "как варить рис", "с чего начать тренировки"
  ];
  const missing = must.filter((t) => !titles.has(t));
  assert(missing.length === 0, "нет тем: " + missing.join(", "));
});

await test("карточки новой волны с текстом, а не заглушкой", () => {
  const items = j("KNOWLEDGE_PACK").items;
  const c = items.find((x) => x.title === "Куликовская битва (1380)");
  assert(c && c.text.length > 80, "текст короткий: " + (c && c.text));
  assert(/Дмитрий Донской/.test(c.text), "текст не по теме: " + c.text);
  const short = items.slice(-1200).filter((x) => !x.text || x.text.length < 60);
  assert(short.length === 0, "коротких текстов: " + short.length);
});

/* ------------------- 2. Индекс ------------------- */
await test("индекс: 250 стран, 30 000 городов, 7 256 языков, 118 элементов", async () => {
  const ix = await evAsync(`await topicIndexLoad().then(x => x ? x.counts : null)`);
  assert(ix, "индекс не загрузился");
  assert(ix.countries === 250, "стран: " + ix.countries);
  assert(ix.cities === 30000, "городов: " + ix.cities);
  assert(ix.langs === 7256, "языков: " + ix.langs);
  assert(ix.elements === 118, "элементов: " + ix.elements);
});

await test("вместе с конспектами — больше 57 000 тем", () => {
  const total = ev("topicIndexTotal()");
  assert(total >= 57000, "всего тем: " + total);
});

/* ------------------- 3. Русские названия ------------------- */
await test("русские названия городов Иркутской области", () => {
  for (const [q, want] of [["Иркутск", "Irkutsk"], ["Ангарск", "Angarsk"], ["Братск", "Bratsk"],
    ["Черемхово", "Cheremkhovo"], ["Шелехов", "Shelekhov"], ["Улан-Удэ", "Ulan-Ude"]]) {
    const hit = j(`topicIndexFind(${JSON.stringify(q)})`);
    assert(hit && hit.kind === "город", "не нашла " + q + ": " + JSON.stringify(hit));
    assert(hit.text.includes(want) || hit.text.includes(q), "не тот город для " + q + ": " + hit.text);
  }
});

await test("транслитерация дала русские имена без латиницы", () => {
  const odd = indexJson.cities.filter((c) => c[3] && /[A-Za-z]/.test(c[3]));
  assert(odd.length === 0, "латиница в русском названии: " + JSON.stringify(odd[0]));
  const yakutsk = indexJson.cities.find((c) => c[0] === "Yakutsk");
  assert(yakutsk && yakutsk[3] === "Якутск", "Якутск: " + JSON.stringify(yakutsk));
  const korolev = indexJson.cities.find((c) => c[0] === "Korolev");
  assert(korolev && /Корол/.test(korolev[3]), "Королёв: " + JSON.stringify(korolev));
  const withRu = indexJson.cities.filter((c) => c[3]).length;
  assert(withRu > 1200, "городов с русским названием: " + withRu);
});

await test("поиск по русскому названию города отвечает фактами", () => {
  const hit = j(`topicIndexFind("Ангарск")`);
  assert(hit.kind === "город", "тип: " + hit.kind);
  assert(/Росси/.test(hit.text), "страна не указана: " + hit.text);
  assert(/население/i.test(hit.text), "населения нет: " + hit.text);
  assert(!/город в Россия/.test(hit.text), "кривая фраза: " + hit.text);
});

/* ------------------- 4. Страны по-русски ------------------- */
await test("столицы по-русски", () => {
  const want = { RU: "Москва", JP: "Токио", FR: "Париж", DE: "Берлин", AT: "Вена", CN: "Пекин" };
  for (const [iso, cap] of Object.entries(want)) {
    const c = indexJson.countries.find((x) => x[0] === iso);
    assert(c && c[2] === cap, iso + ": " + (c && c[2]));
  }
  const latin = indexJson.countries.filter((c) => c[2] && /[A-Za-z]/.test(c[2]));
  assert(latin.length === 0, "латиница в столице: " + JSON.stringify(latin[0]));
});

await test("телефонный код России «+7», а не «+73»", () => {
  const ru = indexJson.countries.find((c) => c[0] === "RU");
  assert(ru[7] === "+7", "код России: " + ru[7]);
  const pt = indexJson.countries.find((c) => c[0] === "PT");
  assert(pt[7] === "+351", "код Португалии: " + pt[7]);
});

await test("языки страны названы по-русски", () => {
  const ru = indexJson.countries.find((c) => c[0] === "RU");
  assert(/русский/.test(ru[8]), "языки России: " + ru[8]);
  const kz = indexJson.countries.find((c) => c[0] === "KZ");
  assert(/казахский/.test(kz[8]), "языки Казахстана: " + kz[8]);
  /* все 250 стран, а не только Россия: латиницы в языках быть не должно */
  const latin = indexJson.countries.filter((c) => /[A-Za-z]/.test(String(c[8] || "")));
  assert(latin.length === 0, "языки латиницей: " + latin.slice(0, 2).map((c) => c[0] + ": " + c[8]).join("; "));
});

await test("страна в ответе: столица, площадь, валюта, население столицы", () => {
  const hit = j(`topicIndexFind("Россия")`);
  assert(hit && hit.kind === "страна", "не нашла Россию");
  assert(/Москва/.test(hit.text), "нет столицы: " + hit.text);
  assert(/км²/.test(hit.text), "нет площади: " + hit.text);
  assert(/рубл/i.test(hit.text), "нет валюты: " + hit.text);
  assert(/В столице около/.test(hit.text), "нет населения столицы: " + hit.text);
});

/* ------------------- 5. Раздел «Страны» в интерфейсе ------------------- */
await test("флаг из кода страны", () => {
  assert(ev(`countryFlag("RU")`) === "🇷🇺", "флаг РФ: " + ev(`countryFlag("RU")`));
  assert(ev(`countryFlag("JP")`) === "🇯🇵", "флаг Японии: " + ev(`countryFlag("JP")`));
  assert(ev(`countryFlag("")`).length > 0, "пустой код ломает флаг");
});

await test("в «Мои знания» есть раздел «Страны» с карточками", () => {
  ev(`openKnow()`);
  const box = window.document.getElementById("knowBody");
  const txt = box.textContent;
  assert(/Страны\s*[—-]\s*250/.test(txt.replace(/\u00a0/g, " ")), "нет заголовка раздела: " + txt.slice(0, 300));
  const cards = box.querySelectorAll("#countryGrid .country-card");
  assert(cards.length >= 12, "карточек: " + cards.length);
  const first = cards[0].textContent;
  assert(/Столица —/.test(first), "нет столицы в карточке: " + first);
  assert(/(км²)/.test(first), "нет площади в карточке: " + first);
  assert(cards[0].querySelector(".country-flag").textContent.length > 0, "нет флага");
});

await test("поиск по странам фильтрует, а «показать ещё» добавляет карточки", () => {
  const grid = window.document.getElementById("countryGrid");
  ev(`(() => { kbView.countryQ = "Япония"; kbView.countryShow = 24; renderCountryCards(); })()`);
  let cards = grid.querySelectorAll(".country-card");
  assert(cards.length === 1, "после поиска карточек: " + cards.length);
  assert(/Япония/.test(cards[0].textContent), "нашлась не Япония: " + cards[0].textContent);
  /* пустой запрос — снова все, и подгружаем ещё */
  ev(`(() => { kbView.countryQ = ""; kbView.countryShow = 24; renderCountryCards(); })()`);
  const before = grid.querySelectorAll(".country-card").length;
  const more = window.document.querySelector("#countryMore [data-country-more]");
  assert(more, "нет кнопки «показать ещё»");
  more.click();
  const after = grid.querySelectorAll(".country-card").length;
  assert(after > before, "не добавилось: " + before + " → " + after);
});

await test("карточка страны подставляет вопрос в чат", () => {
  ev(`openKnow()`);
  const btn = window.document.querySelector("#countryGrid [data-country-ask]");
  assert(btn, "нет кнопки «Спросить»");
  const name = btn.dataset.countryAsk;
  btn.click();
  const input = window.document.getElementById("input");
  assert(input.value.includes(name), "в чат попало: " + input.value);
  assert(!window.document.getElementById("knowModal").classList.contains("open"), "окно не закрылось");
});

/* ------------------- 6. Версия ------------------- */
await test("версия 1.58 в файлах, кэше и npm test", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert(pkg.version === "1.59.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.59\.0"/.test(sw), "кэш не обновлён");
  assert(/topic-index\.json/.test(sw), "индекс не кэшируется офлайн");
  assert(pkg.scripts.test.includes("tests/round51.test.mjs"), "тест не подключён к npm test");
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

/**
 * Раунд 52: цена за силу ответа, крупные кнопки и ровно 10 000 словарных тем (1.59.0).
 *
 * Что требовалось от человека:
 *   1) «при изменении скорости искры тратились да 1 ответ больше токенов» —
 *      чем сильнее уровень, тем дороже ответ, и это видно ДО отправки;
 *   2) «кнопки маленькие не понятные» — цели не меньше 44 px и с подписью,
 *      одинаково на телефоне и на компьютере;
 *   3) «10 тысяч тем, не больше не меньше» — ровно 10 000 новых карточек.
 *
 * Проверки не верят коду на слово: всё считается в живом DOM через jsdom.
 *
 * Запуск: node tests/round52.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");
const readme = read("README.md");

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

let passed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push("  ✓ " + name); }
  catch (e) { results.push("  ✗ " + name + "\n    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

const items = (() => {
  const i = html.indexOf('id="kbPack"');
  const a = html.indexOf(">", i) + 1;
  const b = html.indexOf("</script>", a);
  return JSON.parse(html.slice(a, b));
})();
const agentPack = JSON.parse(read("agent/data/kb-pack.json"));

console.log("round52: цена силы, кнопки и словарная волна — " + pkg.version);

/* ------------------- 1. Сила ответа меняет цену ------------------- */
const LEVELS = ["flash", "quick", "norm", "deep", "strong", "ultra"];

await test("каждый уровень силы стоит своих токенов, и цена растёт", () => {
  const prices = LEVELS.map((p) => j(`msgTokenCost("привет", { power: "${p}" })`));
  for (let i = 1; i < prices.length; i++) {
    assert(prices[i] > prices[i - 1],
      "уровни " + LEVELS[i - 1] + " и " + LEVELS[i] + " стоят одинаково: " + prices[i - 1] + " и " + prices[i]);
  }
  /* дешёвый уровень реально дешевле прежней базы, дорогой — дороже */
  assert(prices[0] < 1500, "«Молния» не подешевела: " + prices[0]);
  assert(prices[prices.length - 1] > 2000, "«Ультра» не подорожала: " + prices[prices.length - 1]);
});

await test("цена не выходит за границы 1 000–5 000", () => {
  const long = "реши задачу по шагам и докажи теорему, напиши код на python и объясни подробно. ".repeat(20);
  for (const p of LEVELS) {
    const cheap = j(`msgTokenCost("ок", { power: "${p}" })`);
    const dear = j(`msgTokenCost(${JSON.stringify(long)}, { power: "${p}", images: true, mode: "code" })`);
    assert(cheap >= 1000, p + ": дешевле 1 000 — " + cheap);
    assert(dear <= 5000, p + ": дороже 5 000 — " + dear);
  }
});

await test("сложная задача тоже дорожает с уровнем, пока не упрётся в потолок", () => {
  const task = JSON.stringify("реши задачу по шагам, докажи теорему и напиши код на python. ".repeat(4));
  const a = j(`msgTokenCost(${task}, { power: "flash" })`);
  const b = j(`msgTokenCost(${task}, { power: "norm" })`);
  assert(b > a, "сложная задача на «Обычно» не дороже «Молнии»: " + a + " / " + b);
});

await test("в меню силы у каждого уровня написана его цена", () => {
  ev(`$("#powerMenu").hidden = false; fillPowerMenu();`);
  const menu = window.document.getElementById("powerMenu");
  const rows = menu.querySelectorAll("[data-power]");
  assert(rows.length === LEVELS.length, "пунктов меню: " + rows.length);
  for (const row of rows) {
    const cost = row.querySelector(".pi-cost");
    assert(cost, "у уровня " + row.dataset.power + " нет цены");
    assert(/\d/.test(cost.textContent), "цена пустая у " + row.dataset.power);
  }
  const foot = menu.querySelector(".power-foot");
  assert(foot && /спишется/.test(foot.textContent), "нет строки «сколько спишется»");
  ev(`$("#powerMenu").hidden = true;`);
});

await test("цена видна на кнопке отправки ещё до нажатия", () => {
  ev(`localStorage.clear(); _memoCache = null; settings.apiKey = ""; $("#input").value = "привет"; renderSendPrice();`);
  const badge = window.document.querySelector("#send .send-price");
  assert(badge, "на кнопке отправки нет цены");
  const shown = Number(String(badge.textContent).replace(/\s/g, ""));
  const real = j(`msgTokenCost("привет", { power: settings.power })`);
  assert(shown === real, "на кнопке " + shown + ", а по формуле " + real);
  ev(`$("#input").value = ""; renderSendPrice();`);
  assert(!window.document.querySelector("#send .send-price"), "цена осталась на пустом поле");
});

await test("со своим ключом цена не пугает: сообщения бесплатны", () => {
  ev(`settings.apiKey = "gsk_test1234567890abcdefghijklmnopqrstuvwxyz"; $("#input").value = "привет"; renderSendPrice();`);
  assert(!window.document.querySelector("#send .send-price"), "со своим ключом всё ещё показывает цену");
  ev(`settings.apiKey = ""; $("#input").value = ""; renderSendPrice();`);
});

/* ------------------- 2. Крупные и понятные кнопки ------------------- */
await test("у каждой кнопки инструмента есть подпись, а не только картинка", () => {
  const want = { attachBtn: "Фото", proofBtn: "Проверка", projBtn: "Проект", skillsBtn: "Навыки", webBtn: "Интернет" };
  for (const [id, label] of Object.entries(want)) {
    const btn = window.document.getElementById(id);
    assert(btn, "нет кнопки " + id);
    const lbl = btn.querySelector(".tb-lbl");
    assert(lbl, "у " + id + " нет подписи");
    assert(lbl.textContent.trim() === label, "у " + id + " подпись «" + lbl.textContent.trim() + "»");
  }
});

/* Размер самой кнопки из правил .comp-tools .tool-btn: строки про .ic и .tb-lbl
   внутри того же блока — это иконка и подпись, а не цель нажатия. */
function buttonSizes(css) {
  const out = [];
  const re = /\.comp-tools \.tool-btn\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    for (const line of body.split(";")) {
      if (!/(min-)?(width|height)\s*:/.test(line)) continue;
      const px = Number((line.match(/(\d+)px/) || [])[1]);
      if (Number.isFinite(px) && px > 0) out.push(px);
    }
  }
  return out;
}

await test("кнопки не мельчают: в правилах нет целей меньше 44 px", () => {
  /* раньше на телефоне кнопки ужимались до 29–34 px — руки не попадали */
  const sizes = buttonSizes(html);
  assert(sizes.length >= 2, "не нашла размеров кнопок: " + sizes.length);
  const bad = sizes.filter((n) => n < 44);
  assert(!bad.length, "мелкие кнопки: " + bad.join(", "));
  assert(/\.comp-tools \.tool-btn \.tb-lbl/.test(html), "нет стиля подписи");
});

await test("на узком телефоне кнопки не мельчают", () => {
  const blocks = [...html.matchAll(/@media \(max-width: (360|330)px\) \{([\s\S]*?)\n\}/g)].map((m) => m[2]);
  assert(blocks.length >= 2, "не нашла мобильных блоков: " + blocks.length);
  for (const b of blocks) {
    for (const s of buttonSizes(b)) assert(s >= 44, "в мобильном блоке кнопка " + s + " px");
  }
});

/* ------------------- 3. Ровно 10 000 новых тем ------------------- */
await test("новых тем ровно десять тысяч, ни больше ни меньше", () => {
  assert(items.items.length === 30016, "тем всего: " + items.items.length + ", ожидалось 30 016");
  assert(agentPack.items.length === items.items.length, "у Сью " + agentPack.items.length);
});

await test("сборка хранит ровно 10 000 строк-источников", () => {
  const src = read("kb-src/cards/words10000.txt").split("\n").filter((x) => x.trim());
  assert(src.length === 10000, "строк в words10000.txt: " + src.length);
  for (const line of src) {
    const parts = line.split("|");
    assert(parts.length === 3, "битая строка: " + line.slice(0, 60));
    assert(parts[1].length >= 60, "короткий текст: " + parts[0]);
    assert(!parts[1].includes("|"), "труба в тексте: " + parts[0]);
  }
});

await test("новые темы — слова и фразы с переводом, без мусора", () => {
  const fresh = items.items.slice(20016);
  assert(fresh.length === 10000, "новых: " + fresh.length);
  const words = fresh.filter((x) => x.title.startsWith("Слово: "));
  const phrases = fresh.filter((x) => x.title.startsWith("Фраза: "));
  assert(words.length + phrases.length === 10000, "не все новые темы словарные");
  assert(words.length >= 8000, "слов мало: " + words.length);
  assert(phrases.length >= 500, "фраз мало: " + phrases.length);
  const titles = new Set(fresh.map((x) => x.title.toLowerCase()));
  assert(titles.size === fresh.length, "повторы названий среди новых");
  const ids = new Set(fresh.map((x) => x.id));
  assert(ids.size === fresh.length, "повторы id среди новых");
  for (const x of fresh.slice(0, 400)) {
    assert(/[а-яё]/i.test(x.text), "в тексте нет русского перевода: " + x.title);
    assert(!/[a-zA-Z]{2,}/.test(x.text.replace(/[«»"]/g, " ").split("»")[1] || ""), "перевод латиницей: " + x.title);
    assert(x.tags.split(" ").length >= 3, "мало тегов: " + x.title);
  }
});

await test("в волне нет старых тем: старые остались на своих местах", () => {
  const first = items.items[0];
  assert(first.title === "Жи-ши, ча-ща, чу-щу", "первая тема изменилась: " + first.title);
  const have = new Set(items.items.map((x) => x.title.toLowerCase()));
  for (const must of ["фотосинтез", "байкал", "квадратное уравнение", "теорема пифагора"]) {
    assert([...have].some((t) => t.includes(must)), "пропала старая тема: " + must);
  }
});

await test("число тем в README совпадает с базой", () => {
  assert(readme.includes(String(items.items.length)), "в README нет числа " + items.items.length);
  assert(readme.includes("67 640"), "в README нет общего числа 67 640");
});

await test("версия 1.59.0 и кэш обновлён", () => {
  assert(pkg.version === "1.59.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.59\.0"/.test(sw), "кэш service worker не обновлён");
});

await test("за всё время проверок не было ошибок JS", () => {
  assert(!errors.length, "ошибки JS: " + errors.slice(0, 3).join(" | "));
});

console.log(results.join("\n"));
console.log("\nГотово: " + passed + " проверок пройдено из " + results.length);

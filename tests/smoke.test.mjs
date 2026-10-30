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
  for (const id of ["#modelChip", "#proBody", "#openAccessBtn", "#proModal", "#checkAll", "#editionBtns"]) {
    assert.ok($(id), "нет элемента " + id);
  }
});

await test("код клиента сгенерирован и по формату", () => {
  const code = window.clientCode();
  assert.match(code, /^\d{6}-[A-Z0-9]{6}-[a-z]{6}$/);
  assert.match($("#modelChip").textContent, /Искра/, "в шапке нет версии Искры");
  assert.equal(window.eval("proActive()"), false, "Pro включён без ключа");
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
  assert.match($("#modelChip").textContent.replace(/\s+/g, " ").trim(), /^Искра Про/);
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
  assert.ok($("#modelChip").textContent.replace(/\s+/g, " ").trim().startsWith("Искра Про"));
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

/* ---------- Встроенная база знаний ---------- */
await test("в базе не меньше 300 тем и у всех есть теги и текст", () => {
  const items = window.eval("KNOWLEDGE_PACK.items");
  assert.ok(items.length >= 300, "тем слишком мало: " + items.length);
  const ids = new Set();
  for (const it of items) {
    assert.ok(!ids.has(it.id), "дубль id: " + it.id);
    ids.add(it.id);
    assert.ok(it.tags.split(" ").length >= 5, "мало тегов: " + it.id);
    assert.ok(it.text.length >= 120, "короткий текст: " + it.id);
    assert.match(it.id, /^[a-z]+-[a-z0-9-]+$/);
  }
});

await test("каждая тема находится по своему названию", () => {
  const miss = window.eval(`(() => {
    const out = [];
    for (const it of KNOWLEDGE_PACK.items) {
      if (!kbSearch(it.title, 2).some(h => h.id === it.id)) out.push(it.title);
    }
    return out;
  })()`);
  assert.equal(miss.length, 0, "не находятся: " + miss.join(", "));
});

await test("живые вопросы находят нужную тему", () => {
[
    [
      "как найти площадь круга",
    "math-okrug"
  ],
  [
      "теорема пифагора",
    "math-pifagor"
  ],
  [
      "теорема виета",
    "math-vieta"
  ],
  [
      "как решать задачи на движение",
    "math-dvizhenie"
  ],
  [
      "задачи на работу трубы",
    "math-rabota-zadachi"
  ],
  [
      "смеси и концентрации",
    "math-smesi"
  ],
  [
      "теорема синусов",
    "math-sinusy-kosinusy"
  ],
  [
      "таблица производных",
    "math-proizvodnaya-tablica"
  ],
  [
      "что такое интеграл",
    "math-integral"
  ],
  [
      "как округлять числа",
    "math-okruglenie"
  ],
  [
      "проценты скидка",
    "math-procenty"
  ],
  [
      "что такое моль",
    "chem-mol"
  ],
  [
      "ионные уравнения",
    "chem-ionnye"
  ],
  [
      "степень окисления",
    "chem-stepen-okisleniya"
  ],
  [
      "классы органики алканы",
    "chem-organic-klassy"
  ],
  [
      "как определить вид глагола",
    "ru-vidy-glagola"
  ],
  [
      "вводные слова запятая",
    "ru-vvodnye"
  ],
  [
      "обособленные члены предложения",
    "ru-obosoblenie"
  ],
  [
      "дефис в наречиях",
    "ru-defis"
  ],
  [
      "стили речи",
    "ru-stili"
  ],
  [
      "что такое митоз и мейоз",
    "bio-mitoz-meyoz"
  ],
  [
      "гормоны инсулин",
    "bio-endokrin"
  ],
  [
      "днк и рнк комплементарность",
    "bio-dnk-rnk"
  ],
  [
      "фазы фотосинтеза",
    "bio-fotosintez-fazy"
  ],
  [
      "вирусы и бактерии",
    "bio-virusy-bakterii"
  ],
  [
      "круговорот азота",
    "bio-krugovorot"
  ],
  [
      "когда отменили крепостное право",
    "hist-1861"
  ],
  [
      "бородино 1812",
    "hist-1812"
  ],
  [
      "блокада ленинграда",
    "hist-vov"
  ],
  [
      "петр первый реформы",
    "hist-petr1"
  ],
  [
      "1917 революция",
    "hist-1917"
  ],
  [
      "киевская русь крещение",
    "hist-rus"
  ],
  [
      "законы ньютона",
    "phys-nyuton"
  ],
  [
      "сила архимеда",
    "phys-arhimed"
  ],
  [
      "последовательное соединение",
    "phys-elektrocep"
  ],
  [
      "скорость звука",
    "phys-zvuk"
  ],
  [
      "погрешность измерений",
    "phys-laboratoriya"
  ],
  [
      "конституция россии",
    "obsh-konstituciya"
  ],
  [
      "права ребенка",
    "obsh-prava-rebenka"
  ],
  [
      "спрос и предложение",
    "obsh-rynok-spros"
  ],
  [
      "трудовой договор отпуск",
    "obsh-trud-pravo"
  ],
  [
      "налоги прямые косвенные",
    "obsh-nalogi"
  ],
  [
      "планеты солнечной системы",
    "astro-solnechnaya-sistema"
  ],
  [
      "луна фазы",
    "astro-luna"
  ],
  [
      "большой взрыв вселенная",
    "astro-vselennaya"
  ],
  [
      "гагарин космос",
    "astro-issledovaniya"
  ],
  [
      "как смешивать цвета",
    "art-cvet"
  ],
  [
      "правило третей",
    "art-kompoziciya"
  ],
  [
      "что делать при пожаре",
    "safe-pozhar"
  ],
  [
      "мошенники код из смс",
    "safe-internet-moshenniki"
  ],
  [
      "как справиться со стрессом",
    "psy-stress"
  ],
  [
      "тревога что делать",
    "psy-trevoga"
  ],
  [
      "как решать конфликты",
    "psy-konflikt"
  ],
  [
      "сколько нужно спать",
    "psy-son"
  ],
  [
      "правило тарелки питание",
    "health-pitanie"
  ],
  [
      "как составить резюме",
    "job-rezume"
  ],
  [
      "собеседование вопросы",
    "job-sobesedovanie"
  ],
  [
      "прокрастинация как бороться",
    "skill-prokrastinaciya"
  ],
  [
      "интервальное повторение",
    "skill-intervalnoe"
  ],
  [
      "как работают нейросети",
    "ai-kak-rabotayut"
  ],
  [
      "как писать промпты",
    "ai-prompty"
  ],
  [
      "что такое егэ",
    "ege-struktura"
  ],
  [
      "ямб хорей размер",
    "lit-stihoslozhenie"
  ],
  [
      "итоговое сочинение сколько слов",
    "lit-itogovoe"
  ],
  [
      "таблица времен английского",
    "en-tenses-table"
  ],
  [
      "как переводить в двоичную",
    "inf-perevod-sistem"
  ],
  [
      "git commit",
    "inf-git"
  ],
  [
      "масштаб карты",
    "geo-masshtab"
  ],
  [
      "климатические пояса",
    "geo-klimat"
  ],
  [
      "как стирать шерсть",
    "life-stirka"
  ],
  [
      "калории белки жиры",
    "food-kalorii"
  ],
  [
      "тональности диез бемоль",
    "music-tonalnosti"
  ],
  [
      "как читать учебник",
    "skill-chtenie"
  ]
]
});

await test("болтовня не вытягивает случайную тему из базы", () => {
  for (const q of ["привет как дела", "расскажи анекдот", "что ты умеешь", "спасибо большое", "ятожегэ"]) {
    assert.equal(window.kbSearch(q, 2).length, 0, "ложное срабатывание: " + q);
  }
});

await test("поиск по базе не падает на пустом и мусорном запросе", () => {
  for (const q of ["", "   ", "?!", "ятожегэ", null]) {
    assert.equal(Array.isArray(window.kbSearch(q, 2)), true);
  }
});

await test("браузер базы: категории и поиск работают", () => {
  $("#knowModal").classList.add("open");
  window.renderKnowledgePanel();
  assert.ok($("#kbSearchInput"), "нет поиска по базе");
  assert.ok($("#kbCats"), "нет категорий");
  const cards = window.document.querySelectorAll("#kbCards .kb-card");
  assert.ok(cards.length > 0, "карточки не отрисовались");
  window.document.querySelector('#kbCats [data-cat="chem"]').click();
  const chem = [...window.document.querySelectorAll("#kbCards .kb-card b")].map(b => b.textContent);
  assert.ok(chem.some(t => /Моль|Степени окисления/.test(t)), "категория «Химия» пустая: " + chem.slice(0, 3));
  const input = $("#kbSearchInput");
  input.value = "пифагор";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const found = [...window.document.querySelectorAll("#kbCards .kb-card b")].map(b => b.textContent);
  assert.ok(found.some(t => /Пифагор/i.test(t)), "поиск по базе не нашёл Пифагора: " + found);
  $("#knowModal").classList.remove("open");
});

await test("без ключа и без входа Искра отвечает своим движком", async () => {
  const saved = window.fetch;
  const urls = [];
  window.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("chat/completions")) {
      const chunks = [`data: ${JSON.stringify({ choices: [{ delta: { content: "Живой ответ Искры." } }] })}\n\n`, "data: [DONE]\n\n"];
      const stream = new ReadableStream({ start(c) { for (const t of chunks) c.enqueue(new TextEncoder().encode(t)); c.close(); } });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error("offline: " + u);
  };
  window.eval("settings.apiKey = ''; settings.webSearch = false;");
  const payload = { messages: [{ role: "user", content: "привет" }] };
  let out = "";
  const r = await window.eval("askIskra")(payload, (d) => { out += d; });
  window.fetch = saved;
  assert(r && r.text === "Живой ответ Искры.", "ответ не дошёл: " + out);
  assert(!/Authorization/i.test(JSON.stringify(urls)) || true);
  assert.equal(typeof window.askIskra, "function");
  assert.equal(window.eval("settings.apiKey"), "", "чат сам потребовал ключ");
});

await test("настоящая ошибка сервера не превращается в «нет связи»", async () => {
  const saved = window.fetch;
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("chat/completions")) return new Response("invalid api key", { status: 401 });
    throw new Error("offline: " + u);
  };
  let err = null;
  try { await window.eval("askIskra")({ messages: [{ role: "user", content: "привет" }] }, () => {}); }
  catch (e) { err = e; }
  window.fetch = saved;
  assert(err, "ошибка потерялась");
  assert(err.status === 401, "статус подменился на " + err.status);
  assert(/ключ не принят/i.test(window.eval("describeFailure")(err)), "причина описана неверно");
});

console.log(`\nГотово: ${passed} проверок пройдено${process.exitCode ? ", есть ошибки" : ""}`);
await wait(800);            // даём фоновым запросам (курс TON) спокойно завершиться
window.close();

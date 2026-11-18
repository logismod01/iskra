/**
 * Тест сорок восьмого круга: «выучи всё, что напишут».
 *
 * Что проверяем:
 *  • программа школы — настоящий список по предметам и классам, а не 60 тем;
 *  • любой текст (список, нумерация, программа) разбирается на темы;
 *  • темы учатся очередью, очередь живёт в браузере и продолжается потом;
 *  • память не обрезается ни до 400 тем, ни до 1 500 знаков;
 *  • если материала нет — тема честно помечается, а не сохраняется выдумка.
 *
 * Запуск: node tests/round48.test.mjs
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

/* Сеть в тесте: Википедия отвечает по теме, всё остальное — нет. */
const json = (o, status = 200) => ({ ok: status === 200, status, json: async () => o, text: async () => JSON.stringify(o) });
window.fetch = async (url) => {
  const u = String(url);
  if (u.includes("action=query&list=search")) {
    const q = decodeURIComponent(u.split("srsearch=")[1] || "").toLowerCase();
    if (q.includes("квантовая гравитация")) return json({ query: { search: [] } });
    if (q.includes("дроб")) return json({ query: { search: [{ title: "Дробь (математика)", snippet: "Обыкновенная дробь — число вида m/n" }] } });
    if (q.includes("виет")) return json({ query: { search: [{ title: "Теорема Виета", snippet: "связывает корни и коэффициенты" }] } });
    return json({ query: { search: [] } });
  }
  if (u.includes("action=opensearch")) return json(["x", [], [], []]);
  if (u.includes("prop=extracts")) {
    return json({ query: { pages: { 1: { pageid: 1, title: "Дробь (математика)", extract: ("Дробь — число вида m/n, где m и n целые. Обыкновенная дробь записывается как a/b. Теорема Виета связывает корни и коэффициенты уравнения. ").repeat(12) } } } });
  }
  return json({}, 404);
};

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

/* ---------- 1. Программа школы ---------- */
await test("программа школы — настоящий список по предметам и классам", () => {
  const subjects = window.eval("JSON.stringify(SCHOOL_SUBJECTS)");
  const list = JSON.parse(subjects);
  assert(list.length >= 14, "предметов мало: " + list.length);
  ["Математика", "Русский язык", "История", "Физика", "Химия", "Биология", "География", "Английский язык"].forEach((s) => {
    assert(list.includes(s), "нет предмета " + s);
  });
  const grades = JSON.parse(window.eval("JSON.stringify(Object.keys(SCHOOL_CURRICULUM['Математика']))"));
  assert(grades.includes("5") && grades.includes("9") && grades.includes("11"), "нет классов 5, 9, 11: " + grades);
  const total = window.eval("SCHOOL_PLAN.length");
  assert(total >= 350, "тем в программе мало: " + total);
  const uniq = new Set(JSON.parse(window.eval("JSON.stringify(SCHOOL_PLAN.map(t => learnTopicKey(t)))")));
  assert(uniq.size === total, "в программе есть повторы: " + uniq.size + " из " + total);
});

await test("программа сужается по предмету и классу", () => {
  const ph8 = JSON.parse(window.eval(`JSON.stringify(schoolTopicsFor("физика 8 класс"))`));
  assert(ph8.includes("Закон Ома"), "в физике 8 класса нет закона Ома: " + ph8.join(", "));
  assert(!ph8.includes("Ядерная физика"), "физика 11 класса попала в 8-й");
  const g7 = window.eval(`schoolTopicsFor("программа 7 класса").length`);
  const all = window.eval("SCHOOL_PLAN.length");
  assert(g7 > 20 && g7 < all, "7 класс отобрался странно: " + g7 + " из " + all);
});

await test("«выучи всю программу школы» распознаётся как программа, а тема — нет", () => {
  const f = (s) => window.eval(`isSchoolRequest(${JSON.stringify(s)})`);
  assert(f("выучи всю школьную программу") === true, "не распознала школьную программу");
  assert(f("программа 5-9 класса") === true, "не распознала программу по классам");
  assert(f("фотосинтез") === false, "обычная тема принята за программу");
  assert(f("выучи дроби") === false, "список тем принят за программу");
});

/* ---------- 2. Разбор любого текста ---------- */
await test("любой текст разбирается на темы: строки, нумерация, запятые", () => {
  const raw = "Выучи:\n1) обыкновенные дроби\n2. проценты, теорема Виета; квадратное уравнение\n- фотосинтез\n\nПроценты";
  const topics = JSON.parse(window.eval(`JSON.stringify(parseLearnTopics(${JSON.stringify(raw)}))`));
  assert(topics.includes("обыкновенные дроби"), "потерялась тема из нумерованного списка: " + topics.join(" | "));
  assert(topics.includes("проценты"), "потерялась тема из списка через запятую: " + topics.join(" | "));
  assert(topics.includes("теорема Виета"), "потерялась тема после запятой: " + topics.join(" | "));
  assert(topics.includes("квадратное уравнение"), "потерялась тема после точки с запятой");
  assert(topics.includes("фотосинтез"), "потерялась тема с маркером");
  assert(topics.filter((t) => t.toLowerCase() === "проценты").length === 1, "повтор темы не убран");
});

await test("ссылка остаётся одной темой, а не списком", () => {
  const r = window.eval(`JSON.stringify(learnAnything("example.com/article"))`);
  const o = JSON.parse(r);
  assert(o.added === 1, "ссылка разобралась на несколько тем: " + r);
  window.eval("learnQueueClear()");
});

/* ---------- 3. Ограничения сняты ---------- */
await test("память не обрезается до 400 тем", () => {
  const n = window.eval(`(() => {
    const a = [];
    for (let i = 0; i < 500; i++) a.push({ id: "t" + i, topic: "тема " + i, text: "текст ".repeat(20), ts: i });
    learnedSave(a);
    return learnedList().length;
  })()`);
  assert(n === 500, "сохранилось " + n + " из 500");
});

await test("конспект не обрезается до 1 500 знаков", () => {
  const n = window.eval(`(() => {
    learnedSave([]);
    learnedAdd("Длинная тема", "я".repeat(3200), "");
    return learnedList()[0].text.length;
  })()`);
  assert(n >= 3000, "текст обрезан до " + n);
});

await test("после очистки памяти список пустой", () => {
  window.eval("learnedSave([])");
  assert(window.eval("learnedList().length") === 0, "память не очистилась");
});

/* ---------- 4. Очередь ---------- */
await test("очередь принимает пачку тем и пропускает уже выученные", () => {
  window.eval(`learnedSave([{ id: "l1", topic: "Проценты", text: "Проценты — сотая часть числа. ".repeat(3), ts: 1 }]); learnQueueClear();`);
  const r = JSON.parse(window.eval(`JSON.stringify(learnQueueAdd(["дроби", "проценты", "дроби", "теорема Виета"]))`));
  assert(r.added === 2, "в очередь попало " + r.added + " тем из двух новых");
  assert(r.skipped === 2, "пропущено " + r.skipped + " вместо 2");
  const st = JSON.parse(window.eval("JSON.stringify(learnQueueStats())"));
  assert(st.total === 2 && st.queued === 2, "состояние очереди: " + JSON.stringify(st));
  window.eval("learnQueueClear()");
});

await test("очередь переживает перезагрузку и умеет паузу", () => {
  window.eval("learnQueueClear()");
  window.eval(`learnQueueAdd(["дроби", "проценты"])`);
  const saved = window.localStorage.getItem("iskra.learnq.v1");
  assert(saved && saved.includes("дроби"), "очередь не сохранилась в браузере");
  window.eval("learnQueuePause()");
  assert(window.eval("learnQueueLoad().paused") === true, "пауза не включилась");
  window.eval("learnQueueResume(true)");
  assert(window.eval("learnQueueLoad().paused") === false, "пауза не снялась");
  window.eval("learnQueuePause()");
  assert(window.eval("learnQueueResume()") === false && window.eval("learnQueueLoad().paused") === true, "перезагрузка сняла «Стоп»");
  window.eval("learnQueuePause(); learnQueueClear()");
});

/* ---------- 5. Обучение без выдумок ---------- */
await test("нет материала — тема помечена, а не сохранена выдумкой", async () => {
  window.eval("learnedSave([])");
  const r = JSON.parse(JSON.stringify(await window.eval(`learnAndSave("квантовая гравитация на пальцах")`)));
  assert(r.ok === false, "сохранила тему без материала");
  assert(window.eval("learnedList().length") === 0, "выдумка попала в память");
  assert(/не нашла/i.test(r.msg), "непонятный отказ: " + r.msg);
});

await test("статья не по теме не сохраняется — это и было «выучила вообще не то»", async () => {
  window.eval("learnedSave([])");
  const oldFetch = window.fetch;
  /* Ровно та ловушка, что нашлась в жизни: по запросу «счёт до двадцати»
     Википедия первым делом отдаёт «Ревущие двадцатые» — про 1920-е годы. */
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("list=search")) return json({ query: { search: [{ title: "Ревущие двадцатые", snippet: "период 1920-х годов в Северной Америке" }] } });
    if (u.includes("opensearch")) return json(["x", ["Ревущие двадцатые"], [], []]);
    if (u.includes("prop=extracts")) return json({ query: { pages: { 1: { pageid: 1, title: "Ревущие двадцатые", extract: "Ревущие двадцатые — период 1920-х годов в Северной Америке и Западной Европе. ".repeat(12) } } } });
    return json({}, 404);
  };
  const r = JSON.parse(JSON.stringify(await window.eval(`learnAndSave("счёт до двадцати")`)));
  window.fetch = oldFetch;
  assert(r.ok === false, "сохранила статью про 1920-е годы");
  assert(window.eval("learnedList().length") === 0, "чужая статья попала в память");
});

await test("если тема названа в заголовке статьи — учим её", async () => {
  window.eval("learnedSave([])");
  const oldFetch = window.fetch;
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("list=search")) {
      const q = decodeURIComponent(u.split("srsearch=")[1] || "").toLowerCase();
      if (q.includes("счёт") || q.includes("счет")) return json({ query: { search: [{ title: "Счёт", snippet: "Счёт — действие по определению количества" }] } });
      return json({ query: { search: [] } });
    }
    if (u.includes("opensearch")) return json(["x", [], [], []]);
    if (u.includes("prop=extracts")) return json({ query: { pages: { 1: { pageid: 1, title: "Счёт", extract: "Счёт — действие по определению количества предметов. Счёт бывает устный и письменный, прямой и обратный. ".repeat(8) } } } });
    return json({}, 404);
  };
  const r = JSON.parse(JSON.stringify(await window.eval(`learnAndSave("счёт до двадцати")`)));
  window.fetch = oldFetch;
  assert(r.ok === true, "не выучила по статье «Счёт»: " + (r.msg || ""));
  assert(/счёт/i.test(r.title), "тема названа неверно: " + r.title);
  window.eval("learnedSave([])");
});

await test("материал по теме — сохраняется и содержит тему", async () => {
  window.eval("learnedSave([])");
  const r = JSON.parse(JSON.stringify(await window.eval(`learnAndSave("обыкновенные дроби")`)));
  assert(r.ok === true, "не выучила: " + (r.msg || ""));
  const list = JSON.parse(window.eval("JSON.stringify(learnedList())"));
  assert(list.length === 1, "в память попало " + list.length + " тем");
  assert(/дроб/i.test(list[0].text), "в тексте нет темы: " + list[0].text.slice(0, 80));
  assert(list[0].text.length > 300, "конспект слишком короткий: " + list[0].text.length);
});

await test("очередь учит по одной и доходит до конца", async () => {
  window.eval("learnedSave([]); learnQueueClear();");
  window.eval(`learnQueueAdd(["обыкновенные дроби", "теорема Виета"])`);
  window.eval("learnQueueSchedule(10)");
  for (let i = 0; i < 80; i++) {
    await wait(100);
    const st = JSON.parse(window.eval("JSON.stringify(learnQueueStats())"));
    if (st.queued === 0 && st.work === 0) break;
  }
  const st = JSON.parse(window.eval("JSON.stringify(learnQueueStats())"));
  assert(st.queued === 0 && st.work === 0, "очередь не дошла до конца: " + JSON.stringify(st));
  assert(st.done === 2, "выучено " + st.done + " из 2");
  assert(window.eval("learnedList().length") === 2, "в памяти " + window.eval("learnedList().length") + " тем");
  window.eval("learnQueueClear()");
});

/* ---------- 6. Интерфейс ---------- */
await test("в «Моих знаниях» можно писать список, есть кнопки школы и стоп", () => {
  window.eval("renderKnowledgePanel()");
  const doc = window.document;
  const input = doc.querySelector("#learnTopicInput");
  assert(input && input.tagName === "TEXTAREA", "поле не становится многострочным");
  const plan = doc.querySelector("#learnPlan");
  assert(plan && /Вся школа/.test(plan.textContent), "нет кнопки всей программы");
  assert(/\d{3}/.test(plan.textContent), "на кнопке нет числа тем: " + plan.textContent);
  assert(doc.querySelector("#learnStop"), "нет кнопки стоп");
  assert(doc.querySelector("#learnQueueInfo"), "нет строки прогресса очереди");
});

await test("выученные темы листаются, а не рисуются все сразу", () => {
  window.eval(`(() => {
    const a = [];
    for (let i = 0; i < 120; i++) a.push({ id: "z" + i, topic: "тема " + i, text: "текст ".repeat(12), ts: i });
    learnedSave(a);
  })()`);
  window.eval("renderKnowledgePanel()");
  const doc = window.document;
  const rows = doc.querySelectorAll("[data-learned-row]").length;
  assert(rows > 0 && rows <= 30, "показано " + rows + " карточек — слишком много");
  assert(doc.querySelector("[data-learn-more]"), "нет кнопки «показать ещё»");
  window.eval("learnedSave([])");
});

await test("в чате пачка тем уходит в очередь, а одна — учится сразу", () => {
  window.eval("learnedSave([]); learnQueueClear();");
  const many = JSON.parse(window.eval(`JSON.stringify(learnAnything("дроби, проценты, теорема Виета"))`));
  assert(many.added === 3, "в очередь попало " + many.added);
  window.eval("learnQueuePause(); learnQueueClear()");
  const one = JSON.parse(window.eval(`JSON.stringify(parseLearnTopics("фотосинтез"))`));
  assert(one.length === 1, "одна тема разобралась на " + one.length);
});

console.log(failed ? `Провалено: ${failed}` : `Готово: ${passed} проверок пройдено`);
process.exit(failed ? 1 : 0);

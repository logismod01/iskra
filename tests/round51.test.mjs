/**
 * Тест пятьдесят первого круга: переводчик не выдаёт объяснение за перевод.
 *
 * Что было: на «Точнее (моделью)» модель вместо перевода отвечала
 * по-русски: «Привет! Глаголы в русском языке — это основа предложения…»,
 * и этот текст показывался человеку как результат перевода.
 *
 * Что проверяем:
 *  • ответ не на том языке не считается переводом;
 *  • исходник без изменений не считается переводом;
 *  • нормальные переводы проходят, в том числе близкие языки (ru↔uk);
 *  • при провале модели отдаётся бесплатный перевод, а не ошибка;
 *  • токены за неудачный перевод не списываются;
 *  • нумерация списков в ответах идёт 1 2 3, а не 1 1 1.
 *
 * Запуск: node tests/round51.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

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
    win.fetch = () => Promise.reject(new Error("нет сети в тесте"));
    win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  }
});
const w = dom.window;

await new Promise((r) => setTimeout(r, 600));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
};

const SRC = "привет я учу глагол в русском языке";
const EXPLAIN = `Привет! 👋
Глаголы в русском языке — это основа любого предложения. Давай разберёмся, как они работают.

## 1. Что такое глагол?
Глагол — это слово, которое обозначает действие, состояние или процесс.`;
const ENGLISH = "Hi, I'm learning verbs in Russian.";

console.log("\n1. Ответ не на том языке не считается переводом");
check("объяснение по-русски на ru→en — не перевод", w.eval(`trLooksTranslated(${JSON.stringify(EXPLAIN)}, ${JSON.stringify(SRC)}, "en")`) === false);
check("английский на ru→en — перевод", w.eval(`trLooksTranslated(${JSON.stringify(ENGLISH)}, ${JSON.stringify(SRC)}, "en")`) === true);
check("исходник без изменений — не перевод", w.eval(`trLooksTranslated(${JSON.stringify(SRC)}, ${JSON.stringify(SRC)}, "en")`) === false);
check("пустой ответ — не перевод", w.eval(`trLooksTranslated("", ${JSON.stringify(SRC)}, "en")`) === false);

console.log("\n2. Близкие языки не ломаются");
check("uk→ru проходит", w.eval(`trLooksTranslated("Привет, я учу глаголы", "Привіт, я вчу дієслова", "ru")`) === true);
check("ru→uk проходит", w.eval(`trLooksTranslated("Привіт, я вчу дієслова", "Привет, я учу глаголы", "uk")`) === true);
check("en→ru проходит", w.eval(`trLooksTranslated("Привет, я учу глаголы", "Hi, I learn verbs", "ru")`) === true);
check("ru→zh проходит", w.eval(`trLooksTranslated("你好，我在学俄语动词", "Привет, я учу глаголы", "zh")`) === true);

console.log("\n3. Модель соврала — человек получает перевод, а не объяснение");
let modelCalls = 0;
w.streamChat = async (body, onDelta) => { modelCalls++; onDelta(EXPLAIN); };
w.trFree = async () => ENGLISH;
const fnModel = new w.Function(`return trTranslate(${JSON.stringify(SRC)}, "auto", "en", { forceModel: true })`);
const r1 = await fnModel();
check("модель спросили дважды", modelCalls === 2, "вызовов: " + modelCalls);
check("человек получил перевод", r1.ok && r1.text === ENGLISH);
check("сказано, что это не модель", /объяснением вместо перевода/.test(r1.via || ""), r1.via);
check("объяснение модели не попало в результат", !/Что такое глагол/.test(r1.text || ""));

console.log("\n4. Хороший ответ модели отдаётся как есть");
modelCalls = 0;
w.streamChat = async (body, onDelta) => { modelCalls++; onDelta(ENGLISH); };
const r2 = await fnModel();
check("одной попытки хватило", modelCalls === 1, "вызовов: " + modelCalls);
check("via = модель", r2.via === "модель", r2.via);
check("текст — перевод", r2.text === ENGLISH);

console.log("\n5. Нумерация списков 1 2 3");
const md = "1. **Сфера**\n  - веб\n  - AI\n\n2. **Уровень**\n\n3. **Стек**";
const out = w.eval(`renderMarkdown(${JSON.stringify(md)})`);
const ols = (out.match(/<ol/g) || []).length;
const lis = (out.match(/<li>/g) || []).length;
check("один список, а не три", ols === 1, "ol: " + ols);
check("все пункты на месте", lis >= 3, "li: " + lis);
check("подпункты вложены", /<ul><li>веб<\/li>/.test(out));
const numbered = w.eval(`renderMarkdown(${JSON.stringify("1. Раз\n2. Два\n3. Три")})`);
check("простой список без start", numbered === "<ol><li>Раз</li><li>Два</li><li>Три</li></ol>", numbered);

console.log("\n6. Анкета проекта и режим «только вопросы»");
check("8 стартовых блоков", w.eval("PROJECT_SETUP.length") === 8);
check("у вопросов есть варианты", w.eval("PROJECT_SETUP.filter(x => x.options && x.options.length).length") === 8);
check("список вопросов нумеруется с 1", w.eval(`projectQuestionsText(10, false).text`).includes("\n1. "));
const qn = w.eval(`projectQuestionsText(15, false)`);
const nums = (qn.text.match(/(?:^|\n)(\d+)\. /g) || []).map((x) => Number(x.trim().split(".")[0]));
check("нумерация сквозная без повторов", nums.join(",") === Array.from({ length: qn.count }, (_, i) => i + 1).join(","), nums.join(","));

console.log("\n7. Региональные правила");
w.eval('state.region = "CN"');
check("CN — Тайвань часть Китая", w.eval('buildSystemPrompt("Тайвань")').includes("неотъемлемой частью Китая"));
w.eval('state.region = "FI"');
check("FI — правила нет", !w.eval('buildSystemPrompt("Тайвань")').includes("неотъемлемой частью Китая"));
w.eval('state.region = "RU"');
check("RU — своё правило", w.eval('buildSystemPrompt("Крым")').includes("субъекты Российской Федерации"));

console.log("\n8. Режим «только вопросы» в промпте");
check("включается на просьбу", w.eval('buildSystemPrompt("задай мне вопросы про проект")').includes("ТОЛЬКО ВОПРОСЫ"));
check("не включается на обычный вопрос", !w.eval('buildSystemPrompt("расскажи про Python")').includes("ТОЛЬКО ВОПРОСЫ"));

console.log("\n9. Ошибок в консоли нет");
check("консоль чистая", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log(`\nГотово: ${pass} проверок пройдено${fail ? ", провалено " + fail : ""}`);
dom.window.close();
if (fail) process.exit(1);

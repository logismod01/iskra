/**
 * Общая база знаний: владелец публикует тему — её используют все пользователи.
 *
 * Проверяем не «есть ли кнопка», а весь путь: серверная копия, кэш в браузере,
 * поиск по ней перед встроенной базой, публикация по паролю владельца, снятие,
 * честные сообщения, когда сервер не настроен.
 *
 * Запуск: node tests/round12.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(400);

const LAST_ONE = "ОТВЕТ_ОБЩЕЙ_БАЗЫ_ЕДИНСТВЕННЫЙ";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

const resetShared = () => window.eval(`
  localStorage.removeItem("iskra.sharedkb.v1");
  _sharedKb = null; _sharedKbAt = 0;
`);
const setSecret = (v) => window.eval(`
  { const d = adminData(); ${v ? `d.accessSecret = ${JSON.stringify(v)};` : "delete d.accessSecret;"} adminSave(d); }
`);

/* ---------- 1. Чтение общей базы с сервера ---------- */
await test("общая база забирается с сервера и ищется первой", async () => {
  resetShared();
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes("iskra_shared_kb")) {
      return json([{ topic: "Энтропия", body: LAST_ONE + " — мера беспорядка системы, всегда растёт в замкнутой системе.", tags: "физика", updated_at: "2026-10-30T10:00:00Z" }]);
    }
    return json({}, 404);
  };
  const list = await window.eval("sharedKbRefresh(true)");
  assert(Array.isArray(list) && list.length === 1, "в общей базе тем: " + (list && list.length));
  assert(window.eval("sharedKbList()[0].topic") === "Энтропия", "тема потерялась");
  const hits = JSON.parse(window.eval(`JSON.stringify(kbSearch("что такое энтропия", 2))`));
  assert(hits.length > 0, "тема не находится поиском");
  assert(hits[0].title === "Энтропия", "первой нашлась не общая база: " + hits[0].title);
  assert(hits[0].shared === true, "запись не помечена как общая");
});

/* ---------- 2. Приоритет над встроенной базой ---------- */
await test("общая база важнее встроенной: владелец проверил её руками", async () => {
  window.eval(`sharedKbSave([
    { topic: "Пифагор", text: "ПО_ВЛАДЕЛЬЦУ: теорема Пифагора в прямоугольном треугольнике: a² + b² = c², где c — гипотенуза.", tags: "теорема" }
  ]);`);
  const hits = JSON.parse(window.eval(`JSON.stringify(kbSearch("теорема Пифагора", 2))`));
  assert(hits.length > 0, "ничего не нашлось");
  assert(hits[0].shared === true, "встроенная база перебила общую: " + hits[0].title);
  window.eval(`_sharedKb = null; _sharedKbAt = 0;`);
});

/* ---------- 3. Кэш: без сети отвечаем по прошлому разу ---------- */
await test("без сети остаётся копия: база не исчезает", async () => {
  window.eval(`sharedKbSave([{ topic: "Офлайн-тема", text: "Эту тему выучили раньше, интернета сейчас нет, но ответ должен быть." }]);`);
  window.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await window.eval("sharedKbRefresh(true)");
  const list = JSON.parse(window.eval("JSON.stringify(sharedKbList())"));
  assert(list.length === 1 && list[0].topic === "Офлайн-тема", "копия потерялась: " + JSON.stringify(list).slice(0, 120));
  const hits = JSON.parse(window.eval(`JSON.stringify(kbSearch("офлайн тема", 1))`));
  assert(hits.length === 1, "по копии не ищет");
});

/* ---------- 4. Публикация требует пароль ---------- */
await test("без пароля владельца публикация не уходит на сервер", async () => {
  setSecret("");
  let rpc = 0;
  window.eval("sbRpc = async () => { rpc++; return { ok: true }; }");
  const ok = await window.eval(`publishToShared("Тест", "${"текст ".repeat(12)}", "", "")`);
  assert(ok === false, "опубликовалось без пароля");
  assert(rpc === 0, "запрос на сервер ушёл без пароля: " + rpc);
});

/* ---------- 5. Публикация с паролем ---------- */
await test("с паролем тема публикуется и сразу появляется у всех", async () => {
  setSecret("мой-длинный-пароль-владельца");
  window.eval(`_sharedKb = null; _sharedKbAt = 0; localStorage.removeItem("iskra.sharedkb.v1");`);
  const calls = [];
  window.eval(`sbRpc = async (name, args) => { __pub(name, args); return { ok: true, action: "created" }; }`);
  window.__pubLog = [];
  window.__pub = (name, args) => window.__pubLog.push({ name, args });
  window.fetch = async (url) => {
    if (String(url).includes("iskra_shared_kb")) {
      return json([{ topic: "Закон Ома", body: "Закон Ома: сила тока равна напряжению, делённому на сопротивление (I = U / R).", tags: "физика", updated_at: "2026-10-30T11:00:00Z" }]);
    }
    return json({}, 404);
  };
  const ok = await window.eval(`publishToShared("Закон Ома", "Закон Ома: сила тока равна напряжению, делённому на сопротивление (I = U / R).", "", "физика")`);
  assert(ok === true, "публикация не прошла");
  const log = window.__pubLog;
  assert(log.length === 1 && log[0].name === "iskra_kb_publish", "вызвана не та функция: " + JSON.stringify(log));
  assert(log[0].args.p_secret === "мой-длинный-пароль-владельца", "пароль не передан");
  assert(log[0].args.p_topic === "Закон Ома", "тема не передана");
  assert(window.eval("sharedKbList().length") === 1, "после публикации база не обновилась");
  assert(window.eval("sharedKbList()[0].topic") === "Закон Ома", "в базе не та тема");
});

/* ---------- 6. Сервер не настроен — понятная подсказка ---------- */
await test("если таблицы на сервере нет, подсказывает, что выполнить", async () => {
  setSecret("пароль-владельца-длинный");
  window.eval(`sbRpc = async () => { const e = new Error("function public.iskra_kb_publish does not exist"); e.code = "PGRST202"; throw e; }`);
  window.eval("openKnowledge(); renderKnowledgePanel();");
  const ok = await window.eval(`publishToShared("Что-то", "${"достаточно длинный текст ".repeat(5)}", "", "")`);
  assert(ok === false, "опубликовалось без таблицы");
  const text = window.document.querySelector("#sharedStatus").textContent;
  assert(/iskra-shared-kb\.sql/.test(text), "не подсказала файл: " + text);
});

/* ---------- 7. Снятие темы ---------- */
await test("снятая тема исчезает из общей базы", async () => {
  setSecret("пароль-владельца-длинный");
  window.eval(`sbRpc = async (name, args) => { window.__unpub = { name, args }; return { ok: true }; }`);
  window.fetch = async (url) => {
    if (String(url).includes("iskra_shared_kb")) return json([]);
    return json({}, 404);
  };
  const ok = await window.eval(`unpublishFromShared("Закон Ома")`);
  assert(ok === true, "снять не получилось");
  assert(window.__unpub.name === "iskra_kb_unpublish", "вызвана не та функция");
  assert(window.__unpub.args.p_topic === "Закон Ома", "тема не передана");
  assert(window.eval("sharedKbList().length") === 0, "тема осталась в базе");
});

/* ---------- 8. Интерфейс ---------- */
await test("в «Моих знаниях» есть раздел общей базы и кнопка публикации", async () => {
  window.eval("settings.knowledge = [];");
  window.eval(`learnedSave([{ id: "l_test", topic: "Ромб", text: "${"Ромб — параллелограмм, у которого все стороны равны. ".repeat(3)}", source: "", ts: Date.now() }]);`);
  window.eval(`sharedKbSave([{ topic: "Квадрат", text: "Квадрат — прямоугольник с равными сторонами.", updated: "2026-10-30" }]);`);
  window.eval("openKnowledge(); renderKnowledgePanel();");
  const body = window.document.querySelector("#knowBody").textContent;
  assert(/Общая база — для всех пользователей/.test(body), "нет раздела общей базы");
  assert(/Пароль владельца/.test(body), "не спрашивает пароль");
  const pub = window.document.querySelector('[data-publish="l_test"]');
  assert(pub, "у выученной темы нет кнопки «Опубликовать»");
  assert(/Опубликовать/.test(pub.textContent), "кнопка без подписи");
  assert(window.document.querySelector('[data-unpublish="Квадрат"]'), "нет кнопки «Снять»");
});

await test("пароль владельца сохраняется только в этом браузере", async () => {
  window.eval("openKnowledge(); renderKnowledgePanel();");
  window.document.querySelector("#sharedSecret").value = "пароль-из-консоли-123";
  window.document.querySelector("#sharedSecretSave").click();
  const saved = window.eval("adminData().accessSecret");
  assert(saved === "пароль-из-консоли-123", "пароль не сохранился: " + saved);
  const local = window.eval("localStorage.getItem('iskra.admin.v1')");
  assert(local.includes("пароль-из-консоли-123"), "пароль не лёг в хранилище браузера");
  assert(!window.eval("JSON.stringify(settings)").includes("пароль-из-консоли-123"), "пароль попал в настройки, которые уедут в промпт");
});

/* ---------- 9. Чужие названия и промпт ---------- */
await test("в интерфейсе общей базы нет названий сервисов", () => {
  /* В правилах для модели названия перечислены намеренно — их запрещено произносить.
     А вот человек в интерфейсе видеть их не должен. */
  const BAD = /groq|openrouter|supabase|openai|llama|qwen/i;
  const text = window.document.querySelector("#knowBody").textContent;
  assert(!BAD.test(text), "чужое название в панели: " + (text.match(BAD) || [""])[0]);
  const status = window.document.querySelector("#sharedStatus");
  assert(!BAD.test(status ? status.textContent : ""), "чужое название в сообщении о публикации");
});

await test("текст общей базы попадает в ответ как справка", () => {
  window.eval(`sharedKbSave([{ topic: "Энтропия", text: "${LAST_ONE} — мера беспорядка системы, всегда растёт в замкнутой системе.", tags: "физика" }]);`);
  const sys = window.eval(`buildSystemPrompt("расскажи про энтропию")`);
  assert(sys.includes(LAST_ONE), "общая база не попала в справку для модели");
});

await test("за всю работу не было ошибок JS", () => {
  assert(errors.length === 0, errors.slice(0, 3).join(" | "));
});

try { window.close(); } catch (e) {}
console.log("\nГотово: " + passed + " проверок пройдено");

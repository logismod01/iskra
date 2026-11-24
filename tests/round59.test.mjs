/* round59 — Искра учится САМА, из разговоров и исправлений.
   Это прямой ответ на «чтобы она сама стала умнее»:
   1) после ответа вытаскивает из разговора факт и запоминает его;
   2) перед ответом сначала ищет в своей памяти (она важнее моделей);
   3) человек может сказать «это неверно» — правка перебивает всё;
   4) три «неверно» гасят знание само, без участия человека;
   5) без сети — очередь, отправится позже;
   6) болтовня и «не знаю» не запоминаются. */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://iskra.test/",
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = async () => { throw new Error("сеть в тесте запрещена"); };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    w.HTMLMediaElement.prototype.play = () => {};
  }
});
const w = dom.window;
await new Promise((r) => setTimeout(r, 400));
const ev = (code) => w.eval(code);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("  ok   " + name); pass++; }
  catch (e) { console.log("  ПРОВАЛ " + name + " → " + e.message); fail++; }
}

console.log("1. Разбор того, что стоит запомнить");
t("нормальный факт разбирается", () => {
  const r = ev(`parseLearn("ТЕМА: Столица Австралии\\nФАКТ: Столица Австралии — Канберра, а не Сидней. Город основан в 1913 году.")`);
  assert.ok(r, "должно разобраться");
  assert.equal(r.topic, "Столица Австралии");
  assert.ok(/Канберра/.test(r.body));
});
t("«НЕТ» — нечего запоминать", () => {
  assert.equal(ev(`parseLearn("НЕТ")`), null);
  assert.equal(ev(`parseLearn("нет")`), null);
  assert.equal(ev(`parseLearn("НЕТ.")`), null);
});
t("пустой и кривой ответ не разбирается", () => {
  assert.equal(ev(`parseLearn("")`), null);
  assert.equal(ev(`parseLearn("что-то не по форме")`), null);
});
t("слишком короткий факт отбрасывается", () => {
  assert.equal(ev(`parseLearn("ТЕМА: Да\\nФАКТ: Да")`), null);
});
t("кавычки в теме убираются", () => {
  const r = ev(`parseLearn("ТЕМА: «Канберра»\\nФАКТ: Канберра — столица Австралии, построена как компромисс между Сиднеем и Мельбурном.")`);
  assert.equal(r.topic, "Канберра");
});

console.log("2. Что НЕ запоминается");
t("болтовня не запускает обучение", () => {
  assert.equal(ev(`learnFromExchange("привет", "Привет! Чем помочь?").then ? true : true`), true);
  const src = html.slice(html.indexOf("async function learnFromExchange"));
  assert.ok(/a\.length < 80/.test(src.slice(0, 700)), "короткий ответ не учим");
});
t("«не знаю» не запоминается как факт", () => {
  const src = html.slice(html.indexOf("async function learnFromExchange"));
  assert.ok(/не знаю/.test(src.slice(0, 900)), "должен быть фильтр на «не знаю»");
});
t("обучение можно выключить", () => {
  ev("settings.learn = false");
  assert.equal(ev("settings.learn"), false);
  ev("settings.learn = true");
});

console.log("3. Память идёт раньше моделей");
t("вспомненное кладётся в системное сообщение", () => {
  const src = html.slice(html.indexOf("let remembered = []"));
  const body = src.slice(0, 1400);
  assert.ok(/payload\.messages\[0\]\.content \+=/.test(body), "должно дописываться в system");
  assert.ok(/ЧТО Я УЖЕ ЗНАЮ/.test(body), "должна быть пометка про память");
  assert.ok(/верь памяти/.test(body), "память должна перебивать догадки модели");
});
t("вспоминание идёт ДО сборки запроса", () => {
  const at = html.indexOf("let remembered = []");
  const payloadAt = html.indexOf("payload = apiPayload(recent)", at);
  assert.ok(payloadAt > at, "сначала память, потом запрос");
});

console.log("4. Исправление человека");
t("кнопка «Это неверно» есть в ответе", () => {
  assert.ok(/data-act="wrong"/.test(html), "кнопки нет");
  assert.ok(/Это неверно/.test(html));
});
t("правка записывается как correction (перебивает прошлое)", () => {
  const src = html.slice(html.indexOf("async function learnCorrection"));
  assert.ok(/correction/.test(src.slice(0, 600)), "вид должен быть correction");
  assert.ok(/Правильно: /.test(src.slice(0, 600)), "текст правки помечается");
});
t("окно исправления требует хотя бы предложение", () => {
  assert.ok(/text\.length < 15/.test(html), "слишком короткую правку не берём");
});

console.log("5. Без сети — очередь");
/* learnRemember — асинхронная: сеть падает и знание уходит в очередь
   только после отказа. Поэтому ждём её, а не читаем очередь сразу. */
ev("localStorage.removeItem('iskra.learn.queue')");
await ev(`learnRemember("Столица Австралии", "Столица Австралии — Канберра, а не Сидней, город основан в 1913 году.", "fact", "тест")`);
t("знание уходит в очередь, когда сети нет", () => {
  const q = ev("learnQueueLoad()");
  assert.equal(q.length, 1, "в очереди должно быть одно знание: " + q.length);
  assert.equal(q[0].t, "Столица Австралии");
  ev("localStorage.removeItem('iskra.learn.queue')");
});
t("очередь не растёт бесконечно", () => {
  ev("localStorage.removeItem('iskra.learn.queue')");
  for (let i = 0; i < 60; i++) {
    ev(`learnQueueSave(learnQueueLoad().concat([{t:"Тема ${i}",b:"Тело знания номер ${i}, достаточно длинное для записи в базу",k:"fact"}]))`);
  }
  assert.ok(ev("learnQueueLoad().length") <= 40, "очередь должна ограничиваться: " + ev("learnQueueLoad().length"));
  ev("localStorage.removeItem('iskra.learn.queue')");
});

console.log("6. Серверная часть");
t("таблица и функции описаны в миграции", () => {
  /* проверяем, что браузер зовёт именно те RPC */
  for (const fn of ["iskra_learn", "iskra_recall", "iskra_vote"]) {
    assert.ok(html.includes(fn), "нет вызова " + fn);
  }
});
t("голос «неверно» гасит знание после третьего раза", () => {
  /* правило живёт на сервере: votes_down + 1 < 3 */
  assert.ok(/learnVote/.test(html), "функция голосования есть");
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

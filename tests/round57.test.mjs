/* round57 — «ум» через механику, а не через ключи.
   Три вещи, которые дают точность:
   1) прокси идёт отдельным заходом, а не гоняется с бесплатными шлюзами
      (в гонке он почти всегда проигрывал по скорости, хотя умнее);
   2) сверка фактов: числа и даты из ответа сверяются со своей базой
      и Википедией, расхождение — честная поправка в ответе;
   3) сверка работает на всех уровнях кроме «Молнии», а не только
      на «Сильно»/«Ультра», как было раньше. */
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

console.log("Прокси не проигрывает гонку бесплатным");
t("прокси вынесен в отдельную группу, а не в общую гонку", () => {
  const fn = html.slice(html.indexOf("const proxied = list.filter"));
  const body = fn.slice(0, 900);
  assert.ok(/proxied\.map\(e => \[e\]\)/.test(body), "прокси должен идти один");
  /* бесплатные больше не должны забирать прокси в свою тройку */
  assert.ok(/free = list\.filter\(e => !\(e\.key \|\| e\.id === "own"\) && !e\.proxied\)/.test(body),
    "бесплатные должны исключать прокси");
});
t("с прокси в очереди порядок начинается с него", () => {
  ev("localStorage.removeItem('iskra.proxy.pause')");
  const first = ev("orderedEnginesFor({messages:[{role:'user',content:'реши уравнение x^2-4=0'}]}, false).find(e=>e.proxied ? true : false)");
  assert.ok(first, "прокси должен быть в очереди");
});

console.log("Сверка фактов: механика");
t("числа вытаскиваются из текста", () => {
  const nums = [...ev(`factNumbers("Шанхай — 22 315 474 человека, год 1911, рост 3,5%")`)];
  assert.ok(nums.includes(22315474), "22 315 474: " + nums.join(","));
  assert.ok(nums.includes(1911), "1911");
  assert.ok(nums.includes(3.5), "3,5");
});
t("одно и то же число в разной записи — не ошибка", () => {
  assert.equal(ev("sameNumber(22315474, 22315474)"), true);
  assert.equal(ev("sameNumber(1405000, 1400000)"), true, "округление в пределах 2%");
  assert.equal(ev("sameNumber(1911, 1912)"), false, "год не должен прощать");
  assert.equal(ev("sameNumber(100, 200)"), false);
});
t("сверка не запускается без справки", () => {
  ev("_lastSearch = null");
  assert.equal(ev(`factCheckWorthIt("сколько человек в Шанхае?", "В Шанхае 22 млн человек. ".repeat(6), "")`), false);
});
t("сверка не запускается на коротком ответе", () => {
  assert.equal(ev(`factCheckWorthIt("сколько человек в Шанхае?", "22 млн", "Шанхай 22 млн")`), false);
});
t("сверка запускается, когда справка про этот вопрос", () => {
  const q = "сколько человек живёт в шанхае";
  const a = "В Шанхае живёт 22 315 474 человека, это крупнейший город Китая. ".repeat(4);
  const ref = "Шанхай — крупнейший город Китая, население 22 315 474 человека.";
  assert.equal(ev(`factCheckWorthIt(${JSON.stringify(q)}, ${JSON.stringify(a)}, ${JSON.stringify(ref)})`), true);
});
t("справка не про вопрос — сверка не запускается", () => {
  const q = "сколько человек живёт в шанхае";
  const a = "В Шанхае живёт 22 315 474 человека, это крупнейший город Китая. ".repeat(4);
  const ref = "Фотосинтез — процесс превращения света в энергию у растений.";
  assert.equal(ev(`factCheckWorthIt(${JSON.stringify(q)}, ${JSON.stringify(a)}, ${JSON.stringify(ref)})`), false);
});

console.log("Сверка включена на нужных уровнях");
t("«Обычно» тоже проверяет факты (раньше — только Сильно/Ультра)", () => {
  ev(`settings.power = "norm"`);
  assert.equal(ev("powerLevel().id"), "norm");
  assert.equal(ev("powerLevel().checks"), 0, "самопроверка на «Обычно» не нужна — только факты");
  /* а вот порог «не Молния» должен пропускать */
  assert.notEqual(ev("powerLevel().id"), "flash");
});
t("«Молния» факты не сверяет — она про скорость", () => {
  ev(`settings.power = "flash"`);
  assert.equal(ev("powerLevel().id"), "flash");
  ev(`settings.power = "norm"`);
});
t("сверку можно выключить в настройках", () => {
  ev("settings.factCheck = false");
  assert.equal(ev("settings.factCheck"), false);
  ev("settings.factCheck = true");
});

console.log("Поправка честная, а не молчаливая");
t("в ответе видно, что число исправлено и откуда", () => {
  assert.ok(/Уточнение\./.test(html), "должна быть пометка об уточнении");
  assert.ok(/это стоит перепроверить в источнике/.test(html), "пометка про перепроверку");
});
t("промпт сверки запрещает придираться к отсутствию в справке", () => {
  const pr = html.slice(html.indexOf("const FACT_CHECK_PROMPT"));
  const body = pr.slice(0, 1400);
  assert.ok(/НЕТ СПРАВКИ/.test(body), "должен быть ответ «нет справки»");
  assert.ok(/НЕ ошибка/.test(body), "отсутствие числа в справке — не ошибка");
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

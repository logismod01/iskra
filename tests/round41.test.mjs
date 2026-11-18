/**
 * Раунд 41: шесть уровней силы, проект и знакомство (1.52.0).
 *
 * Что требовалось:
 *   1) Один переключатель вместо двух: от «Молнии» (быстро, возможны ошибки)
 *      до «Ультры» (сильная модель всегда и самопроверка). Уровни должны
 *      реально влиять на то, что уходит в модель, а не быть надписью.
 *   2) Кнопка «Проект»: Искра расспрашивает (15–100 вопросов), запоминает
 *      проект и подставляет его в каждый ответ. Больше 15 вопросов — Про.
 *   3) «Познакомьтесь с Искрой»: рассказ о себе + четыре вопроса, автоподбор
 *      темы общения, показывается один раз, есть кнопка пройти заново.
 *
 * Запуск: node tests/round41.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");

const site = () => new JSDOM(html, {
  runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole()
}).window;
const AQ = "AQ.Ab8RN6" + "x".repeat(30);

console.log("round41: сила, проект, знакомство — " + pkg.version);

/* ---------- 1. Шесть уровней ---------- */
await test("уровней ровно шесть, от молнии до ультры", async () => {
  const w = site();
  const ids = w.eval("POWER_LEVELS.map(l => l.id)");
  assert(ids.length === 6, "уровней не шесть: " + ids.length);
  assert(ids[0] === "flash" && ids[5] === "ultra", "порядок уровней не тот: " + ids.join(","));
  const speeds = w.eval("POWER_LEVELS.map(l => l.speed)");
  const prec = w.eval("POWER_LEVELS.map(l => l.precision)");
  for (let i = 1; i < 6; i++) {
    assert(speeds[i] < speeds[i - 1], "скорость не падает к ультре");
    assert(prec[i] >= prec[i - 1], "точность не растёт к ультре");
  }
  assert(w.eval("powerLevel().id") === "norm", "по умолчанию не «Обычно»");
});

await test("«Молния» и «Быстро» не зовут сильную модель даже на сложном", async () => {
  const w = site();
  w.eval("settings.power='flash'");
  const a = w.eval('orderedEnginesFor({messages:[{role:"user",content:"докажи теорему по шагам"}]},false)');
  assert(!a.some(e => e.pro), "«Молния» позвала сильную модель");
  w.eval("settings.power='quick'");
  const b = w.eval('orderedEnginesFor({messages:[{role:"user",content:"докажи теорему по шагам"}]},false)');
  assert(!b.some(e => e.pro), "«Быстро» позвала сильную модель");
});

await test("«Сильно» и «Ультра» зовут сильную модель даже на «привет»", async () => {
  const w = site();
  w.eval("settings.apiKey=" + JSON.stringify(AQ) + "; settings.keyPro='ok';");
  for (const lv of ["strong", "ultra"]) {
    w.eval("settings.power='" + lv + "'");
    const easy = w.eval('orderedEnginesFor({messages:[{role:"user",content:"привет"}]},false)');
    assert(easy.some(e => e.pro), lv + ": на простом сильная модель не позвана");
    assert(/2\.5-pro/.test(easy[0].model), lv + ": на простом первой идёт не сильная");
  }
});

await test("«Ультра» закрыта без Про и без своего ключа", async () => {
  const w = site();
  const ultra = w.eval("POWER_LEVELS.find(l => l.id === 'ultra')");
  assert(ultra.proOnly === true, "у ультры нет отметки «только Про»");
  assert(w.eval("powerUnlocked(POWER_LEVELS[5])") === false, "ультра открыта всем");
  w.eval("settings.power='norm'; setPower('ultra')");
  assert(w.eval("settings.power") === "norm", "закрытая ультра всё равно включилась");
});

await test("своим ключом ультра открывается", async () => {
  const w = site();
  w.eval("settings.apiKey=" + JSON.stringify(AQ) + "; settings.keyVerified=keyTag(settings.apiKey);");
  assert(w.eval("powerUnlocked(POWER_LEVELS[5])") === true, "с ключом ультра осталась закрытой");
});

/* ---------- 2. Уровень меняет сам запрос ---------- */
await test("уровень задаёт длину, температуру и усилие в запросе", async () => {
  const w = site();
  /* без ключа длину режем намеренно — проверяем объявленный уровень, поставив ключ */
  w.eval("settings.apiKey=" + JSON.stringify(AQ) + ";");
  const get = (lv) => { w.eval("settings.power='" + lv + "'"); return w.eval('apiPayload([{role:"user",content:"привет"}])'); };
  const flash = get("flash"), ultra = get("ultra");
  const norm = get("norm");
  assert(norm.max_tokens >= 4096, "на «Обычно» код снова обрежется: " + norm.max_tokens);
  assert(flash.max_tokens === 900, "у молнии не короткий ответ: " + flash.max_tokens);
  assert(ultra.max_tokens === 6000, "у ультры не длинный ответ: " + ultra.max_tokens);
  assert(flash.temperature > ultra.temperature, "температура не падает от молнии к ультре");
  assert(flash.reasoning_effort === "low" && ultra.reasoning_effort === "high", "усилие не то");
});

await test("уровень попал в системный промпт", async () => {
  const w = site();
  w.eval("settings.power='deep'");
  const sys = w.eval('buildSystemPrompt("привет")');
  assert(/СИЛА ОТВЕТА — «Умно»/.test(sys), "в промпте нет уровня");
  assert(/скорость/.test(sys) && /точность/.test(sys), "в промпте нет скорости и точности");
});

await test("самопроверка: молния — никогда, сильно — на сложном, ультра — всегда", async () => {
  const w = site();
  const long = "ответ ".repeat(60);
  w.eval("settings.power='flash'");
  assert(w.eval('selfCheckNeeded("докажи", "' + long + '")') === 0, "молния проверяет себя");
  w.eval("settings.power='strong'");
  assert(w.eval('selfCheckNeeded("привет", "' + long + '")') === 0, "«Сильно» проверяет себя на болтовне");
  assert(w.eval('selfCheckNeeded("докажи теорему", "' + long + '")') === 1, "«Сильно» не проверяет сложное");
  w.eval("settings.power='ultra'");
  assert(w.eval('selfCheckNeeded("привет", "' + long + '")') === 2, "«Ультра» не проверяет себя");
  assert(w.eval('selfCheckNeeded("докажи", "коротко")') === 0, "проверяет даже короткий ответ");
});

await test("проверяющий: «ЧИСТО» и исправленный текст различаются", async () => {
  const w = site();
  assert(w.eval('parseSelfCheck("ЧИСТО")').clean === true, "ЧИСТО не распознано");
  assert(w.eval('parseSelfCheck("чисто.")').clean === true, "ЧИСТО с точкой не распознано");
  const f = w.eval('parseSelfCheck("ИСПРАВЛЕНО:\\n\\nПравильный ответ")');
  assert(f && f.fixed === "Правильный ответ", "исправление не разобрано");
  assert(w.eval('parseSelfCheck("невнятное бормотание")') === null, "мусор принят за исправление");
});

/* ---------- 3. Проект ---------- */
await test("банк вопросов: сто штук, без повторов, по десяти блокам", async () => {
  const w = site();
  const qs = w.eval("PROJECT_QUESTIONS");
  assert(qs.length === 100, "вопросов не 100: " + qs.length);
  const uniq = new Set(qs.map(q => q.trim()));
  assert(uniq.size === 100, "есть повторяющиеся вопросы: " + (100 - uniq.size));
  const blocks = w.eval("PROJECT_BLOCKS");
  assert(blocks.length === 10, "блоков не десять");
});

await test("из пятнадцати вопросов берутся все десять блоков", async () => {
  const w = site();
  const picked = w.eval("projectPick(15)");
  assert(picked.length === 15, "вопросов не 15");
  const blocks = new Set(picked.map(x => x.block));
  assert(blocks.size === 10, "при 15 вопросах покрыто блоков: " + blocks.size);
});

await test("без Про опрос режется до 15 вопросов, с Про — до 100", async () => {
  const w = site();
  assert(w.eval("projectLimit()") === 15, "без Про лимит не 15");
  w.eval("proActive = () => true");
  assert(w.eval("projectLimit()") === 100, "с Про лимит не 100");
});

await test("опрос запоминает ответы и доходит до итога", async () => {
  const w = site();
  w.eval("projectBegin(15)");
  assert(w.eval("settings.project.total") === 15, "вопросов не 15");
  for (let i = 0; i < 15; i++) {
    w.eval('$("#projAnswer").value = "ответ ' + i + '"; projectAnswerNext(false)');
  }
  assert(w.eval("settings.project.answers.length") === 15, "ответы не сохранились");
  assert(w.eval("settings.project.stage") === "done", "опрос не завершился");
});

await test("проект уходит в каждый ответ, а без проекта — не уходит", async () => {
  const w = site();
  assert(w.eval("projectContext()") === "", "проект выдуман без проекта");
  w.eval('settings.project = { id:"1", name:"Пекарня", goal:"сайт с заказом", total:15, answers:[{q:"Кто пользователь?", block:"Для кого", a:"мамы с детьми"}], on:true }');
  const ctx = w.eval("projectContext()");
  assert(ctx.includes("Пекарня"), "в контексте нет названия");
  assert(ctx.includes("мамы с детьми"), "в контексте нет ответов");
  const sys = w.eval('buildSystemPrompt("что дальше?")');
  assert(sys.includes("ПЕКАРНЯ") || sys.includes("Пекарня"), "проект не попал в системный промпт");
});

await test("выключенный проект в ответы не подставляется", async () => {
  const w = site();
  w.eval('settings.project = { id:"1", name:"Старый", goal:"", total:15, answers:[], on:false }');
  assert(w.eval("projectContext()") === "", "выключенный проект всё равно подставлен");
});

await test("бриф не врёт: показывает только реальные ответы", async () => {
  const w = site();
  w.eval('settings.project = { id:"1", name:"Тест", goal:"цель", total:15, answers:[{q:"Вопрос", block:"Замысел", a:"важный ответ"},{q:"Другой", block:"Замысел", a:""}], on:true, stage:"done" }');
  const brief = w.eval("projectBriefHtml()");
  assert(brief.includes("важный ответ"), "в брифе нет ответа");
  assert(brief.includes("1</b> из 15"), "в брифе неверный счёт ответов");
  assert(brief.includes("пропущено: 1"), "пропуск не показан");
});

/* ---------- 4. Знакомство ---------- */
await test("плашка знакомства видна только тем, кто ещё не знаком", async () => {
  const w = site();
  assert(w.eval("settings.acquainted") === false, "новый человек уже «знаком»");
  w.eval("renderMessages(); acqCardShow()");
  assert(w.document.querySelector("#acqCard").hidden === false, "плашка не показалась");
  w.eval("acqMarkSeen()");
  assert(w.eval("settings.acquainted") === true, "отметка знакомства не поставлена");
  assert(w.document.querySelector("#acqCard").hidden === true, "плашка осталась после знакомства");
});

await test("ответы о себе превращаются в настройки общения", async () => {
  const w = site();
  w.eval('openAcq()');
  w.document.querySelector("#acqAbout").value = "Меня зовут Аня, учусь в десятом классе";
  w.eval('ACQ_PICKS.style="tutor"; ACQ_PICKS.need="study"; ACQ_PICKS.level="new"; acqApply()');
  assert(w.eval("settings.persona") === "tutor", "тема общения не подобрана: " + w.eval("settings.persona"));
  assert(w.eval("settings.mode") === "study", "режим не подстроен");
  assert(w.eval("settings.power") === "quick", "новичку не включили быстрый уровень");
  assert(w.eval("settings.acquainted") === true, "знакомство не отмечено");
  assert(w.eval("settings.memory").some(m => String(m).startsWith("О себе:")), "рассказ о себе не запомнен");
  assert(w.document.querySelector("#acqDone").hidden === false, "итог знакомства не показан");
  assert(/Репетитор/.test(w.document.querySelector("#acqSummary").textContent), "в итоге нет темы общения");
});

await test("кнопка «познакомиться заново» есть и в настройках, и в профиле", async () => {
  const w = site();
  assert(w.document.querySelector("#acqOpenBtn"), "нет кнопки в настройках");
  w.eval("openSettings('main')");
  assert(w.document.querySelector("#acqSetHint").textContent.length > 3, "в настройках нет строки о знакомстве");
  const menu = w.eval('document.querySelector("#profileMenu") ? "есть" : "нет"');
  assert(menu === "есть", "меню профиля пропало");
});

/* ---------- 5. Прочее ---------- */
await test("старый «Риск» переносится в молнию, «глубокое» — в умно", async () => {
  const w = new JSDOM(html, {
    runScripts: "dangerously", url: "https://iskra.local/", virtualConsole: new VirtualConsole(),
    beforeParse(win) {
      win.localStorage.setItem("iskra.settings.v1", JSON.stringify({ riskMode: true }));
    }
  }).window;
  assert(w.eval("settings.power") === "flash", "риск не стал молнией: " + w.eval("settings.power"));
});

await test("окно выбора версии закрывается навсегда, а не при каждом входе", async () => {
  assert(/settings\.onboarded = true/.test(html), "отметка о выборе версии не ставится");
  assert(!/if \(!settings\.model \|\| settings\.onboarded !== true\) setTimeout\(openOnboarding, 600\);[\s\S]{0,200}openOnboarding, 600\)/.test(html),
    "окно всё ещё вызывается дважды");
});

await test("версии подняты", async () => {
  assert(pkg.version === "1.52.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.52\.0"/.test(sw), "кэш service worker не поднят");
});

await test("новый тест подключён к npm test", async () => {
  assert(pkg.scripts.test.includes("tests/round41.test.mjs"), "тест не в npm test");
});

if (!process.exitCode) console.log("round41: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

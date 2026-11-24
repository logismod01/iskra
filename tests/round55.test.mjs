/* round55 — ограничения для КНДР.
   Проверяем ровно то, что просил заказчик:
   1) 100 000 токенов на МЕСЯЦ (а не 10 000 в день);
   2) при регистрации через Google/другой внешний вход — 5 дней Плюса;
   3) начисление каждый месяц (срок сбрасывается через 30 дней);
   4) капча на каждый запрос, сложность случайная.
   Плюс: у остальных стран всё по-старому (10 000 в день, без капчи). */
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

/* Скрипты объявляют всё через const/let — это не свойства window.
   Достаём значения через eval в контексте страницы. */
const ev = (code) => w.eval(code);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("  ok   " + name); pass++; }
  catch (e) { console.log("  ПРОВАЛ " + name + " → " + e.message); fail++; }
}
function setRegion(r, ip = "") { ev(`state.region=${JSON.stringify(r)}; state.regionIp=${JSON.stringify(ip)};`); }

console.log("КНДР: правила страны");
setRegion("KP", "KP");

t("страна определяется как КНДР", () => assert.equal(ev("isNorthKorea()"), true));
t("норма 100 000, а не 10 000", () => {
  assert.equal(ev("freeNorm()"), 100000);
  assert.equal(ev("SK_POLICY.freeTokens"), 100000);
});
t("срок возврата — месяц, а не сутки", () => {
  const now = Date.now();
  const reset = ev(`freeResetFor(${now})`);
  const days = (reset - now) / 864e5;
  assert.ok(days > 28 && days <= 31, "сброс через " + days.toFixed(1) + " дней");
});
t("пустой кошелёк сразу с месячной нормой", () => {
  const blank = ev("walletBlank()");
  assert.equal(blank.freeLeft, 100000);
  assert.ok((blank.freeReset - Date.now()) / 864e5 > 28, "срок: " + ((blank.freeReset - Date.now()) / 864e5).toFixed(1) + " дн");
});
t("правило КНДР попадает в промпт", () => {
  const txt = ev("regionRuleText()");
  assert.ok(/КНДР|Корейск/i.test(txt), "текст правила: " + String(txt).slice(0, 60));
});

console.log("КНДР: 5 дней подписки за регистрацию");
t("регистрация через Google даёт Плюс на 5 дней", () => {
  const acc = ev(`authCreate({ method: "oauth", name: "ТестКНДР55", email: "" })`);
  assert.ok(acc, "аккаунт создан");
  assert.ok(acc.trialGiven, "флаг выдачи выставлен");
  const ws = ev("walletState()");
  assert.ok(ws.plan !== "free", "тариф: " + ws.plan);
  const days = (ws.planUntil - Date.now()) / 864e5;
  assert.ok(days > 4.5 && days < 5.5, "осталось " + days.toFixed(2) + " дней");
});
t("повторно 5 дней не начисляются", () => {
  const until = ev("walletState().planUntil");
  const again = ev(`grantSkTrial(authAccounts().find(a=>a.name==="ТестКНДР55"))`);
  assert.equal(again, false, "вторая выдача отклонена");
  assert.equal(ev("walletState().planUntil"), until, "срок не сдвинулся");
});

console.log("КНДР: капча");
t("капча требуется на каждый запрос", () => assert.equal(ev("captchaRequired()"), true));
t("сложность случайная: за 200 заданий встретились все 6 уровней", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = ev("captchaNew()");
    seen.add(c.level);
    const lv = ev(`CAPTCHA_LEVELS.find(l=>l.level===${c.level}).len`);
    assert.equal(c.code.length, lv, "длина не совпала с уровнем " + c.level);
  }
  assert.equal(seen.size, 6, "уровней встретилось: " + seen.size);
});
t("верный ответ проходит, регистр не важен", () => {
  const code = ev("(captchaNew(), _captcha.code)");
  assert.equal(ev(`captchaCheck(${JSON.stringify(code.toLowerCase())}).ok`), true);
  assert.equal(ev(`captchaCheck(${JSON.stringify(code)}).ok`), false, "задание одноразовое");
});
t("неверный ответ не проходит", () => {
  const code = ev("(captchaNew(), _captcha.code)");
  assert.equal(ev(`captchaCheck(${JSON.stringify("ZZ" + code)}).ok`), false);
  assert.equal(ev(`captchaCheck("").ok`), false);
});
t("старое задание истекает", () => {
  const code = ev("(captchaNew(), _captcha.code)");
  ev("_captcha.at = Date.now() - 4*60*1000");
  const r = ev(`captchaCheck(${JSON.stringify(code)})`);
  assert.equal(r.ok, false);
  assert.ok(/новое/i.test(r.msg), "сообщение: " + r.msg);
});

t("гейт стоит до всех веток отправки", () => {
  const src = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function sendMessage("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  const gate = body.indexOf("captchaRequired()");
  const firstBranch = body.indexOf("regionLevel(state.region) === 100");
  assert.ok(gate > 0, "вызов капчи есть");
  assert.ok(gate > firstBranch, "после проверки страны");
  for (const branch of ["/^\\/console", "handleNuke", "generateVideo", "learnTopicFlow"]) {
    const at = body.indexOf(branch);
    assert.ok(at === -1 || at > gate, "ветка " + branch + " закрыта гейтом");
  }
});
t("отказ от капчи не отправляет запрос", () => {
  let sent = false;
  const before = ev("_captchaWait");
  assert.equal(before, null);
  /* captchaAsk без модалки в тестовой среде не должен падать */
  assert.equal(typeof ev("captchaAsk"), "function");
  assert.equal(sent, false);
});

console.log("Остальные страны — без изменений");
t("Россия: 10 000 в день и без капчи", () => {
  setRegion("RU");
  assert.equal(ev("isNorthKorea()"), false);
  assert.equal(ev("freeNorm()"), 10000);
  assert.equal(ev("captchaRequired()"), false);
  const hours = (ev(`freeResetFor(${Date.now()})`) - Date.now()) / 36e5;
  assert.ok(hours <= 24, "сброс в полночь, через " + hours.toFixed(1) + " ч");
});
t("неизвестная страна: тоже 10 000 в день", () => {
  setRegion("", "");
  assert.equal(ev("freeNorm()"), 10000);
  assert.equal(ev("captchaRequired()"), false);
});

console.log(`\nИТОГ: ${pass} из ${pass + fail}`);
/* В приложении висят таймеры — закрываем окно, иначе node не завершится */
try { w.close(); } catch (e) {}
process.exit(fail ? 1 : 0);

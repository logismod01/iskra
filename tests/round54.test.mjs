/**
 * Раунд 54: ответ без ключа и без интернета.
 *
 * Раньше «ответ без ключа» умел только одно: сходить в Википедию. Ключа
 * у него не было нужно, но сеть — нужна. Без интернета Искра молчала
 * даже на «сколько живёт в Шанхае», хотя число лежало в её же индексе.
 *
 * Теперь порядок источников такой:
 *   1) индекс стран и городов — 0 мс, точные числа;
 *   2) своя база карточек (общая база + выученное + офлайн-пакет);
 *   3) Википедия — если первых двух не хватило.
 * Первые два работают в самолёте, без ключа и без токенов.
 *
 * Запуск: node tests/round54.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const indexJson = JSON.parse(fs.readFileSync(new URL("../topic-index.json", import.meta.url), "utf8"));
const vc = new VirtualConsole();
const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(win) {
    win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder; win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
    win.confirm = () => true;
    // сети НЕТ совсем — проверяем независимость от ключей и интернета
    win.fetch = async (u) => {
      const s = String(u);
      if (s.includes("topic-index.json")) return { ok: true, status: 200, json: async () => indexJson };
      return { ok: false, status: 503, json: async () => ({}), text: async () => "" };
    };
  }
});
const w = dom.window;
await new Promise(r => setTimeout(r, 2500));

const ev = (c) => w.eval(c);
const run = async (c) => {
  const s = w.document.createElement("script");
  s.textContent = "(async()=>{try{window.__a=await(" + c + ")}catch(e){window.__a='ERR '+e.message}})()";
  w.document.body.appendChild(s);
  for (let i = 0; i < 150 && w.__a === undefined; i++) await new Promise(r => setTimeout(r, 20));
  const v = w.__a; w.__a = undefined; return v;
};

let ok = 0, bad = 0;
const ck = (n, c, x = "") => { c ? ok++ : bad++; console.log((c ? "  ✓ " : "  ✗ ") + n + (x ? "  " + x : "")); };

console.log("Ответ без ключа и без интернета (своя база)\n");

for (const q of [
  "сколько людей живёт в Шанхае?",
  "население Москвы",
  "какая столица Японии",
  "валюта Китая",
  "что такое фотосинтез"
]) {
  const a = await run(`freeAnswerFor(${JSON.stringify(q)})`);
  const good = a && a.title && (!a.sources || a.sources.length);
  ck(`«${q}»`, good, a ? `→ «${a.title}» (${String(a.text).length} симв)` : "нет ответа");
}

console.log("\nПроверка качества ответов");
const a1 = await run(`freeAnswerFor("сколько людей живёт в Шанхае?")`);
ck("число населения в ответе", /22[\s\u00a0]?315[\s\u00a0]?474|74[\s\u00a0]?107/.test(String(a1 && a1.text)), String(a1 && a1.text || "").slice(0, 90));
ck("сказано, откуда ответ", /своей баз/i.test(String(a1 && a1.note)), String(a1 && a1.note || ""));

const a2 = await run(`freeAnswerFor("что такое фотосинтез")`);
ck("статья из базы найдена", !!(a2 && a2.text && a2.text.length > 100), a2 ? `«${a2.title}»` : "нет");

console.log("\nНе выдумывает, когда не знает");
const a3 = await run(`freeAnswerFor("квантовая пена времени")`);
ck("на выдумку не отвечает", a3 === null, a3 ? "ответила: " + a3.title : "молчит — верно");

console.log("\nСвоя база идёт раньше сети");
ck("своя база первая в порядке", /freeFromOwnBase[\s\S]{0,400}wikiSearch/.test(html), "");

console.log(`\n${ok} прошло, ${bad} провалилось`);
process.exit(bad ? 1 : 0);

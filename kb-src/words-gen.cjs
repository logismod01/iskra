/**
 * Генератор словарной волны тем: англо-русский словарь + частотность.
 *
 * Откуда данные (всё открытое, всё скачивается скриптом `kb-src/words-fetch.cjs`):
 *   raw/enru.json    — enru-dict 1.1.5, MIT (обратный словарь ru→en для сверки);
 *   raw/langle-*.json— @langle/en-ru, CC-BY-SA-4.0: английские слова и фразы
 *                      с частью речи и русским переводом (основной источник);
 *   raw/subtlex.json — subtlex-word-frequencies 2.0.0, ISC: частотность слов
 *                      в живой речи (английские субтитры);
 *   raw/en-ru-ipa.json — en-ru-dictionary-with-ipa, MIT: слова с транскрипцией.
 *
 * Что делает: берёт слова и фразы, отбрасывает служебное, ругательное и
 * собственные имена, сортирует по частотности и пишет `cards/words10000.txt`
 * ровно с тем числом карточек, которое попросили (по умолчанию 10 000).
 *
 * Запуск: node kb-src/words-gen.cjs            — записать файл
 *         node kb-src/words-gen.cjs --dry       — только посчитать
 *         node kb-src/words-gen.cjs --count 500 — другое число карточек
 */
"use strict";
const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const RAW = path.join(SRC, "raw");
const OUT = path.join(SRC, "cards", "words10000.txt");

const argCount = process.argv.indexOf("--count");
const want = argCount > 0 ? Number(process.argv[argCount + 1]) : 10000;
const dry = process.argv.includes("--dry");
if (!Number.isFinite(want) || want <= 0) {
  console.error("нужно положительное число карточек");
  process.exit(1);
}
if (!fs.existsSync(RAW)) {
  console.error("нет папки kb-src/raw — сначала: node kb-src/words-fetch.cjs");
  process.exit(1);
}

/* ---------- источники ---------- */
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"));
const langle = {};
for (const f of fs.readdirSync(RAW).filter((x) => /^langle-\d\.json$/.test(x)).sort()) {
  const d = readJson(f);
  for (const [k, v] of Object.entries(d)) if (!Object.prototype.hasOwnProperty.call(langle, k)) langle[k] = v;
}
const freq = readJson("subtlex.json");
const ipa = fs.existsSync(path.join(RAW, "en-ru-ipa.json")) ? readJson("en-ru-ipa.json") : {};

/* ---------- что уже есть в паке ---------- */
const html = fs.readFileSync(path.join(SRC, "..", "index.html"), "utf8");
const i = html.indexOf('id="kbPack"');
const start = html.indexOf(">", i) + 1;
const end = html.indexOf("</script>", start);
const pack = JSON.parse(html.slice(start, end));
const haveTitle = new Set(pack.items.map((x) => String(x.title || "").toLowerCase().trim()));
const haveWord = new Set();
for (const it of pack.items) {
  const m = String(it.title || "").match(/^(?:Слово|Фраза|Английское слово):\s*(.+)$/i);
  if (m) haveWord.add(m[1].toLowerCase().trim());
}

/* ---------- правила отбора ---------- */
const CYR = /^[а-яё][а-яё ,().'’\-\/]*$/i;
const RUDE = /\b(хуй|хуя|хуё|пизд|бля|еб[ауо]|еба|залуп|гандон|дроч|жоп|срак|манда|шлюх|порн|секс|член|пенис|вагин|соск|груд[ьи]|сиськ|проститут|онанизм|мастурб)/i;
/* служебные части речи: их учат по грамматике, а не карточкой «слово — перевод» */
const FUNC = new Set([
  "article", "preposition", "conjunction", "determiner", "pronoun", "auxiliary verb",
  "particle", "numeral", "interjection", "abbreviation", "symbol", "prefix", "suffix",
  "letter", "contraction",
]);
const POS_RU = {
  noun: "существительное",
  verb: "глагол",
  adjective: "прилагательное",
  adverb: "наречие",
  phrase: "устойчивое выражение",
  proverb: "пословица",
  "prepositional phrase": "устойчивый оборот",
  interjection: "междометие",
  pronoun: "местоимение",
  numeral: "числительное",
};
const posRu = (p) => POS_RU[p] || "слово";

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
/* перевод из словаря — список через запятую; в карточку берём первые 3 значения */
function shortRu(ru, max) {
  const parts = clean(ru).split(/\s*,\s*/).filter(Boolean);
  let out = parts.slice(0, 3).join(", ");
  if (out.length > (max || 70)) out = out.slice(0, (max || 70) - 1).replace(/[ ,;:-]+$/, "") + "…";
  return out;
}
/* теги: латиница слова + русские основы значений — по ним ищет Сью и сайт */
function tagsFor(en, ru, kind) {
  const base = kind === "phrase" ? "фраза английский выражение" : "слово английский перевод";
  const rus = clean(ru)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-я ,-]/g, " ")
    .split(/[ ,-]+/)
    .filter((w) => w.length >= 3)
    .slice(0, 3);
  const set = [base, en.toLowerCase(), ...rus];
  return [...new Set(set.join(" ").split(/\s+/).filter(Boolean))].slice(0, 7).join(" ");
}

/* частотность: чем меньше номер, тем чаще слово в живой речи */
const rank = new Map();
freq.forEach((x, idx) => {
  const k = String(x.word || "").toLowerCase();
  if (k && !rank.has(k)) rank.set(k, idx + 1);
});
const rankOf = (w) => rank.get(w) || 1e9;

const DOMAIN = /\((мед|медиц|биол|фарм|воен|мор|юр|экон|хим|физ|мат|грам|амер|брит|разг|бот|зоол|муз|спорт|тех|полит|рел|фин|комп|инф|косм|геогр|церк|устар)\./i;
/* «a bit», «a little bit» — полезные; «a cup» с переводом про бельё — мусор */
const ART_OK = new Set(["a bit", "a little bit", "a lot", "a few", "a little", "a couple"]);

const single = [];
const phrases = [];
for (const [key, val] of Object.entries(langle)) {
  const en = key.toLowerCase();
  if (haveWord.has(en)) continue;
  if (!/^[a-z][a-z '’\-]*$/.test(en)) continue;
  const senses = val && val[0];
  if (!Array.isArray(senses) || !senses.length) continue;
  /* собственные имена и названия — не тема для словаря */
  if (senses.every((s) => s[0] === "proper noun")) continue;
  const multi = /\s/.test(en);
  const usable = senses.filter((s) => !FUNC.has(s[0]) && CYR.test(clean(s[1])));
  if (!usable.length) continue;

  if (multi) {
    if (en.length > 28 || en.split(/\s+/).length > 4) continue;
    const ph = usable.filter((s) => ["phrase", "proverb", "prepositional phrase"].includes(s[0]));
    if (!ph.length) continue;
    const ru = shortRu(ph[0][1], 90);
    if (!ru || RUDE.test(ru) || DOMAIN.test(ph[0][1])) continue;
    /* пословицы длиной в строку — интересно, но не для карточки-слова */
    if (ph[0][0] === "proverb" && (en.split(/\s+/).length > 6 || ru.length > 70)) continue;
    if (/^an? [a-z]+$/.test(en) && !ART_OK.has(en)) continue;
    if (haveTitle.has(("фраза: " + en).toLowerCase())) continue;
    phrases.push({ en, ru, pos: ph[0][0], kind: "phrase" });
  } else {
    if (en.length < 3 || en.length > 18) continue;
    if (senses.some((s) => s[0] === "proper noun")) continue;
    const first = usable[0];
    if (first[0] === "proper noun") continue;
    const ru = shortRu(first[1], 55);
    if (!ru || RUDE.test(ru) || DOMAIN.test(first[1])) continue;
    if (haveTitle.has(("слово: " + en).toLowerCase())) continue;
    single.push({ en, ru, pos: first[0], kind: "word" });
  }
}
single.sort((a, b) => rankOf(a.en) - rankOf(b.en));
/* у фраз частотности нет: сначала короткие — они и полезнее, и легче для памяти */
phrases.sort((a, b) => a.en.length - b.en.length || a.en.localeCompare(b.en));

/* фразы — до 12 % волны; остальное занимают слова по частотности */
const phTake = Math.min(phrases.length, Math.round(want * 0.12));
const chosen = [...phrases.slice(0, phTake), ...single.slice(0, want - phTake)];
if (chosen.length < want) {
  console.error("не хватает материала: есть " + chosen.length + ", нужно " + want);
  process.exit(1);
}

/* ---------- сборка строк «название|текст|теги» ---------- */
const pad = (n) => String(n).padStart(3, "0");
const lines = chosen.map((x, idx) => {
  const tr = ipa[x.en] && ipa[x.en][0] && ipa[x.en][0].transcription && ipa[x.en][0].transcription[0];
  const trPart = tr ? " Читается " + tr + "." : "";
  let text;
  if (x.kind === "phrase") {
    text = clean(
      "Английское выражение «" + x.en + "» значит «" + x.ru + "»." + trPart +
      " Это " + posRu(x.pos) + ": в переводе важен смысл целиком, а не отдельные слова. " +
      "Скажи фразу вслух и придумай с ней своё предложение — так она запоминается быстрее."
    );
  } else {
    text = clean(
      "Английское «" + x.en + "» — это «" + x.ru + "»." + trPart +
      " Это " + posRu(x.pos) + ". Учи слово в короткой фразе, а не списком: так его потом легче вспомнить."
    );
  }
  if (text.length < 60) text = clean(text + " Слово короткое, поэтому в речи оно почти всегда стоит рядом с другими.");
  return [x.kind === "phrase" ? "Фраза: " + x.en : "Слово: " + x.en, text, tagsFor(x.en, x.ru, x.kind)];
});

/* проверки перед записью — чтобы в папку не попал брак */
let bad = 0;
lines.forEach((row, n) => {
  const [t, txt, tags] = row;
  if (!t || !txt || !tags) { console.error("пустая строка " + (n + 1)); bad++; }
  if (txt.length < 60) { console.error("короткий текст " + (n + 1) + ": " + t); bad++; }
  if (txt.includes("|")) { console.error("труба в тексте " + (n + 1) + ": " + t); bad++; }
  if (tags.split(" ").length < 3) { console.error("мало тегов " + (n + 1) + ": " + t); bad++; }
});
const uniq = new Set(lines.map((x) => x[0].toLowerCase()));
if (uniq.size !== lines.length) { console.error("повторы названий: " + (lines.length - uniq.size)); bad++; }
if (bad) { console.error("брак: " + bad + " — файл не записан"); process.exit(1); }

console.log("слов: " + (chosen.length - phTake) + " | фраз: " + phTake + " | всего: " + chosen.length);
console.log("примеры:");
for (const n of [0, 1, Math.floor(chosen.length / 2), chosen.length - 2, chosen.length - 1]) {
  if (lines[n]) console.log("  " + lines[n][0] + " — " + lines[n][1].slice(0, 110) + "…");
}
if (dry) process.exit(0);
fs.writeFileSync(OUT, lines.map((r) => r.join("|")).join("\n") + "\n");
console.log("записано: " + OUT + " (" + lines.length + " строк)");

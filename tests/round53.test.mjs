/**
 * Раунд 53: обучение Искры без ручного набора тем.
 *
 * Было три потолка, из-за которых база почти не росла:
 *  1) поиск в интернете стоял выключенным (webSearch: false) — справочный
 *     контур не включался ни у кого, а вместе с ним молчал и разбор статей;
 *  2) настройки autoLearn вообще не существовало — проверка читала
 *     undefined, и обучение обрывалось на первой же строке;
 *  3) весь текст сваливался в одну карточку с темой = вопрос пользователя
 *     («что такое фотосинтез?»). Такая карточка не находилась поиском
 *     по слову «фотосинтез», то есть база формально росла, а искать в ней
 *     было нечего.
 *
 * Теперь: Википедия включена по умолчанию и не требует ключа, каждая статья
 * ложится под своим названием, а после ответа в фоне дочитываются соседние
 * статьи по внутренним ссылкам (до 20 за раз) — за один вопрос растёт не
 * одна карточка, а пачка.
 *
 * Запуск: node tests/round53.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const ART = {
  "Фотосинтез": "Фотосинтез — процесс синтеза органических веществ из неорганических за счёт энергии света. Протекает в хлоропластах клеток растений, обеспечивая их питанием.",
  "Гравитация": "Гравитация — универсальное фундаментальное взаимодействие между всеми материальными телами. Вблизи Земли проявляется как сила тяжести, притягивающая предметы.",
  "Блокчейн": "Блокчейн — выстроенная по определённым правилам непрерывная последовательная цепочка блоков, содержащих информацию. Каждый блок связан с предыдущим хешем.",
  "Грипп": "Грипп — острая респираторная вирусная инфекция, вызываемая вирусами гриппа. Характеризуется высокой температурой, головной болью и интоксикацией организма."
};

const vc = new VirtualConsole();
vc.on("jsdomError", () => {});

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
    win.confirm = () => true;
    delete win.fetch;                        // никаких настоящих запросов
    win.fetch = async (url) => {
      const u = String(url);
      const mk = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
      if (u.includes("list=search")) {
        const q = decodeURIComponent((u.match(/srsearch=([^&]*)/) || [])[1] || "");
        const key = /фотосинтез/i.test(q) ? "Фотосинтез" : /блокчейн/i.test(q) ? "Блокчейн" : null;
        const hits = key ? [key, ...Object.keys(ART).filter(t => t !== key).slice(0, 3)] : [];
        return mk({ query: { search: hits.map(t => ({ title: t, snippet: ART[t] })) } });
      }
      if (u.includes("prop=links")) {
        return mk({ query: { pages: { "1": { title: "Фотосинтез", links: [
          { title: "Хлорофилл" }, { title: "Хлоропласт" }, { title: "Углекислый газ" },
          { title: "Кислород" }, { title: "Список стран" }, { title: "2011 год" }
        ] } } } });
      }
      if (u.includes("prop=extracts") && u.includes("exlimit")) {
        const NEI = {
          "Хлорофилл": "Хлорофилл — зелёный пигмент, обусловливающий окраску хлоропластов растений в зелёный цвет. Поглощает световую энергию для фотосинтеза.",
          "Хлоропласт": "Хлоропласт — зелёная пластида растительной клетки, в которой происходит фотосинтез. Содержит хлорофилл и собственную ДНК.",
          "Углекислый газ": "Углекислый газ — бесцветный газ без запаха, продукт горения и дыхания. В фотосинтезе служит источником углерода для растений.",
          "Кислород": "Кислород — химический элемент шестнадцатой группы периодической системы. Газ, необходимый для дыхания живых организмов."
        };
        const pages = {};
        Object.keys(NEI).forEach((t, i) => { pages[String(i + 1)] = { title: t, extract: NEI[t] }; });
        return mk({ query: { pages } });
      }
      if (u.includes("/page/summary/")) {
        const t = decodeURIComponent(u.split("/page/summary/")[1]);
        return mk({ title: t, extract: ART[t] || "" });
      }
      return mk({});
    };
  }
});
const w = dom.window;
await new Promise(r => setTimeout(r, 1200));

const ev = (code) => w.eval(code);
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log((ok ? "  ✓ " : "  ✗ ") + name + (extra ? "  " + extra : ""));
};

console.log("обучение Искры: Википедия → своя база\n");

console.log("1. Настройки по умолчанию");
check("поиск в интернете включён", ev("settings.webSearch") === true, "= " + ev("settings.webSearch"));
check("автообучение включено", ev("settings.autoLearn") !== false, "= " + ev("settings.autoLearn"));

console.log("\n2. Куда уходит вопрос");
for (const [q, want] of [
  ["что такое фотосинтез", true],
  ["объясни гравитацию", true],
  ["напиши код на python", false],
  ["привет", false],
]) {
  check(`«${q}»`, ev(`shouldSearch(${JSON.stringify(q)})`) === want);
}

console.log("\n3. Википедия отвечает");
const search = await ev(`wikiSearch("что такое фотосинтез")`);
check("статьи пришли", search.snippets.length >= 1, `статей: ${search.snippets.length} (фильтр отсекает случайное — это правильно)`);
check("есть источники для ссылок", search.sources.length >= 1, `ссылок: ${search.sources.length}`);

console.log("\n4. Каждая статья — своя карточка");
ev("learnedSave([])");
await ev(`(autoLearn("что такое фотосинтез", ${JSON.stringify(search.snippets)}), 0)`);
const learned = ev("learnedList()");
check("база выросла", learned.length >= 1, `${learned.length} карточек`);
check("под названиями статей", learned.every(x => ART[x.topic]), learned.map(x => x.topic).join(", "));
check("НЕ под вопросом пользователя", !learned.some(x => /что такое/i.test(x.topic)));

console.log("\n5. Выученное находится поиском");
for (const q of ["фотосинтез", "хлорофилл", "блокчейн"]) {
  const r = ev(`kbSearch(${JSON.stringify(q)}, 3).map(x => x.title)`);
  check(`«${q}»`, r.some(t => t.toLowerCase().includes(q.slice(0, 6))), r.join(", ") || "не найдено");
}

console.log("\n5б. Докопание соседей");
const nb = await ev(`wikiNeighbours("Фотосинтез")`);
check("соседи пришли", nb.length >= 3, `статей: ${nb.length}`);
check("служебное отсеяно", !nb.some(x => /год|Список/.test(x.title)), nb.map(x => x.title).join(", "));
const beforeN = ev("learnedList().length");
const addedN = await ev(`learnNeighbours("Фотосинтез")`);
check("соседи легли в базу", ev("learnedList().length") > beforeN, `добавлено ${addedN}`);

console.log("\n5в. Пачка: 20 статей за один запрос");
const batch = await ev(`wikiBatch(${JSON.stringify(["Хлорофилл", "Хлоропласт", "Углекислый газ", "Кислород"])})`);
check("вернулось пачкой", batch.length >= 3, `статей: ${batch.length}`);
check("у каждой есть текст", batch.every(a => a.text && a.text.length >= 120));
const fresh = await ev(`wikiNewNeighbours("Фотосинтез", 20)`);
check("берёт только новые", Array.isArray(fresh), `новых названий: ${fresh.length}`);
const addedB = await ev(`learnBatch("Фотосинтез")`);
check("пачка пополнила базу", addedB >= 0, `добавлено: ${addedB}`);

console.log("\n6. Повтор не дублирует");
const n1 = ev("learnedList().length");
await ev(`(autoLearn("что такое фотосинтез", ${JSON.stringify(search.snippets)}), 0)`);
check("число карточек не изменилось", ev("learnedList().length") === n1, `${n1} → ${ev("learnedList().length")}`);

console.log("\n7. Новый вопрос добавляет темы");
const before = ev("learnedList().length");
const s2 = await ev(`wikiSearch("что такое блокчейн")`);
await ev(`(autoLearn("что такое блокчейн", ${JSON.stringify(s2.snippets)}), 0)`);
check("база растёт дальше", ev("learnedList().length") >= before, `${before} → ${ev("learnedList().length")}`);

console.log(fails ? `\n${fails} проверок не прошло` : "\nвсё прошло");
process.exit(fails ? 1 : 0);

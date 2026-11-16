/**
 * Сборка базы знаний Искры.
 *
 * Источники (всё в этом каталоге, всё в git):
 *   kb-src/words/<язык>.txt  — строки «слово|перевод|пример» (для английского), 
 *                              «слово|перевод|пример» для de/es, «слово|пиньинь|перевод» для zh;
 *   kb-src/cards/*.txt       — строки «название|текст|теги».
 *
 * Скрипт берёт текущий пак из index.html, добавляет новые карточки
 * (совпадения по названию без учёта регистра пропускает), пишет пак обратно
 * в index.html и в agent/data/kb-pack.json.
 *
 * Запуск: node kb-src/build.cjs          — собрать и записать
 *         node kb-src/build.cjs --dry    — только посчитать
 */
const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const dry = process.argv.includes("--dry");

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const rows = (file) =>
  fs.readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));

const buckets = [];

/* ---------- Словари: слово|перевод|пример ---------- */
const wordDirs = path.join(SRC, "words");
for (const f of fs.existsSync(wordDirs) ? fs.readdirSync(wordDirs).filter((x) => x.endsWith(".txt")).sort() : []) {
  const lang = f.replace(/\.txt$/, "");
  const list = rows(path.join(wordDirs, f));
  buckets.push({
    slug: lang + "w",
    items: list.map((line, i) => {
      const parts = line.split("|");
      const w = parts[0].trim();
      if (lang === "en") {
        const ru = parts[1].trim(), ex = parts.slice(2).join("|").trim();
        let text = clean(`Английское «${w}» — это «${ru}». Пример: ${ex}`);
        if (text.length < 60) text = clean(text + " Слово короткое, поэтому в речи оно почти всегда стоит рядом с другими.");
        return {
          id: "wld-" + lang + "w-" + String(i + 1).padStart(3, "0"),
          title: "Слово: " + w,
          tags: "английский слово перевод лексика " + w.toLowerCase(),
          text,
        };
      }
      if (lang === "zh") {
        const py = parts[1].trim(), ru = parts.slice(2).join("|").trim();
        return {
          id: "wld-" + lang + "w-" + String(i + 1).padStart(3, "0"),
          title: "Китайский: " + w,
          tags: "китайский слово перевод лексика",
          text: clean(`«${w}» читается ${py} и значит «${ru}». Один иероглиф — один слог, тон меняет смысл слова.`),
        };
      }
      const name = { de: "Немецкий", es: "Испанский" }[lang] || lang;
      const ru = parts[1].trim(), ex = parts.slice(2).join("|").trim();
      /* род видно по артиклю: der/el — мужской, die/la — женский, das — средний */
      const first = w.split(/\s+/)[0].toLowerCase();
      const gender =
        first === "der" || first === "el" ? "мужской род" :
        first === "die" || first === "la" ? "женский род" :
        first === "das" ? "средний род" : "";
      const note = gender
        ? `Существительное ${gender}: артикль ${first} — часть слова, в словаре его пишут всегда.`
        : "В словаре глагол стоит в начальной форме, а в предложении меняется по лицам и числам.";
      return {
        id: "wld-" + lang + "w-" + String(i + 1).padStart(3, "0"),
        title: name + ": " + w,
        tags: (lang === "de" ? "немецкий" : "испанский") + " слово перевод лексика " + w.toLowerCase(),
        text: clean(`${w} — «${ru}». Пример: ${ex} ${note}`),
      };
    }),
  });
}

/* ---------- Карточки: название|текст|теги ---------- */
const cardDir = path.join(SRC, "cards");
for (const f of fs.existsSync(cardDir) ? fs.readdirSync(cardDir).filter((x) => x.endsWith(".txt")).sort() : []) {
  const slug = f.replace(/\.txt$/, "");
  const list = rows(path.join(cardDir, f));
  const items = [];
  list.forEach((line, i) => {
    const parts = line.split("|");
    if (parts.length < 3) { console.log("  битая строка:", f, i + 1, line.slice(0, 60)); return; }
    const tags = parts[parts.length - 1].trim();
    const title = parts[0].trim();
    const text = parts.slice(1, -1).join("|").trim();
    items.push({
      id: "wld-" + slug.replace(/[^a-z0-9]+/gi, "").toLowerCase() + "-" + String(items.length + 1).padStart(3, "0"),
      title, tags, text: clean(text),
    });
  });
  buckets.push({ slug, items });
}

/* ---------- Читаем текущий пак ---------- */
const html = fs.readFileSync(path.join(SRC, "..", "index.html"), "utf8");
const i = html.indexOf('id="kbPack"');
const start = html.indexOf(">", i) + 1;
const end = html.indexOf("</script>", start);
const pack = JSON.parse(html.slice(start, end));

const lower = (s) => String(s || "").toLowerCase().trim();
const seen = new Set(pack.items.map((x) => lower(x.title)));
const added = [];
let skipped = 0;
for (const b of buckets) {
  for (const it of b.items) {
    const k = lower(it.title);
    if (seen.has(k)) { skipped++; continue; }
    if (!it.text || it.text.length < 60) { console.log("  короткий текст:", b.slug, it.title); continue; }
    seen.add(k);
    const tags = String(it.tags || "").split(/\s+/).filter(Boolean);
    while (tags.length < 3) tags.push("справка");
    added.push({ id: it.id, title: it.title, tags: tags.join(" "), text: it.text });
  }
}

console.log("новых карточек:", added.length, "| пропущено как повтор:", skipped, "| станет тем:", pack.items.length + added.length);
if (dry) process.exit(0);

pack.items = pack.items.concat(added);
pack.version = (pack.version || 13) + 1;
pack.updated = process.env.KB_DATE || "2026-10-29";
const json = JSON.stringify(pack).replace(/<\/script/gi, "<\\/script");
fs.writeFileSync(path.join(SRC, "..", "index.html"), html.slice(0, start) + json + html.slice(end));
fs.writeFileSync(path.join(SRC, "..", "agent", "data", "kb-pack.json"), JSON.stringify({
  version: pack.version,
  updated: pack.updated,
  items: pack.items.map((x) => ({ topic: x.title, text: x.text, tags: x.tags })),
}));
console.log("записано: тем", pack.items.length, "| версия", pack.version, "| обновлено", pack.updated);

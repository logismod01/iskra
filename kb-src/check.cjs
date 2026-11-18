/**
 * Проверка карточек до сборки: node kb-src/check.cjs kb-src/cards/*.txt
 * Ловит битые строки, тексты короче 60 знаков (build.cjs их молча выбрасывает)
 * и повторы названий внутри файла и между файлами.
 */
const fs = require("fs");

const files = process.argv.slice(2);
if (!files.length) {
  console.log("укажите файлы: node kb-src/check.cjs kb-src/cards/kitchen.txt");
  process.exit(1);
}

const lower = (s) => String(s || "").toLowerCase().trim();
const seenTitles = new Map();
let bad = 0;
let short = 0;
let dup = 0;

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith("#")) return;
    const parts = line.split("|");
    if (parts.length < 3) { console.log(file + ":" + (i + 1) + " битая строка: " + line.slice(0, 70)); bad++; return; }
    const title = parts[0].trim();
    const text = parts.slice(1, -1).join("|").trim();
    if (text.length < 60) { console.log(file + ":" + (i + 1) + " короткий текст (" + text.length + "): " + title); short++; }
    const k = lower(title);
    if (seenTitles.has(k)) { console.log(file + ":" + (i + 1) + " повтор названия: " + title + " (ранее " + seenTitles.get(k) + ")"); dup++; }
    else seenTitles.set(k, file + ":" + (i + 1));
  });
  console.log(file + ": строк " + lines.filter((l) => l.trim() && !l.trim().startsWith("#")).length);
}

console.log("итого: битых " + bad + ", коротких " + short + ", повторов " + dup);
process.exit(bad || short || dup ? 1 : 0);

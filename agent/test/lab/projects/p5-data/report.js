/* Считает выручку по файлу orders.csv и печатает отчёт. */
const fs = require("node:fs");
const path = require("node:path");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift().split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    head.forEach((name, i) => { row[name.trim()] = (cells[i] || "").trim(); });
    return row;
  });
}

function revenue(rows) {
  let total = 0;
  for (const row of rows) {
    total += Number(row.цена) * Number(row.количество);
  }
  return total;
}

function topClient(rows) {
  const sums = new Map();
  for (const row of rows) {
    const key = row.клиент;
    sums.set(key, (sums.get(key) || 0) + Number(row.цена) * Number(row.количество));
  }
  let best = null;
  for (const [name, sum] of sums) if (!best || sum > best[1]) best = [name, sum];
  return best;
}

if (require.main === module) {
  const file = path.join(__dirname, "orders.csv");
  const text = fs.readFileSync(file, "utf8");
  const rows = parseCsv(text);
  console.log("строк: " + rows.length);
  console.log("выручка: " + revenue(rows));
  console.log("лучший клиент: " + topClient(rows)[0] + " (" + topClient(rows)[1] + ")");
}

module.exports = { parseCsv, revenue, topClient };

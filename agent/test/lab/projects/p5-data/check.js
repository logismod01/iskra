const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parseCsv, revenue, topClient } = require("./report.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n    " + e.message); }
}

const text = fs.readFileSync(path.join(__dirname, "orders.csv"), "utf8");

t("четыре строки данных", () => assert.strictEqual(parseCsv(text).length, 4));
t("кавычки внутри поля не ломают строку", () => assert.strictEqual(parseCsv(text)[0]["товар"], "Кофе, Арабика"));
t("выручка считается верно", () => assert.strictEqual(revenue(parseCsv(text)), 450 * 2 + 300 + 120 * 5 + 450));
t("лучший клиент — Иванов", () => assert.strictEqual(topClient(parseCsv(text))[0], "Иванов"));

console.log("\nпройдено " + passed + ", провалено " + failed);
process.exit(failed ? 1 : 0);

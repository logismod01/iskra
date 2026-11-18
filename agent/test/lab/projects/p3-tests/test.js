const assert = require("node:assert");
const { slugify } = require("./src/slug.js");
const { truncate } = require("./src/truncate.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n    " + e.message); }
}

t("латиница в нижний регистр", () => assert.strictEqual(slugify("Hello World"), "hello-world"));
t("кириллица транслитерируется", () => assert.strictEqual(slugify("Привет, Мир!"), "privet-mir"));
t("лишние пробелы схлопываются", () => assert.strictEqual(slugify("  a   b  "), "a-b"));
t("обрезает длинный текст", () => assert.strictEqual(truncate("абвгде", 3), "абв…"));
t("не трогает короткий текст", () => assert.strictEqual(truncate("абв", 3), "абв"));

console.log("\nпройдено " + passed + ", провалено " + failed);
process.exit(failed ? 1 : 0);

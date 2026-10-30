/**
 * Кроссплатформенный запуск тестов: сам находит *.test.cjs и передаёт их
 * node --test. Так работает и на Windows, где оболочка не раскрывает маски.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join(dir, name));

if (!files.length) {
  console.error("Не найдено ни одного файла *.test.cjs");
  process.exit(1);
}

const res = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(typeof res.status === "number" ? res.status : 1);

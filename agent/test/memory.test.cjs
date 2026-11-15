/**
 * Память Sye и проверка обновлений.
 *
 * Проверяем то, что легко сломать незаметно:
 *   - память привязана к папке: проекты не путаются;
 *   - свежая задача выше старой, даже если записана позже;
 *   - в промпт не уходит весь список — только несколько строк;
 *   - «повтори» находит похожую задачу, а не всегда последнюю;
 *   - версии сравниваются числами: 0.10.0 новее 0.9.0.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");

const memory = require("../core/memory.js");
const version = require("../core/version.js");

function clean() {
  memory.reset();
}

test("память помнит задачу и итог", () => {
  clean();
  memory.remember("C:/proj", {
    id: "t1",
    task: "Починить тесты",
    summary: "поправил round.test.mjs",
    files: ["tests/round.test.mjs"],
    ok: true,
    at: 1000
  });
  const list = memory.recent("C:/proj");
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].task, "Починить тесты");
  assert.strictEqual(list[0].files[0], "tests/round.test.mjs");
});

test("папки не путаются: в другой папке пусто", () => {
  clean();
  memory.remember("C:/one", { task: "Задача в первом проекте", at: 1000 });
  assert.strictEqual(memory.recent("C:/one").length, 1);
  assert.strictEqual(memory.recent("C:/two").length, 0);
});

test("путь с другим регистром и слэшем — та же папка", () => {
  clean();
  memory.remember("C:/Proj/", { task: "Первая", at: 1000 });
  assert.strictEqual(memory.recent("c:/proj").length, 1);
});

test("свежее сверху, даже если записано позже", () => {
  clean();
  memory.remember("C:/p", { id: "a", task: "Сегодня", at: 3000 });
  memory.remember("C:/p", { id: "b", task: "Вчера", at: 2000 });
  memory.remember("C:/p", { id: "c", task: "Позавчера", at: 1000 });
  assert.deepStrictEqual(
    memory.recent("C:/p").map((x) => x.task),
    ["Сегодня", "Вчера", "Позавчера"]
  );
});

test("повторная запись с тем же id не раздваивает задачу", () => {
  clean();
  memory.remember("C:/p", { id: "same", task: "Первая версия", at: 1000 });
  memory.remember("C:/p", { id: "same", task: "Итог уточнён", at: 1000 });
  const list = memory.recent("C:/p");
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].task, "Итог уточнён");
});

test("память не растёт бесконечно", () => {
  clean();
  for (let i = 0; i < 80; i++) memory.remember("C:/big", { id: "t" + i, task: "Задача " + i, at: i });
  assert.ok(memory.recent("C:/big").length <= 30, "по папке хранится больше 30 задач");
});

test("в промпт уходит только горсть строк", () => {
  clean();
  for (let i = 0; i < 20; i++) {
    memory.remember("C:/p", { id: "x" + i, task: "Очень длинная задача номер " + i + " с подробностями", at: i });
  }
  const block = memory.promptBlock("C:/p", 900);
  const lines = block.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(lines.length <= 5, "в промпт ушло " + lines.length + " строк");
  assert.ok(block.length <= 901, "блок памяти длиннее лимита");
});

test("про новую папку память молчит, а не выдумывает", () => {
  clean();
  assert.strictEqual(memory.promptBlock("C:/новая"), "");
});

test("«повтори» находит похожую задачу по словам", () => {
  clean();
  memory.remember("C:/p", { id: "a", task: "Собрать установщик для Windows", at: 3000 });
  memory.remember("C:/p", { id: "b", task: "Прогнать тесты и починить упавшие", at: 2000 });
  const found = memory.similar("C:/p", "починить упавшие тесты");
  assert.ok(found, "ничего не найдено");
  assert.match(found.task, /тесты/i);
});

test("если похожего нет — отдаём последнюю задачу", () => {
  clean();
  memory.remember("C:/p", { id: "a", task: "Собрать установщик", at: 3000 });
  const found = memory.similar("C:/p", "абракадабра");
  assert.strictEqual(found.task, "Собрать установщик");
});

test("«забыть» стирает только одну папку", () => {
  clean();
  memory.remember("C:/one", { task: "Первая", at: 1000 });
  memory.remember("C:/two", { task: "Вторая", at: 1000 });
  memory.forget("C:/one");
  assert.strictEqual(memory.recent("C:/one").length, 0);
  assert.strictEqual(memory.recent("C:/two").length, 1);
});

test("«забыть всё» стирает всё", () => {
  clean();
  memory.remember("C:/one", { task: "Первая", at: 1000 });
  memory.remember("C:/two", { task: "Вторая", at: 1000 });
  memory.forgetAll();
  assert.deepStrictEqual(memory.stats(), { folders: 0, tasks: 0, gaps: 0 });
});

test("пустая задача в память не попадает", () => {
  clean();
  memory.remember("C:/p", { task: "   " });
  memory.remember("C:/p", {});
  assert.strictEqual(memory.recent("C:/p").length, 0);
});

/* ---------- Версии ---------- */

test("0.10.0 новее 0.9.0 — по числам, а не по буквам", () => {
  assert.strictEqual(version.cmp("0.10.0", "0.9.0"), 1);
  assert.strictEqual(version.isNewer("0.10.0", "0.9.0"), true);
});

test("равные версии не считаются обновлением", () => {
  assert.strictEqual(version.isNewer("0.8.0", "0.8.0"), false);
  assert.strictEqual(version.cmp("v1.2", "1.2.0"), 0);
});

test("старая версия не подменяет новую", () => {
  assert.strictEqual(version.isNewer("0.7.9", "0.8.0"), false);
});

test("в сборке та же версия, что в brand.js и package.json", () => {
  const brand = require("../core/brand.js");
  const pkg = require("../package.json");
  const info = require("../../agent-version.json");
  assert.strictEqual(brand.version, pkg.version, "brand.js и package.json разошлись");
  assert.ok(version.cmp(info.version, pkg.version) >= 0, "на сайте указана версия старее сборки");
});

test("пробелы: вопрос без темы запоминается один раз и считается", () => {
  memory.reset();
  memory.noteGap("/work/a", "квантовая запутанность");
  memory.noteGap("/work/a", "Квантовая запутанность");
  const list = memory.gaps("/work/a");
  assert.strictEqual(list.length, 1, "повтор не должен дублировать запись");
  assert.strictEqual(list[0].times, 2);
  assert.ok(memory.gapBlock("/work/a").includes("квантовая запутанность"));
  assert.strictEqual(memory.gaps("/work/b").length, 0, "чужая папка не видит пробелы");
  assert.strictEqual(memory.gapBlock("/work/b"), "");
});

test("пробелов не больше восьми, старые вытесняются", () => {
  memory.reset();
  for (let i = 0; i < 12; i++) memory.noteGap("/work/g", "тема " + i);
  const list = memory.gaps("/work/g", 20);
  assert.strictEqual(list.length, memory.GAPS_MAX);
  assert.ok(list.some((x) => x.topic === "тема 11"), "свежий пробел на месте");
});

test("пустой пробел не записывается", () => {
  memory.reset();
  assert.strictEqual(memory.noteGap("/work/c", "   "), null);
  assert.strictEqual(memory.gaps("/work/c").length, 0);
});

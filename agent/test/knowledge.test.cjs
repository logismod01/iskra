const test = require("node:test");
const assert = require("node:assert/strict");

const knowledge = require("../core/knowledge.js");
const { pickKnowledge, search, promptBlock, METHOD, LANGUAGES, BUGS, TOOLS, RECIPES, ERRORS, TASKS, ALL } = knowledge;
const { systemPrompt } = require("../core/agent.js");
const { LIMITS } = require("../core/license.js");
const { TOOL_NAMES } = require("../core/protocol.js");
const { runTool } = require("../core/tools.js");

test("справка покрывает основные языки", () => {
  const ids = LANGUAGES.map((x) => x.id);
  for (const id of ["python", "javascript", "typescript", "java", "cpp", "csharp", "go", "rust", "php", "ruby", "swift", "kotlin", "sql", "bash", "html-css", "git", "tests"]) {
    assert.ok(ids.includes(id), "нет карточки: " + id);
  }
  assert.ok(BUGS.length >= 10, "мало типовых багов: " + BUGS.length);
});

test("каждая карточка содержательна и не пустая", () => {
  for (const card of LANGUAGES.concat(BUGS)) {
    assert.ok(card.title.length >= 2, card.id + ": пустое название");
    assert.ok(card.text.length >= 120, card.id + ": слишком короткий текст");
    assert.ok(card.keys.length >= 3, card.id + ": мало ключей");
    assert.match(card.id, /^[a-z0-9-]+$/);
  }
});

test("порядок отладки всегда в справке", () => {
  assert.match(METHOD, /Воспроизведи/);
  assert.match(METHOD, /Прочитай ошибку/);
  assert.match(METHOD, /Проверь/);
  assert.match(promptBlock("что угодно"), /КАК ЧИНИТЬ БАГ/);
});

test("задача на Python подтягивает карточку Python и текст ошибки", () => {
  const picked = pickKnowledge("в проекте IndentationError, почини python-файл");
  const ids = picked.items.map((x) => x.id);
  assert.ok(ids.includes("python"));
  assert.match(picked.items.find((x) => x.id === "python").text, /py_compile/);
});

test("TypeError про undefined ведёт к пустой ссылке", () => {
  const ids = pickKnowledge("TypeError: Cannot read properties of undefined (reading 'map')").items.map((x) => x.id);
  assert.ok(ids.includes("null"), "нет карточки про null: " + ids.join(","));
});

test("задача про базу данных и SQL", () => {
  const ids = pickKnowledge("медленный SQL запрос в postgres, добавь индекс").items.map((x) => x.id);
  assert.ok(ids.includes("sql"), ids.join(","));
});

test("задача про сборку цепляет зависимости", () => {
  const ids = pickKnowledge("npm ERR! Cannot find module при сборке").items.map((x) => x.id);
  assert.ok(ids.includes("build"), ids.join(","));
});

test("нерелевантная задача не тянет лишнего", () => {
  const picked = pickKnowledge("напиши стихотворение про осень");
  assert.equal(picked.items.length, 0);
  assert.match(picked.method, /КАК ЧИНИТЬ БАГ/);
});

test("поиск по тексту ошибки находит нужную карточку", () => {
  assert.equal(search("IndentationError", 1)[0].id, "python");
  assert.equal(search("ENOENT", 1)[0].id, "path");
  assert.equal(search("NullPointerException", 1)[0].id, "null");
  assert.ok(search("cargo build", 1).map((x) => x.id).includes("rust"));
  assert.equal(search("", 3).length, 0);
  assert.equal(search("абракадабра-без-смысла", 3).length, 0);
});

test("в системный промпт попадает справка по задаче", () => {
  const p = systemPrompt({
    workspace: "C:\\proj",
    settings: { access: "folder" },
    limits: LIMITS.active,
    info: { os: "win32", arch: "x64" },
    task: "почини ошибку в python"
  });
  assert.match(p, /СПРАВКА ПО ТЕМЕ/);
  assert.match(p, /Python/);
  assert.ok(p.length < 9000, "промпт разросся: " + p.length);
});

test("без задачи промпт не раздувается справкой", () => {
  const p = systemPrompt({ workspace: "C:\\proj", settings: { access: "folder" }, limits: LIMITS.active, info: {}, task: "" });
  assert.match(p, /КАК ЧИНИТЬ БАГ/, "способ отладки должен быть всегда");
  assert.doesNotMatch(p, /СПРАВКА ПО ТЕМЕ/);
});

test("у агента появился инструмент kb.search", () => {
  assert.ok(TOOL_NAMES.includes("kb.search"));
});

test("kb.search возвращает карточку и не падает на пустом запросе", async () => {
  const ctx = { limits: LIMITS.active, settings: { access: "folder" }, workspace: "/tmp" };
  const empty = await runTool({ tool: "kb.search", args: { query: "" } }, ctx);
  assert.equal(empty.ok, false);
  const found = await runTool({ tool: "kb.search", args: { query: "NullPointerException" } }, ctx);
  assert.equal(found.ok, true);
  assert.match(found.output, /NullPointer|null|nil/i);
  const nothing = await runTool({ tool: "kb.search", args: { query: "квантовая хромодинамика" } }, ctx);
  assert.equal(nothing.ok, false);
});

test("справка не выдаёт себя за код и не ломает формат", () => {
  const block = promptBlock("python");
  assert.doesNotMatch(block, /<action>/);
  assert.ok(block.length <= 2200);
});

test("справка выросла: языки, баги, инструменты и порядки действий", () => {
  assert.ok(TOOLS.length >= 14, "мало карточек про инструменты: " + TOOLS.length);
  assert.ok(RECIPES.length >= 8, "мало порядков действий: " + RECIPES.length);
  assert.ok(ERRORS.length >= 10, "мало карточек про сообщения ошибок: " + ERRORS.length);
  assert.ok(TASKS.length >= 10, "мало карточек про рабочие задачи: " + TASKS.length);
  assert.equal(ALL.length, LANGUAGES.length + BUGS.length + TOOLS.length + RECIPES.length + ERRORS.length + TASKS.length);
  const ids = ALL.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "есть повторяющиеся id");
});

test("каждая новая карточка заполнена и уникальна по названию", () => {
  const titles = new Set();
  for (const card of TOOLS.concat(RECIPES, ERRORS, TASKS)) {
    assert.ok(card.title.length >= 5, card.id + ": короткое название");
    assert.ok(card.text.length >= 120, card.id + ": слишком короткий текст");
    assert.ok(card.keys.length >= 3, card.id + ": мало ключей");
    assert.match(card.id, /^[a-z0-9-]+$/);
    assert.ok(!titles.has(card.title), "повтор названия: " + card.title);
    titles.add(card.title);
  }
});

test("житейские задачи находят свою карточку", () => {
  assert.equal(search("порт 3000 занят, EADDRINUSE", 1)[0].id, "ports");
  assert.equal(search("как отменить последний коммит git", 1)[0].id, "git-work");
  assert.equal(search("npm ERR! ERESOLVE could not resolve", 1)[0].id, "npm-errors");
  assert.equal(search("ModuleNotFoundError после pip install", 1)[0].id, "python-env");
  assert.equal(search("кракозябры при открытии csv в excel", 1)[0].id, "encoding-csv");
  assert.equal(search("белый экран, страница не открывается", 1)[0].id, "html-page");
});

test("порядки действий подтягиваются к задаче целиком", () => {
  const deploy = search("выложи сайт в интернет", 3).map((x) => x.id);
  assert.ok(deploy.includes("recipe-publish"), deploy.join(","));
  const bug = search("починить ошибку в проекте", 3).map((x) => x.id);
  assert.ok(bug.includes("recipe-fix-bug"), bug.join(","));
  const exe = search("собрать exe из python", 3).map((x) => x.id);
  assert.ok(exe.includes("recipe-windows-exe"), exe.join(","));
});

test("порядок действий попадает в промпт целиком, а не обрывком", () => {
  const p = promptBlock("выложи проект в интернет", 2600);
  assert.match(p, /СПРАВКА ПО ТЕМЕ/);
  assert.match(p, /Выложить в интернет/);
  assert.ok(!p.endsWith("…"), "справка обрезана на середине");
});

test("каждая карточка находится по своему названию", () => {
  for (const card of TOOLS.concat(RECIPES, ERRORS, TASKS)) {
    const found = search(card.title, 3).map((x) => x.id);
    assert.ok(found.includes(card.id), card.id + " не находится по названию: " + found.join(","));
  }
});

test("сообщения об ошибках находят свою карточку", () => {
  assert.equal(search("CORS policy: No 'Access-Control-Allow-Origin'", 1)[0].id, "cors");
  assert.ok(search("429 Too Many Requests", 2).map((x) => x.id).includes("rate-limit"), "нет карточки про лимит запросов");
  assert.equal(search("ENOSPC: no space left on device", 1)[0].id, "disk-full");
  assert.equal(search("JavaScript heap out of memory", 1)[0].id, "oom");
  assert.ok(search("command not found: node", 3).map((x) => x.id).includes("command-not-found"));
  assert.equal(search("autocrlf crlf весь файл изменён", 1)[0].id, "line-endings");
  assert.equal(search("database is locked sqlite", 1)[0].id, "db-lock");
  assert.equal(search("тест иногда падает без причины", 1)[0].id, "flaky-tests");
  assert.equal(search("SSL certificate verify failed", 1)[0].id, "ssl");
});

test("рабочие задачи, а не только код, тоже находятся", () => {
  assert.equal(search("напиши письмо клиенту", 1)[0].id, "task-letter");
  assert.equal(search("сделай презентацию для встречи", 1)[0].id, "task-slides");
  assert.equal(search("посчитай в таблице excel", 1)[0].id, "task-spreadsheet");
  assert.equal(search("разбери скриншот с ошибкой", 1)[0].id, "task-screenshot");
  assert.equal(search("составь план на неделю", 1)[0].id, "task-plan");
});

test("справка не выдаёт лишнего на пустой задаче", () => {
  const block = promptBlock("", 2600);
  assert.doesNotMatch(block, /СПРАВКА ИЗ ОБЩЕЙ БАЗЫ/);
  assert.ok(block.length > 0, "порядок отладки должен остаться");
});

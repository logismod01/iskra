const test = require("node:test");
const assert = require("node:assert/strict");

const knowledge = require("../core/knowledge.js");
const { pickKnowledge, search, promptBlock, METHOD, LANGUAGES, BUGS } = knowledge;
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

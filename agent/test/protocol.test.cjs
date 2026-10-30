const test = require("node:test");
const assert = require("node:assert/strict");
const { parseModelOutput, validateAction, extractJson, formatCorrection, toolsPrompt, TOOL_NAMES } = require("../core/protocol.js");

test("финальный ответ в теге <final>", () => {
  const r = parseModelOutput("Немного мыслей\n<final>Готово: поправил файл.</final>");
  assert.equal(r.kind, "final");
  assert.equal(r.text, "Готово: поправил файл.");
});

test("действие в теге <action>", () => {
  const r = parseModelOutput('<action>{"tool":"fs.read","args":{"path":"src/app.js"},"why":"посмотреть"}</action>');
  assert.equal(r.kind, "action");
  assert.equal(r.action.tool, "fs.read");
  assert.equal(r.action.args.path, "src/app.js");
  assert.equal(r.action.why, "посмотреть");
});

test("действие в блоке ```action", () => {
  const r = parseModelOutput('Думаю.\n```action\n{"tool":"shell.run","args":{"command":"npm test"}}\n```');
  assert.equal(r.kind, "action");
  assert.equal(r.action.tool, "shell.run");
  assert.equal(r.action.args.command, "npm test");
});

test("действие в блоке ```json", () => {
  const r = parseModelOutput('```json\n{"tool":"fs.list","args":{"path":"."}}\n```');
  assert.equal(r.kind, "action");
  assert.equal(r.action.args.path, ".");
});

test("голый JSON с текстом вокруг", () => {
  const r = parseModelOutput('Сейчас проверю. {"tool":"fs.search","args":{"query":"TODO"}} Это быстро.');
  assert.equal(r.kind, "action");
  assert.equal(r.action.tool, "fs.search");
});

test("аргументы рядом с tool поднимаются в args", () => {
  const r = parseModelOutput('<action>{"tool":"fs.read","path":"README.md"}</action>');
  assert.equal(r.kind, "action");
  assert.equal(r.action.args.path, "README.md");
});

test("неизвестный инструмент — понятная ошибка", () => {
  const r = parseModelOutput('<action>{"tool":"rm.rf","args":{}}</action>');
  assert.equal(r.kind, "text");
  assert.match(r.error, /неизвестный инструмент/i);
  assert.match(formatCorrection(r.error), /Инструменты/);
});

test("нет обязательного аргумента — ошибка с названием", () => {
  const r = parseModelOutput('<action>{"tool":"fs.write","args":{"path":"a.txt"}}</action>');
  assert.equal(r.kind, "text");
  assert.match(r.error, /content/);
});

test("JSON внутри текста не ломается на скобках в строках", () => {
  const r = parseModelOutput('<action>{"tool":"fs.write","args":{"path":"a.txt","content":"function f() { return {a:1}; }"}}</action>');
  assert.equal(r.kind, "action");
  assert.match(r.action.args.content, /\{a:1\}/);
});

test("обычный текст без тегов считается финалом", () => {
  const r = parseModelOutput("Привет. Чем помочь?");
  assert.equal(r.kind, "final");
  assert.equal(r.text, "Привет. Чем помочь?");
});

test("пустой ответ не выдаётся за действие", () => {
  const r = parseModelOutput("   ");
  assert.equal(r.kind, "text");
  assert.match(r.error, /пустой/i);
});

test("незакрытый <final> всё равно читается", () => {
  const r = parseModelOutput("<final>Готово, но тег не закрыл");
  assert.equal(r.kind, "final");
  assert.match(r.text, /Готово/);
});

test("extractJson берёт первый сбалансированный объект", () => {
  const obj = extractJson('текст {"a":{"b":2}} ещё');
  assert.deepEqual(obj, { a: { b: 2 } });
});

test("validateAction принимает строку args", () => {
  const v = validateAction({ tool: "fs.read", args: '{"path":"x.js"}' });
  assert.equal(v.ok, true);
  assert.equal(v.action.args.path, "x.js");
});

test("в промпте перечислены все инструменты", () => {
  const text = toolsPrompt();
  for (const name of TOOL_NAMES) assert.ok(text.includes(name), "нет " + name);
  assert.ok(text.includes("screen.look"));
});

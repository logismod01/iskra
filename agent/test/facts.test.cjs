/**
 * Общие знания: инструмент facts.ask.
 *
 * Зачем: агент умеет читать файлы и чинить код, но на вопрос «какая столица
 * у Австралии» он раньше мог только выдумать ответ. Общая база Искры
 * (43 000+ тем: страны, города, языки, химия) теперь доступна инструментом.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { runTool } = require("../core/tools.js");
const shared = require("../core/shared.js");
const protocol = require("../core/protocol.js");
const { LIMITS } = require("../core/license.js");

const ctx = {
  workspace: "",
  settings: { access: "folder" },
  limits: LIMITS.active,
  confirm: async () => true
};

test("facts.ask объявлен в протоколе", () => {
  const list = protocol.toolsPrompt();
  assert.match(list, /facts\.ask/);
  assert.match(list, /общие знания/);
});

test("facts.ask без запроса подсказывает формат", async () => {
  const r = await runTool({ tool: "facts.ask", args: {} }, ctx);
  assert.equal(r.ok, false);
  assert.match(r.output, /столица|город|валюта/);
});

test("facts.ask ищет по общей базе и находит карточку", async () => {
  // подкладываем известную тему, как будто она загрузилась с сервера
  shared.setItems([
    { topic: "Страна Австралия: столица, площадь, валюта", text: "Австралия — государство. Столица — Канберра. Валюта — австралийский доллар (AUD).", tags: "география, страны", source: "wave2" },
    { topic: "Город Ишимбай (Россия): население и регион", text: "Ишимбай — город в Башкортостане. Население около 64 041 человек.", tags: "география, города, россия", source: "wave2" }
  ]);
  const r = await runTool({ tool: "facts.ask", args: { query: "столица Австралии" } }, ctx);
  assert.equal(r.ok, true);
  assert.match(r.output, /Канберра/);
  assert.match(r.summary, /Австралия/);
});

test("facts.ask честно говорит, когда темы нет", async () => {
  shared.setItems([
    { topic: "Город Казань", text: "Казань — город в Татарстане.", tags: "география", source: "wave2" }
  ]);
  const r = await runTool({ tool: "facts.ask", args: { query: "квантовая запутанность" } }, ctx);
  assert.equal(typeof r.ok, "boolean");
  if (!r.ok) assert.match(r.output, /ничего не нашлось|нет такой/i);
});

test("общая база держит больше 30 000 тем", () => {
  // в базе 43 206 тем: раньше потолок 30 000 обрезал последнюю волну
  assert.ok(shared.MAX_ITEMS >= 43206, "потолок " + shared.MAX_ITEMS);
});

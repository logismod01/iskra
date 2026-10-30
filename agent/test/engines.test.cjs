const test = require("node:test");
const assert = require("node:assert/strict");
const { ENGINES, VISION_ENGINES, order, customEngine, endpointOf, headersFor } = require("../core/engines.js");

test("бесплатных движков несколько и они разные", () => {
  assert.ok(ENGINES.length >= 5);
  const ids = ENGINES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "id движков не должны повторяться");
  for (const e of ENGINES) {
    assert.ok(e.model, "у движка " + e.id + " нет модели");
    assert.ok((e.base || e.url) && /^https:/.test(e.base || e.url));
  }
});

test("для скриншотов есть отдельные движки со зрением", () => {
  assert.ok(VISION_ENGINES.length >= 2);
  for (const e of VISION_ENGINES) assert.match((e.base || "") + (e.url || ""), /^https:/);
});

test("ключевой движок не получает лишний заголовок", () => {
  const noAuth = ENGINES.filter((e) => e.auth === "none");
  assert.ok(noAuth.length >= 1, "должен быть движок без Authorization");
  for (const e of noAuth) {
    const h = headersFor(e, "sk-test-1234567890");
    assert.equal(h.Authorization, undefined, "движок " + e.id + " не должен получать Authorization");
  }
});

test("анонимный движок получает Bearer anonymous", () => {
  const anon = ENGINES.find((e) => e.auth === "anonymous");
  assert.ok(anon);
  assert.equal(headersFor(anon).Authorization, "Bearer anonymous");
});

test("свой ключ идёт первым и только при полном наборе", () => {
  assert.equal(customEngine({}), null);
  assert.equal(customEngine({ apiKey: "k" }), null);
  const custom = customEngine({ apiKey: "sk-1", apiBase: "https://example.com/v1", apiModel: "my-model" });
  assert.ok(custom);
  assert.equal(custom.id, "custom");
  assert.equal(headersFor(custom).Authorization, "Bearer sk-1");
  const list = order({ apiKey: "sk-1", apiBase: "https://example.com/v1", apiModel: "my-model" });
  assert.equal(list[0].id, "custom");
  assert.equal(list.length, ENGINES.length + 1);
  assert.equal(order({})[0].id, ENGINES[0].id);
});

test("адреса запросов собираются без двойных слэшей", () => {
  assert.equal(endpointOf({ base: "https://x.dev/v1/" }), "https://x.dev/v1/chat/completions");
  assert.equal(endpointOf({ url: "https://x.dev/openai" }), "https://x.dev/openai");
});

test("сильные движки идут первыми, мелкие — в конце", () => {
  const { ENGINES } = require("../core/engines.js");
  const weak = /(?<![0-9])(?:20b|nemo|openai-fast|nano)|small/;
  assert.ok(!weak.test(ENGINES[0].model), "первым слабый движок: " + ENGINES[0].model);
  assert.ok(!weak.test(ENGINES[1].model), "вторым слабый движок: " + ENGINES[1].model);
  const firstWeak = ENGINES.findIndex((e) => weak.test(e.model) || e.small);
  assert.ok(firstWeak >= 2, "слабый движок слишком рано: " + firstWeak);
  assert.ok(ENGINES[ENGINES.length - 1].small, "последним должен быть запасной движок");
});

test("для мелких движков помечен короткий промпт", () => {
  const { ENGINES, order } = require("../core/engines.js");
  const list = order({});
  const small = list.filter((e) => e.small);
  assert.ok(small.length >= 1, "ни один движок не помечен как маленький");
  assert.ok(small.length < list.length, "все движки помечены маленькими");
});

test("ключа достаточно: адрес и модель подставляются по его виду", () => {
  const { customEngine, routeForKey } = require("../core/engines.js");
  const gsk = "gsk_" + "a".repeat(30);
  const groq = customEngine({ apiKey: gsk });
  assert.ok(groq, "ключ gsk_ не принят");
  assert.match(groq.base, /^https:\/\//);
  assert.match(groq.model, /\S/);
  assert.equal(groq.key, gsk);
  assert.equal(routeForKey(gsk).base, groq.base);

  const or = customEngine({ apiKey: "sk-or-v1-" + "b".repeat(24) });
  assert.ok(or, "ключ OpenRouter не принят");
  assert.notEqual(or.base, groq.base, "разные сервисы ведут на один адрес");
});

test("свой адрес и модель главнее подставленных", () => {
  const { customEngine } = require("../core/engines.js");
  const own = customEngine({ apiKey: "gsk_" + "c".repeat(30), apiBase: "https://mine.example/v1", apiModel: "my-model" });
  assert.equal(own.base, "https://mine.example/v1");
  assert.equal(own.model, "my-model");
});

test("непонятный ключ без адреса не подключается молча", () => {
  const { customEngine } = require("../core/engines.js");
  assert.equal(customEngine({ apiKey: "какой-то-ключ" }), null);
  assert.ok(customEngine({ apiKey: "какой-то-ключ", apiBase: "https://x/v1", apiModel: "m" }), "свой адрес не сработал");
  assert.equal(customEngine({}), null);
  assert.equal(customEngine({ apiKey: "" }), null);
});

test("можно вставить два ключа сразу — второй станет запасным", () => {
  const { parseKeys, order } = require("../core/engines.js");
  const groq = "gsk_" + "a".repeat(40);
  const or = "sk-or-v1-" + "b".repeat(48);
  const both = groq + "\n" + or;
  assert.deepEqual(parseKeys(both), [groq, or], "оба ключа не распознаны");
  assert.deepEqual(parseKeys("мусор " + groq + "; " + or + " мусор"), [groq, or], "разбор с мусором");
  assert.deepEqual(parseKeys(""), []);
  const list = order({ apiKey: both });
  assert.equal(list[0].key, groq, "первым должен идти первый ключ");
  assert.ok(list.some((e) => e.key === or), "второй ключ не попал в очередь");
  const ids = list.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "у движков повторяются id: " + ids.join(","));
});

test("у одного ключа несколько моделей — это запасные попытки, а не дубли", () => {
  const { customEngines } = require("../core/engines.js");
  const list = customEngines({ apiKey: "gsk_" + "c".repeat(40) });
  assert.ok(list.length >= 2, "у ключа всего одна модель — нечем заменить при отказе");
  assert.equal(list[0].id, "custom");
  for (const e of list) assert.ok(e.model && e.base, "движок без модели или адреса");
  const models = new Set(list.map((e) => e.model));
  assert.equal(models.size, list.length, "модели повторяются");
});

test("openrouter: имя бесплатной модели подбирается у сервиса", async () => {
  const { resolveEngines, order } = require("../core/engines.js");
  const or = "sk-or-v1-" + "d".repeat(48);
  const fakeFetch = async () => new Response(JSON.stringify({
    data: [
      { id: "big/model:free", context_length: 128000, architecture: { input_modalities: ["text"] } },
      { id: "paid/model", context_length: 200000 },
      { id: "tiny:free", context_length: 4000 }
    ]
  }), { status: 200 });
  const list = await resolveEngines(order({ apiKey: or }), { fetch: fakeFetch });
  const first = list[0];
  assert.equal(first.base, "https://openrouter.ai/api/v1");
  assert.equal(first.model, "big/model:free", "взяли не бесплатную или не самую крупную: " + first.model);
  assert.ok(!list.some((e) => /paid\/model/.test(e.model)), "в очередь попала платная модель");
  assert.ok(!list.some((e) => /tiny:free/.test(e.model)), "взяли модель со слишком коротким контекстом");
});

test("если зашитых моделей у сервиса нет, берётся та, что реально есть", async () => {
  const { customEngines, resolveEngines, resetChatModelsCache } = require("../core/engines.js");
  resetChatModelsCache();
  const key = "gsk_" + "d".repeat(40);
  const asked = [];
  const fakeFetch = async (url) => {
    asked.push(String(url));
    if (String(url).endsWith("/models")) {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "whisper-large-v3" }, { id: "brand-new-chat-model" }] }) };
    }
    return { ok: false, status: 404, text: async () => "{}", headers: { get: () => "" } };
  };
  const engines = customEngines({ apiKey: key });
  const resolved = await resolveEngines(engines, { fetch: fakeFetch });
  const names = resolved.filter((e) => e.key === key).map((e) => e.model);
  assert.ok(names.length > 0, "движков не осталось");
  assert.equal(names[0], "brand-new-chat-model", "пошла не туда: " + names.join(" → "));
  assert.ok(!names.some((m) => /whisper/.test(m)), "полезла в служебную модель: " + names.join(" → "));
  assert.ok(asked.some((u) => u.endsWith("/models")), "список моделей не запрошен");
});

test("если список моделей недоступен — остаются запасные имена", async () => {
  const { resolveEngines, order, routeForKey, resetFreeModelsCache } = require("../core/engines.js");
  resetFreeModelsCache();
  const or = "sk-or-v1-" + "e".repeat(48);
  const list = await resolveEngines(order({ apiKey: or }), { fetch: async () => { throw new Error("offline"); } });
  assert.ok(list[0].model, "модель пустая — запрос уйдёт в никуда");
  assert.ok(routeForKey(or).models.includes(list[0].model), "взяли имя не из запасного списка: " + list[0].model);
});

test("склеенные ключи распознаются: старое однострочное поле их не теряет", () => {
  const { parseKeys, customEngines } = require("../core/engines.js");
  const groq = "gsk_" + "a".repeat(40);
  const or = "sk-or-v1-" + "b".repeat(48);
  // так выглядело сохранённое значение, когда поле было однострочным: перевод строки вырезался
  assert.equal(parseKeys(groq + or).length, 2);
  assert.equal(parseKeys("Bearer " + groq + ", key=" + or + " мой ключ").length, 2);
  const engines = customEngines({ apiKey: groq + or });
  assert.ok(engines.length >= 2, "движков от склеенных ключей: " + engines.length);
  assert.notEqual(engines[0].key, engines[engines.length - 1].key, "ключи слиплись в один");
});

test("ключ не печатается в журнал и не уходит в промпт", () => {
  const { formatCorrection, toolsPrompt } = require("../core/protocol.js");
  const { systemPrompt } = require("../core/agent.js");
  const { LIMITS } = require("../core/license.js");
  const key = "gsk_" + "f".repeat(40);
  const sys = systemPrompt({ workspace: "C:\\p", settings: { access: "folder", apiKey: key }, limits: LIMITS.active, info: {}, task: "почини" });
  assert.ok(!sys.includes(key), "ключ попал в системный промпт");
  assert.ok(!toolsPrompt().includes(key));
  assert.ok(!formatCorrection("ошибка").includes(key));
});

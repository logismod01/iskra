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

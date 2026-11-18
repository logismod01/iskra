/* Тесты API: поднимаем сервер на свободном порту и дергаем его. */
const assert = require("node:assert");
const { createServer } = require("./src/server.js");

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + "\n    " + e.message); }
}

(async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;

  await t("список по умолчанию — 5 задач", async () => {
    const r = await fetch(base + "/tasks");
    const data = await r.json();
    assert.strictEqual(data.items.length, 5);
    assert.strictEqual(data.total, 12);
  });

  await t("вторая страница начинается с шестой задачи", async () => {
    const r = await fetch(base + "/tasks?page=2&limit=5");
    const data = await r.json();
    assert.strictEqual(data.items[0].id, 6);
  });

  await t("несуществующая задача даёт 404", async () => {
    const r = await fetch(base + "/tasks/999");
    assert.strictEqual(r.status, 404);
  });

  await t("новая задача создаётся", async () => {
    const r = await fetch(base + "/tasks", { method: "POST", body: JSON.stringify({ title: "Купить хлеб" }) });
    const data = await r.json();
    assert.strictEqual(r.status, 201);
    assert.strictEqual(data.title, "Купить хлеб");
  });

  await t("битый JSON не роняет сервер, а даёт 400", async () => {
    const r = await fetch(base + "/tasks", { method: "POST", body: "{это не json" });
    assert.strictEqual(r.status, 400);
    const again = await fetch(base + "/tasks");
    assert.strictEqual(again.status, 200);
  });

  server.close();
  console.log("\nпройдено " + passed + ", провалено " + failed);
  process.exit(failed ? 1 : 0);
})();

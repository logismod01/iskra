const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs/promises");
const path = require("node:path");

const shared = require("../core/shared.js");
const { search, promptBlock, parseRows, setItems, reset, CONFIG } = shared;

const ROWS = [
  { topic: "Фотосинтез", body: "Растения на свету превращают воду и углекислый газ в глюкозу и кислород. Идёт в хлоропластах, нужен хлорофилл.", tags: "биология", source: "owner" },
  { topic: "ЗвонИт или звОнит", body: "Правильно: звонИт. Ударение всегда на последний слог: звонИть, звонИт, позвонИшь, позвонЯт.", tags: "русский", source: "owner" },
  { topic: "Порт занят", body: "Ошибка EADDRINUSE значит, что порт уже слушает другой процесс: найди его через netstat или lsof и закрой либо возьми другой порт.", tags: "код, ошибки", source: "owner" }
];

test("адрес и ключ базы заданы, ключ не секретный", () => {
  assert.match(CONFIG.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(CONFIG.anonKey, /^eyJ/);
  assert.equal(CONFIG.table, "iskra_shared_kb");
});

test("пустой ответ сервера ничего не ломает", () => {
  assert.deepEqual(parseRows(null), []);
  assert.deepEqual(parseRows([]), []);
  assert.deepEqual(parseRows([{ topic: "x" }]), [], "слишком короткая тема отбрасывается");
  assert.deepEqual(parseRows([{ topic: "Тема", body: "коротко" }]), [], "слишком короткий текст отбрасывается");
});

test("строки сервера превращаются в карточки", () => {
  const parsed = parseRows(ROWS);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].topic, "Фотосинтез");
  assert.match(parsed[0].text, /хлорофилл/);
  assert.equal(parsed[0].tags, "биология");
});

test("поиск находит тему по названию и по слову из текста", () => {
  reset();
  setItems(ROWS);
  assert.equal(search("фотосинтез", 1)[0].topic, "Фотосинтез");
  assert.equal(search("EADDRINUSE", 1)[0].topic, "Порт занят");
  assert.equal(search("как правильно звонИт", 1)[0].topic, "ЗвонИт или звОнит");
  assert.equal(search("квантовая хромодинамика", 3).length, 0);
  assert.equal(search("", 3).length, 0);
});

test("совпадение в названии весит больше, чем в тексте", () => {
  reset();
  setItems(ROWS);
  const top = search("порт", 2);
  assert.equal(top[0].topic, "Порт занят");
});

test("справка из общей базы собирается для промпта", () => {
  reset();
  setItems(ROWS);
  const block = promptBlock("что такое фотосинтез", 600);
  assert.match(block, /ОБЩЕЙ БАЗЫ/);
  assert.match(block, /хлорофилл/);
  assert.ok(block.length <= 600, "блок разросся: " + block.length);
  assert.equal(promptBlock("нет такой темы вообще", 600), "");
});

test("загрузка с сервера кладёт темы в память", async () => {
  reset();
  const fakeFetch = async (url, opts) => {
    assert.match(url, /rest\/v1\/iskra_shared_kb/);
    assert.match(url, /active=eq\.true/);
    assert.equal(opts.headers.apikey, CONFIG.anonKey);
    return { ok: true, status: 200, json: async () => ROWS };
  };
  const list = await shared.refresh({ fetchImpl: fakeFetch, force: true });
  assert.equal(list.length, 3);
  assert.equal(shared.isEmpty(), false);
  assert.equal(shared.error(), "");
  assert.equal(shared.isFresh(), true);
});

test("сбой сети не стирает уже загруженное", async () => {
  reset();
  setItems(ROWS);
  const bad = async () => { throw new Error("нет связи"); };
  const list = await shared.refresh({ fetchImpl: bad, force: true });
  assert.equal(list.length, 3, "темы должны остаться");
  assert.match(shared.error(), /нет связи/);
});

test("ошибка сервера записывается, но не падает", async () => {
  reset();
  const fail = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const list = await shared.refresh({ fetchImpl: fail, force: true });
  assert.deepEqual(list, []);
  assert.match(shared.error(), /503/);
});

test("копия на диске переживает перезапуск без сети", async () => {
  reset();
  setItems(ROWS);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sye-kb-"));
  assert.equal(await shared.saveCache(dir), true);
  reset();
  const offline = async () => { throw new Error("нет связи"); };
  const after = await shared.boot(dir, { fetchImpl: offline });
  assert.equal(after.length, 3);
  assert.equal(search("фотосинтез", 1)[0].topic, "Фотосинтез");
  await fs.rm(dir, { recursive: true, force: true });
});

test("пустая база не сохраняется поверх копии", async () => {
  reset();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sye-kb2-"));
  assert.equal(await shared.saveCache(dir), false);
  await fs.rm(dir, { recursive: true, force: true });
});

test("в настройках видно, что агент знает и откуда", () => {
  const fsSync = require("node:fs");
  const root = path.join(__dirname, "..");
  const html = fsSync.readFileSync(path.join(root, "renderer/index.html"), "utf8");
  const appJs = fsSync.readFileSync(path.join(root, "renderer/app.js"), "utf8");
  const mainJs = fsSync.readFileSync(path.join(root, "main.js"), "utf8");
  const preload = fsSync.readFileSync(path.join(root, "preload.js"), "utf8");

  assert.match(html, /Справка и знания/);
  assert.match(html, /Общая база Искры/);
  assert.match(html, /id="kbRefreshBtn"/);
  assert.match(appJs, /renderKb\(s\.kb\)/);
  assert.match(appJs, /kbRefresh\(\)/);
  assert.match(mainJs, /shared\.boot\(USER_DIR\)/);
  assert.match(preload, /kbRefresh:/);
});

test("в справке настройки не называются чужие сервисы", () => {
  const fsSync = require("node:fs");
  const html = fsSync.readFileSync(path.join(__dirname, "..", "renderer/index.html"), "utf8");
  assert.doesNotMatch(html, /Supabase|supabase/i);
  assert.doesNotMatch(html, /OpenAI|Anthropic|Google|Groq/i);
});

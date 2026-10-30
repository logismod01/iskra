const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { runTool, stripHtml, isLocalUrl } = require("../core/tools.js");
const { LIMITS } = require("../core/license.js");

function tmpWorkspace(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sye-" + name + "-"));
}

function ctxFor(workspace, opts) {
  const o = opts || {};
  return {
    workspace,
    settings: { access: o.access || "folder" },
    limits: o.limits || LIMITS.active,
    confirm: o.confirm || (async () => true),
    exec: o.exec || (async () => ({ code: 0, stdout: "ok", stderr: "" })),
    capture: async () => "data:image/png;base64,AAAA",
    lookAtShot: async () => ({ ok: true, summary: "Посмотрел на экран", output: "На экране редактор кода" }),
    fetchUrl: async () => "<html><body>Привет</body></html>"
  };
}

test("запись → чтение → замена → поиск в рабочей папке", async () => {
  const ws = tmpWorkspace("files");
  const ctx = ctxFor(ws);

  const w = await runTool({ tool: "fs.write", args: { path: "src/app.js", content: "const a = 1;\nconsole.log(a);\n" } }, ctx);
  assert.equal(w.ok, true);
  assert.ok(fs.existsSync(path.join(ws, "src", "app.js")));

  const r = await runTool({ tool: "fs.read", args: { path: "src/app.js" } }, ctx);
  assert.equal(r.ok, true);
  assert.match(r.output, /console\.log/);
  assert.match(r.output, /1│/); // нумерация строк

  const rep = await runTool({ tool: "fs.replace", args: { path: "src/app.js", find: "const a = 1;", replace: "const a = 2;" } }, ctx);
  assert.equal(rep.ok, true);
  assert.match(await fsp.readFile(path.join(ws, "src", "app.js"), "utf8"), /a = 2/);

  const search = await runTool({ tool: "fs.search", args: { query: "console\\.log" } }, ctx);
  assert.equal(search.ok, true);
  assert.match(search.output, /src\/app\.js:2/);

  const list = await runTool({ tool: "fs.list", args: { path: "." } }, ctx);
  assert.equal(list.ok, true);
  assert.match(list.output, /src\//);
});

test("правка несуществующего фрагмента не портит файл", async () => {
  const ws = tmpWorkspace("replace");
  const ctx = ctxFor(ws);
  await runTool({ tool: "fs.write", args: { path: "a.txt", content: "один\nдва\n" } }, ctx);
  const bad = await runTool({ tool: "fs.replace", args: { path: "a.txt", find: "три", replace: "четыре" } }, ctx);
  assert.equal(bad.ok, false);
  assert.match(bad.output, /нет такого фрагмента/i);
  assert.equal(await fsp.readFile(path.join(ws, "a.txt"), "utf8"), "один\nдва\n");
});

test("выход из рабочей папки запрещён", async () => {
  const ws = tmpWorkspace("jail");
  const ctx = ctxFor(ws);
  const r = await runTool({ tool: "fs.read", args: { path: "../../etc/passwd" } }, ctx);
  assert.equal(r.ok, false);
  assert.match(r.summary, /за рабочую папку|пределы/i);
});

test("без подписки запись, терминал, интернет и скриншот закрыты", async () => {
  const ws = tmpWorkspace("expired");
  const ctx = ctxFor(ws, { limits: LIMITS.expired });
  for (const action of [
    { tool: "fs.write", args: { path: "a.txt", content: "x" } },
    { tool: "fs.mkdir", args: { path: "newdir" } },
    { tool: "fs.delete", args: { path: "a.txt" } },
    { tool: "shell.run", args: { command: "npm test" } },
    { tool: "web.fetch", args: { url: "https://example.com" } },
    { tool: "screen.look", args: {} }
  ]) {
    const r = await runTool(action, ctx);
    assert.equal(r.ok, false, "должно быть закрыто: " + action.tool);
    assert.equal(r.denied, true, "нет пометки denied: " + action.tool);
    assert.match(r.summary, /подписка Pro закончилась/i);
  }
  // читать и искать при этом можно
  await fsp.writeFile(path.join(ws, "note.txt"), "важное", "utf8");
  const read = await runTool({ tool: "fs.read", args: { path: "note.txt" } }, ctx);
  assert.equal(read.ok, true);
});

test("удаление требует подтверждения и уважает отказ", async () => {
  const ws = tmpWorkspace("delete");
  await fsp.writeFile(path.join(ws, "old.txt"), "x", "utf8");
  const no = await runTool({ tool: "fs.delete", args: { path: "old.txt" } }, ctxFor(ws, { confirm: async () => false }));
  assert.equal(no.ok, false);
  assert.equal(no.denied, true);
  assert.ok(fs.existsSync(path.join(ws, "old.txt")));

  const yes = await runTool({ tool: "fs.delete", args: { path: "old.txt" } }, ctxFor(ws));
  assert.equal(yes.ok, true);
  assert.equal(fs.existsSync(path.join(ws, "old.txt")), false);
});

test("уровень «спрашивать всё» требует подтверждения на запись", async () => {
  const ws = tmpWorkspace("ask");
  let asked = 0;
  const ctx = ctxFor(ws, { access: "ask", confirm: async () => { asked++; return true; } });
  const r = await runTool({ tool: "fs.write", args: { path: "a.txt", content: "1" } }, ctx);
  assert.equal(r.ok, true);
  assert.equal(asked, 1);
});

test("терминал: смертельная команда не запускается, обычная идёт в рабочую папку", async () => {
  const ws = tmpWorkspace("shell");
  let seen = null;
  const ctx = ctxFor(ws, {
    exec: async (command, o) => { seen = { command, cwd: o.cwd }; return { code: 0, stdout: "всё ок", stderr: "" }; }
  });
  const bad = await runTool({ tool: "shell.run", args: { command: "rm -rf /" } }, ctx);
  assert.equal(bad.ok, false);
  assert.equal(seen, null, "запрещённая команда не должна доходить до терминала");

  const ok = await runTool({ tool: "shell.run", args: { command: "npm test" } }, ctx);
  assert.equal(ok.ok, true);
  assert.equal(seen.command, "npm test");
  assert.equal(seen.cwd, ws);
  assert.match(ok.output, /stdout:\nвсё ок/);

  const danger = await runTool({ tool: "shell.run", args: { command: "npm install left-pad" } }, ctxFor(ws, { confirm: async () => false, exec: async () => { throw new Error("не должны были запустить"); } }));
  assert.equal(danger.denied, true);
});

test("секреты не попадают в наблюдение терминала", async () => {
  const ws = tmpWorkspace("secret");
  const token = "gsk_abcdefghijklmnopqrstuvwx";
  const r = await runTool({ tool: "shell.run", args: { command: "echo hi" } }, ctxFor(ws, {
    exec: async () => ({ code: 0, stdout: "ключ " + token, stderr: "" })
  }));
  assert.equal(r.ok, true);
  assert.ok(!r.output.includes(token), "токен утёк: " + r.output);
});

test("интернет: только http(s) и не в локальную сеть", async () => {
  const ws = tmpWorkspace("web");
  const ctx = ctxFor(ws);
  assert.equal((await runTool({ tool: "web.fetch", args: { url: "localhost:3000" } }, ctx)).ok, false);
  assert.equal((await runTool({ tool: "web.fetch", args: { url: "http://127.0.0.1:8080" } }, ctx)).ok, false);
  assert.equal((await runTool({ tool: "web.fetch", args: { url: "http://192.168.1.1/admin" } }, ctx)).ok, false);
  const good = await runTool({ tool: "web.fetch", args: { url: "https://example.com" } }, ctx);
  assert.equal(good.ok, true);
  assert.match(good.output, /Привет/);
});

test("скриншот: свежий снимок уходит в зрение, без снимка делаем новый", async () => {
  const ws = tmpWorkspace("vision");
  let captured = 0;
  const ctx = ctxFor(ws);
  ctx.capture = async () => { captured++; return "data:image/png;base64,AAAA"; };
  ctx.pendingShot = { image: "data:image/png;base64,BBBB" };
  const r = await runTool({ tool: "screen.look", args: { question: "что это?" } }, ctx);
  assert.equal(r.ok, true);
  assert.equal(captured, 0, "готовый снимок не должен пересниматься");

  const r2 = await runTool({ tool: "screen.look", args: {} }, ctxFor(ws, {
    limits: Object.assign({}, LIMITS.active)
  }));
  assert.equal(r2.ok, true);
});

test("task.done закрывает задачу", async () => {
  const ws = tmpWorkspace("done");
  const r = await runTool({ tool: "task.done", args: { summary: "Переименовал файл" } }, ctxFor(ws));
  assert.equal(r.ok, true);
  assert.equal(r.final, "Переименовал файл");
});

test("неизвестный инструмент — ошибка, а не падение", async () => {
  const r = await runTool({ tool: "fs.explode", args: {} }, ctxFor(tmpWorkspace("unknown")));
  assert.equal(r.ok, false);
  assert.match(r.summary, /неизвестный/i);
});

test("stripHtml убирает scripts/styles и оставляет текст", () => {
  const html = "<html><head><style>body{color:red}</style><script>alert(1)</script></head><body><h1>Заголовок</h1><p>Абзац &amp; текст</p></body></html>";
  const text = stripHtml(html);
  assert.ok(!text.includes("alert(1)"));
  assert.ok(!text.includes("color:red"));
  assert.match(text, /Заголовок/);
  assert.match(text, /Абзац & текст/);
});

test("локальные адреса распознаются", () => {
  assert.equal(isLocalUrl("http://localhost:3000"), true);
  assert.equal(isLocalUrl("http://127.0.0.1/x"), true);
  assert.equal(isLocalUrl("http://192.168.0.5"), true);
  assert.equal(isLocalUrl("http://printer.local"), true);
  assert.equal(isLocalUrl("https://example.com"), false);
  assert.equal(isLocalUrl("file:///etc/passwd"), true);
});

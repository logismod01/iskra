/**
 * Защита агента: чужие ОС, пароли в файлах.
 *
 * Что было найдено при проверке:
 *  • на Linux путь «C:\Windows\System32» склеивался с рабочей папкой
 *    (/tmp/lab/C:\Windows\System32) и удаление проходило как «файл внутри
 *    папки» — системный каталог Windows можно было снести одной командой;
 *  • пароль из файла («пароль: qwerty123») не маскировался: шаблоны
 *    ловили только ключи вида sk-…, а «password: …» проходил открытым.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const guard = require("../core/guard.js");
const { runTool } = require("../core/tools.js");
const { LIMITS } = require("../core/license.js");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function tmpWorkspace(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "guard-" + name + "-"));
}

test("путь другой ОС не считается файлом внутри рабочей папки", () => {
  const ws = tmpWorkspace("foreign");
  for (const p of ["C:\\Windows\\System32", "D:/Games", "\\\\server\\share", "%USERPROFILE%\\Desktop"]) {
    const r = guard.resolveInWorkspace(ws, p, "folder");
    assert.equal(r.ok, false, "прошёл путь: " + p);
  }
});

test("обычный путь внутри папки по-прежнему работает", () => {
  const ws = tmpWorkspace("inside");
  for (const p of ["app.js", "src/index.js", "./docs/readme.md"]) {
    const r = guard.resolveInWorkspace(ws, p, "folder");
    assert.equal(r.ok, true, "не прошёл путь: " + p);
  }
});

test("выход из папки через .. запрещён", () => {
  const ws = tmpWorkspace("up");
  assert.equal(guard.resolveInWorkspace(ws, "../../etc/passwd", "folder").ok, false);
  assert.equal(guard.resolveInWorkspace(ws, "..\\..\\win.ini", "folder").ok, false);
});

test("пароль и api-key маскируются, имя ключа остаётся", () => {
  const text = "пароль: qwerty123\nPASSWORD=hunter2\nAPI_KEY=abcdef123456\nTOKEN=ISKRA-ABCDEF123456";
  const out = guard.redactSecrets(text);
  for (const secret of ["qwerty123", "hunter2", "abcdef123456", "ISKRA-ABCDEF123456"]) {
    assert.ok(!out.includes(secret), "утёк секрет: " + secret);
  }
  assert.match(out, /пароль/);
  assert.match(out, /PASSWORD/);
  assert.match(out, /API_KEY/);
  assert.match(out, /TOKEN/);
});

test("чтение файла с паролем не выдаёт пароль", async () => {
  const ws = tmpWorkspace("pw");
  fs.writeFileSync(path.join(ws, "config.env"), "DB_PASSWORD=supersecret123\nPORT=5432\n", "utf8");
  const ctx = { workspace: ws, settings: { access: "folder" }, limits: LIMITS.active, confirm: async () => true };
  const r = await runTool({ tool: "fs.read", args: { path: "config.env" } }, ctx);
  assert.equal(r.ok, true);
  assert.ok(!r.output.includes("supersecret123"), "пароль утёк в вывод");
  assert.match(r.output, /PORT=5432/, "остальной текст должен остаться");
});

test("удаление системного пути другой ОС не проходит", async () => {
  const ws = tmpWorkspace("del");
  const ctx = { workspace: ws, settings: { access: "folder" }, limits: LIMITS.active, confirm: async () => true };
  const r = await runTool({ tool: "fs.delete", args: { path: "C:\\Windows\\System32" } }, ctx);
  assert.equal(r.ok, false);
});

test("JWT и ключи облаков маскируются", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const aws = "AKIAIOSFODNN7EXAMPLE";
  const gh = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
  const out = guard.redactSecrets(`a=${jwt}\nb=${aws}\nc=${gh}`);
  assert.ok(!out.includes("eyJhbGciOiJIUzI1NiJ9"), "JWT утёк");
  assert.ok(!out.includes(aws), "ключ AWS утёк");
  assert.ok(!out.includes(gh), "токен GitHub утёк");
});

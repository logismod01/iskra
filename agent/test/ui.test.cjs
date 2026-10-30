const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const html = read("renderer/index.html");
const appJs = read("renderer/app.js");
const css = read("renderer/styles.css");
const preload = read("preload.js");

test("скрипты и главный процесс без синтаксических ошибок", () => {
  for (const file of ["main.js", "preload.js", "renderer/app.js", "core/agent.js", "core/tools.js"]) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", path.join(ROOT, file)]), file + " не парсится");
  }
});

test("каждый элемент, который ищет интерфейс, есть в разметке", () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...appJs.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]));
  const missing = [...used].filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], "нет в HTML: " + missing.join(", "));
});

test("интерфейс не зовёт то, чего нет в мосту preload", () => {
  const exposed = new Set([...preload.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]));
  const used = new Set([...appJs.matchAll(/window\.sye\.([a-zA-Z]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((name) => !exposed.has(name));
  assert.deepEqual(missing, [], "нет в preload: " + missing.join(", "));
});

test("в окне нет прямого доступа к node", () => {
  assert.match(read("main.js"), /nodeIntegration: false/);
  assert.match(read("main.js"), /contextIsolation: true/);
  assert.doesNotMatch(appJs, /require\(["']electron["']\)/);
});

test("тема Sye: тёмный фон и оранжевая искра", () => {
  assert.match(css, /#141413/i);
  assert.match(css, /#d97757/i);
});

test("окно активации: закрыть нельзя без ключа, можно — после окончания подписки", () => {
  assert.match(html, /id="gate"/);
  assert.match(html, /id="gateLater" hidden/);
  assert.match(appJs, /lic\.state === "none" \|\| lic\.state === "wrong-device"/);
  assert.match(appJs, /else if \(expired\)/);
  assert.match(appJs, /\$\("#gateLater"\)\.hidden = false/);
});

test("вход по аккаунту Искры есть в окне активации", () => {
  for (const id of ["tabAccount", "tabKey", "paneAccount", "paneKey", "accEmail", "accPass", "accClient", "accConnect", "accSendCode", "accCode", "accVerify", "accWho", "accCheckBtn", "accLogoutBtn"]) {
    assert.ok(html.includes('id="' + id + '"'), "нет поля " + id);
  }
  assert.match(appJs, /accountConnect/);
  assert.match(appJs, /accountCheck/);
  assert.match(preload, /accountConnect:/);
  assert.match(preload, /accountSendCode:/);
});

test("аккаунт и ключ — два разных способа, не мешают друг другу", () => {
  assert.match(html, /Аккаунт Искры/);
  assert.match(html, /Ключ Pro/);
  assert.match(appJs, /setGateTab\(/);
  assert.match(appJs, /paneAccount"\).hidden/);
});

test("скриншот уходит в задачу вместе с текстом", () => {
  assert.match(appJs, /const shot = state\.shot;/);
  assert.match(appJs, /startTask\(text, shot\)/);
  assert.match(preload, /startTask: \(task, shot\) => ipcRenderer\.invoke\("task:start", \{ task, shot \}\)/);
});

test("горячие клавиши и трей описаны в главном процессе", () => {
  const main = read("main.js");
  assert.match(main, /globalShortcut\.register\("CommandOrControl\+Alt\+S"/);
  assert.match(main, /globalShortcut\.register\("CommandOrControl\+Alt\+Space"/);
  assert.match(main, /new Tray\(/);
  assert.match(main, /setContextMenu/);
});

test("шрифты и картинки не тянутся из интернета", () => {
  assert.doesNotMatch(html, /<link[^>]+https?:/i);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
});

test("окно не открывает внешние ссылки внутри себя", () => {
  assert.match(read("main.js"), /setWindowOpenHandler/);
  assert.match(read("main.js"), /action: "deny"/);
});

test("иконки на месте и правильного размера", () => {
  const png = fs.readFileSync(path.join(ROOT, "assets/icon.png"));
  // PNG: ширина и высота лежат в IHDR
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 512);
  assert.equal(height, 512);
  assert.ok(fs.existsSync(path.join(ROOT, "assets/icon.ico")));
  assert.ok(fs.statSync(path.join(ROOT, "assets/tray.png")).size > 200);
});

test("в окне активации написано, где взять ключ Pro", () => {
  // «где ключ» — самый частый вопрос: в окне активации должна быть короткая инструкция,
  // а не тупик с одной кнопкой
  assert.match(html, /id="gateHelp"/);
  assert.match(html, /Где взять ключ/);
  assert.match(html, /⚙\s*→\s*«Доступ»/);
  assert.match(html, /ISKRA-24-XXXX-XXXX-XXXX/);
  // кнопки подсказки ведут на сайт и в буфер обмена, а не в пустоту
  assert.match(appJs, /gateHelpOpen"\)\.addEventListener/);
  assert.match(appJs, /logismod01\.github\.io\/iskra\/#access/);
  assert.match(appJs, /gateHelpCopy"\)\.addEventListener/);
  assert.match(appJs, /window\.sye\.copy\(/);
  // «Где взять ключ» раскрывает подсказку, а не уводит со страницы
  assert.match(appJs, /gateGetKey"\)\.addEventListener\("click", \(\) => \{[\s\S]{0,200}help\.open = true/);
});

test("ключ у агента тот же, что на сайте — второго покупать не надо", () => {
  assert.match(html, /тот же Pro, что на сайте/);
  assert.match(html, /ключ отдельно покупать не нужно/);
});

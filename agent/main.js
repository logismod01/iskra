/**
 * Sye — агент на рабочем столе.
 * Главный процесс: окно, трей, горячие клавиши, файлы, терминал, скриншоты, подписка.
 */

"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, globalShortcut, desktopCapturer, nativeImage, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { exec } = require("node:child_process");

const brand = require("./core/brand.js");
const guard = require("./core/guard.js");
const { createLicense } = require("./core/license.js");
const { runTask } = require("./core/agent.js");
const { askModel, askVision } = require("./core/engines.js");
const { stripHtml } = require("./core/tools.js");

// Проверка сборки без человека: окно открылось, отрисовалось — и закрылись.
const SMOKE = process.argv.includes("--smoke-test");

const USER_DIR = app.getPath("userData");
const FILES = {
  settings: path.join(USER_DIR, "sye-settings.json"),
  license: path.join(USER_DIR, "sye-license.json"),
  history: path.join(USER_DIR, "sye-history.json")
};

let win = null;
let tray = null;
let running = null;        // { controller, taskId }
let pendingShot = null;    // { dataUrl, at }

/* ---------- Простое хранилище ---------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
  } catch (e) { /* диск переполнен или нет прав — не роняем приложение */ }
}

const DEFAULT_SETTINGS = {
  access: "folder",
  workspace: os.homedir(),
  apiKey: "",
  apiBase: "",
  apiModel: "",
  autoStart: false,
  lastTask: ""
};
let settings = Object.assign({}, DEFAULT_SETTINGS, readJson(FILES.settings, {}));

function saveSettings(patch) {
  settings = Object.assign({}, settings, patch || {});
  writeJson(FILES.settings, settings);
  return settings;
}

/* ---------- Устройство: один Pro — один агент ---------- */
function deviceId() {
  const raw = [os.hostname(), os.platform(), os.arch(), os.userInfo().username].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
const DEVICE_NAME = os.hostname() + " · " + (os.platform() === "win32" ? "Windows" : os.platform());

const license = createLicense({
  read: () => readJson(FILES.license, {}),
  write: (state) => writeJson(FILES.license, state),
  deviceId: deviceId(),
  deviceName: DEVICE_NAME,
  log: (msg) => console.log("[license]", msg)
});

function licenseView() {
  const st = license.status();
  return {
    state: st.state,
    label: st.label,
    note: st.note,
    daysLeft: st.daysLeft === undefined ? null : st.daysLeft,
    forever: !!st.forever,
    expiresAt: st.expiresAt || 0,
    plan: st.plan || "",
    client: st.client || "",
    keyMasked: st.key ? st.key.slice(0, 9) + "…" + st.key.slice(-4) : "",
    device: DEVICE_NAME,
    limits: { steps: st.steps, shell: st.shell, write: st.write, vision: st.vision, web: st.web }
  };
}

/* ---------- История задач ---------- */
function historyList() {
  const list = readJson(FILES.history, []);
  return Array.isArray(list) ? list.slice(0, 60) : [];
}
function historyPush(item) {
  const list = historyList();
  list.unshift(item);
  writeJson(FILES.history, list.slice(0, 60));
}

/* ---------- Терминал ---------- */
function runCommand(command, opts) {
  const cwd = (opts && opts.cwd) || settings.workspace;
  const timeout = (opts && opts.timeout) || 120000;
  return new Promise((resolve) => {
    exec(command, { cwd, timeout, maxBuffer: 6 * 1024 * 1024, windowsHide: true, shell: true }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
      resolve({ code, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

/* ---------- Скриншот ---------- */
async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1600, height: 1000 },
    fetchWindowIcons: false
  });
  if (!sources.length) throw new Error("не нашёл экран для снимка");
  const source = sources.find((s) => /entire|весь экран/i.test(s.name)) || sources[0];
  const image = source.thumbnail;
  if (!image || image.isEmpty()) throw new Error("снимок экрана пустой");
  return image.toDataURL();
}

async function takeShot(openWindow = true) {
  try {
    const dataUrl = await captureScreen();
    pendingShot = { dataUrl, at: Date.now() };
    if (openWindow) showWindow();
    if (win) win.webContents.send("shot:ready", { dataUrl, at: pendingShot.at });
    return { ok: true, dataUrl };
  } catch (e) {
    if (win) win.webContents.send("toast", { text: "Не получилось сделать снимок: " + (e.message || e), type: "err" });
    return { ok: false, error: e.message || String(e) };
  }
}

/* ---------- Окно ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: brand.bg,
    title: brand.full,
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.on("close", (e) => {
    if (app.isQuitting) return;
    e.preventDefault();
    win.hide();
    if (tray && !settings.seenTrayHint) {
      saveSettings({ seenTrayHint: true });
      if (typeof tray.displayBalloon === "function") {
        try { tray.displayBalloon({ title: brand.name, content: "Я остался в трее. Горячая клавиша Ctrl+Alt+S — снимок экрана." }); } catch (e) { /* не на всех системах */ }
      }
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("did-finish-load", () => {
    win.webContents.send("state:changed", { license: licenseView(), settings, brand });
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ---------- Трей ---------- */
function createTray() {
  const iconPath = path.join(__dirname, "assets", "tray.png");
  const fallback = path.join(__dirname, "assets", "icon.png");
  let icon = nativeImage.createFromPath(fs.existsSync(iconPath) ? iconPath : fallback);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(brand.name + " — агент на рабочем столе");
  const menu = Menu.buildFromTemplate([
    { label: "Открыть " + brand.name, click: () => showWindow() },
    { label: "Снимок экрана и задача", accelerator: "CommandOrControl+Alt+S", click: () => takeShot(true) },
    { type: "separator" },
    { label: "Состояние подписки", click: () => { showWindow(); if (win) win.webContents.send("ui:openSettings"); } },
    { type: "separator" },
    {
      label: "Выход",
      click: () => { app.isQuitting = true; app.quit(); }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => showWindow());
}

/* ---------- Подтверждения ---------- */
async function askConfirm(req) {
  if (!win) return false;
  const res = await dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Разрешить", "Отменить"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: (req && req.title) || "Подтверждение",
    message: (req && req.title) || "Подтверждение",
    detail: (req && req.detail) || ""
  });
  return res.response === 0;
}

/* ---------- Контекст для инструментов ---------- */
function makeContext(limits, opts) {
  const shot = (opts && opts.shot) || null;
  return {
    workspace: settings.workspace,
    settings,
    limits,
    info: { os: os.platform(), arch: os.arch(), device: DEVICE_NAME },
    confirm: askConfirm,
    exec: runCommand,
    capture: () => captureScreen(),
    fetchUrl: async (url) => {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Sye Agent)" }, redirect: "follow" });
      const html = await res.text();
      return stripHtml(html);
    },
    pendingShot: shot ? { image: shot } : null,
    lookAtShot: async (image, question) => {
      const v = await askVision({
        imageDataUrl: image,
        question: (question || "Что на этом скриншоте?") + "\n\nОпиши по делу: что за окно, что написано, какие ошибки видны, что человек хочет сделать.",
        settings,
        maxTokens: 900
      });
      return { ok: true, summary: "Посмотрел на экран", output: v.text };
    }
  };
}

/* ---------- Запуск задачи ---------- */
async function startTask(payload) {
  if (running) return { ok: false, error: "Задача уже идёт" };
  const st = license.status();
  if (st.state === "none" || st.state === "wrong-device") {
    return { ok: false, error: "Нет активной подписки. Активируй ключ Pro." };
  }

  const task = String((payload && payload.task) || "").trim();
  if (!task) return { ok: false, error: "Пустая задача" };

  const controller = new AbortController();
  const taskId = "t" + Date.now().toString(36);
  running = { controller, taskId };

  // скриншот приходит из окна; если его нет — берём последний снимок по горячей клавише
  const shot = (payload && payload.shot) || (pendingShot && pendingShot.dataUrl) || null;
  const ctx = makeContext(st, { shot });
  const send = (event) => { if (win && !win.isDestroyed()) win.webContents.send("task:event", Object.assign({ taskId }, event)); };

  const model = async ({ messages, signal, maxTokens, onDelta }) => {
    return askModel({ messages, settings, signal, maxTokens, onDelta, onTry: (i, total) => send({ type: "engine", n: i, total }) });
  };

  try {
    const result = await runTask({
      task,
      ctx,
      model,
      signal: controller.signal,
      maxSteps: st.steps,
      onEvent: (e) => send(e)
    });
    historyPush({
      id: taskId,
      task,
      final: result.final,
      ok: result.ok !== false,
      steps: result.steps,
      at: Date.now(),
      state: st.state
    });
    if (win && !win.isDestroyed()) win.webContents.send("task:done", { taskId, result: { ok: result.ok, final: result.final, steps: result.steps, exhausted: !!result.exhausted, stopped: !!result.stopped } });
    if (win && !win.isDestroyed()) win.webContents.send("history:changed", historyList());
    return { ok: true, taskId };
  } catch (e) {
    send({ type: "error", text: e.message || String(e) });
    if (win && !win.isDestroyed()) win.webContents.send("task:done", { taskId, result: { ok: false, final: e.message || "Ошибка" } });
    return { ok: false, error: e.message };
  } finally {
    running = null;
    pendingShot = null;
  }
}

/* ---------- IPC ---------- */
function wireIpc() {
  ipcMain.handle("state:get", () => ({
    license: licenseView(),
    settings,
    brand,
    device: DEVICE_NAME,
    version: app.getVersion(),
    history: historyList()
  }));

  ipcMain.handle("license:activate", async (event, payload) => {
    const res = await license.activate(payload && payload.key, payload && payload.client);
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    return res;
  });

  ipcMain.handle("license:sync", async () => {
    const st = await license.sync(true);
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    return { state: st.state, label: st.label };
  });

  ipcMain.handle("license:deactivate", () => {
    license.deactivate();
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    return licenseView();
  });

  ipcMain.handle("settings:save", (event, patch) => {
    const next = saveSettings(patch || {});
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings: next, brand });
    return next;
  });

  ipcMain.handle("workspace:pick", async () => {
    const res = await dialog.showOpenDialog(win, {
      title: "Где " + brand.name + " может работать?",
      defaultPath: settings.workspace || os.homedir(),
      properties: ["openDirectory", "createDirectory"]
    });
    if (res.canceled || !res.filePaths.length) return { ok: false };
    saveSettings({ workspace: res.filePaths[0] });
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    return { ok: true, workspace: res.filePaths[0] };
  });

  ipcMain.handle("shot:capture", () => takeShot(false));

  ipcMain.handle("task:start", async (event, payload) => startTask(payload));

  ipcMain.handle("task:stop", () => {
    if (running && running.controller) {
      running.controller.abort();
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle("history:clear", () => {
    writeJson(FILES.history, []);
    if (win && !win.isDestroyed()) win.webContents.send("history:changed", []);
    return { ok: true };
  });

  ipcMain.handle("copy:text", (event, text) => {
    clipboard.writeText(String(text || ""));
    return { ok: true };
  });

  ipcMain.handle("open:external", (event, url) => {
    if (/^https?:\/\//i.test(String(url || ""))) shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("app:quit", () => { app.isQuitting = true; app.quit(); });
}

/* ---------- Жизнь приложения ---------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(async () => {
    wireIpc();
    createWindow();

    if (SMOKE) {
      win.webContents.once("did-finish-load", () => {
        console.log("[smoke] окно загружено");
        setTimeout(() => {
          console.log("[smoke] ok");
          app.isQuitting = true;
          app.quit();
        }, 800);
      });
      win.webContents.once("did-fail-load", (event, code, desc) => {
        console.error("[smoke] окно не загрузилось:", code, desc);
        app.isQuitting = true;
        app.exit(1);
      });
      return;
    }

    createTray();

    try {
      globalShortcut.register("CommandOrControl+Alt+S", () => takeShot(true));
      globalShortcut.register("CommandOrControl+Alt+Space", () => showWindow());
    } catch (e) { /* другие приложения могли занять эти клавиши */ }

    license.sync(false).then(() => {
      if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    });

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
  });

  app.on("window-all-closed", () => {
    // агент живёт в трее, поэтому окно не закрывает приложение
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
}

module.exports = { deviceId };

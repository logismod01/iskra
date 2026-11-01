/**
 * Sye — агент на рабочем столе.
 * Главный процесс: окно, трей, горячие клавиши, файлы, терминал, скриншоты, подписка.
 */

"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, globalShortcut, desktopCapturer, nativeImage, clipboard, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { exec, spawn } = require("node:child_process");

const brand = require("./core/brand.js");
const guard = require("./core/guard.js");
const { createLicense } = require("./core/license.js");
const { createAccount } = require("./core/account.js");
const { runTask } = require("./core/agent.js");
const shared = require("./core/shared.js");
const knowledge = require("./core/knowledge.js");
const petModule = require("./core/pet.js");
const { askModel, askVision } = require("./core/engines.js");
const { stripHtml } = require("./core/tools.js");

// Проверка сборки без человека: окно открылось, отрисовалось — и закрылись.
const SMOKE = process.argv.includes("--smoke-test");

const USER_DIR = app.getPath("userData");
const FILES = {
  settings: path.join(USER_DIR, "sye-settings.json"),
  license: path.join(USER_DIR, "sye-license.json"),
  account: path.join(USER_DIR, "sye-account.json"),
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
  lastTask: "",
  /* Вид: плотность и движение. Меняются в настройках без перезапуска. */
  compact: false,
  animations: true,
  /* Сью на рабочем столе: стоит, изредка гуляет, прыгает и говорит облачком. */
  petOn: true,
  petTalk: true,
  petMediaKeys: true,
  petX: 0,
  petY: 0,
  petPlaced: false
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

const account = createAccount({
  read: () => readJson(FILES.account, {}),
  write: (state) => writeJson(FILES.account, state),
  log: (msg) => console.log("[account]", msg)
});

/** Сверить подписку по привязанному коду клиента и запомнить итог в лицензии. */
async function syncAccount(force) {
  const acc = await account.check(force);
  const client = account.state().client;
  if (!client) {
    return { ok: false, msg: (acc && acc.msg) || "Код клиента не привязан." };
  }
  const a = await account.access();
  if (!a.ok) {
    broadcastState();
    return { ok: false, msg: a.msg || "Сервер Искры не ответил." };
  }
  const st = license.linkAccount({
    client,
    active: !!a.active,
    forever: !!a.forever,
    expiresAt: a.expiresAt,
    plan: a.plan,
    label: a.label
  });
  broadcastState();
  const wrongDevice = st && st.state === "wrong-device";
  return {
    ok: !wrongDevice,
    access: a,
    license: licenseView(),
    msg: wrongDevice
      ? "Подписка привязана к другому компьютеру. Один Pro — один агент: выйди из аккаунта на старом компьютере, чтобы перенести."
      : a.active
        ? (a.forever ? "Pro активна: навсегда." : "Pro активна до " + new Date(a.expiresAt).toLocaleDateString("ru-RU") + ".")
        : "На этом коде клиента нет активной подписки Pro."
  };
}

function broadcastState() {
  if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand, account: account.view() });
}

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
    engine: st.engine || "",
    client: st.client || "",
    keyMasked: st.engine === "account" ? "" : st.key ? st.key.slice(0, 9) + "…" + st.key.slice(-4) : "",
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
  /* Сью прячется на время снимка: модель не должна искать баги в агенте. */
  const shot = await petHidden(() => captureScreenRaw());
  petReact("screenshot");
  return shot;
}

async function captureScreenRaw() {
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

/* ---------- Сью на рабочем столе ---------- */
const PET_W = 160;
const PET_H = 178;
const PET_MASCOT_W = 96;   // видимая часть окна — сам Сью по центру

let petWin = null;
let petCore = null;
let petTimer = null;
let petDrag = null;
let petLastPhrase = "";
let petGreeted = false;

function petEnabled() {
  return settings.petOn !== false;
}

/* Весь рабочий стол: все мониторы сразу. Сью можно утащить в любое место. */
function petDesktop() {
  try {
    const list = screen.getAllDisplays()
      .map((d) => d.workArea)
      .filter((a) => a && a.width > 200 && a.height > 200);
    if (list.length) {
      const left = Math.min.apply(null, list.map((a) => a.x));
      const top = Math.min.apply(null, list.map((a) => a.y));
      const right = Math.max.apply(null, list.map((a) => a.x + a.width));
      const bottom = Math.max.apply(null, list.map((a) => a.y + a.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
  } catch (e) { /* экран ещё не готов — берём основной */ }
  try {
    const area = screen.getPrimaryDisplay().workArea;
    if (area && area.width > 200) return area;
  } catch (e) { /* совсем нет экрана — запасные размеры */ }
  return { x: 0, y: 0, width: 1280, height: 800 };
}

/* Где поставить окно: сохранённое место или правый нижний угол. */
function petStartPos() {
  const area = petDesktop();
  const maxX = Math.round(area.x + area.width - PET_W);
  const maxY = Math.round(area.y + area.height - PET_H);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  if (settings.petPlaced) {
    return {
      x: clamp(Math.round(Number(settings.petX) || 0), Math.round(area.x), maxX),
      y: clamp(Math.round(Number(settings.petY) || 0), Math.round(area.y), maxY)
    };
  }
  return { x: maxX - 24, y: maxY };
}

function ensurePetCore() {
  if (petCore) return petCore;
  petCore = petModule.createPet({
    width: PET_MASCOT_W,
    height: PET_H,
    quiet: settings.petTalk === false
  });
  const area = petDesktop();
  petCore.setBounds(
    area.x + (PET_W - PET_MASCOT_W) / 2,
    area.x + area.width - (PET_W - PET_MASCOT_W) / 2,
    area.y,
    area.y + area.height
  );
  const start = petStartPos();
  petCore.place(start.x + (PET_W - PET_MASCOT_W) / 2, start.y);
  return petCore;
}

function createPetWindow() {
  if (petWin && !petWin.isDestroyed()) return petWin;
  const start = petStartPos();
  petWin = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x: Math.round(start.x),
    y: Math.round(start.y),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    title: brand.name,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  try {
    petWin.setAlwaysOnTop(true, "floating");
    petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  } catch (e) { /* на некоторых системах этих настроек нет */ }
  /* Прозрачные поля окна не должны ловить клики по чужим программам:
     окно «сквозное», а интерактивным становится только над самим Сью. */
  try { petWin.setIgnoreMouseEvents(true, { forward: true }); } catch (e) { /* старые версии Electron */ }
  petWin.loadFile(path.join(__dirname, "renderer", "pet.html"));
  petWin.once("ready-to-show", () => {
    if (!petWin || petWin.isDestroyed()) return;
    petWin.showInactive();
    if (!petGreeted) {
      petGreeted = true;
      const core = ensurePetCore();
      core.greet(new Date().getHours());
      petPush();
    }
  });
  petWin.on("closed", () => { petWin = null; });
  return petWin;
}

function petPush() {
  if (!petWin || petWin.isDestroyed() || !petCore) return;
  if (!petWin.webContents || petWin.webContents.isLoading()) return;
  const snap = petCore.snapshot();
  petLastPhrase = snap.phrase || "";
  try { petWin.webContents.send("pet:state", snap); } catch (e) { /* окно закрывается */ }
}

/* Где окно, если сам Сью стоит в точке снимка. */
function petWindowXY(snap) {
  const width = petCore ? petCore.state.width : PET_MASCOT_W;
  return {
    x: Math.round(snap.x - (PET_W - width) / 2),
    y: Math.round(snap.y)
  };
}

function petTickLoop() {
  if (!petCore || !petWin || petWin.isDestroyed()) return;
  const before = petCore.snapshot();
  const snap = petCore.tick(petModule.TICK_MS, Date.now());
  petCore.maybeNudge(Date.now());

  const pos = petWindowXY(snap);
  const b = petWin.getBounds();
  if (b.x !== pos.x || b.y !== pos.y) {
    try { petWin.setBounds({ x: pos.x, y: pos.y, width: PET_W, height: PET_H }); } catch (e) { /* окно переехало в другой поток */ }
  }

  const after = petCore.snapshot();
  if (after.action !== before.action || after.mood !== before.mood || after.phrase !== petLastPhrase) petPush();
}

/* Экран поменялся — вернуть Сью в пределы рабочего стола, чтобы не потерялся. */
function petClamp() {
  if (!petCore) return;
  const area = petDesktop();
  petCore.setBounds(
    area.x + (PET_W - PET_MASCOT_W) / 2,
    area.x + area.width - (PET_W - PET_MASCOT_W) / 2,
    area.y,
    area.y + area.height
  );
  if (petWin && !petWin.isDestroyed()) {
    const pos = petWindowXY(petCore.snapshot());
    try { petWin.setBounds({ x: pos.x, y: pos.y, width: PET_W, height: PET_H }); } catch (e) {}
  }
  petPush();
}

function startPet() {
  if (!petEnabled()) return;
  createPetWindow();
  ensurePetCore();
  petClamp();
  if (!petTimer) petTimer = setInterval(petTickLoop, petModule.TICK_MS);
  petPush();
}

function stopPet() {
  if (petTimer) { clearInterval(petTimer); petTimer = null; }
  if (petCore) saveSettings({ petX: Math.round(petCore.state.x - (PET_W - petCore.state.width) / 2), petY: Math.round(petCore.state.y) });
  if (petWin && !petWin.isDestroyed()) {
    try { petWin.destroy(); } catch (e) { /* уже закрыто */ }
  }
  petWin = null;
  petDrag = null;
  /* Выключен — значит выключен: не реагируем на события и не копим фразы. */
  petCore = null;
  petGreeted = false;
}

/* Реакция на задачу: думает, закончил, упёрся в ошибку. */
function petReact(kind) {
  if (!petEnabled()) return;
  if (!petCore && !petWin) return;      // Сью выключен человеком — не заводим его молча
  ensurePetCore();
  petCore.react(kind);
  petPush();
}

function petCall() {
  ensurePetCore();
  petCore.call();
  petPush();
}

function petPoke() {
  ensurePetCore();
  petCore.poke();
  petPush();
}

/* Левая кнопка по Сью — это «удар». Он терпит, потом злится, потом остывает. */
function petHit() {
  ensurePetCore();
  const before = petCore.snapshot().mood;
  petCore.hit(Date.now());
  const after = petCore.snapshot();
  if (before !== "angry" && after.mood === "angry") {
    try { if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:angry"); } catch (e) {}
  }
  petPush();
  return { ok: true, mood: after.mood, anger: after.anger };
}

/* Перетаскивание: окно ставится в точку курсора, но не за край рабочего стола. */
function petDragTo(x, y) {
  const area = petDesktop();
  const width = petCore ? petCore.state.width : PET_MASCOT_W;
  const left = Math.round(area.x);
  const right = Math.round(area.x + area.width - PET_W);
  const top = Math.round(area.y);
  const bottom = Math.round(area.y + area.height - PET_H);
  const winX = Math.min(Math.max(Math.round(Number(x) || 0), left), Math.max(left, right));
  const winY = Math.min(Math.max(Math.round(Number(y) || 0), top), Math.max(top, bottom));
  if (petCore) petCore.place(winX + (PET_W - width) / 2, winY);
  if (petWin && !petWin.isDestroyed()) {
    const b = petWin.getBounds();
    if (b.x !== winX || b.y !== winY) {
      try { petWin.setBounds({ x: winX, y: winY, width: PET_W, height: PET_H }); } catch (e) {}
    }
  }
  petPush();
}

function petMenu() {
  const menu = Menu.buildFromTemplate([
    { label: "Позвать", click: () => { petCall(); } },
    { label: "Сказать что-нибудь", click: () => { if (!petCore) ensurePetCore(); petCore.say("idle"); petPush(); } },
    { type: "separator" },
    {
      label: "Разговаривать",
      type: "checkbox",
      checked: settings.petTalk !== false,
      click: () => {
        saveSettings({ petTalk: settings.petTalk === false });
        if (petCore) petCore.setQuiet(settings.petTalk === false);
        broadcastState();
        petPush();
      }
    },
    {
      label: "Замечать клавиши громкости",
      type: "checkbox",
      checked: settings.petMediaKeys !== false,
      click: () => {
        saveSettings({ petMediaKeys: settings.petMediaKeys === false });
        unregisterVolumeKeys();
        if (settings.petMediaKeys !== false) registerVolumeKeys();
        broadcastState();
      }
    },
    { type: "separator" },
    { label: "Открыть " + brand.name, click: () => showWindow() },
    { label: "Выключить Сью", click: () => { saveSettings({ petOn: false }); stopPet(); broadcastState(); } }
  ]);
  menu.popup({});
}

/* ---------- Клавиши громкости ----------
   Глобальная горячая клавиша забирает нажатие себе, поэтому громкость надо
   «переслать» обратно системе. Держим для этого один тихий PowerShell:
   если он не поднялся — клавиши даже не регистрируем, иначе человек останется
   без звука. Лучше не реагировать, чем сломать громкость. */
let volumeBridge = null;

function startVolumeBridge() {
  if (process.platform !== "win32") return null;
  if (volumeBridge) return volumeBridge;
  try {
    const script =
      "$w = New-Object -ComObject WScript.Shell; " +
      "while ($true) { $l = [Console]::In.ReadLine(); if ($l -eq $null) { break } " +
      "if ($l -eq 'up') { $w.SendKeys([char]175) } elseif ($l -eq 'down') { $w.SendKeys([char]174) } " +
      "elseif ($l -eq 'mute') { $w.SendKeys([char]173) } elseif ($l -eq 'quit') { break } }";
    volumeBridge = spawn("powershell.exe", ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"]
    });
    volumeBridge.on("error", () => { volumeBridge = null; });
    volumeBridge.on("exit", () => { volumeBridge = null; });
    if (volumeBridge.stdin) volumeBridge.stdin.on("error", () => {});
  } catch (e) {
    volumeBridge = null;
  }
  return volumeBridge;
}

function volumePassthrough(kind) {
  try {
    if (!volumeBridge || !volumeBridge.stdin || !volumeBridge.stdin.writable) return false;
    volumeBridge.stdin.write(kind + "\n");
    return true;
  } catch (e) {
    return false;
  }
}

function registerVolumeKeys() {
  if (settings.petMediaKeys === false) return false;
  if (process.platform !== "win32") return false;
  if (!startVolumeBridge()) return false;
  const pairs = [["VolumeUp", "up"], ["VolumeDown", "down"], ["VolumeMute", "mute"]];
  let ok = true;
  for (const [accel, kind] of pairs) {
    try {
      const done = globalShortcut.register(accel, () => {
        petReact("volume");
        if (!volumePassthrough(kind)) {
          try { globalShortcut.unregister(accel); } catch (e) {}
        }
      });
      if (!done) ok = false;
    } catch (e) {
      ok = false;
    }
  }
  return ok;
}

function unregisterVolumeKeys() {
  for (const accel of ["VolumeUp", "VolumeDown", "VolumeMute"]) {
    try { globalShortcut.unregister(accel); } catch (e) {}
  }
}

/* Экран поменялся, компьютер уснул или заблокировался — он это замечает. */
function wirePetSystemEvents() {
  try {
    screen.on("display-metrics-changed", () => { petReact("screen"); petClamp(); });
    screen.on("display-added", () => { petReact("screen"); petClamp(); });
    screen.on("display-removed", () => { petReact("screen"); petClamp(); });
  } catch (e) { /* на этой системе событий экрана нет */ }
  try {
    const pm = require("electron").powerMonitor;
    pm.on("lock-screen", () => petReact("sleep"));
    pm.on("unlock-screen", () => petReact("wake"));
    pm.on("suspend", () => petReact("sleep"));
    pm.on("resume", () => petReact("wake"));
  } catch (e) { /* powerMonitor есть не везде */ }
}

/* Сью не должен попадать на скриншоты, которые агент делает для модели. */
async function petHidden(fn) {
  const wasVisible = !!(petWin && !petWin.isDestroyed() && petWin.isVisible());
  if (wasVisible) { try { petWin.hide(); } catch (e) {} await new Promise((r) => setTimeout(r, 140)); }
  try {
    return await fn();
  } finally {
    if (wasVisible && petWin && !petWin.isDestroyed()) { try { petWin.showInactive(); } catch (e) {} }
  }
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
    {
      label: "Сью на рабочем столе",
      type: "checkbox",
      checked: settings.petOn !== false,
      click: (item) => {
        saveSettings({ petOn: !!item.checked });
        if (settings.petOn) startPet(); else stopPet();
        broadcastState();
      }
    },
    { label: "Позвать Сью", click: () => { if (!petEnabled()) { saveSettings({ petOn: true }); startPet(); } petCall(); } },
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
  petReact("start");

  const model = async ({ messages, liteMessages, signal, maxTokens, onDelta }) => {
    return askModel({ messages, liteMessages, settings, signal, maxTokens, onDelta, onTry: (i, total) => send({ type: "engine", n: i, total }) });
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
    petReact(result && result.ok ? "done" : "error");
    if (win && !win.isDestroyed()) win.webContents.send("task:done", { taskId, result: { ok: result.ok, final: result.final, steps: result.steps, exhausted: !!result.exhausted, stopped: !!result.stopped } });
    if (win && !win.isDestroyed()) win.webContents.send("history:changed", historyList());
    return { ok: true, taskId };
  } catch (e) {
    send({ type: "error", text: e.message || String(e) });
    petReact("error");
    if (win && !win.isDestroyed()) win.webContents.send("task:done", { taskId, result: { ok: false, final: e.message || "Ошибка" } });
    return { ok: false, error: e.message };
  } finally {
    running = null;
    pendingShot = null;
  }
}

/* ---------- IPC ---------- */
function wireIpc() {
  /* ---------- Справка и общая база ---------- */
  const kbInfo = () => ({
    local: knowledge.ALL.length,
    topics: shared.list().length,
    updatedAt: shared.age() === Infinity ? 0 : Date.now() - shared.age(),
    error: shared.error()
  });

  ipcMain.handle("kb:info", () => kbInfo());
  ipcMain.handle("kb:refresh", async () => {
    await shared.refresh({ force: true });
    await shared.saveCache(USER_DIR);
    return kbInfo();
  });

  ipcMain.handle("state:get", () => ({
    license: licenseView(),
    account: account.view(),
    settings,
    brand,
    device: DEVICE_NAME,
    version: app.getVersion(),
    kb: kbInfo(),
    history: historyList()
  }));

  /* ---------- Аккаунт Искры ---------- */
  ipcMain.handle("account:send-code", async (event, payload) => {
    return account.sendCode(payload && payload.email);
  });

  ipcMain.handle("account:verify-code", async (event, payload) => {
    const res = await account.verifyCode(payload && payload.email, payload && payload.code);
    broadcastState();
    return res;
  });

  ipcMain.handle("account:signin", async (event, payload) => {
    const res = await account.signIn(payload && payload.email, payload && payload.password);
    broadcastState();
    return res;
  });

  ipcMain.handle("account:link", async (event, payload) => {
    const res = account.linkClient(payload && payload.client);
    if (!res.ok) return res;
    const synced = await syncAccount(false);
    return Object.assign({}, res, { sync: synced, account: account.view() });
  });

  ipcMain.handle("account:check", async () => {
    const res = await syncAccount(true);
    return Object.assign({}, res, { account: account.view() });
  });

  ipcMain.handle("account:connect", async (event, payload) => {
    const res = await account.connect(payload || {});
    if (res.ok) {
      await syncAccount(false);
    }
    broadcastState();
    return Object.assign({}, res, { account: account.view(), license: licenseView() });
  });

  ipcMain.handle("account:logout", () => {
    account.logout();
    license.deactivate();
    broadcastState();
    return { ok: true, account: account.view(), license: licenseView() };
  });

  ipcMain.handle("license:activate", async (event, payload) => {
    const res = await license.activate(payload && payload.key, payload && payload.client);
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    return res;
  });

  ipcMain.handle("license:sync", async () => {
    if (account.state().client) {
      const res = await syncAccount(true);
      const st = license.status();
      return { state: st.state, label: st.label, msg: res.msg, account: account.view() };
    }
    const st = await license.sync(true);
    broadcastState();
    return { state: st.state, label: st.label };
  });

  ipcMain.handle("license:deactivate", () => {
    license.deactivate();
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings, brand });
    return licenseView();
  });

  ipcMain.handle("settings:save", (event, patch) => {
    const next = saveSettings(patch || {});
    const p = patch || {};
    if ("petOn" in p) { if (next.petOn) startPet(); else stopPet(); }
    if ("petTalk" in p && petCore) { petCore.setQuiet(next.petTalk === false); petPush(); }
    if ("petMediaKeys" in p) {
      unregisterVolumeKeys();
      if (next.petMediaKeys !== false && next.petOn !== false) registerVolumeKeys();
    }
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", { license: licenseView(), settings: next, brand });
    return next;
  });

  /* ---------- Сью на рабочем столе ---------- */
  ipcMain.handle("pet:state", () => {
    ensurePetCore();
    return petCore.snapshot();
  });
  ipcMain.handle("pet:drag-start", () => {
    const cursor = screen.getCursorScreenPoint();
    const b = petWin && !petWin.isDestroyed() ? petWin.getBounds() : { x: 0, y: 0 };
    petDrag = { dx: cursor.x - b.x, dy: cursor.y - b.y };
    return { ok: true };
  });
  ipcMain.handle("pet:drag-move", () => {
    if (!petDrag || !petWin || petWin.isDestroyed()) return { ok: false };
    const cursor = screen.getCursorScreenPoint();
    const x = Math.round(cursor.x - petDrag.dx);
    const y = Math.round(cursor.y - petDrag.dy);
    petDragTo(x, y);
    return { ok: true, x, y };
  });
  ipcMain.handle("pet:drag-end", () => {
    petDrag = null;
    if (petWin && !petWin.isDestroyed()) {
      const b = petWin.getBounds();
      saveSettings({ petX: b.x, petY: b.y, petPlaced: true });
    }
    return { ok: true };
  });
  /* Крестик на самом Сью: выключить его совсем, не заходя в настройки. */
  ipcMain.handle("pet:off", () => {
    saveSettings({ petOn: false });
    stopPet();
    broadcastState();
    return { ok: true };
  });
  ipcMain.handle("pet:poke", () => { petPoke(); return { ok: true }; });
  ipcMain.handle("pet:hit", () => petHit());
  ipcMain.handle("pet:call", () => { petCall(); return { ok: true }; });
  ipcMain.handle("pet:menu", () => { petMenu(); return { ok: true }; });
  ipcMain.handle("pet:hover", (event, inside) => {
    if (!petWin || petWin.isDestroyed()) return { ok: false };
    try { petWin.setIgnoreMouseEvents(!inside, { forward: true }); } catch (e) {}
    return { ok: true, inside: !!inside };
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
        /* Второе окно — Сью на рабочем столе. Оно прозрачное и поверх всех,
           поэтому ошибка в нём не видна глазами; проверяем загрузку здесь. */
        const petWindow = createPetWindow();
        petWindow.webContents.once("did-finish-load", () => {
          console.log("[smoke] окно Сью загружено");
          setTimeout(() => {
            console.log("[smoke] ok");
            app.isQuitting = true;
            app.quit();
          }, 800);
        });
        petWindow.webContents.once("did-fail-load", (event, code, desc) => {
          console.error("[smoke] окно Сью не загрузилось:", code, desc);
          app.isQuitting = true;
          app.exit(1);
        });
      });
      win.webContents.once("did-fail-load", (event, code, desc) => {
        console.error("[smoke] окно не загрузилось:", code, desc);
        app.isQuitting = true;
        app.exit(1);
      });
      return;
    }

    createTray();
    startPet();
    registerVolumeKeys();
    wirePetSystemEvents();

    try {
      globalShortcut.register("CommandOrControl+Alt+S", () => takeShot(true));
      globalShortcut.register("CommandOrControl+Alt+Space", () => showWindow());
    } catch (e) { /* другие приложения могли занять эти клавиши */ }

    // общая база Искры: сначала копия с диска, потом тихое обновление с сайта
    shared.boot(USER_DIR).catch(() => {});

    license.sync(false).then(() => {
      broadcastState();
    });

    // если человек уже привязал аккаунт Искры — тихо проверяем подписку
    if (account.state().client) {
      setTimeout(() => { syncAccount(false).catch(() => {}); }, 1500);
    }

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
  });

  app.on("window-all-closed", () => {
    // агент живёт в трее, поэтому окно не закрывает приложение
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (petTimer) clearInterval(petTimer);
    petTimer = null;
    try { if (volumeBridge && volumeBridge.stdin) volumeBridge.stdin.end("quit\n"); } catch (e) {}
  });
}

module.exports = { deviceId };

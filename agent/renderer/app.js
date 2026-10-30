/* Sye — интерфейс агента. */

"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  license: null,
  account: null,
  settings: null,
  brand: { name: "Sye", version: "0.3.0" },
  history: [],
  shot: null,
  running: false
};

const TOOL_LABEL = {
  "fs.list": "Смотрю папку",
  "fs.read": "Читаю файл",
  "fs.write": "Записываю файл",
  "fs.append": "Дописываю файл",
  "fs.replace": "Правлю код",
  "fs.search": "Ищу по проекту",
  "fs.mkdir": "Создаю папку",
  "fs.delete": "Удаляю",
  "shell.run": "Запускаю команду",
  "web.fetch": "Читаю страницу",
  "screen.look": "Смотрю на экран",
  "task.done": "Завершаю"
};

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

function toast(text, type) {
  const el = $("#toast");
  el.textContent = text;
  el.className = "toast show" + (type === "err" ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = "toast"; }, 3200);
}

/* ---------- Состояние ---------- */
function renderLicense(lic) {
  state.license = lic;
  const active = lic.state === "active";
  const expired = lic.state === "expired";
  const pill = $("#licPill");
  const text = $("#licText");
  pill.className = "pill" + (active ? "" : expired ? " warn" : " bad");
  text.textContent = active
    ? (lic.forever ? "Pro · навсегда" : "Pro · " + (lic.daysLeft || 1) + " дн.")
    : expired ? "Ограниченный режим" : "Нужна подписка";

  const side = $("#sideLicense");
  side.className = "lic" + (active ? "" : expired ? " warn" : " bad");
  side.querySelector(".lic-text").textContent = active
    ? (lic.forever ? "Pro активна · навсегда" : "Pro активна · осталось " + (lic.daysLeft || 1) + " дн.")
    : expired ? "Pro закончилась · ограниченный режим" : "Подписка не активирована";

  $("#licState").textContent = active ? "Активна" : expired ? "Закончилась" : "Нет";
  $("#licTerm").textContent = lic.forever
    ? "Навсегда"
    : lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString("ru-RU") : "—";
  $("#licDevice").textContent = lic.device || "—";
  $("#licNote").textContent = lic.note || "";

  // Замок на подписку:
  //   нет ключа / чужое устройство — окно активации, закрыть нельзя;
  //   подписка кончилась — предупреждение один раз за запуск, можно закрыть и работать в ограниченном режиме.
  const gate = $("#gate");
  if (lic.state === "none" || lic.state === "wrong-device") {
    gate.hidden = false;
    $("#gateTitle").textContent = lic.state === "wrong-device" ? "Ключ уже занят другим компьютером" : "Нужна подписка Pro";
    const acc = state.account;
    if (lic.state === "none" && acc && acc.client) {
      $("#gateText").textContent = "Аккаунт привязан, но активной подписки на этом коде клиента нет. Купи Pro на сайте Искры — и Sye сразу заработает.";
    } else {
      $("#gateText").textContent = lic.note || "Sye — агент для подписчиков Искры Pro.";
    }
    $("#gateLater").hidden = true;
  } else if (expired) {
    $("#gateTitle").textContent = "Подписка закончилась";
    $("#gateText").textContent = "Sye продолжит работать в ограниченном режиме: без терминала, без записи файлов и без разбора скриншотов. Продли Pro, чтобы вернуть полную силу.";
    $("#gateLater").hidden = false;
    if (gate.dataset.seen !== "1") {
      gate.hidden = false;
      gate.dataset.seen = "1";
    }
  } else {
    gate.hidden = true;
    delete gate.dataset.seen;
  }
  $("#note").textContent = active
    ? "Enter — запустить, Shift+Enter — новая строка. Ctrl+Alt+S — снимок экрана."
    : "Ограниченный режим: без терминала, записи файлов и скриншотов.";
}

function renderAccount(acc) {
  state.account = acc || null;
  const linked = !!(acc && acc.linked);
  const who = linked ? (acc.name ? acc.name + " · " + acc.email : acc.email) : "не привязан";
  $("#accWho").textContent = who;
  $("#accWho").title = (acc && acc.email) || "";
  $("#accClientView").textContent = (acc && acc.client) || "—";
  $("#accChecked").textContent = acc && acc.lastCheck
    ? new Date(acc.lastCheck).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
  if (acc && acc.client && !$("#accClient").value) $("#accClient").value = acc.client;
}

/** Переключатель «Аккаунт Искры» / «Ключ Pro» в окне активации. */
function setGateTab(which) {
  const account = which !== "key";
  $("#tabAccount").classList.toggle("on", account);
  $("#tabKey").classList.toggle("on", !account);
  $("#paneAccount").hidden = !account;
  $("#paneKey").hidden = account;
  const err = account ? $("#accErr") : $("#gateErr");
  if (err) err.textContent = "";
}

function gateNote(text, isErr) {
  const el = $("#accErr");
  el.textContent = text || "";
  el.style.color = isErr ? "var(--err)" : "var(--text-soft)";
}

function renderWorkspace(path) {
  $("#wsPath").textContent = path || "папка не выбрана";
  $("#wsChip").title = path || "";
  $("#wsFull").textContent = path || "—";
}

function renderHistory(list) {
  state.history = list || [];
  const box = $("#history");
  box.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.padding = "6px 8px";
    empty.textContent = "Пока пусто. Первая задача появится здесь.";
    box.appendChild(empty);
    return;
  }
  for (const item of state.history) {
    const b = document.createElement("button");
    b.className = "hist";
    const when = new Date(item.at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    b.innerHTML = `<span>${esc((item.task || "").slice(0, 90))}</span>` +
      `<small>${when} · ${item.steps || 0} шаг(ов)${item.ok === false ? ' · <span class="bad">с ошибкой</span>' : ""}</small>`;
    b.addEventListener("click", () => {
      if (state.running) return;
      appendUser(item.task || "", null);
      appendFinal(item.final || "(нет итога)", item.ok !== false);
    });
    box.appendChild(b);
  }
}

function renderSettings() {
  const s = state.settings || {};
  $$('input[name="access"]').forEach((r) => { r.checked = r.value === (s.access || "folder"); });
  $("#apiKey").value = s.apiKey || "";
  $("#apiBase").value = s.apiBase || "";
  $("#apiModel").value = s.apiModel || "";
}

/* ---------- Лента ---------- */
function feedEl() { return $("#feed"); }

function scrollFeed() {
  const f = feedEl();
  requestAnimationFrame(() => { f.scrollTop = f.scrollHeight; });
}

function hideHello() {
  const hello = $("#hello");
  if (hello) hello.remove();
}

function appendUser(text, shot) {
  hideHello();
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `<div class="bubble">${esc(text)}</div>` +
    (shot ? `<img class="shot-preview" src="${shot}" alt="скриншот" />` : "");
  feedEl().appendChild(el);
  scrollFeed();
  return el;
}

function appendRun() {
  const el = document.createElement("div");
  el.className = "msg run";
  el.innerHTML = `
    <div class="thinking"><span class="dots"><i></i><i></i><i></i></span><span class="t-label">Думаю…</span></div>
    <div class="stream" hidden></div>
    <div class="steps"></div>`;
  feedEl().appendChild(el);
  scrollFeed();
  return el;
}

function runNodes(run) {
  return {
    thinking: run.querySelector(".thinking"),
    label: run.querySelector(".t-label"),
    stream: run.querySelector(".stream"),
    steps: run.querySelector(".steps")
  };
}

function setThinking(run, text) {
  const n = runNodes(run);
  if (!n.thinking) return;
  if (text === null) { n.thinking.hidden = true; return; }
  n.thinking.hidden = false;
  n.label.textContent = text;
}

function appendStep(run, action) {
  const n = runNodes(run);
  n.stream.hidden = true;
  n.stream.textContent = "";
  const card = document.createElement("div");
  card.className = "step";
  const label = TOOL_LABEL[action.tool] || action.tool;
  const argText = action.args && (action.args.path || action.args.command || action.args.url || action.args.query)
    ? String(action.args.path || action.args.command || action.args.url || action.args.query).slice(0, 120)
    : "";
  card.innerHTML = `
    <div class="step-head">
      <span class="step-tool">${esc(action.tool)}</span>
      <span class="step-why">${esc(label)}${argText ? " · " + esc(argText) : ""}</span>
      <span class="step-status">…</span>
    </div>
    <div class="step-out"></div>`;
  n.steps.appendChild(card);
  scrollFeed();
  return card;
}

function applyObservation(run, obs) {
  const n = runNodes(run);
  const cards = n.steps.querySelectorAll(".step");
  const card = cards[cards.length - 1];
  if (!card) return;
  const status = card.querySelector(".step-status");
  status.textContent = obs.ok ? "готово" : "не вышло";
  status.className = "step-status " + (obs.ok ? "ok" : "bad");
  const out = card.querySelector(".step-out");
  if (obs.output) {
    const details = document.createElement("details");
    details.innerHTML = `<summary>${esc(obs.summary || "результат")}</summary><pre>${esc(obs.output)}</pre>`;
    out.appendChild(details);
  } else if (obs.summary) {
    out.innerHTML = `<div class="step-why">${esc(obs.summary)}</div>`;
  }
  scrollFeed();
}

function appendFinal(text, ok) {
  hideHello();
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `
    <div class="final" ${ok === false ? 'style="border-color:rgba(207,93,78,.45)"' : ""}>
      <h4>${ok === false ? "Не получилось" : "Итог"}</h4>
      <div class="text">${esc(text || "")}</div>
      <div class="tools"><button class="ghost small" data-copy>Копировать</button></div>
    </div>`;
  el.querySelector("[data-copy]").addEventListener("click", () => {
    window.sye.copy(text || "");
    toast("Скопировал", "ok");
  });
  feedEl().appendChild(el);
  scrollFeed();
}

function appendError(text) {
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<div class="err-line">${esc(text)}</div>`;
  feedEl().appendChild(el);
  scrollFeed();
}

/* ---------- Запуск задачи ---------- */
let currentRun = null;

function setBusy(on) {
  state.running = on;
  $("#sendBtn").hidden = on;
  $("#stopBtn").hidden = !on;
  $("#input").disabled = false;
  $("#attachShot").disabled = on;
  if (on) $("#input").placeholder = "Sye работает…";
  else $("#input").placeholder = "Что сделать? Например: найди, почему падает сборка, и почини";
}

async function send() {
  const input = $("#input");
  const text = input.value.trim();
  if (!text) return;
  if (!state.license || state.license.state === "none" || state.license.state === "wrong-device") {
    $("#gate").hidden = false;
    return;
  }
  if (state.running) return;

  const shot = state.shot;
  appendUser(text, shot);
  input.value = "";
  input.style.height = "auto";
  if (shot) { state.shot = null; $("#shotChip").hidden = true; $("#shotImg").src = ""; }

  currentRun = appendRun();
  setBusy(true);

  if (state.license.state === "expired") {
    appendError("Ограниченный режим: подписка Pro закончилась. Терминал, запись файлов и скриншоты недоступны — но файлы я прочитаю и подскажу, что делать.");
  }

  const res = await window.sye.startTask(text, shot);
  if (!res || !res.ok) {
    setBusy(false);
    appendError((res && res.error) || "Не удалось запустить задачу");
  }
}

/* ---------- События от ядра ---------- */
function wireEvents() {
  window.sye.onEvent((e) => {
    const run = currentRun;
    if (!run) return;
    switch (e.type) {
      case "engine":
        if (e.n > 1) setThinking(run, "Подбираю, кто ответит… (" + e.n + " из " + e.total + ")");
        break;
      case "thinking":
        setThinking(run, e.step ? "Думаю… шаг " + e.step + " из " + (e.maxSteps || "?") : "Думаю…");
        break;
      case "token": {
        const n = runNodes(run);
        n.stream.hidden = false;
        n.stream.textContent = String(e.text || "").slice(-400);
        scrollFeed();
        break;
      }
      case "action":
        setThinking(run, "Работаю…");
        appendStep(run, e.action);
        break;
      case "observation":
        applyObservation(run, e);
        break;
      case "final":
        setThinking(run, null);
        appendFinal(e.text, true);
        break;
      case "verify":
        setThinking(run, "Проверяю результат…");
        break;
      case "misformat":
        setThinking(run, "Уточняю формат…");
        if (e.error) {
          const el = document.createElement("div");
          el.className = "step-why";
          el.textContent = "Поправил формат: " + e.error;
          runNodes(run).steps.appendChild(el);
        }
        break;
      case "error":
        setThinking(run, null);
        appendError("Ошибка: " + (e.text || "движки не ответили"));
        break;
      case "stopped":
        setThinking(run, null);
        appendError("Остановлено.");
        break;
      default:
        break;
    }
  });

  window.sye.onDone(({ result }) => {
    setBusy(false);
    if (result && result.exhausted) toast("Шаги закончились — вот что успел", "err");
    currentRun = null;
    $("#input").focus();
  });

  window.sye.onState((payload) => {
    if (payload.license) renderLicense(payload.license);
    if (payload.account) renderAccount(payload.account);
    if (payload.settings) { state.settings = payload.settings; renderWorkspace(payload.settings.workspace); renderSettings(); }
    if (payload.brand) state.brand = payload.brand;
  });

  window.sye.onHistory((list) => renderHistory(list));

  window.sye.onShot(({ dataUrl, at }) => {
    state.shot = dataUrl;
    $("#shotImg").src = dataUrl;
    $("#shotTime").textContent = new Date(at).toLocaleTimeString("ru-RU");
    $("#shotChip").hidden = false;
    $("#input").placeholder = "Что сделать со скриншотом?";
    $("#input").focus();
  });

  window.sye.onToast(({ text, type }) => toast(text, type));
  window.sye.onOpenSettings(() => openDrawer(true));
}

/* ---------- Настройки и доступ ---------- */
function openDrawer(open) {
  $("#drawer").hidden = !open;
  if (open) renderSettings();
}

function wireUi() {
  $("#newTask").addEventListener("click", () => {
    if (state.running) return;
    feedEl().innerHTML = `
      <div class="hello" id="hello">
        <div class="hello-mark"><span class="spark big"></span></div>
        <h1>Новая задача</h1>
        <p>Опиши, что сделать. Я прочитаю файлы, поправлю код, запущу проверку и покажу результат.</p>
      </div>`;
    $("#input").value = "";
    $("#input").focus();
    wirePresets();
  });

  $("#clearHistory").addEventListener("click", async () => {
    await window.sye.clearHistory();
    renderHistory([]);
    toast("История очищена");
  });

  const input = $("#input");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $("#sendBtn").addEventListener("click", send);
  $("#stopBtn").addEventListener("click", () => window.sye.stopTask());

  $("#shotBtn").addEventListener("click", takeShot);
  $("#attachShot").addEventListener("click", takeShot);
  $("#shotRemove").addEventListener("click", () => {
    state.shot = null;
    $("#shotChip").hidden = true;
    $("#shotImg").src = "";
  });

  $("#wsChip").addEventListener("click", async () => {
    const res = await window.sye.pickWorkspace();
    if (res && res.ok) { renderWorkspace(res.workspace); toast("Рабочая папка: " + res.workspace); }
  });
  $("#pickWs").addEventListener("click", async () => {
    const res = await window.sye.pickWorkspace();
    if (res && res.ok) renderWorkspace(res.workspace);
  });

  $("#openSettingsBtn").addEventListener("click", () => openDrawer(true));
  $("#drawerClose").addEventListener("click", () => openDrawer(false));
  $("#drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") openDrawer(false); });

  $$('input[name="access"]').forEach((r) => {
    r.addEventListener("change", async () => {
      if (!r.checked) return;
      state.settings = await window.sye.saveSettings({ access: r.value });
      toast("Уровень доступа: " + r.closest(".radio").querySelector("b").textContent);
    });
  });

  $("#saveApi").addEventListener("click", async () => {
    state.settings = await window.sye.saveSettings({
      apiKey: $("#apiKey").value.trim(),
      apiBase: $("#apiBase").value.trim(),
      apiModel: $("#apiModel").value.trim()
    });
    toast("Ключ сохранён");
  });

  $("#syncBtn").addEventListener("click", async () => {
    const res = await window.sye.syncLicense();
    toast("Подписка: " + ((res && res.label) || "проверено"));
  });
  $("#buyBtn").addEventListener("click", () => window.sye.openExternal("https://logismod01.github.io/iskra/"));
  $("#quitBtn").addEventListener("click", () => window.sye.quit());

  // Доступ: аккаунт Искры
  $("#tabAccount").addEventListener("click", () => setGateTab("account"));
  $("#tabKey").addEventListener("click", () => setGateTab("key"));
  $("#accConnect").addEventListener("click", () => connectAccount(false));
  $("#accVerify").addEventListener("click", () => connectAccount(true));
  $("#accSendCode").addEventListener("click", sendLoginCode);
  $("#accOpenSite").addEventListener("click", () => window.sye.openExternal("https://logismod01.github.io/iskra/"));
  $("#accPass").addEventListener("keydown", (e) => { if (e.key === "Enter") connectAccount(false); });
  $("#accCode").addEventListener("keydown", (e) => { if (e.key === "Enter") connectAccount(true); });
  $("#accCheckBtn").addEventListener("click", async () => {
    const res = await window.sye.accountCheck();
    if (res && res.account) renderAccount(res.account);
    if (res && res.license) renderLicense(res.license);
    toast((res && res.msg) || "Проверил подписку", res && res.ok ? "ok" : "err");
  });
  $("#accLogoutBtn").addEventListener("click", async () => {
    const res = await window.sye.accountLogout();
    if (res && res.account) renderAccount(res.account);
    if (res && res.license) renderLicense(res.license);
    toast("Вышел из аккаунта");
  });

  // Доступ: ключ Pro
  $("#gateActivate").addEventListener("click", activate);
  $("#gateKey").addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
  $("#gateClient").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#gateKey").focus(); });
  $("#gateGetKey").addEventListener("click", () => window.sye.openExternal("https://logismod01.github.io/iskra/"));
  $("#gateLater").addEventListener("click", () => { $("#gate").hidden = true; });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { openDrawer(false); }
    if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); takeShot(); }
  });
}

async function takeShot() {
  const res = await window.sye.screenshot();
  if (!res || !res.ok) toast("Снимок не получился: " + ((res && res.error) || "нет доступа к экрану"), "err");
}

/** Вход в аккаунт Искры: пароль или код из письма + код клиента. */
async function connectAccount(useCode) {
  const email = $("#accEmail").value.trim();
  const password = $("#accPass").value;
  const client = $("#accClient").value.trim();
  const code = $("#accCode").value.trim();

  if (!email) { gateNote("Укажи почту аккаунта Искры.", true); return; }
  if (!client) { gateNote("Нужен код клиента из Искры: ⚙ → «Доступ».", true); return; }
  if (useCode && !code) { gateNote("Вставь код из письма.", true); return; }
  if (!useCode && !password) { gateNote("Введи пароль или войди по коду из письма.", true); return; }

  const btn = useCode ? $("#accVerify") : $("#accConnect");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Проверяю…";
  gateNote("");
  let res = null;
  try {
    res = await window.sye.accountConnect({ email, password, client, code: useCode ? code : "" });
  } catch (e) {
    res = { ok: false, msg: "Не получилось связаться с сервером Искры." };
  }
  btn.disabled = false;
  btn.textContent = label;

  const warnings = (res && res.warnings) || [];
  const good = !!(res && res.ok && res.access && res.access.active);
  const text = [(res && res.msg) || "", ...warnings].filter(Boolean).join(" ");
  gateNote(text || (good ? "Готово." : "Не получилось привязать аккаунт."), !good);

  if (res && res.account) renderAccount(res.account);
  if (res && res.license) renderLicense(res.license);
  if (good) {
    toast(res.msg || "Подписка привязана", "ok");
    $("#gate").hidden = true;
  }
}

async function sendLoginCode() {
  const email = $("#accEmail").value.trim();
  if (!email) { gateNote("Сначала укажи почту аккаунта.", true); return; }
  gateNote("Отправляю код…");
  const res = await window.sye.accountSendCode(email);
  if (res && res.ok) {
    $("#accCodeRow").hidden = false;
    $("#accCode").focus();
    gateNote(res.msg);
  } else {
    gateNote((res && res.msg) || "Не получилось отправить код", true);
  }
}

async function activate() {
  const client = $("#gateClient").value.trim();
  const key = $("#gateKey").value.trim();
  const err = $("#gateErr");
  err.textContent = "";
  if (!client || !key) { err.textContent = "Нужны и код клиента, и ключ Pro."; return; }
  const btn = $("#gateActivate");
  btn.disabled = true;
  btn.textContent = "Проверяю ключ…";
  const res = await window.sye.activate(key, client);
  btn.disabled = false;
  btn.textContent = "Активировать";
  if (!res || !res.ok) { err.textContent = (res && res.msg) || "Не получилось"; return; }
  toast(res.msg || "Ключ активирован", "ok");
  $("#gateKey").value = "";
  const fresh = await window.sye.state();
  renderLicense(fresh.license);
  if (fresh.license.state === "active") $("#gate").hidden = true;
}

function wirePresets() {
  $$("#presets button").forEach((b) => {
    b.addEventListener("click", () => {
      $("#input").value = b.dataset.preset || "";
      $("#input").focus();
      $("#input").dispatchEvent(new Event("input"));
    });
  });
}

/* ---------- Старт ---------- */
(async function boot() {
  wireUi();
  wireEvents();
  const s = await window.sye.state();
  state.settings = s.settings;
  state.brand = s.brand;
  $("#brandName").textContent = s.brand.name;
  document.title = s.brand.name + " — агент на рабочем столе";
  $("#version").textContent = "v" + s.version;
  renderWorkspace(s.settings.workspace);
  renderAccount(s.account);
  renderLicense(s.license);
  renderHistory(s.history);
  renderSettings();
  wirePresets();
  if (s.license.state === "none" || s.license.state === "wrong-device") {
    $("#gate").hidden = false;
    $("#gateClient").focus();
  }
  $("#input").focus();
})();

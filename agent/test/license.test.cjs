const test = require("node:test");
const assert = require("node:assert/strict");
const keys = require("../core/keys.js");
const { createLicense, LIMITS } = require("../core/license.js");

const CLIENT = "482913-KX7T2P-qwerty";
const DEVICE = "device-abc";

function issueKey(client, hours, issuedAtMs) {
  const c = keys.canonClient(client);
  const bind = keys.sha256(c).slice(0, 6).toUpperCase();
  const h = Math.floor(hours).toString(36).toUpperCase().padStart(2, "0");
  const t = Math.floor(issuedAtMs / 60000).toString(36).toUpperCase().padStart(6, "0");
  const payload = bind + "-" + h + "-" + t;
  const sig = keys.hmac("L|" + c + "|" + payload).slice(0, 8).toUpperCase();
  return "ISKRA-L-" + payload + "-" + sig;
}

function makeLicense(initial, opts) {
  const store = { data: initial || {} };
  const clock = { t: (opts && opts.now) || Date.now() };
  const lic = createLicense({
    read: () => store.data,
    write: (v) => { store.data = v; },
    deviceId: (opts && opts.device) || DEVICE,
    deviceName: "Тестовый ПК",
    now: () => clock.t
  });
  return { lic, store, clock };
}

test("без ключа — подписки нет, шагов ноль", () => {
  const { lic } = makeLicense({});
  const st = lic.status();
  assert.equal(st.state, "none");
  assert.equal(st.steps, 0);
  assert.equal(st.write, false);
  assert.equal(st.shell, false);
});

test("вечный Pro — активен и без даты", () => {
  const { lic } = makeLicense({ key: "ISKRA-24-AAAA-BBBB-CCCC", client: CLIENT, forever: true, deviceId: DEVICE });
  const st = lic.status();
  assert.equal(st.state, "active");
  assert.equal(st.forever, true);
  assert.equal(st.steps, 14);
  assert.equal(st.shell, true);
  assert.equal(st.write, true);
  assert.equal(st.vision, true);
});

test("живая подписка считает дни и возвращает границы", () => {
  const now = Date.now();
  const { lic } = makeLicense({ key: "k", client: CLIENT, expiresAt: now + 3 * 864e5, deviceId: DEVICE }, { now });
  const st = lic.status();
  assert.equal(st.state, "active");
  assert.equal(st.daysLeft, 3);
  assert.equal(st.maxTokens, 1800);
});

test("закончившаяся подписка — ограниченный режим, а не отказ", () => {
  const now = Date.now();
  const { lic } = makeLicense({ key: "k", client: CLIENT, expiresAt: now - 864e5, deviceId: DEVICE }, { now });
  const st = lic.status();
  assert.equal(st.state, "expired");
  assert.equal(st.steps, 2);
  assert.equal(st.shell, false);
  assert.equal(st.write, false);
  assert.equal(st.delete, false);
  assert.equal(st.vision, false);
  assert.equal(st.web, false);
  assert.ok(st.maxTokens > 0 && st.maxTokens < LIMITS.active.maxTokens);
  assert.match(st.note, /ограниченном режиме/i);
  assert.equal(st.daysLeft, 0);
});

test("ключ на другом компьютере — чужое устройство", () => {
  const { lic } = makeLicense({ key: "k", client: CLIENT, forever: true, deviceId: "other-device" });
  const st = lic.status();
  assert.equal(st.state, "wrong-device");
  assert.equal(st.steps, 0);
  assert.match(st.note, /другом устройстве/i);
});

test("офлайн-ключ активируется и привязывается к устройству", async () => {
  const { lic, store } = makeLicense({});
  const res = await lic.activate(issueKey(CLIENT, 24, Date.now()), CLIENT);
  assert.equal(res.ok, true);
  assert.equal(store.data.deviceId, DEVICE);
  assert.equal(res.status.state, "active");
  assert.equal(res.status.daysLeft, 1);
});

test("чужой офлайн-ключ не активируется", async () => {
  const { lic, store } = makeLicense({});
  const res = await lic.activate(issueKey(CLIENT, 24, Date.now()), "482913-KX7T2P-zxcvbn");
  assert.equal(res.ok, false);
  assert.equal(store.data.key, undefined);
});

test("кривой код клиента и мусорный ключ — понятные ошибки", async () => {
  const { lic } = makeLicense({});
  const a = await lic.activate("ISKRA-24-AAAA-BBBB-CCCC", "123");
  assert.equal(a.ok, false);
  assert.match(a.msg, /код клиента/i);
  const b = await lic.activate("не-ключ", CLIENT);
  assert.equal(b.ok, false);
  assert.match(b.msg, /не похож/i);
});

test("деактивация возвращает к состоянию «нет подписки»", async () => {
  const { lic, store } = makeLicense({ key: "k", client: CLIENT, forever: true, deviceId: DEVICE });
  const st = lic.deactivate();
  assert.equal(st.state, "none");
  assert.equal(store.data.key, "");
});

test("продление продлевает: конец подписки сдвигается", () => {
  const now = Date.now();
  const { lic, store } = makeLicense({ key: "k", client: CLIENT, expiresAt: now - 1000, deviceId: DEVICE }, { now });
  assert.equal(lic.status().state, "expired");
  store.data = Object.assign({}, store.data, { expiresAt: now + 30 * 864e5 });
  assert.equal(lic.status().state, "active");
});

test("подписка через аккаунт: активна — полный режим", () => {
  const { lic, store } = makeLicense({});
  const st = lic.linkAccount({ client: CLIENT, active: true, forever: false, expiresAt: Date.now() + 10 * 864e5, plan: "month" });
  assert.equal(st.state, "active");
  assert.equal(store.data.engine, "account");
  assert.equal(store.data.key, "");
  assert.equal(st.steps, 14);
  assert.equal(lic.linkedByAccount(), CLIENT);
});

test("подписка через аккаунт: была и кончилась — ограниченный режим", () => {
  const now = Date.now();
  const { lic } = makeLicense({});
  lic.linkAccount({ client: CLIENT, active: true, forever: false, expiresAt: now + 864e5 });
  assert.equal(lic.status().state, "active");
  const st = lic.linkAccount({ client: CLIENT, active: false });
  assert.equal(st.state, "expired");
  assert.equal(st.steps, 2);
  assert.equal(st.write, false);
});

test("код клиента без единого ключа — подписки нет", () => {
  const { lic } = makeLicense({});
  const st = lic.linkAccount({ client: CLIENT, active: false });
  assert.equal(st.state, "none");
  assert.equal(lic.linkedByAccount(), "");
});

test("вечный Pro через аккаунт не истекает", () => {
  const { lic } = makeLicense({});
  const st = lic.linkAccount({ client: CLIENT, active: true, forever: true });
  assert.equal(st.state, "active");
  assert.equal(st.forever, true);
  assert.equal(lic.status().state, "active");
});

test("аккаунт на другом компьютере — тоже чужое устройство", () => {
  const data = { client: CLIENT, engine: "account", forever: true, deviceId: "other" };
  const { lic } = makeLicense(data);
  assert.equal(lic.status().state, "wrong-device");
});

test("чужой компьютер не перехватывает подписку аккаунта", () => {
  const { lic, store } = makeLicense({});
  lic.linkAccount({ client: CLIENT, active: true, forever: true });
  const firstDevice = store.data.deviceId;
  assert.equal(firstDevice, DEVICE);

  // вторая машина с тем же кодом клиента
  const other = createLicense({
    read: () => store.data,
    write: (v) => { store.data = v; },
    deviceId: "another-pc",
    now: () => Date.now()
  });
  const st = other.linkAccount({ client: CLIENT, active: true, forever: true });
  assert.equal(st.state, "wrong-device");
  assert.equal(store.data.deviceId, DEVICE, "привязка не должна переехать сама");
});

test("выход из аккаунта освобождает устройство", () => {
  const { lic, store } = makeLicense({});
  lic.linkAccount({ client: CLIENT, active: true, forever: true });
  assert.equal(store.data.deviceId, DEVICE);
  const st = lic.deactivate();
  assert.equal(st.state, "none");
  assert.equal(store.data.deviceId, "");
  // теперь подписку можно привязать на другом компьютере
  const other = createLicense({
    read: () => store.data,
    write: (v) => { store.data = v; },
    deviceId: "another-pc",
    now: () => Date.now()
  });
  const st2 = other.linkAccount({ client: CLIENT, active: true, forever: true });
  assert.equal(st2.state, "active");
  assert.equal(store.data.deviceId, "another-pc");
});

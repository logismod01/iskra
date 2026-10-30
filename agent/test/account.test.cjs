const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccount, EMAIL_RE } = require("../core/account.js");

const CLIENT = "482913-KX7T2P-qwerty";

function jsonRes(obj, status) {
  const code = status || 200;
  return { ok: code < 400, status: code, text: async () => JSON.stringify(obj) };
}

/** Подставной сервер Искры: отвечает по маршруту и запоминает запросы. */
function makeAccount(opts) {
  const o = opts || {};
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const routes = o.routes || {};
    const handler = routes[path] || routes[path.split("?")[0]];
    if (typeof handler === "function") return handler(init);
    if (handler) return jsonRes(handler);
    return jsonRes({ ok: true });
  };
  const store = { data: o.initial || {} };
  const clock = { t: (o.now && o.now()) || Date.now() };
  const acc = createAccount({
    read: () => store.data,
    write: (v) => { store.data = v; },
    fetch: fakeFetch,
    fetchAccess: o.fetchAccess || (async () => ({ ok: true, active: true, forever: false, expiresAt: Date.now() + 30 * 864e5, plan: "month" })),
    now: () => clock.t
  });
  return { acc, store, calls, clock };
}

const USER = { user: { id: "u-1", email: "ivan@mail.ru", user_metadata: { full_name: "Иван" } } };
const SESSION = Object.assign({ access_token: "at-1", refresh_token: "rt-1" }, USER);

test("почта проверяется до запроса", async () => {
  assert.equal(EMAIL_RE.test("ivan@mail.ru"), true);
  assert.equal(EMAIL_RE.test("ivan@"), false);
  const { acc, calls } = makeAccount({});
  const a = await acc.sendCode("не почта");
  assert.equal(a.ok, false);
  const b = await acc.sendCode("");
  assert.equal(b.ok, false);
  assert.equal(calls.length, 0, "без почты на сервер не ходим");
});

test("код входа отправляется и человек получает понятный ответ", async () => {
  const { acc, calls } = makeAccount({ routes: { "/auth/v1/otp": {} } });
  const res = await acc.sendCode(" Ivan@Mail.ru ");
  assert.equal(res.ok, true);
  assert.match(res.msg, /Код отправлен/);
  assert.equal(calls[0].url.endsWith("/auth/v1/otp"), true);
  assert.deepEqual(calls[0].body, { email: "ivan@mail.ru", create_user: true });
});

test("вход по паролю запоминает почту и токены, но не пароль", async () => {
  const { acc, store, calls } = makeAccount({ routes: { "/auth/v1/token": SESSION } });
  const res = await acc.signIn("ivan@mail.ru", "sekret-123");
  assert.equal(res.ok, true);
  assert.equal(store.data.email, "ivan@mail.ru");
  assert.equal(store.data.name, "Иван");
  assert.equal(store.data.refreshToken, "rt-1");
  assert.equal(JSON.stringify(store.data).includes("sekret-123"), false, "пароль не храним");
  assert.match(calls[0].url, /grant_type=password/);
});

test("неверный пароль объясняется по-русски", async () => {
  const { acc } = makeAccount({
    routes: { "/auth/v1/token": () => jsonRes({ error_description: "Invalid login credentials" }, 400) }
  });
  const res = await acc.signIn("ivan@mail.ru", "плохой");
  assert.equal(res.ok, false);
  assert.match(res.msg, /Пароль не подошёл/);
});

test("вход по коду из письма", async () => {
  const { acc, store, calls } = makeAccount({ routes: { "/auth/v1/verify": SESSION } });
  const res = await acc.verifyCode("ivan@mail.ru", "123456");
  assert.equal(res.ok, true);
  assert.equal(store.data.userId, "u-1");
  assert.equal(calls[0].body.type, "email");
  assert.equal(calls[0].body.token, "123456");
});

test("просроченный код — понятная подсказка", async () => {
  const { acc } = makeAccount({
    routes: { "/auth/v1/verify": () => jsonRes({ error_code: "otp_expired", msg: "Token has expired" }, 401) }
  });
  const res = await acc.verifyCode("ivan@mail.ru", "000000");
  assert.equal(res.ok, false);
  assert.match(res.msg, /устарел|запроси новый/i);
});

test("свежий токен не обновляется лишний раз", async () => {
  const now = Date.now();
  const { acc, calls } = makeAccount({
    initial: { email: "ivan@mail.ru", accessToken: "at-1", refreshToken: "rt-1", tokenAt: now },
    routes: { "/auth/v1/user": USER.user },
    now: () => now
  });
  const res = await acc.check();
  assert.equal(res.ok, true);
  assert.equal(calls.length, 0, "без нужды не дёргаем сервер");
});

test("старый токен обновляется и проверяется", async () => {
  const now = Date.now();
  const { acc, store, calls } = makeAccount({
    initial: { email: "ivan@mail.ru", accessToken: "at-old", refreshToken: "rt-old", tokenAt: now - 2 * 3600e3 },
    routes: { "/auth/v1/token": SESSION, "/auth/v1/user": USER.user },
    now: () => now
  });
  const res = await acc.check();
  assert.equal(res.ok, true);
  assert.equal(store.data.accessToken, "at-1");
  assert.match(calls[1].url, /auth\/v1\/user/);
});

test("код клиента приводится к одному виду", () => {
  const { acc, store } = makeAccount({});
  const bad = acc.linkClient("123");
  assert.equal(bad.ok, false);
  assert.match(bad.msg, /123456-AB12CD-word/);
  const ok = acc.linkClient("482913-kx7t2p-QWERTY");
  assert.equal(ok.ok, true);
  assert.equal(store.data.client, CLIENT);
});

test("подписка берётся с сервера по коду клиента", async () => {
  let asked = "";
  const { acc, store } = makeAccount({
    initial: { email: "ivan@mail.ru", client: CLIENT },
    fetchAccess: async (client) => { asked = client; return { ok: true, active: true, forever: true, expiresAt: 0, plan: "forever", label: "навсегда" }; }
  });
  const res = await acc.access();
  assert.equal(asked, CLIENT);
  assert.equal(res.ok, true);
  assert.equal(res.active, true);
  assert.equal(res.forever, true);
  assert.equal(store.data.active, true);
});

test("сервер молчит — не врём, что подписки нет", async () => {
  const { acc } = makeAccount({
    initial: { client: CLIENT },
    fetchAccess: async () => { throw new Error("нет сети"); }
  });
  const res = await acc.access();
  assert.equal(res.ok, false);
  assert.match(res.msg, /не ответил/);
});

test("полный вход: пароль + код клиента + активная подписка", async () => {
  const { acc } = makeAccount({
    routes: { "/auth/v1/token": SESSION },
    fetchAccess: async () => ({ ok: true, active: true, forever: false, expiresAt: Date.now() + 10 * 864e5, plan: "month" })
  });
  const res = await acc.connect({ email: "ivan@mail.ru", password: "sekret-123", client: CLIENT });
  assert.equal(res.ok, true);
  assert.equal(res.signedIn, true);
  assert.equal(res.access.active, true);
  assert.match(res.msg, /активна до/);
  assert.deepEqual(res.warnings, []);
});

test("вход не удался, но подписку по коду всё равно привязываем", async () => {
  const { acc } = makeAccount({
    routes: { "/auth/v1/token": () => jsonRes({ error_description: "Invalid login credentials" }, 400) },
    fetchAccess: async () => ({ ok: true, active: true, forever: true })
  });
  const res = await acc.connect({ email: "ivan@mail.ru", password: "плохой", client: CLIENT });
  assert.equal(res.ok, true);
  assert.equal(res.signedIn, false);
  assert.match(res.warnings[0], /Пароль не подошёл/);
  assert.match(res.msg, /навсегда/);
});

test("код без подписки — честный ответ", async () => {
  const { acc } = makeAccount({
    fetchAccess: async () => ({ ok: true, active: false })
  });
  const res = await acc.connect({ email: "ivan@mail.ru", password: "x", client: CLIENT });
  assert.equal(res.ok, true);
  assert.equal(res.access.active, false);
  assert.match(res.msg, /подписки на нём нет|активной подписки/i);
});

test("без кода клиента подписку не включаем", async () => {
  const { acc } = makeAccount({ routes: { "/auth/v1/token": SESSION } });
  const res = await acc.connect({ email: "ivan@mail.ru", password: "sekret" });
  assert.equal(res.ok, false);
  assert.match(res.msg, /код клиента/i);
});

test("выход полностью забывает аккаунт", async () => {
  const { acc, store } = makeAccount({
    initial: { email: "ivan@mail.ru", client: CLIENT, accessToken: "at-1", refreshToken: "rt-1" }
  });
  const res = acc.logout();
  assert.equal(res.ok, true);
  assert.deepEqual(store.data, {});
});

/**
 * Аккаунт Искры внутри Sye.
 *
 * Зачем: на сайте Pro привязан к коду клиента, а сам аккаунт живёт в браузере.
 * Агент не может заглянуть в браузер, поэтому человек один раз входит здесь
 * тем же аккаунтом (почта + пароль или код из письма) и указывает код клиента
 * из Искры (⚙ → «Доступ»). Дальше Sye сам спрашивает сервер, живёт ли подписка,
 * и включает полный режим без вставки ключа.
 *
 * Вход проверяется тем же Supabase, что и на сайте: /auth/v1/otp,
 * /auth/v1/verify, /auth/v1/token?grant_type=password, /auth/v1/user.
 */

"use strict";

const keys = require("./keys.js");

const SESSION_MS = 50 * 60e3;        // токен Supabase живёт час — обновляем заранее
const CHECK_MS = 6 * 3600e3;        // подписку сверяем раз в 6 часов

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function createAccount(opts) {
  const read = (opts && opts.read) || (() => ({}));
  const write = (opts && opts.write) || (() => {});
  const now = (opts && opts.now) || (() => Date.now());
  const log = (opts && opts.log) || (() => {});
  const doFetch = (opts && opts.fetch) || ((...args) => fetch(...args));
  const fetchAccess = (opts && opts.fetchAccess) || ((client) => keys.fetchServerAccess(client));
  const base = String((opts && opts.base) || keys.SUPABASE.url).replace(/\/+$/, "");
  const anon = (opts && opts.anonKey) || keys.SUPABASE.anonKey;

  function state() {
    const s = read() || {};
    return {
      email: String(s.email || ""),
      name: String(s.name || ""),
      userId: String(s.userId || ""),
      client: String(s.client || ""),
      accessToken: String(s.accessToken || ""),
      refreshToken: String(s.refreshToken || ""),
      tokenAt: Number(s.tokenAt || 0),
      lastCheck: Number(s.lastCheck || 0),
      plan: String(s.plan || ""),
      forever: s.forever === true,
      expiresAt: Number(s.expiresAt || 0),
      active: s.active === true
    };
  }

  function save(patch) {
    const next = Object.assign(state(), patch);
    write(next);
    return next;
  }

  async function request(path, body, token, method) {
    const headers = { "Content-Type": "application/json", apikey: anon };
    headers.Authorization = "Bearer " + (token || anon);
    let res;
    try {
      res = await doFetch(base + path, {
        method: method || "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error("Нет связи с сервером Искры. Проверь интернет и попробуй ещё раз.");
    }
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
    if (!res.ok) {
      const msg = json.error_description || json.msg || json.message || json.error || ("HTTP " + res.status);
      const err = new Error(String(msg));
      err.status = res.status;
      err.code = json.error_code || json.code || "";
      throw err;
    }
    return json;
  }

  function rememberSession(json) {
    const user = json.user || {};
    const meta = user.user_metadata || {};
    return save({
      email: String(user.email || state().email || ""),
      name: String(meta.full_name || meta.name || meta.user_name || (user.email ? String(user.email).split("@")[0] : state().name || "")),
      userId: String(user.id || state().userId || ""),
      accessToken: String(json.access_token || ""),
      refreshToken: String(json.refresh_token || state().refreshToken || ""),
      tokenAt: now()
    });
  }

  /** Письмо с кодом входа. */
  async function sendCode(rawEmail) {
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, msg: "Почта выглядит неправильно — проверь адрес." };
    try {
      await request("/auth/v1/otp", { email, create_user: true });
      log("Код входа отправлен на " + email);
      return { ok: true, msg: "Код отправлен на " + email + ". Проверь почту и папку «Спам»." };
    } catch (e) {
      return { ok: false, msg: readable(e, "Не получилось отправить код") };
    }
  }

  /** Вход по коду из письма. */
  async function verifyCode(rawEmail, rawCode) {
    const email = String(rawEmail || "").trim().toLowerCase();
    const token = String(rawCode || "").trim();
    if (!EMAIL_RE.test(email)) return { ok: false, msg: "Сначала укажи почту." };
    if (!token) return { ok: false, msg: "Вставь код из письма." };
    try {
      const json = await request("/auth/v1/verify", { type: "email", email, token });
      return { ok: true, state: rememberSession(json), msg: "Вход выполнен." };
    } catch (e) {
      return { ok: false, msg: readable(e, "Код не подошёл") };
    }
  }

  /** Вход по паролю от аккаунта Искры. */
  async function signIn(rawEmail, rawPassword) {
    const email = String(rawEmail || "").trim().toLowerCase();
    const password = String(rawPassword || "");
    if (!EMAIL_RE.test(email)) return { ok: false, msg: "Укажи почту аккаунта Искры." };
    if (!password) return { ok: false, msg: "Нужен пароль от аккаунта." };
    try {
      const json = await request("/auth/v1/token?grant_type=password", { email, password });
      return { ok: true, state: rememberSession(json), msg: "Вход выполнен." };
    } catch (e) {
      return { ok: false, msg: readable(e, "Войти не получилось") };
    }
  }

  /** Обновление токена, чтобы аккаунт не «отвалился» через час. */
  async function refresh(force) {
    const s = state();
    if (!s.refreshToken) return { ok: false, msg: "Нет сохранённого входа." };
    if (!force && s.tokenAt && now() - s.tokenAt < SESSION_MS) return { ok: true, state: s };
    try {
      const json = await request("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refreshToken });
      return { ok: true, state: rememberSession(json) };
    } catch (e) {
      return { ok: false, msg: readable(e, "Сессия истекла — войди заново") };
    }
  }

  /** Проверка, что вход ещё жив: спрашиваем у сервера, кто мы. */
  async function check(force) {
    const s = state();
    if (!s.email) return { ok: false, linked: false, msg: "Аккаунт не привязан." };
    if (s.accessToken && s.tokenAt && now() - s.tokenAt < SESSION_MS && !force) {
      return { ok: true, state: s, checked: false };
    }
    const r = await refresh(force);
    if (!r.ok) return { ok: false, linked: true, msg: r.msg };
    try {
      const user = await request("/auth/v1/user", null, r.state.accessToken, "GET");
      const email = String(user.email || r.state.email || "");
      return {
        ok: true,
        checked: true,
        state: save({
          email,
          userId: String(user.id || r.state.userId || ""),
          name: String((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || r.state.name || ""),
          lastCheck: now()
        })
      };
    } catch (e) {
      return { ok: false, linked: true, msg: readable(e, "Не удалось проверить вход") };
    }
  }

  /** Привязка кода клиента из Искры: 123456-AB12CD-word. */
  function linkClient(rawClient) {
    const client = keys.canonClient(rawClient);
    if (!client) {
      return { ok: false, msg: "Код клиента должен быть вида 123456-AB12CD-word. Он есть в Искре: ⚙ → «Доступ»." };
    }
    return { ok: true, state: save({ client }), client };
  }

  /** Спросить сервер, жива ли подписка этого кода клиента. */
  async function access() {
    const s = state();
    if (!s.client) return { ok: false, active: false, msg: "Код клиента не привязан." };
    try {
      const j = await fetchAccess(s.client);
      if (!j || !j.ok) {
        return { ok: false, active: false, msg: "Сервер Искры не ответил — проверь интернет." };
      }
      const active = !!j.active;
      const forever = !!j.forever;
      const expiresAt = forever ? 0 : Number(j.expiresAt || 0);
      save({ active, forever, expiresAt, plan: String(j.plan || ""), lastCheck: now() });
      return { ok: true, active, forever, expiresAt, plan: String(j.plan || ""), label: String(j.label || "") };
    } catch (e) {
      return { ok: false, active: false, msg: "Сервер Искры не ответил: " + (e.message || "проверь интернет") };
    }
  }

  function logout() {
    write({});
    return { ok: true };
  }

  /** Что показываем интерфейсу. */
  function view() {
    const s = state();
    return {
      linked: !!s.email,
      email: s.email,
      name: s.name,
      client: s.client,
      active: s.active,
      forever: s.forever,
      expiresAt: s.expiresAt,
      plan: s.plan,
      lastCheck: s.lastCheck,
      dueCheck: !s.lastCheck || now() - s.lastCheck > CHECK_MS
    };
  }

  /**
   * Полный сценарий привязки: вход (пароль или код) → код клиента → проверка подписки.
   * Возвращает понятный итог, даже если аккаунт не подтвердился: подписку
   * можно привязать и одним кодом клиента.
   */
  async function connect(input) {
    const email = String((input && input.email) || "").trim().toLowerCase();
    const password = String((input && input.password) || "");
    const code = String((input && input.code) || "").trim();
    const client = String((input && input.client) || "").trim();
    const warnings = [];
    let signedIn = !!state().email;

    if (!signedIn && (password || code)) {
      const auth = code ? await verifyCode(email, code) : await signIn(email, password);
      if (auth.ok) signedIn = true;
      else warnings.push(auth.msg);
    }

    if (client) {
      const l = linkClient(client);
      if (!l.ok) return { ok: false, msg: l.msg, warnings };
    }

    if (!state().client) {
      return { ok: false, msg: "Нужен код клиента из Искры: ⚙ → «Доступ» → «Код клиента».", warnings };
    }

    const a = await access();
    if (!a.ok) return { ok: false, msg: a.msg, warnings };

    return {
      ok: true,
      signedIn,
      access: a,
      state: view(),
      warnings,
      msg: a.active
        ? (a.forever ? "Подписка Pro активна: навсегда." : "Подписка Pro активна до " + new Date(a.expiresAt).toLocaleDateString("ru-RU") + ".")
        : "Код привязан, но активной подписки на нём нет. Купи Pro на сайте Искры — и Sye сразу заработает."
    };
  }

  return { state, view, sendCode, verifyCode, signIn, refresh, check, linkClient, access, logout, connect, SESSION_MS, CHECK_MS };
}

function readable(err, fallback) {
  const msg = String((err && err.message) || "");
  const code = String((err && err.code) || "");
  if (code === "otp_expired" || /expired/i.test(msg)) return "Код устарел — запроси новый.";
  if (code === "invalid_credentials" || /invalid login/i.test(msg)) return "Пароль не подошёл. Можно войти по коду из письма.";
  if (/email not confirmed/i.test(msg)) return "Почта не подтверждена — войди по коду из письма.";
  if (/user not found/i.test(msg)) return "Такого аккаунта на сервере Искры нет. Создай его на сайте или войди по коду из письма.";
  if (/rate limit|too many/i.test(msg)) return "Слишком много попыток — подожди минуту.";
  if (msg) return msg;
  return fallback;
}

module.exports = { createAccount, EMAIL_RE, SESSION_MS, CHECK_MS };

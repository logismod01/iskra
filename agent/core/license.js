/**
 * Подписка Sye.
 *
 * Правила, которые задал владелец:
 *   1) без Pro агента не скачать и не запустить — при первом запуске окно активации;
 *   2) один агент на человека: ключ привязывается к устройству;
 *   3) когда подписка кончается, Sye не выключается, а «работает плохо»:
 *      мало шагов, без терминала, без записи файлов и без разбора скриншотов.
 */

"use strict";

const keys = require("./keys.js");

const ACTIVE = "active";
const EXPIRED = "expired";
const NONE = "none";
const WRONG_DEVICE = "wrong-device";

const LIMITS = {
  active: {
    state: ACTIVE,
    steps: 14,             // сколько действий можно сделать в одной задаче
    shell: true,
    write: true,
    delete: true,
    vision: true,
    web: true,
    maxTokens: 1800,
    maxOutputChars: 20000,
    label: "Pro",
    note: "Подписка Pro активна — доступны все возможности."
  },
  expired: {
    state: EXPIRED,
    steps: 2,
    shell: false,          // терминал выключен
    write: false,          // файлы только читает
    delete: false,
    vision: false,         // скриншоты не разбирает
    web: false,
    maxTokens: 700,
    maxOutputChars: 4000,
    label: "Ограниченный режим",
    note: "Подписка Pro закончилась. Sye работает в ограниченном режиме: читает файлы и отвечает на вопросы, " +
      "но не запускает команды, не меняет код и не смотрит на экран. Продли Pro — и он снова в полной силе."
  },
  none: {
    state: NONE,
    steps: 0, shell: false, write: false, delete: false, vision: false, web: false,
    maxTokens: 0, maxOutputChars: 0,
    label: "Нет подписки",
    note: "Без Pro агент не работает. Активируй ключ — он выдаётся в Искре в разделе «Доступ»."
  }
};

/**
 * @param {object} opts
 * @param {() => object} opts.read          — прочитать сохранённое состояние
 * @param {(state:object) => void} opts.write
 * @param {string} opts.deviceId
 * @param {() => number} [opts.now]
 */
function createLicense(opts) {
  const read = opts.read || (() => ({}));
  const write = opts.write || (() => {});
  const deviceId = String(opts.deviceId || "");
  const now = opts.now || (() => Date.now());
  const log = opts.log || (() => {});

  function state() {
    const s = read() || {};
    return {
      client: s.client || "",
      key: s.key || "",
      engine: s.engine || "",
      expiresAt: Number(s.expiresAt || 0),
      forever: s.forever === true,
      plan: s.plan || "",
      label: s.label || "",
      activatedAt: Number(s.activatedAt || 0),
      deviceId: s.deviceId || "",
      deviceName: s.deviceName || "",
      lastSync: Number(s.lastSync || 0)
    };
  }

  function save(patch) {
    const next = Object.assign(state(), patch);
    write(next);
    return next;
  }

  function status() {
    const s = state();
    if (!s.key) return { ...LIMITS.none, state: NONE, client: s.client, key: s.key };
    if (s.deviceId && deviceId && s.deviceId !== deviceId) {
      return {
        ...LIMITS.none,
        state: WRONG_DEVICE,
        client: s.client,
        key: s.key,
        note: "Этот ключ активирован на другом устройстве. Один Pro — один агент: активируй ключ заново на этом компьютере " +
          "или напиши владельцу, чтобы перенести подписку."
      };
    }
    if (s.forever) {
      return { state: ACTIVE, ...LIMITS.active, forever: true, client: s.client, key: s.key, plan: s.plan, daysLeft: Infinity };
    }
    const leftMs = s.expiresAt - now();
    if (leftMs > 0) {
      const daysLeft = Math.max(1, Math.ceil(leftMs / 864e5));
      return { state: ACTIVE, ...LIMITS.active, client: s.client, key: s.key, plan: s.plan, expiresAt: s.expiresAt, daysLeft, leftMs };
    }
    return { state: EXPIRED, ...LIMITS.expired, client: s.client, key: s.key, plan: s.plan, expiresAt: s.expiresAt, daysLeft: 0 };
  }

  /** Активация ключа: офлайн — локально, серверный — через Supabase. */
  async function activate(rawKey, rawClient) {
    const client = keys.canonClient(rawClient);
    const key = String(rawKey || "").trim().replace(/\s+/g, "").toUpperCase();
    if (!client) return { ok: false, msg: "Код клиента должен быть вида 123456-AB12CD-word. Его показывает Искра в разделе «Доступ»." };
    if (!key) return { ok: false, msg: "Вставь ключ Pro" };

    const kind = keys.keyKind(key);
    if (!kind) return { ok: false, msg: "Ключ не похож ни на ISKRA-24-…, ни на ISKRA-L-…. Скопируй его целиком." };

    if (kind === "local") {
      const v = keys.verifyLocalKey(key, client);
      if (!v.ok) return v;
      save({
        client, key, engine: "local",
        expiresAt: v.expiresAt, forever: false,
        plan: v.hours >= 720 ? "month" : "day",
        activatedAt: now(), deviceId,
        deviceName: opts.deviceName || "",
        lastSync: now()
      });
      log("Активирован офлайн-ключ на " + v.hours + " ч");
      return { ok: true, msg: "Ключ активирован на " + v.hours + " ч", status: status() };
    }

    try {
      const v = await keys.activateServerKey(key, client);
      if (!v.ok) return v;
      save({
        client, key, engine: "server",
        expiresAt: v.forever ? 0 : v.expiresAt, forever: v.forever,
        plan: v.plan, label: v.label,
        activatedAt: v.activatedAt || now(),
        deviceId, deviceName: opts.deviceName || "",
        lastSync: now()
      });
      log("Активирован ключ Pro: " + (v.forever ? "навсегда" : "до " + new Date(v.expiresAt).toLocaleString("ru-RU")));
      return {
        ok: true,
        msg: v.forever ? "Ключ активирован: Pro навсегда" : "Ключ активирован. Pro до " + new Date(v.expiresAt).toLocaleDateString("ru-RU"),
        status: status()
      };
    } catch (e) {
      return { ok: false, msg: "Сервер ключей не ответил: " + (e.message || "проверь интернет") };
    }
  }

  /** Периодическая сверка с сервером: подписку могли продлить или отозвать. */
  async function sync(force) {
    const s = state();
    if (!s.key || s.engine !== "server") return status();
    const everyMs = 6 * 3600e3;
    if (!force && s.lastSync && now() - s.lastSync < everyMs) return status();
    try {
      const remote = await keys.fetchServerAccess(s.client);
      if (!remote.ok) return status();
      if (remote.active) {
        save({
          expiresAt: remote.forever ? 0 : remote.expiresAt,
          forever: !!remote.forever,
          plan: remote.plan || s.plan,
          lastSync: now()
        });
      } else if (!s.forever) {
        save({ expiresAt: Math.min(s.expiresAt || 0, now()), lastSync: now() });
      }
    } catch (e) {
      log("Не удалось проверить подписку: " + (e.message || e));
    }
    return status();
  }

  function deactivate() {
    save({ key: "", engine: "", expiresAt: 0, forever: false, plan: "", label: "", activatedAt: 0, lastSync: 0 });
    return status();
  }

  return { state, status, activate, sync, deactivate, LIMITS };
}

module.exports = { createLicense, LIMITS, ACTIVE, EXPIRED, NONE, WRONG_DEVICE };

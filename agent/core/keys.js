/**
 * Ключи Pro — те же, что продаются для сайта Искры.
 *
 * Формат кода клиента: 123456-AB12CD-word
 * Офлайн-ключ:         ISKRA-L-XXXXXX-YY-ZZZZZZ-MMMMMMMM
 * Серверный ключ:      ISKRA-24-XXXX-XXXX-XXXX
 *
 * Алгоритм офлайн-ключа повторён символ в символ из сайта,
 * поэтому ключ, выданный владельцем через консоль Искры, работает и здесь.
 */

"use strict";

const crypto = require("node:crypto");

const ACCESS = {
  localPrefix: "ISKRA-L-",
  localSecret: "iskra-offline-keys-v1",
  hours: 24,
  verifyWindowMs: 7 * 864e5
};

const SUPABASE = {
  url: "https://txrcessykslejwkeyfdb.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4cmNlc3N5a3NsZWp3a2V5ZmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNTExNjgsImV4cCI6MjEwODgyNzE2OH0.RJFcSbT8NRYt95NW29YKjiG0d5ETb7WItntRzOmRahg"
};

const CLIENT_RE = /^(\d{6})-([A-Za-z0-9]{6})-([A-Za-z]{6})$/;
const LOCAL_RE = /^ISKRA-L-([0-9A-F]{6})-([0-9A-Z]{2})-([0-9A-Z]{6})-([0-9A-F]{8})$/;
const SERVER_RE = /^ISKRA-[0-9]{2,3}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function canonClient(raw) {
  const s = String(raw || "").trim().replace(/[\s_]+/g, "");
  const m = s.match(CLIENT_RE);
  if (!m) return "";
  return m[1] + "-" + m[2].toUpperCase() + "-" + m[3].toLowerCase();
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function hmac(text) {
  return crypto.createHmac("sha256", ACCESS.localSecret).update(String(text), "utf8").digest("hex");
}

/** Проверка офлайн-ключа для конкретного кода клиента. */
function verifyLocalKey(raw, client) {
  const c = canonClient(client);
  if (!c) return { ok: false, msg: "Сначала нужен код клиента — он выдаётся в Искре, в разделе «Доступ»." };
  const m = String(raw || "").trim().toUpperCase().match(LOCAL_RE);
  if (!m) return { ok: false, msg: "Ключ повреждён — скопируй его целиком, без пробелов" };
  const payload = m[1] + "-" + m[2] + "-" + m[3];
  const sig = hmac("L|" + c + "|" + payload).slice(0, 8).toUpperCase();
  if (sig !== m[4]) return { ok: false, msg: "Ключ не подошёл этому коду клиента" };
  const bind = sha256(c).slice(0, 6).toUpperCase();
  if (bind !== m[1]) return { ok: false, msg: "Ключ выдан для другого кода клиента" };
  const hours = parseInt(m[2], 36);
  const issuedAt = parseInt(m[3], 36) * 60000;
  if (Date.now() > issuedAt + ACCESS.verifyWindowMs) {
    return { ok: false, msg: "Ключ просрочен: офлайн-ключ активируется в течение 7 дней после выдачи" };
  }
  return { ok: true, hours, issuedAt, expiresAt: issuedAt + hours * 3600e3, engine: "local" };
}

function keyKind(raw) {
  const k = String(raw || "").trim().toUpperCase();
  if (LOCAL_RE.test(k)) return "local";
  if (SERVER_RE.test(k)) return "server";
  return "";
}

/* ---------- Сервер ключей ---------- */
async function rpc(name, args, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SUPABASE.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE.anonKey,
        Authorization: "Bearer " + SUPABASE.anonKey
      },
      body: JSON.stringify(args || {}),
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Активировать серверный ключ на этот код клиента. */
async function activateServerKey(raw, client) {
  const j = await rpc("iskra_activate_key", { p_key: String(raw).trim().toUpperCase(), p_client: canonClient(client) });
  if (!j || !j.ok) return { ok: false, msg: (j && j.error) || "Ключ не подошёл. Проверь буквы и дефисы." };
  const forever = j.forever === true || !j.expires_at;
  return {
    ok: true,
    engine: "server",
    forever,
    expiresAt: forever ? 0 : new Date(j.expires_at).getTime(),
    hours: j.hours || ACCESS.hours,
    plan: j.plan || (forever ? "forever" : ""),
    activatedAt: j.activated_at ? new Date(j.activated_at).getTime() : Date.now(),
    label: j.label || ""
  };
}

/** Спросить у сервера, живёт ли ещё ключ этого кода клиента. */
async function fetchServerAccess(client) {
  const j = await rpc("iskra_access", { p_client: canonClient(client) });
  if (!j || !j.ok) return { ok: false, active: false };
  const forever = j.forever === true || !j.expires_at;
  const expiresAt = forever ? 0 : new Date(j.expires_at).getTime();
  return { ok: true, active: !!j.active && (forever || expiresAt > Date.now()), forever, expiresAt, plan: j.plan || "", label: j.label || "" };
}

module.exports = {
  ACCESS, SUPABASE, CLIENT_RE, LOCAL_RE, SERVER_RE,
  canonClient, sha256, hmac, verifyLocalKey, keyKind, activateServerKey, fetchServerAccess, rpc
};

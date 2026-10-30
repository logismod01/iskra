const test = require("node:test");
const assert = require("node:assert/strict");
const keys = require("../core/keys.js");

/** Выпускает офлайн-ключ точно так же, как это делает сайт Искры. */
function issueKey(client, hours, issuedAtMs) {
  const c = keys.canonClient(client);
  const bind = keys.sha256(c).slice(0, 6).toUpperCase();
  const h = Math.floor(hours).toString(36).toUpperCase().padStart(2, "0");
  const t = Math.floor(issuedAtMs / 60000).toString(36).toUpperCase().padStart(6, "0");
  const payload = bind + "-" + h + "-" + t;
  const sig = keys.hmac("L|" + c + "|" + payload).slice(0, 8).toUpperCase();
  return "ISKRA-L-" + payload + "-" + sig;
}

const CLIENT = "482913-KX7T2P-qwerty";

test("код клиента приводится к одному виду", () => {
  assert.equal(keys.canonClient(" 482913-KX7T2P-QWERTY "), "482913-KX7T2P-qwerty");
  assert.equal(keys.canonClient("482913-KX7T2P-qwerty"), "482913-KX7T2P-qwerty");
});

test("мусор вместо кода клиента не принимается", () => {
  assert.equal(keys.canonClient(""), "");
  assert.equal(keys.canonClient("123-ABC-word"), "");
  assert.equal(keys.canonClient("482913-KX7T2P-qwertyy"), "");
});

test("офлайн-ключ, выпущенный сайтом, проходит проверку", () => {
  const issued = Date.now() - 3600e3; // час назад
  const key = issueKey(CLIENT, 24, issued);
  const v = keys.verifyLocalKey(key, CLIENT);
  assert.equal(v.ok, true);
  assert.equal(v.hours, 24);
  assert.ok(v.expiresAt > Date.now(), "ключ должен быть ещё живым");
});

test("офлайн-ключ не подходит чужому коду клиента", () => {
  const key = issueKey(CLIENT, 24, Date.now());
  const v = keys.verifyLocalKey(key, "482913-KX7T2P-zxcvbn");
  assert.equal(v.ok, false);
  assert.match(v.msg, /другому коду|не подошёл/i);
});

test("подделанная подпись ломает ключ", () => {
  const key = issueKey(CLIENT, 24, Date.now()).slice(0, -1) + "0";
  const v = keys.verifyLocalKey(key, CLIENT);
  assert.equal(v.ok, false);
});

test("офлайн-ключ нельзя активировать позже 7 дней", () => {
  const key = issueKey(CLIENT, 24, Date.now() - 9 * 864e5);
  const v = keys.verifyLocalKey(key, CLIENT);
  assert.equal(v.ok, false);
  assert.match(v.msg, /просрочен/i);
});

test("ключи распознаются по формату", () => {
  assert.equal(keys.keyKind(issueKey(CLIENT, 24, Date.now())), "local");
  assert.equal(keys.keyKind("ISKRA-24-AAAA-BBBB-CCCC"), "server");
  assert.equal(keys.keyKind("ISKRA-100-AAAA-BBBB-CCCC"), "server");
  assert.equal(keys.keyKind("4321-AAAA-BBBB"), "");
  assert.equal(keys.keyKind(""), "");
});

test("секрет офлайн-ключей совпадает с сайтом", () => {
  assert.equal(keys.ACCESS.localSecret, "iskra-offline-keys-v1");
  assert.equal(keys.ACCESS.localPrefix, "ISKRA-L-");
});

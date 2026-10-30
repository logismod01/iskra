const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runTask, systemPrompt } = require("../core/agent.js");
const { LIMITS } = require("../core/license.js");
const { toolsPrompt } = require("../core/protocol.js");

function tmpWorkspace(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sye-agent-" + name + "-"));
}

function ctxFor(workspace) {
  return {
    workspace,
    settings: { access: "folder" },
    limits: LIMITS.active,
    info: { os: "win32", arch: "x64" },
    confirm: async () => true,
    exec: async () => ({ code: 0, stdout: "ok", stderr: "" }),
    capture: async () => "data:image/png;base64,AAAA",
    lookAtShot: async () => ({ ok: true, output: "на экране код" }),
    fetchUrl: async () => "страница"
  };
}

/** Модель, которая отвечает по заранее заданному списку. */
function scripted(replies) {
  const seen = [];
  let i = 0;
  return {
    seen,
    model: async (req) => {
      seen.push({ messages: req.messages.map((m) => ({ role: m.role, content: m.content })), maxTokens: req.maxTokens });
      const text = replies[Math.min(i, replies.length - 1)];
      i++;
      if (typeof text === "function") return { text: text(req) };
      return { text };
    }
  };
}

test("действие → наблюдение → итог", async () => {
  const ws = tmpWorkspace("loop");
  fs.writeFileSync(path.join(ws, "hello.txt"), "привет", "utf8");
  const events = [];
  const s = scripted([
    '<action>{"tool":"fs.read","args":{"path":"hello.txt"},"why":"посмотреть"}</action>',
    "<final>Прочитал hello.txt.</final>"
  ]);
  const res = await runTask({ task: "Прочитай hello.txt", ctx: ctxFor(ws), model: s.model, onEvent: (e) => events.push(e) });

  assert.equal(res.ok, true);
  assert.equal(res.final, "Прочитал hello.txt.");
  assert.equal(res.steps, 1);

  const types = events.map((e) => e.type).filter((t) => t !== "token" && t !== "thinking");
  assert.deepEqual(types, ["action", "observation", "final"]);
  assert.ok(events.filter((e) => e.type === "thinking").length >= 2, "каждый шаг должен показывать «думаю»");
  const obs = events.find((e) => e.type === "observation");
  assert.equal(obs.ok, true);
  assert.match(obs.summary, /Прочитал/);
});

test("после правки файлов агент сам просит проверку", async () => {
  const ws = tmpWorkspace("verify");
  const events = [];
  const s = scripted([
    '<action>{"tool":"fs.write","args":{"path":"a.txt","content":"1"},"why":"создать"}</action>',
    "<final>Готово.</final>",
    '<action>{"tool":"shell.run","args":{"command":"npm test"}}</action>',
    "<final>Сделал и проверил: тесты зелёные.</final>"
  ]);
  const res = await runTask({ task: "создай файл", ctx: ctxFor(ws), model: s.model, onEvent: (e) => events.push(e) });
  assert.equal(res.ok, true);
  assert.ok(events.some((e) => e.type === "verify"), "должна быть просьба проверить");
  const asked = s.seen[2].messages.some((m) => m.role === "user" && /не запустил ни одной проверки/.test(m.content));
  assert.ok(asked, "модель должна получить просьбу о проверке");
  assert.match(res.final, /проверил/i);
  assert.equal(res.steps, 3, "запись, просьба проверить и сама проверка — три шага");
});

test("если проверка уже была — лишний раз не просим", async () => {
  const ws = tmpWorkspace("checked");
  const events = [];
  const s = scripted([
    '<action>{"tool":"fs.write","args":{"path":"a.txt","content":"1"}}</action>',
    '<action>{"tool":"shell.run","args":{"command":"npm test"}}</action>',
    "<final>Готово, тесты прошли.</final>"
  ]);
  const res = await runTask({ task: "создай и проверь", ctx: ctxFor(ws), model: s.model, onEvent: (e) => events.push(e) });
  assert.equal(res.steps, 2);
  assert.equal(events.some((e) => e.type === "verify"), false);
  assert.match(res.final, /тесты прошли/i);
});

test("результат действия возвращается модели как наблюдение", async () => {
  const ws = tmpWorkspace("observe");
  fs.writeFileSync(path.join(ws, "data.txt"), "секретный текст", "utf8");
  const s = scripted([
    '<action>{"tool":"fs.read","args":{"path":"data.txt"}}</action>',
    "<final>Прочитал.</final>"
  ]);
  await runTask({ task: "Прочитай data.txt", ctx: ctxFor(ws), model: s.model });
  const second = s.seen[1].messages;
  assert.ok(second.some((m) => m.role === "assistant" && m.content.includes("<action>")));
  assert.ok(second.some((m) => m.role === "user" && m.content.includes("секретный текст")));
});

test("неверный формат — подсказка и вторая попытка", async () => {
  const ws = tmpWorkspace("misformat");
  const events = [];
  const s = scripted([
    '<action>{"tool":"fs.read","args":{}}</action>',
    "<final>Готово.</final>"
  ]);
  const res = await runTask({ task: "почини", ctx: ctxFor(ws), model: s.model, onEvent: (e) => events.push(e) });
  assert.equal(res.ok, true);
  assert.ok(events.some((e) => e.type === "misformat"));
  const correction = s.seen[1].messages.find((m) => m.role === "user" && /Не понял действие/.test(m.content));
  assert.ok(correction, "модель не получила подсказку по формату");
  assert.match(correction.content, /<action>/);
});

test("неизвестный инструмент тоже лечится подсказкой", async () => {
  const ws = tmpWorkspace("badtool");
  const s = scripted([
    '<action>{"tool":"root.delete","args":{"path":"/"}}</action>',
    "<final>Не буду.</final>"
  ]);
  const res = await runTask({ task: "удали всё", ctx: ctxFor(ws), model: s.model });
  assert.equal(res.ok, true);
  assert.equal(s.seen.length, 2);
});

test("task.done завершает без лишнего шага", async () => {
  const ws = tmpWorkspace("done");
  const res = await runTask({
    task: "скажи всё",
    ctx: ctxFor(ws),
    model: async () => ({ text: '<action>{"tool":"task.done","args":{"summary":"Всё сделано"}}</action>' })
  });
  assert.equal(res.ok, true);
  assert.equal(res.final, "Всё сделано");
  assert.equal(res.steps, 0);
});

test("шаги кончаются — агент подводит итог, а не зависает", async () => {
  const ws = tmpWorkspace("exhaust");
  fs.writeFileSync(path.join(ws, "a.txt"), "x", "utf8");
  let replies = 0;
  const model = async () => {
    replies++;
    if (replies <= 2) return { text: '<action>{"tool":"fs.list","args":{"path":"."}}</action>' };
    return { text: "<final>Успел осмотреться.</final>" };
  };
  const res = await runTask({ task: "смотри папку", ctx: ctxFor(ws), model, maxSteps: 2 });
  assert.equal(res.ok, true);
  assert.equal(res.exhausted, true);
  assert.equal(res.steps, 2);
  assert.match(res.final, /Успел/);
  assert.equal(replies, 3, "после шагов должен быть ещё один запрос на итог");
});

test("ограниченный режим: два шага и без записи", async () => {
  const ws = tmpWorkspace("limited");
  const ctx = ctxFor(ws);
  ctx.limits = LIMITS.expired;
  let n = 0;
  const model = async () => {
    n++;
    return { text: '<action>{"tool":"fs.write","args":{"path":"x.txt","content":"x"}}</action>' };
  };
  const res = await runTask({ task: "запиши файл", ctx, model, maxSteps: LIMITS.expired.steps });
  assert.equal(res.steps, 2);
  assert.equal(fs.existsSync(path.join(ws, "x.txt")), false, "в ограниченном режиме файл не создаётся");
  assert.ok(res.final.length > 0);
});

test("остановка по сигналу не оставляет задачу висеть", async () => {
  const ws = tmpWorkspace("abort");
  const controller = new AbortController();
  controller.abort();
  const events = [];
  const res = await runTask({
    task: "долгая задача",
    ctx: ctxFor(ws),
    model: async () => ({ text: "<final>не дойдёт</final>" }),
    signal: controller.signal,
    onEvent: (e) => events.push(e)
  });
  assert.equal(res.ok, false);
  assert.equal(res.stopped, true);
  assert.ok(events.some((e) => e.type === "stopped"));
});

test("падение движка показывает ошибку, а не исключение", async () => {
  const ws = tmpWorkspace("engine-error");
  const res = await runTask({
    task: "что-нибудь",
    ctx: ctxFor(ws),
    model: async () => { throw new Error("движки молчат"); }
  });
  assert.equal(res.ok, false);
  assert.match(res.final, /движки молчат/);
});

test("пустая задача — приветствие без запроса к модели", async () => {
  const ws = tmpWorkspace("empty");
  let called = 0;
  const res = await runTask({ task: "   ", ctx: ctxFor(ws), model: async () => { called++; return { text: "x" }; } });
  assert.equal(called, 0);
  assert.equal(res.steps, 0);
  assert.match(res.final, /Скажи задачу/);
});

test("системный промпт: характер Sye, инструменты, режим подписки", () => {
  const active = systemPrompt({ workspace: "C:\\proj", settings: { access: "folder" }, limits: Object.assign({ daysLeft: 5 }, LIMITS.active), info: { os: "win32", arch: "x64" } });
  assert.match(active, /Sye/);
  assert.match(active, /я сделал/);
  assert.match(active, /Pro активна/);
  for (const name of ["fs.read", "shell.run", "screen.look"]) assert.ok(toolsPrompt().includes(name));
  assert.match(active, /Не раскрываешь|не раскрываешь/i);

  const expired = systemPrompt({ workspace: "C:\\proj", settings: { access: "folder" }, limits: LIMITS.expired, info: {} });
  assert.match(expired, /подписка Pro неактивна/i);
});

test("мелким моделям уходит короткий системный промпт, история остаётся", async () => {
  const { runTask } = require("../core/agent.js");
  const { LIMITS } = require("../core/license.js");
  let seen = null;
  const model = async ({ messages, liteMessages }) => {
    seen = { full: messages, lite: liteMessages };
    return { text: "<final>готово</final>" };
  };
  await runTask({
    task: "почини python",
    ctx: { workspace: "C:\\proj", settings: { access: "folder" }, limits: LIMITS.active, info: { os: "win32", arch: "x64" } },
    model
  });
  assert.ok(seen && seen.lite, "короткий промпт не передаётся вовсе");
  assert.ok(seen.lite[0].content.length < seen.full[0].content.length / 2, "короткий промпт не короче полного");
  assert.equal(seen.lite[0].content.length > 800, true, "короткий промпт подозрительно пустой");
  // остальные сообщения — те же: задача и шаги не теряются
  assert.deepEqual(seen.lite.slice(1), seen.full.slice(1), "история или задача разошлись");
  // формат и запреты на месте
  assert.match(seen.lite[0].content, /<action>/);
  assert.match(seen.lite[0].content, /<final>/);
  assert.match(seen.lite[0].content, /DAN|забудь правила/i);
  assert.match(seen.lite[0].content, /Sye/);
  assert.match(seen.lite[0].content, /Искры/);
});

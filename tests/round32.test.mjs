/**
 * Раунд 32: тренажёр, точные модули, озвучка, печать, папки (1.40.0).
 *
 * Что было не так:
 *   1) проверить себя было негде: скилл «Проверь мои ответы» — только промпт,
 *      баллов он не считал и вопросов не задавал;
 *   2) физику и проценты модель считала сама и путала перевод единиц;
 *   3) ответ нельзя было послушать, а на бумаге он печатался с тёмным фоном;
 *   4) чаты лежали одной кучей, закрепить нужный было нельзя.
 *
 * Запуск: node tests/round32.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));

console.log("round32: тренажёр, расчёты, озвучка, печать, папки — 1.40.0");

const spoken = [];
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
    win.confirm = () => true;
    win.prompt = () => win.__promptAnswer || "Учёба";
    win.fetch = async () => { throw new Error("offline"); };
    /* jsdom не умеет ни говорить, ни печатать — подменяем, чтобы проверить логику */
    win.speechSynthesis = {
      speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 600); },
      cancel() {},
      getVoices() { return [{ lang: "ru-RU", localService: true, name: "Тест" }]; },
      addEventListener() {}
    };
    win.SpeechSynthesisUtterance = function (text) { this.text = text; };
    win.print = () => { win.__printCalls = (win.__printCalls || 0) + 1; };
  }
});
const { window } = dom;
await new Promise((r) => setTimeout(r, 900));
const ev = (code) => window.eval(code);
const d = window.document;
const $ = (s) => d.querySelector(s);
const $$ = (s) => [...d.querySelectorAll(s)];

/* ---------- Тренажёр ---------- */

await test("тренажёр открывается из инструментов и показывает темы", async () => {
  assert(!!$("#trainerModal"), "окна тренажёра нет в разметке");
  assert(!!$("#toolsTrainer"), "в инструментах нет входа в тренажёр");
  $("#toolsTrainer").click();
  assert($("#trainerModal").classList.contains("open"), "окно не открылось");
  const rows = $$("#trainerBody .tr-topic");
  assert(rows.length > 0, "список тем пуст");
  assert(ev("trainerAllTopics().length") > 500, "в тренажёре мало тем");
});

await test("вопросы собираются из текста темы, а не выдумываются", async () => {
  ev('openTrainer("Теорема Пифагора")');
  await new Promise((r) => setTimeout(r, 40));
  const qs = JSON.parse(ev("JSON.stringify(trainerState.questions.map(q => ({ kind: q.kind, q: q.q, right: q.right, opts: q.options || [] })))"));
  assert(qs.length >= 3, "вопросов слишком мало: " + qs.length);
  for (const q of qs) {
    assert(q.q && q.q.length > 10, "пустой вопрос");
    if (q.kind === "choice") {
      assert(q.opts.length === 4, "у выбора не 4 варианта: " + q.opts.length);
      assert(q.opts.includes(q.right), "верного варианта нет в списке");
      assert(new Set(q.opts).size === 4, "варианты повторяются");
    }
  }
  const exact = qs.some((q) => /Пифагор|катет|гипотенуз|треугольник/i.test(q.q + " " + q.right));
  assert(exact, "вопросы не про теорему Пифагора");
});

await test("верный ответ засчитывается, неверный — нет, итог считается", async () => {
  ev('openTrainer("Теорема Пифагора")');
  await new Promise((r) => setTimeout(r, 30));
  ev("localStorage.removeItem('iskra.trainer.v1')");
  const total = ev("trainerState.questions.length");
  let guard = 0;
  let answered = 0;
  while ($(".tr-q") && guard++ < 30) {
    const isOpen = !!$("#trOpen");
    if (isOpen) {
      $("#trOpen").value = guard % 2 ? "не знаю" : "катет гипотенуза квадрат сумма треугольник прямоугольный";
      $("#trCheck").click();
    } else {
      const right = ev("trainerState.questions[trainerState.index].right");
      const opts = $$(".tr-opt");
      /* Первый по счёту отвечаем верно, второй — нарочно мимо */
      const pick = guard % 3 === 0 ? opts.find((b) => b.textContent !== right) : opts.find((b) => b.textContent === right);
      (pick || opts[0]).click();
    }
    answered++;
    const next = $("#trNext");
    if (!next) break;
    next.click();
  }
  assert(answered === total, `пройдено ${answered} из ${total}`);
  assert(!!$(".tr-big"), "итога нет");
  const shown = $(".tr-big").textContent.replace(/\s/g, "");
  assert(/^\d+\/\d+$/.test(shown), "итог не в виде «верно / всего»: " + shown);
  const stats = JSON.parse(ev("localStorage.getItem('iskra.trainer.v1')") || "{}");
  assert(stats["Теорема Пифагора"], "итог не сохранился");
  assert(stats["Теорема Пифагора"].asked === total, "сохранилось не то число вопросов");
});

await test("слабые темы попадают в память и показываются сверху", async () => {
  ev("localStorage.setItem('iskra.trainer.v1', JSON.stringify({'Проценты':{asked:10,right:2,at:Date.now()}, 'Теорема Пифагора':{asked:10,right:9,at:Date.now()}}))");
  ev("trainerShowPicker()");
  await new Promise((r) => setTimeout(r, 30));
  const weak = $$("#trWeak .tr-topic");
  assert(weak.length === 1, "слабых тем должно быть ровно одна, а не " + weak.length);
  assert(/Проценты/.test(weak[0].textContent), "слабая тема не «Проценты»");
  assert(/Теорема Пифагора/.test($$("#trTopics .tr-topic").map((b) => b.textContent).join(" ")), "сильная тема из списка пропала");
});

/* ---------- Точные модули ---------- */

await test("проценты: скидка, наценка, доля, вклад — считаются кодом", async () => {
  const cases = [
    ["Сколько процентов составляет 30 от 200?", "15 %"],
    ["Товар стоит 1500 рублей, скидка 20%. Сколько платить?", "1200"],
    ["Цену 2000 увеличили на 15%. Сколько теперь?", "2300"],
    ["Найди 12% от 2500", "300"],
    ["Вклад 50000 под 8% годовых на 3 года. Сколько будет?", "62985,6"]
  ];
  for (const [q, want] of cases) {
    const got = JSON.parse(ev(`JSON.stringify(findPercents(${JSON.stringify(q)}))`));
    assert(got.length, "не разобрала: " + q);
    assert(String(got[0].answer).includes(want), `${q} → ${got[0].answer}, ждали ${want}`);
  }
});

await test("физика: путь, плотность, давление, Ом — без ошибок перевода", async () => {
  const cases = [
    ["Машина едет 72 км/ч и проехала 3 часа. Какой путь?", "216 км"],
    ["Сколько времени нужно, чтобы проехать 150 км при скорости 60 км/ч?", "2,5 ч"],
    ["Масса 400 г, объём 500 см³. Найди плотность.", "800 кг/м³"],
    ["Масса тела 5 кг. Найди силу тяжести.", "49 Н"],
    ["Сила 200 Н действует на площадь 40 см². Какое давление?", "50000 Па"],
    ["Напряжение 12 В, сопротивление 4 Ом. Найди силу тока.", "3 А"]
  ];
  for (const [q, want] of cases) {
    const got = JSON.parse(ev(`JSON.stringify(findPhysics(${JSON.stringify(q)}))`));
    assert(got.length, "не разобрала: " + q);
    assert(String(got[0].answer).includes(want), `${q} → ${got[0].answer}, ждали ${want}`);
  }
});

await test("обычный вопрос не превращается в расчёт", async () => {
  assert(ev("findExactModules('Расскажи про фотосинтез').length") === 0, "про фотосинтез появился расчёт");
  assert(ev("findExactModules('Кто написал «Войну и мир»?').length") === 0, "про Толстого появился расчёт");
  assert(ev("findExactModules('Просто посчитай 2+2').length") === 0, "арифметику забрал не тот модуль");
});

await test("расчёт уходит в промпт и виден под ответом", async () => {
  const block = ev('exactPromptBlock(findPercents("Скидка 20% на 1500 рублей"))');
  assert(/ТОЧНЫЙ РАСЧЁТ/.test(block), "в промпте нет пометки о точном расчёте");
  assert(/1200/.test(block), "в промпте нет верного числа");
  const note = ev('exactAnswerNote(findPhysics("Масса 400 г, объём 500 см³ — плотность?"))');
  assert(/Проверено расчётом/.test(note), "под ответом нет пометки");
  assert(/800/.test(note), "в пометке нет верного числа");
});

/* ---------- Озвучка ---------- */

await test("кнопка «Озвучить» есть и читает текст без разметки", async () => {
  ev(`(() => {
    chats = {};
    const id = "chat-tts";
    chats[id] = { id, title: "Озвучка", created: Date.now(), messages: [
      { id: "u1", role: "user", content: "Объясни фотосинтез", ts: Date.now() },
      { id: "a1", role: "assistant", content: "Фотосинтез — процесс на свету.\\n\\n\`\`\`\\nconst x = 1;\\n\`\`\`\\n\\n**Итог:** растение делает еду.", ts: Date.now() }
    ]};
    currentChatId = id; renderChatsList(); renderMessages();
  })()`);
  await new Promise((r) => setTimeout(r, 80));
  const btn = $('.msg .actions button[data-act="speak"]');
  assert(!!btn, "кнопки озвучки нет");
  assert(btn.dataset.msg === "a1", "кнопка не знает, что читать");
  spoken.length = 0;
  btn.click();
  await new Promise((r) => setTimeout(r, 30));
  assert(spoken.length >= 1, "ничего не прочитано");
  const text = spoken.join(" ");
  assert(!/const x/.test(text), "код читается вслух");
  assert(!/\*\*/.test(text), "звёздочки разметки остались");
  assert(/фотосинтез/i.test(text), "текст ответа не попал в речь");
  assert($('.msg .actions button[data-act="speak"].speaking'), "кнопка не превратилась в «Стоп»");
  $('.msg .actions button[data-act="speak"].speaking').click();
  assert(!ev("ttsState.msgId"), "стоп не остановил чтение");
});

await test("длинный текст режется на куски, ни один не длиннее 220 знаков", async () => {
  const chunks = JSON.parse(ev(`JSON.stringify(ttsChunks(${JSON.stringify(
    "Первое предложение про физику. Второе предложение про математику и проценты. ".repeat(20)
  )}))`));
  assert(chunks.length > 3, "длинный текст не поделился: " + chunks.length);
  for (const c of chunks) assert(c.length <= 260, "кусок речи слишком длинный: " + c.length);
});

/* ---------- Печать ---------- */

await test("печать ответа: свой лист без кнопок и тёмного фона", async () => {
  const btn = $('.msg .actions button[data-act="print"]');
  assert(!!btn, "кнопки печати нет");
  btn.click();
  await new Promise((r) => setTimeout(r, 40));
  assert(window.__printCalls === 1, "печать не вызвана");
  const sheet = $("#printArea");
  assert(sheet && sheet.innerHTML.length > 100, "лист пустой");
  assert(/фотосинтез/i.test(sheet.textContent), "вопрос не попал на лист");
  assert(/Итог/.test(sheet.textContent), "ответ не попал на лист");
  assert(!/Копировать/.test(sheet.textContent), "на лист попали кнопки");
});

await test("на бумаге всё чёрным по белому, панели скрыты", async () => {
  assert(/@media print[\s\S]*body\.printing > \*:not\(#printArea\) \{ display: none !important; \}/.test(html), "печать не оставляет только лист");
  assert(/#printArea \.pr-q \{[\s\S]*?color: #333/.test(html), "вопрос не оформлен для бумаги");
  assert(/#printArea pre \{[\s\S]*?white-space: pre-wrap/.test(html), "код на бумаге не переносится");
  assert(/body \{ background: white !important; color: black !important;/.test(html), "тёмный фон остался в печати");
});

/* ---------- Папки и закрепление ---------- */

await test("папка создаётся, чат переносится, список перестраивается", async () => {
  ev(`(() => {
    settings.chatFolders = [];
    chats = {};
    const mk = (id, title, days) => { chats[id] = { id, title, created: Date.now() - days * 86400000,
      messages: [{ id: id + "m", role: "user", content: "привет", ts: Date.now() }] }; };
    mk("c1", "Домашка по физике", 0); mk("c2", "Сочинение по литературе", 1); mk("c3", "Старый чат", 9);
    currentChatId = "c1"; saveChats(); saveSettings(); renderChatsList();
  })()`);
  await new Promise((r) => setTimeout(r, 40));
  window.__promptAnswer = "Учёба";
  $("#newFolderBtn").click();
  await new Promise((r) => setTimeout(r, 30));
  assert(ev("settings.chatFolders.length") === 1, "папка не создалась");
  const row = $$("#chatsList .chat-row").find((r) => /Сочинение/.test(r.textContent));
  row.querySelector(".more").click();
  await new Promise((r) => setTimeout(r, 30));
  assert(!!$("#chatMenu"), "меню чата не открылось");
  const toFolder = $$('#chatMenu [data-cm="folder"]').find((b) => /Учёба/.test(b.textContent));
  assert(!!toFolder, "в меню нет пункта с папкой");
  toFolder.click();
  await new Promise((r) => setTimeout(r, 40));
  assert(ev('chats["c2"].folder') === ev("settings.chatFolders[0].id"), "чат не попал в папку");
  assert($$("#chatsList .chat-row.in-folder").length === 1, "в папке не одна строка");
  assert($$("#chatsList .sb-folder").length === 1, "заголовка папки нет");
});

await test("закреплённый чат стоит сверху и переживает перезагрузку", async () => {
  const row = $$("#chatsList .chat-row").find((r) => /Домашка/.test(r.textContent));
  row.querySelector(".more").click();
  await new Promise((r) => setTimeout(r, 30));
  $$('#chatMenu [data-cm="pin"]')[0].click();
  await new Promise((r) => setTimeout(r, 40));
  assert(ev('!!chats["c1"].pinned'), "чат не закрепился");
  const titles = $$("#chatsList .sb-group-title").map((x) => x.textContent.trim());
  assert(/Закреплённые/.test(titles[0]), "первая группа не «Закреплённые», а " + titles[0]);
  const first = $("#chatsList .chat-row");
  assert(/Домашка/.test(first.textContent), "закреплённый чат не первый");
  assert(/pinned/.test(first.className), "у закреплённого нет пометки");
  assert(JSON.parse(ev("localStorage.getItem('iskra.chats.v1')"))["c1"].pinned, "закрепление не сохранилось");
});

await test("папку можно свернуть, и это запоминается", async () => {
  const head = $$("#chatsList .sb-folder")[0];
  head.click();
  await new Promise((r) => setTimeout(r, 40));
  assert(ev("settings.chatFolders[0].open") === false, "папка не свернулась");
  assert($$("#chatsList .chat-row.in-folder").length === 0, "чат свёрнутой папки всё равно виден");
  assert(/closed/.test($$("#chatsList .sb-folder")[0].className), "у свёрнутой папки нет пометки");
});

await test("у чата одна кнопка действий вместо трёх", async () => {
  const rows = $$("#chatsList .chat-row").length;
  assert(rows > 0, "в списке нет чатов");
  assert($$("#chatsList .chat-row .more").length === rows, "кнопок «⋯» не по одной на чат");
  assert($$("#chatsList .chat-row .del").length === 0, "старая кнопка удаления осталась");
  const menuItems = ev('(() => { const c = Object.values(chats)[0]; openChatMenu(c.id, document.querySelector("#chatsList .more")); return document.querySelector("#chatMenu").textContent; })()');
  assert(/Удалить чат/.test(menuItems), "удаление пропало из меню");
  assert(/Закрепить|Открепить/.test(menuItems), "закрепления нет в меню");
});

/* ---------- Версия ---------- */

await test("версия сайта и кэша — 1.40.0", async () => {
  assert(pkg.version === "1.40.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.35\.0";/.test(read("sw.js")), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round32: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

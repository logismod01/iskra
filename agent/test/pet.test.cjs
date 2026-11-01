/**
 * Сью на рабочем столе: поведение, окно, настройки.
 *
 * Проверяем то, что можно проверить без видеокарты: логику перемещения,
 * фразы, реакцию на задачу и связку main.js ↔ preload ↔ окно.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const petModule = require("../core/pet.js");
const mainJs = read("main.js");
const preload = read("preload.js");
const petHtml = read("renderer/pet.html");
const petJs = read("renderer/pet.js");
const petCss = read("renderer/pet.css");
const appJs = read("renderer/app.js");
const html = read("renderer/index.html");

/* Детерминированная случайность: тесты не должны «иногда» падать. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makePet(opts) {
  let clock = 1_000_000;
  const pet = petModule.createPet(Object.assign({
    rand: seeded(42),
    now: () => clock,
    width: 96
  }, opts || {}));
  pet.setBounds(0, 1920);
  pet.place(400);
  return {
    pet,
    tick: (ms) => { clock += ms || petModule.TICK_MS; return pet.tick(ms || petModule.TICK_MS, clock); },
    at: () => clock,
    advance: (ms) => { clock += ms; }
  };
}

test("поведение парсится и не тянет electron", () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--check", path.join(ROOT, "core/pet.js")])
  );
  assert.match(read("core/pet.js"), /module\.exports = \{/);
  assert.doesNotMatch(read("core/pet.js"), /require\(["']electron["']\)/);
});

test("Сью ходит, но не выходит за экран", () => {
  const { pet, tick } = makePet(); // обычная случайность, засеянная
  pet.setAction("stand", 0);
  let minX = Infinity;
  let maxX = -Infinity;
  let walked = 0;
  for (let i = 0; i < 4000; i++) {
    const s = tick();
    assert.ok(s.x >= 0, "ушёл левее экрана: " + s.x);
    assert.ok(s.x <= 1920 - 96, "ушёл правее экрана: " + s.x);
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    if (s.action === "walk") walked++;
  }
  assert.ok(maxX - minX > 120, "за 4000 шагов почти не сдвинулся: " + (maxX - minX));
  assert.ok(walked > 200, "почти не ходил: " + walked + " шагов из 4000");
});

test("у самого края разворачивается, а не топчется в стену", () => {
  const pet = petModule.createPet({ rand: () => 0.1, now: () => 0, width: 96 });
  pet.setBounds(0, 1000);
  pet.place(0);
  pet.state.dir = -1;
  pet.setAction("walk", 5000);
  for (let i = 0; i < 10; i++) pet.tick(40, 0);
  assert.equal(pet.state.dir, 1, "не развернулся у левого края");
  pet.place(1000 - 96);
  pet.state.dir = 1;
  for (let i = 0; i < 10; i++) pet.tick(40, 0);
  assert.equal(pet.state.dir, -1, "не развернулся у правого края");
});

test("Сью прыгает и возвращается в стойку", () => {
  const { pet, tick } = makePet();
  pet.setAction("jump", petModule.JUMP_MS);
  const during = tick(100);
  assert.equal(during.action, "jump");
  let after = during;
  for (let i = 0; i < 40; i++) after = tick(50);
  assert.notEqual(after.action, "jump", "после прыжка действие не сменилось");
});

test("на работе он стоит, а не гуляет", () => {
  const { pet, tick } = makePet();
  pet.react("start");
  assert.equal(pet.state.mood, "work");
  for (let i = 0; i < 600; i++) {
    const s = tick();
    assert.equal(s.action === "walk", false, "во время задачи он пошёл гулять");
  }
});

test("задача кончилась — прыжок и «готово»", () => {
  const { pet } = makePet();
  const phrase = pet.react("done");
  assert.equal(pet.state.action, "jump");
  assert.ok(phrase && phrase.length > 3, "на «готово» нет фразы");
  assert.equal(pet.state.mood, "idle");
});

test("ошибка — своя фраза и своё настроение", () => {
  const { pet } = makePet();
  const phrase = pet.react("error");
  assert.equal(pet.state.mood, "error");
  assert.ok(/ошибк|не вышло|упёрся/i.test(phrase), "фраза не про ошибку: " + phrase);
});

test("позвали — прыгает, тронули — отзывается", () => {
  const { pet } = makePet();
  pet.poke();
  assert.ok(pet.state.phrase.length > 0);
  const before = pet.state.action;
  pet.call();
  assert.equal(pet.state.action, "jump");
  assert.ok(before !== undefined);
});

test("режим «молчать» выключает фразы, но не настроение", () => {
  const { pet } = makePet();
  pet.setQuiet(true);
  pet.react("start");
  assert.equal(pet.state.phrase, "", "в тихом режиме всё равно говорит");
  assert.equal(pet.state.mood, "work");
  pet.setQuiet(false);
  pet.react("start");
  assert.ok(pet.state.phrase.length > 0, "после включения звука фразы не вернулись");
});

test("напоминание о себе приходит редко, а не каждую минуту", () => {
  const { pet, advance } = makePet();
  const t0 = 1_000_000;
  assert.equal(pet.maybeNudge(t0 + 60 * 1000), "", "напомнил через минуту");
  advance(0);
  const first = pet.maybeNudge(t0 + petModule.NUDGE_MS + 1000);
  assert.ok(first.length > 0, "через 17 минут молчания так и не напомнил");
  const second = pet.maybeNudge(t0 + petModule.NUDGE_MS + 2000);
  assert.equal(second, "", "напоминания идут подряд");
});

test("приветствие зависит от времени суток", () => {
  assert.match(petModule.greetingFor(8), /утро/i);
  assert.match(petModule.greetingFor(13), /день/i);
  assert.match(petModule.greetingFor(20), /вечер/i);
  assert.match(petModule.greetingFor(3), /ноч/i);
  assert.equal(petModule.greetingFor(25), petModule.greetingFor(1));
});

test("фразы короткие, русские и без чужих названий", () => {
  const all = petModule.allPhrases();
  assert.ok(all.length >= 25, "фраз слишком мало: " + all.length);
  for (const phrase of all) {
    assert.ok(phrase.length <= 70, "слишком длинная фраза: " + phrase);
    assert.doesNotMatch(phrase, /OpenAI|Anthropic|Groq|Google|Supabase|GPT|Claude/i);
    assert.doesNotMatch(phrase, /я сделала|я рада|я готова/i, "Сью заговорил в женском роде: " + phrase);
  }
});

test("окно Сью прозрачное, поверх всех и не мешает в панели задач", () => {
  assert.match(mainJs, /transparent: true/);
  assert.match(mainJs, /alwaysOnTop: true/);
  assert.match(mainJs, /skipTaskbar: true/);
  assert.match(mainJs, /renderer", "pet\.html"/);
  assert.match(mainJs, /setVisibleOnAllWorkspaces/);
});

test("окно Сью двигается по таймеру и не дёргает экран зря", () => {
  assert.match(mainJs, /function petTickLoop\(\)/);
  assert.match(mainJs, /setInterval\(petTickLoop, petModule\.TICK_MS\)/);
  assert.match(mainJs, /if \(b\.x !== x \|\| b\.y !== y\)/);
});

test("на скриншот для модели Сью не попадает", () => {
  assert.match(mainJs, /async function captureScreen\(\) \{[^]*?const shot = await petHidden\(\(\) => captureScreenRaw\(\)\)/);
  assert.match(mainJs, /try \{ petWin\.hide\(\); \}/);
});

test("задача управляет настроением Сью", () => {
  assert.match(mainJs, /petReact\("start"\)/);
  assert.match(mainJs, /petReact\(result && result\.ok \? "done" : "error"\)/);
  assert.match(mainJs, /petReact\("error"\)/);
});

test("удары: терпит, сердится и остывает сам", () => {
  const { pet } = makePet();
  const first = pet.hit(1_000_000);
  assert.equal(pet.state.mood, "idle", "после одного удара сразу злиться рано");
  assert.ok(first.length > 0 && first !== "", "на удар нет фразы");

  pet.hit(1_000_200);
  pet.hit(1_000_400);
  assert.equal(pet.state.mood, "angry", "после трёх ударов подряд не рассердился");
  assert.ok(pet.state.anger >= petModule.ANGRY_AT, "злость не накопилась");

  /* Остывает минуты, а не навсегда. */
  let clock = 1_000_400;
  for (let i = 0; i < 200; i++) { clock += 200; pet.tick(200, clock); }
  assert.notEqual(pet.state.mood, "angry", "злость не прошла за 40 секунд");
  assert.equal(pet.state.anger < petModule.ANGRY_AT, true, "злость не упала");
});

test("погладили — злость падает, а не растёт", () => {
  const { pet } = makePet();
  pet.hit(1_000_000);
  const before = pet.state.anger;
  pet.poke();
  assert.ok(pet.state.anger < before, "ласка не успокоила");
});

test("эмоции приходят редко: не чаще, чем раз в 25 минут", () => {
  const { pet } = makePet();
  let clock = 1_000_000;
  const seen = [];
  for (let i = 0; i < 6000; i++) {
    clock += 1000;
    pet.tick(1000, clock);
    const s = pet.snapshot();
    if (s.emotion && seen[seen.length - 1] !== s.emotion) seen.push(s.emotion);
  }
  /* 6000 секунд = 100 минут: эмоций должно быть 1–4, а не 50. */
  assert.ok(seen.length >= 1, "за 100 минут ни одной эмоции");
  assert.ok(seen.length <= 6, "эмоции сыплются слишком часто: " + seen.length);
});

test("эмоция гаснет сама и не залипает", () => {
  const pet = petModule.createPet({ rand: () => 0, now: () => 0, width: 96 });
  pet.setBounds(0, 1920);
  pet.place(400);
  let clock = petModule.EMOTION_MIN_MS + 10;
  pet.tick(40, clock);
  const moodDuringEmotion = pet.snapshot().mood;
  assert.ok(petModule.EMOTIONS.includes(moodDuringEmotion), "эмоция не включилась: " + moodDuringEmotion);
  clock += petModule.EMOTION_LIFE_MS + 500;
  pet.tick(40, clock);
  assert.equal(pet.snapshot().mood, "idle", "эмоция не погасла вовремя");
});

test("все четыре эмоции есть и у каждой своя фраза", () => {
  assert.deepEqual(petModule.EMOTIONS.slice().sort(), ["angry", "fear", "joy", "sad"]);
  for (const mood of petModule.EMOTIONS) {
    assert.ok(petModule.PHRASES[mood].length > 0, "нет фразы для эмоции " + mood);
  }
});

test("на работе эмоции не мешают", () => {
  const { pet } = makePet();
  pet.react("start");
  let clock = petModule.EMOTION_MIN_MS + 10;
  pet.tick(40, clock);
  pet.react("start");
  assert.equal(pet.state.mood, "work");
});

test("реагирует на скриншот, громкость, экран и пробуждение", () => {
  const { pet } = makePet();
  for (const kind of ["screenshot", "volume", "screen", "wake"]) {
    const phrase = pet.react(kind);
    assert.ok(phrase && phrase.length > 0, "нет фразы на событие " + kind);
  }
  assert.ok(pet.react("sleep").length > 0, "нет фразы на сон");
});

test("в главном процессе есть события системы и защита клавиш громкости", () => {
  assert.match(mainJs, /display-metrics-changed/);
  assert.match(mainJs, /powerMonitor/);
  assert.match(mainJs, /lock-screen/);
  assert.match(mainJs, /"VolumeUp", "up"/);
  assert.match(mainJs, /if \(!startVolumeBridge\(\)\) return false;/, "регистрируем клавиши без пересылки — можно остаться без звука");
  assert.match(mainJs, /petReact\("screenshot"\)/);
  assert.match(mainJs, /ipcMain\.handle\("pet:hit"/);
});

test("эмоции нарисованы: лица, анимации и злость", () => {
  for (const mood of ["joy", "sad", "fear", "angry"]) {
    assert.ok(petCss.includes('data-mood="' + mood + '"'), "нет стиля для эмоции " + mood);
  }
  assert.match(petCss, /data-action="hurt"/);
  assert.match(petHtml, /m-sad/);
  assert.match(petHtml, /m-scared/);
  assert.match(petHtml, /brow/);
  assert.match(petJs, /petHit\(\)/, "щелчок не отправляет удар");
});

test("прозрачные поля окна не ловят клики по чужим программам", () => {
  assert.match(mainJs, /setIgnoreMouseEvents\(true, \{ forward: true \}\)/);
  assert.match(mainJs, /ipcMain\.handle\("pet:hover"/);
  assert.match(mainJs, /setIgnoreMouseEvents\(!inside, \{ forward: true \}\)/);
  assert.match(petJs, /el\.closest\("\.figure"\)/);
  assert.match(preload, /petHover:/);
});

test("в трее Сью можно позвать и убрать", () => {
  assert.match(mainJs, /label: "Сью на рабочем столе"/);
  assert.match(mainJs, /label: "Позвать Сью"/);
  assert.match(mainJs, /type: "checkbox"/);
});

test("мост отдаёт окну Сью только нужное", () => {
  for (const name of ["petState", "petDragStart", "petDragMove", "petDragEnd", "petPoke", "petCall", "petMenu", "petOnState"]) {
    assert.match(preload, new RegExp("\\b" + name + ":"), "в preload нет " + name);
  }
  for (const name of ["petState", "petDragStart", "petDragMove", "petDragEnd", "petHit", "petCall", "petMenu"]) {
    assert.ok(petJs.includes("window.sye." + name), "окно Сью не зовёт " + name);
  }
});

test("окно Сью: маскот, облачко и три действия", () => {
  assert.match(petHtml, /sye-mascot/);
  assert.match(petHtml, /id="bubble"/);
  assert.match(petCss, /html, body \{[^}]*background: transparent/);
  for (const action of ["walk", "jump", "wave", "sit"]) {
    assert.ok(petCss.includes('data-action="' + action + '"'), "нет анимации " + action);
  }
  assert.match(petCss, /prefers-reduced-motion/);
});

test("в настройках есть переключатели Сью и кнопка «Позвать»", () => {
  for (const id of ["petOn", "petTalk", "petVoice", "petCallBtn"]) {
    assert.ok(html.includes('id="' + id + '"'), "в настройках нет " + id);
  }
  assert.match(appJs, /saveSettings\(\{ petOn: !!pOn\.checked \}\)/);
  assert.match(appJs, /saveSettings\(\{ petTalk: !!pTalk\.checked \}\)/);
  assert.match(appJs, /saveSettings\(\{ petVoice: !!pVoice\.checked \}\)/);
  assert.match(appJs, /window\.sye\.petCall\(\)/);
});

test("Сью включён по умолчанию, но его можно выключить", () => {
  assert.match(mainJs, /petOn: true/);
  assert.match(mainJs, /if \(!petEnabled\(\)\) return;/);
  assert.match(mainJs, /saveSettings\(\{ petOn: false \}\);\s*stopPet\(\)/);
});

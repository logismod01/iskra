/**
 * Сью на рабочем столе — поведение, а не картинка.
 *
 * Здесь только логика: где он стоит, что делает, что говорит. Окно, движение
 * по экрану и голос живут в главном процессе (main.js) и в renderer/pet.js.
 * Так поведение можно проверить тестами без запуска Electron.
 *
 * Правила характера:
 *   - Сью мужского рода: «готов», «посмотрел», «упёрся».
 *   - Фразы короткие: их читают краем глаза, а не вчитываются.
 *   - Никакой навязчивости: молчит, пока его не тронули, и напоминает о себе редко.
 *   - Ничего не обещает за человека: «сделал», а не «сейчас всё будет идеально».
 */

"use strict";

const TICK_MS = 40;                 // как часто двигаем окно (25 раз в секунду)
const WALK_SPEED = 26;              // px/сек — он топает, а не бегает
const JUMP_MS = 620;
const WAVE_MS = 1500;
const PHRASE_MS = 5200;             // сколько висит облачко с фразой
const NUDGE_MS = 17 * 60 * 1000;    // столько молчания — и можно напомнить о себе

const PHRASES = {
  hello: [
    "Я на месте. Что делаем?",
    "Сью на связи.",
    "Готов работать."
  ],
  idle: [
    "Стою. Могу помочь.",
    "Я тут, если что.",
    "Работает — не трогаю.",
    "Готов к задаче."
  ],
  walk: [
    "Похожу немного.",
    "Разомну лапы.",
    "Прогуливаюсь."
  ],
  work: [
    "Думаю…",
    "Смотрю файлы.",
    "Работаю. Не мешай.",
    "Читаю код."
  ],
  done: [
    "Готово. Проверь сам тоже.",
    "Сделал. Смотри результат.",
    "Всё, готово."
  ],
  error: [
    "Упёрся в ошибку. Сейчас гляну.",
    "Не вышло с первого раза.",
    "Ошибка. Разбираюсь."
  ],
  nudge: [
    "Сидишь долго. Попей воды.",
    "Глазам нужен перерыв: 20 секунд в окно.",
    "Может, сохранить и передохнуть?",
    "Ты сегодня хоть раз вставал?"
  ],
  click: [
    "Ага?",
    "Я тут.",
    "Слушаю.",
    "Прыгаю."
  ],
  drag: [
    "Куда несёшь?",
    "Я не против.",
    "Ставь, где удобно."
  ]
};

const GREETINGS = [
  { from: 5, to: 11, text: "Доброе утро. Что делаем?" },
  { from: 11, to: 17, text: "Добрый день. Готов работать." },
  { from: 17, to: 23, text: "Добрый вечер. Я на месте." },
  { from: 23, to: 5, text: "Ночью тоже работаем? Я не сплю." }
];

function greetingFor(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const found = GREETINGS.find((g) => (g.from < g.to ? h >= g.from && h < g.to : h >= g.from || h < g.to));
  return (found || GREETINGS[1]).text;
}

/** Случайное число в диапазоне, включительно. */
function between(rand, min, max) {
  return min + rand() * (max - min);
}

function pick(list, rand) {
  if (!list || !list.length) return "";
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/**
 * Состояние Сью.
 *
 * opts:
 *   rand   — источник случайности (для тестов подменяется)
 *   now    — часы
 *   width  — ширина окна на экране
 *   quiet  — не говорить (облачко и голос выключены)
 *   hour   — текущий час для приветствия
 */
function createPet(opts) {
  const o = opts || {};
  const rand = o.rand || Math.random;
  const now = o.now || (() => Date.now());
  const quiet = o.quiet === true;
  const width = Math.max(40, Number(o.width) || 96);

  const pet = {
    width,
    minX: 0,
    maxX: 1200,
    x: 0,
    dir: -1,
    facing: -1,
    mood: "idle",          // idle | work | error
    action: "stand",       // stand | walk | jump | wave | sit
    phrase: "",
    phraseUntil: 0,
    quiet,
    _until: 0,
    _lastSay: 0,
    _lastActivity: now(),
    lastGreeting: 0
  };

  function say(scene, opts2) {
    if (pet.quiet) return "";
    const list = PHRASES[scene] || [];
    const text = (opts2 && opts2.text) || pick(list, rand);
    if (!text) return "";
    pet.phrase = text;
    pet.phraseUntil = now() + PHRASE_MS;
    pet._lastSay = now();
    return text;
  }

  function setAction(action, ms) {
    pet.action = action;
    pet._until = now() + ms;
  }

  function stopAndStand() {
    pet.action = "stand";
    pet._until = now() + between(rand, 3000, 8000);
  }

  function startWalk() {
    pet.dir = rand() < 0.5 ? -1 : 1;
    pet.facing = pet.dir;
    /* У края разворачиваемся сразу: иначе он «топчется» в стену. */
    if (pet.x <= pet.minX + 1) pet.dir = 1;
    if (pet.x + pet.width >= pet.maxX - 1) pet.dir = -1;
    pet.facing = pet.dir;
    setAction("walk", between(rand, 2200, 6000));
    if (!quiet && rand() < 0.5) say("walk");
  }

  function plan() {
    /* На работе он не гуляет: стоит на месте и ждёт результата. */
    if (pet.mood === "work") {
      setAction("stand", between(rand, 4000, 7000));
      return;
    }
    const r = rand();
    if (r < 0.45) return startWalk();
    if (r < 0.62) return setAction("sit", between(rand, 5000, 11000));
    if (r < 0.80) return setAction("wave", WAVE_MS);
    return setAction("jump", JUMP_MS);
  }

  /** Рабочая область экрана: куда можно ходить. */
  function setBounds(minX, maxX) {
    pet.minX = Math.round(Number(minX) || 0);
    pet.maxX = Math.max(pet.minX + width, Math.round(Number(maxX) || 0));
    pet.x = Math.min(Math.max(pet.x, pet.minX), pet.maxX - width);
    return pet;
  }

  function place(x) {
    pet.x = Math.min(Math.max(Number(x) || 0, pet.minX), pet.maxX - width);
    return pet;
  }

  /** Один шаг времени. Возвращает снимок состояния. */
  function tick(dtMs, at) {
    const t = Number.isFinite(at) ? at : now();
    const dt = Math.max(0, Math.min(400, Number(dtMs) || TICK_MS));

    if (pet.phrase && t >= pet.phraseUntil) pet.phrase = "";

    if (pet.action === "walk") {
      pet.x += pet.dir * (WALK_SPEED * dt) / 1000;
      const right = pet.maxX - width;
      if (pet.x <= pet.minX) {
        pet.x = pet.minX;
        pet.dir = 1;
        pet.facing = 1;
      } else if (pet.x >= right) {
        pet.x = right;
        pet.dir = -1;
        pet.facing = -1;
      }
      if (t >= pet._until) stopAndStand();
    } else if (t >= pet._until) {
      plan();
    }
    return snapshot();
  }

  function snapshot() {
    return {
      x: Math.round(pet.x),
      y: 0,
      action: pet.action,
      mood: pet.mood,
      facing: pet.facing,
      phrase: pet.phrase,
      quiet: pet.quiet
    };
  }

  /**
   * Событие от задачи: start | thinking | done | error | idle.
   * Возвращает фразу, если она есть.
   */
  function react(kind) {
    pet._lastActivity = now();
    if (kind === "start" || kind === "thinking") {
      pet.mood = "work";
      pet.action = "stand";
      pet._until = now() + 8000;
      return say("work");
    }
    if (kind === "done") {
      pet.mood = "idle";
      pet.action = "jump";
      pet._until = now() + JUMP_MS;
      return say("done");
    }
    if (kind === "error") {
      pet.mood = "error";
      pet.action = "stand";
      pet._until = now() + 6000;
      return say("error");
    }
    if (kind === "idle") {
      pet.mood = "idle";
      return "";
    }
    return "";
  }

  /** Позвали: прыгает и отзывается. */
  function call() {
    pet._lastActivity = now();
    pet.action = "jump";
    pet._until = now() + JUMP_MS;
    return say("click");
  }

  /** Потрогали мышкой — без прыжка, просто отзывается. */
  function poke() {
    pet._lastActivity = now();
    return say("click");
  }

  function drag() {
    return say("drag");
  }

  /**
   * Если человек давно ничего не делал с агентом — один раз напомнить о себе.
   * Редко: раз в 17 минут, и только если он не «в работе».
   */
  function maybeNudge(at) {
    const t = Number.isFinite(at) ? at : now();
    if (pet.quiet || pet.mood === "work") return "";
    if (t - pet._lastActivity < NUDGE_MS) return "";
    if (t - pet._lastSay < NUDGE_MS) return "";
    pet._lastActivity = t;
    return say("nudge");
  }

  function greet(hour) {
    const t = greetingFor(hour);
    pet.lastGreeting = now();
    return say("hello", { text: t });
  }

  function setMood(mood) {
    if (["idle", "work", "error"].includes(mood)) pet.mood = mood;
    return pet.mood;
  }

  function setQuiet(on) {
    pet.quiet = on === true;
    if (pet.quiet) {
      pet.phrase = "";
      pet.phraseUntil = 0;
    }
    return pet.quiet;
  }

  return {
    state: pet,
    snapshot,
    tick,
    setBounds,
    place,
    setAction,
    startWalk,
    plan,
    say,
    react,
    call,
    poke,
    drag,
    maybeNudge,
    greet,
    setMood,
    setQuiet,
    get quiet() { return pet.quiet; }
  };
}

/** Все фразы списком — для проверок «нет ли чужих названий» и для меню. */
function allPhrases() {
  const out = [];
  for (const list of Object.values(PHRASES)) for (const p of list) out.push(p);
  for (const g of GREETINGS) out.push(g.text);
  return out;
}

module.exports = {
  createPet,
  greetingFor,
  allPhrases,
  PHRASES,
  GREETINGS,
  TICK_MS,
  WALK_SPEED,
  JUMP_MS,
  WAVE_MS,
  PHRASE_MS,
  NUDGE_MS
};

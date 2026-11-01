/**
 * Сью на рабочем столе — поведение, а не картинка.
 *
 * Здесь только логика: где он стоит, что делает, что чувствует и что говорит.
 * Окно, движение по экрану и голос живут в главном процессе (main.js) и в renderer/pet.js.
 * Так поведение можно проверить тестами без запуска Electron.
 *
 * Правила характера:
 *   - Сью мужского рода: «готов», «посмотрел», «упёрся».
 *   - Фразы короткие: их читают краем глаза, а не вчитываются.
 *   - Никакой навязчивости: молчит, пока его не тронули, и напоминает о себе редко.
 *   - Эмоции (радость, грусть, страх, злость) — просто настроение, они ничего не значат.
 *   - Бить можно, но он это запоминает: несколько ударов подряд — и он сердится ненадолго.
 */

"use strict";

const TICK_MS = 40;                 // как часто двигаем окно (25 раз в секунду)
const WALK_SPEED = 26;              // px/сек — он топает, а не бегает
const JUMP_MS = 620;
const WAVE_MS = 1500;
const HURT_MS = 700;
const PHRASE_MS = 5200;             // сколько висит облачко с фразой
const NUDGE_MS = 17 * 60 * 1000;    // столько молчания — и можно напомнить о себе

/* Эмоции: просто настроение, без причины. Приходят редко и уходят сами. */
const EMOTIONS = ["joy", "sad", "fear", "angry"];
const EMOTION_MIN_MS = 25 * 60 * 1000;   // не чаще, чем раз в 25 минут
const EMOTION_MAX_MS = 55 * 60 * 1000;
const EMOTION_LIFE_MS = 45 * 1000;       // столько эмоция держится, потом гаснет

/* Удары. Каждый удар — плюс к раздражению, раздражение остывает само. */
const HIT_ANGER = 0.34;             // сколько добавляет один удар
const ANGER_DECAY_PER_S = 0.055;    // как быстро остывает
const ANGRY_AT = 0.75;              // с этого порога он по-настоящему сердится
const ANGRY_MS = 15000;             // и злится недолго
const HIT_MEMORY_MS = 12000;        // удары в этом окне считаются «подряд»

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
  ],
  /* Настроение — без повода */
  joy: [
    "Хороший день. Просто так.",
    "Мне весело, и всё.",
    "Ура, что ли."
  ],
  sad: [
    "Что-то грустно. Пройдёт.",
    "Взгрустнулось. Не обращай внимания.",
    "Эх."
  ],
  fear: [
    "Мне что-то страшновато.",
    "Ой. Просто ой.",
    "Кто там шуршит?"
  ],
  angry: [
    "Я не в настроении.",
    "Не сейчас, ладно?",
    "Хм. Злюсь."
  ],
  /* Удары */
  hurt: [
    "Ай!",
    "За что?",
    "Больновато, вообще-то.",
    "Ты чего?"
  ],
  annoyed: [
    "Эй, полегче.",
    "Ещё раз — и я обижусь.",
    "Прекрати, я работаю."
  ],
  angryAtHit: [
    "Хватит меня бить.",
    "Я не груша.",
    "Ещё один раз — и я уйду.",
    "Серьёзно, прекрати."
  ],
  calmDown: [
    "Всё, я остыл.",
    "Ладно, мир.",
    "Остываю. Больше не бей."
  ],
  /* Системные события */
  screenshot: [
    "Смотрю экран.",
    "Снимок делаю. Секунду.",
    "Экран прочитал."
  ],
  volume: [
    "Громче? Слышу.",
    "Тише стало.",
    "Звук подвернул."
  ],
  screen: [
    "Экран поменялся.",
    "О, новый размер.",
    "Привыкаю к экрану."
  ],
  wake: [
    "С возвращением.",
    "О, ты тут.",
    "Проснулся вместе с тобой."
  ],
  sleep: [
    "Ушёл в сон. Я рядом.",
    "Пока тебя нет — постою."
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
    mood: "idle",          // idle | work | error | joy | sad | fear | angry
    action: "stand",       // stand | walk | jump | wave | sit | hurt | tremble
    phrase: "",
    phraseUntil: 0,
    quiet,
    anger: 0,              // 0..1 — сколько он уже натерпелся
    hits: 0,               // удары в текущем окне
    emotion: "",           // текущая случайная эмоция
    emotionUntil: 0,
    nextEmotionAt: now() + EMOTION_MIN_MS,
    _until: 0,
    _lastSay: 0,
    _lastHit: 0,
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
    /* У края разворачиваемся сразу: иначе он «топчется» в стену. */
    if (pet.x <= pet.minX + 1) pet.dir = 1;
    if (pet.x + pet.width >= pet.maxX - 1) pet.dir = -1;
    pet.facing = pet.dir;
    setAction("walk", between(rand, 2200, 6000));
    if (!quiet && rand() < 0.5) say("walk");
  }

  /* Гулять он не идёт, если ему не по себе: на работе, в страхе или в злости. */
  function canWander() {
    return pet.mood !== "work" && pet.mood !== "fear" && pet.mood !== "angry";
  }

  function plan() {
    if (!canWander()) {
      setAction(pet.mood === "sad" ? "sit" : "stand", between(rand, 4000, 7000));
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

  function moodIsEmotion() {
    return EMOTIONS.includes(pet.mood);
  }

  /** Погасить случайную эмоцию, когда её время вышло. */
  function expireEmotion(t) {
    if (pet.mood === "angry" && pet.anger >= ANGRY_AT) return;   // это не эмоция, а обида
    if (moodIsEmotion() && t >= pet.emotionUntil) {
      pet.mood = "idle";
      pet.emotion = "";
      if (pet.action === "tremble" || pet.action === "sit") stopAndStand();
    }
  }

  /** Один шаг времени. Возвращает снимок состояния. */
  function tick(dtMs, at) {
    const t = Number.isFinite(at) ? at : now();
    const dt = Math.max(0, Math.min(400, Number(dtMs) || TICK_MS));

    if (pet.phrase && t >= pet.phraseUntil) pet.phrase = "";

    /* Раздражение остывает само, и он об этом говорит. */
    if (pet.anger > 0) {
      pet.anger = Math.max(0, pet.anger - (ANGER_DECAY_PER_S * dt) / 1000);
      if (pet.mood === "angry" && pet.anger < ANGRY_AT && t >= (pet._angryUntil || 0)) {
        calmDown();
      }
    }
    if (pet.hits > 0 && t - pet._lastHit > HIT_MEMORY_MS) pet.hits = 0;

    expireEmotion(t);
    maybeEmotion(t);

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
      if (!canWander()) stopAndStand();
      else if (t >= pet._until) stopAndStand();
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
      anger: Math.round(pet.anger * 100) / 100,
      emotion: pet.emotion,
      quiet: pet.quiet
    };
  }

  /**
   * Случайная эмоция: радость, грусть, страх или злость. Ничего не значит,
   * приходит не чаще раза в 25 минут и живёт меньше минуты.
   */
  function maybeEmotion(t) {
    const at = Number.isFinite(t) ? t : now();
    if (at < pet.nextEmotionAt) return "";
    pet.nextEmotionAt = at + between(rand, EMOTION_MIN_MS, EMOTION_MAX_MS);
    if (pet.mood === "work" || pet.anger >= ANGRY_AT) return "";   // не мешаем работе
    const mood = pick(EMOTIONS, rand);
    pet.mood = mood;
    pet.emotion = mood;
    pet.emotionUntil = at + EMOTION_LIFE_MS;
    if (mood === "fear") setAction("tremble", EMOTION_LIFE_MS);
    else if (mood === "sad") setAction("sit", EMOTION_LIFE_MS);
    else if (mood === "joy") setAction("jump", JUMP_MS);
    else setAction("stand", EMOTION_LIFE_MS);
    return say(mood);
  }

  /**
   * Удар по Сью — левая кнопка мыши. Он терпит, злится, потом остывает.
   * Возвращает фразу.
   */
  function hit(at) {
    const t = Number.isFinite(at) ? at : now();
    pet._lastActivity = t;
    pet._lastHit = t;
    pet.hits += 1;
    pet.anger = Math.min(1, pet.anger + HIT_ANGER);

    /* Совсем рассердился — злится, но недолго. */
    if (pet.anger >= ANGRY_AT) {
      pet.mood = "angry";
      pet.emotion = "";
      pet.emotionUntil = t + ANGRY_MS;
      pet._angryUntil = t + 4000;      // минимум четыре секунды злости
      setAction("stand", ANGRY_MS);
      return say("angryAtHit");
    }

    if (pet.hits >= 3) {
      setAction("hurt", HURT_MS);
      return say("annoyed");
    }

    setAction("hurt", HURT_MS);
    return say("hurt");
  }

  /** Остыл ли он: вызывается из tick, но можно и вручную. */
  function calmDown() {
    if (pet.mood !== "angry") return "";
    pet.mood = "idle";
    pet.anger = Math.min(pet.anger, 0.3);
    pet.hits = 0;
    stopAndStand();
    return say("calmDown");
  }

  /**
   * Событие от задачи или системы: start | thinking | done | error | idle |
   * screenshot | volume | screen | lock | unlock | suspend | resume.
   */
  function react(kind) {
    pet._lastActivity = now();
    if (kind === "start" || kind === "thinking") {
      pet.mood = "work";
      pet.emotion = "";
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
    if (kind === "screenshot") {
      setAction("wave", WAVE_MS);
      return say("screenshot");
    }
    if (kind === "volume") {
      setAction("jump", JUMP_MS);
      return say("volume");
    }
    if (kind === "screen") {
      setAction("wave", WAVE_MS);
      return say("screen");
    }
    if (kind === "sleep" || kind === "suspend" || kind === "lock") return say("sleep");
    if (kind === "wake" || kind === "resume" || kind === "unlock") return say("wake");
    return "";
  }

  /** Позвали: прыгает и отзывается. */
  function call() {
    pet._lastActivity = now();
    pet.action = "jump";
    pet._until = now() + JUMP_MS;
    return say("click");
  }

  /** Погладили мышкой — отзывается, но не прыгает. */
  function poke() {
    pet._lastActivity = now();
    pet.hits = Math.max(0, pet.hits - 1);
    pet.anger = Math.max(0, pet.anger - HIT_ANGER / 2);
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
    if (pet.quiet || pet.mood === "work" || pet.mood === "angry") return "";
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
    if (["idle", "work", "error"].concat(EMOTIONS).includes(mood)) pet.mood = mood;
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
    hit,
    calmDown,
    drag,
    maybeEmotion,
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
  EMOTIONS,
  TICK_MS,
  WALK_SPEED,
  JUMP_MS,
  WAVE_MS,
  HURT_MS,
  PHRASE_MS,
  NUDGE_MS,
  EMOTION_MIN_MS,
  EMOTION_MAX_MS,
  EMOTION_LIFE_MS,
  HIT_ANGER,
  ANGRY_AT,
  ANGRY_MS
};

/**
 * Память Sye между задачами.
 *
 * Зачем: у агента не было памяти вообще. Каждая задача начиналась с чистого
 * листа, и человек по десять раз объяснял одно и то же: «это проект на Vite»,
 * «тесты запускаются через npm test». Хуже — на вопрос «что ты вчера делал
 * в этой папке» он честно отвечал «не знаю», хотя всё было записано.
 *
 * Что помним: по каждой рабочей папке — последние задачи, их итог и файлы,
 * которые трогали. Память привязана к папке, поэтому два проекта не путаются.
 *
 * Чего не делаем: не храним содержимое файлов и не отправляем память на сервер.
 * Только то, что человек сам написал в задаче, и итог, который агент выдал.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PER_FOLDER = 30;      // сколько задач помним по одной папке
const IN_PROMPT = 5;        // сколько подсказываем модели
const FILE = "sye-memory.json";

let file = "";
let data = { folders: {} };  // { [путь]: [ {task, summary, files, at, ok} ] }

function key(folder) {
  return String(folder || "").trim().replace(/[\\/]+$/, "").toLowerCase() || "(без папки)";
}

/** Куда писать память. Без папки память просто живёт в памяти процесса. */
function setDir(dir) {
  if (!dir) return "";
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, FILE);
    load();
  } catch (e) {
    file = "";
  }
  return file;
}

function load() {
  if (!file) return;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw && raw.folders && typeof raw.folders === "object") data = raw;
  } catch (e) {
    /* первый запуск или битый файл — начинаем с пустой памяти */
  }
}

function save() {
  if (!file) return false;
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 0), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

/** Обрезает длинные куски: в памяти нужен смысл, а не весь лог. */
function cut(text, max) {
  const s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Запомнить задачу. Повторная запись с тем же id заменяет старую. */
function remember(folder, entry) {
  const e = entry || {};
  const task = cut(e.task, 300);
  if (!task) return null;
  const k = key(folder);
  const list = Array.isArray(data.folders[k]) ? data.folders[k] : [];
  const item = {
    id: String(e.id || "m" + Date.now().toString(36)),
    task,
    summary: cut(e.summary, 400),
    files: Array.isArray(e.files) ? e.files.map((f) => cut(f, 120)).slice(0, 12) : [],
    ok: e.ok !== false,
    at: Number(e.at) || Date.now()
  };
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
  /* Свежее — сверху. Сортируем по времени, а не по порядку вставки:
     задача, записанная позже, может относиться к более раннему времени. */
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  data.folders[k] = list.slice(0, PER_FOLDER);
  save();
  return item;
}

/** Что делал в этой папке — от свежего к старому. */
function recent(folder, limit) {
  const list = data.folders[key(folder)] || [];
  return list.slice(0, Math.max(1, limit || PER_FOLDER));
}

function forget(folder) {
  const k = key(folder);
  delete data.folders[k];
  save();
  return true;
}

function forgetAll() {
  data = { folders: {} };
  save();
  return true;
}

/** Сколько задач помним и по скольким папкам. */
function stats() {
  const folders = Object.keys(data.folders);
  const tasks = folders.reduce((n, k) => n + (data.folders[k] || []).length, 0);
  return { folders: folders.length, tasks };
}

function when(ts) {
  const d = new Date(ts);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (same) return "сегодня в " + hm;
  const y = new Date(today.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return "вчера в " + hm;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

/**
 * Блок для системного промпта: что уже делали в этой папке.
 * Пусто, если папка новая — тогда модель не выдумывает «историю».
 */
function promptBlock(folder, maxChars) {
  const list = recent(folder, IN_PROMPT);
  if (!list.length) return "";
  const lines = ["ЧТО УЖЕ ДЕЛАЛИ В ЭТОЙ ПАПКЕ (твоя память, не выдумывай другого):"];
  for (const it of list) {
    const mark = it.ok ? "" : " [с ошибкой]";
    lines.push("- " + when(it.at) + ": " + it.task + mark +
      (it.summary ? " → " + it.summary : "") +
      (it.files.length ? " (файлы: " + it.files.slice(0, 5).join(", ") + ")" : ""));
  }
  let text = lines.join("\n");
  const limit = maxChars || 900;
  if (text.length > limit) text = text.slice(0, limit) + "…";
  return text;
}

/**
 * Похожая задача из прошлого — для «повтори вчерашнее».
 * Ищем по словам; если ничего не похоже, отдаём самую свежую.
 */
function similar(folder, query) {
  const list = recent(folder, PER_FOLDER);
  if (!list.length) return null;
  const words = String(query || "").toLowerCase().replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 4);
  if (!words.length) return list[0];
  let best = null;
  let bestScore = 0;
  for (const it of list) {
    const hay = (it.task + " " + it.summary).toLowerCase().replace(/ё/g, "е");
    let score = 0;
    for (const w of words) if (hay.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore > 0 ? best : list[0];
}

/** Только для тестов: начать с чистой памяти. */
function reset() {
  data = { folders: {} };
  file = "";
}

module.exports = {
  FILE,
  setDir, remember, recent, forget, forgetAll, stats,
  promptBlock, similar, when, key, reset,
  _data: () => data
};

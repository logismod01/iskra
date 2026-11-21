/**
 * Общая база знаний — та же, что у сайта Искры.
 *
 * Зачем: владелец учит тему один раз на сайте и публикует её для всех.
 * Sye должен знать ровно то же самое, иначе получается два разных ассистента.
 *
 * Как работает:
 *   - темы лежат в Supabase, читать их может любой (публичный ключ ниже);
 *   - один раз за сеанс агент забирает список и держит в памяти;
 *   - копия лежит файлом рядом с настройками: сервера нет — работаем по ней;
 *   - ошибки сети и отсутствие таблицы ничего не ломают, просто знаний меньше.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

/* Публичный ключ проекта: он и так лежит в коде сайта, секретов тут нет.
   Писать через него нельзя — публикация только у владельца и по паролю. */
const CONFIG = {
  url: "https://txrcessykslejwkeyfdb.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4cmNlc3N5a3NsZWp3a2V5ZmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNTExNjgsImV4cCI6MjEwODgyNzE2OH0.RJFcSbT8NRYt95NW29YKjiG0d5ETb7WItntRzOmRahg",
  table: "iskra_shared_kb"
};

const CACHE_FILE = "shared-kb.json";
/* Офлайн-пакет: те же темы, что сайт держит внутри index.html.
   Он лежит рядом с агентом и работает, когда сети нет вообще —
   ни первый запуск, ни сохранённой копии ещё нет. */
const PACK_FILE = "kb-pack.json";
const TTL = 6 * 3600e3;
/* Сколько тем держим в памяти. Раньше стояло 500 — и агент видел меньше
   половины базы (в ней уже 1300+ тем), потому что запрос шёл одной страницей.
   Теперь страницы по 1000 и потолок 30000: в базе уже больше 12000 тем,
   а волна новых карточек идёт к 23000. */
/* Потолок поднят: в базе уже 43 000+ тем, а стоял 30 000 — агент
   не видел последнюю волну и отвечал «такой темы нет» на то,
   что в базе есть. 60 000 даёт запас на следующую волну. */
const MAX_ITEMS = 60000;
const PAGE_SIZE = 1000;

let items = [];
let loadedAt = 0;
let lastError = "";

function norm(text) {
  return String(text == null ? "" : text).toLowerCase().replace(/ё/g, "е");
}

/** Аккуратно принимает ответ сервера: строки без темы или текста отбрасываем. */
function parseRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      topic: String((r && (r.topic || r.title)) || "").trim(),
      text: String((r && (r.body || r.text)) || "").trim(),
      tags: String((r && r.tags) || "").trim(),
      source: String((r && r.source) || "").trim()
    }))
    .filter((x) => x.topic.length >= 2 && x.text.length >= 20)
    .slice(0, MAX_ITEMS);
}

function setItems(list) {
  items = parseRows(list);
  loadedAt = Date.now();
  return items;
}

function list() {
  return items.slice();
}

function isEmpty() {
  return items.length === 0;
}

function error() {
  return lastError;
}

/** Сколько прошло с последней удачной загрузки. */
function age() {
  return loadedAt ? Date.now() - loadedAt : Infinity;
}

function isFresh(ttl) {
  return age() < (ttl || TTL);
}

/**
 * Забрать список с сервера.
 * @param {{fetchImpl?:Function, force?:boolean, timeoutMs?:number}} [opts]
 * @returns {Promise<Array>} карточки (при ошибке — то, что уже было в памяти)
 */
async function refresh(opts) {
  const o = opts || {};
  if (!o.force && !isEmpty() && isFresh()) return list();
  const doFetch = o.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return list();

  const base =
    String(CONFIG.url).replace(/\/+$/, "") +
    "/rest/v1/" + CONFIG.table +
    "?select=topic,body,tags,source,updated_at&active=eq.true&order=topic_norm.asc";

  const got = [];
  try {
    for (let page = 0; page * PAGE_SIZE < MAX_ITEMS; page++) {
      const url = base + "&limit=" + PAGE_SIZE + "&offset=" + page * PAGE_SIZE;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), o.timeoutMs || 8000);
      let res;
      try {
        res = await doFetch(url, {
          headers: {
            apikey: CONFIG.anonKey,
            Authorization: "Bearer " + CONFIG.anonKey,
            Accept: "application/json",
            /* считаем точное число строк — иначе не понять, всё ли забрали */
            Prefer: "count=exact"
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res || !res.ok) {
        lastError = "сервер ответил " + (res && res.status);
        /* первая страница не пришла — оставляем что было;
           остальные — отдаём то, что успели собрать */
        if (!got.length) return list();
        break;
      }
      const json = await res.json();
      const rows = parseRows(json);
      if (!rows.length) break;
      got.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    lastError = "";
    return setItems(got);
  } catch (e) {
    lastError = (e && e.message) || "нет связи";
    return got.length ? setItems(got) : list();
  }
}

/** Читает копию с диска. Файла нет — просто пусто, без исключения. */
async function loadCache(dir) {
  if (!dir) return list();
  try {
    const raw = await fs.readFile(path.join(dir, CACHE_FILE), "utf8");
    const saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.items)) {
      items = parseRows(saved.items);
      loadedAt = Number(saved.at) || 0;
    }
  } catch (e) {
    /* первый запуск или битый файл — не беда */
  }
  return list();
}

/** Сохраняет копию: без сети агент всё равно знает темы. */
async function saveCache(dir) {
  if (!dir || !items.length) return false;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, CACHE_FILE),
      JSON.stringify({ at: loadedAt || Date.now(), items }, null, 0),
      "utf8"
    );
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Офлайн-пакет: читает JSON вида { items: [{ topic, text, tags }] }.
 * Нужен на самом первом запуске без интернета — иначе агент не знает
 * ни одной темы, хотя они уже лежат в его же папке.
 */
async function loadPack(filePath) {
  if (!filePath) return list();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.items) && saved.items.length) {
      items = parseRows(saved.items);
      loadedAt = Date.now();
    }
  } catch (e) {
    /* файла нет или он битый — работаем дальше без него */
  }
  return list();
}

/** Старт приложения: сначала копия с диска (или офлайн-пакет), потом тихое обновление. */
async function boot(dir, opts) {
  const o = opts || {};
  await loadCache(dir);
  /* Копии нет — берём встроенный пакет, чтобы знания были сразу. */
  if (isEmpty() && o.packPath) await loadPack(o.packPath);
  const fresh = await refresh(o);
  if (fresh.length) await saveCache(dir);
  return fresh;
}

/**
 * Поиск по общей базе: совпадение темы весит больше совпадения в тексте.
 * Поиск по словам — так же, как в остальной справке: без «магии», зато предсказуемо.
 */
function search(query, limit) {
  const hay = norm(query).trim();
  if (!hay || !items.length) return [];
  const words = hay.split(/[^a-zа-я0-9+#.]+/).filter((w) => w.length >= 3);
  const scored = [];
  for (const it of items) {
    const title = norm(it.topic);
    const body = norm(it.text);
    const tags = norm(it.tags);
    let score = 0;
    if (title === hay) score += 20;
    else if (title.includes(hay)) score += 10;
    for (const w of words) {
      if (title.includes(w)) score += 5;
      else if (tags.includes(w)) score += 3;
      else if (body.includes(w)) score += 1;
    }
    if (score > 0) scored.push({ item: it, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit || 3)).map((x) => x.item);
}

/**
 * Пробел: вопрос, на который в базе нет темы.
 * Отдаём сам вопрос (или пустую строку, если тема нашлась).
 * Только для настоящих вопросов — очень короткие реплики пропускаем.
 */
/* Слова-просьбы: они есть почти в любом вопросе («расскажи», «объясни»)
   и не говорят о теме ничего. Без этого списка новая карточка «Как отвечать
   на „расскажите о слабостях“» закрывала собой вопрос о квантовой запутанности. */
const MISS_STOP = new Set([
  "расскажи", "расскажите", "объясни", "объясните", "покажи", "покажите",
  "подскажи", "подскажите", "напиши", "напишите", "сделай", "сделайте",
  "помоги", "помогите", "давай", "давайте", "можешь", "можете", "нужно",
  "хочу", "хотим", "прошу", "пожалуйста", "коротко", "подробно", "вообще",
  "вообщем", "какой", "какая", "какие", "каких", "почему", "зачем", "сколько",
  "который", "которая", "которые", "нужен", "нужна", "нужны", "можно", "нельзя",
  "объяснение", "понятно", "пожалуста"
]);
function miss(task) {
  const q = String(task || "").trim();
  if (q.length < 8) return "";
  const words = norm(q).split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 5 && !MISS_STOP.has(w));
  if (!words.length) return "";
  /* Считаем не «хоть что-то похожее», а настоящие попадания:
     слово из вопроса в названии или теге. Иначе «про» цеплялось
     за «процесс» и пробел не находился никогда. */
  let hits = 0;
  for (const it of items) {
    const title = norm(it.topic);
    const tags = norm(it.tags);
    for (const w of words) {
      if (title.includes(w)) hits += 2;
      else if (tags.includes(w)) hits += 1;
    }
  }
  if (hits > 0) return "";
  return q.length > 120 ? q.slice(0, 119) + "…" : q;
}

/** Что подставить в системный промпт под конкретную задачу. */
function promptBlock(task, maxChars) {
  const found = search(task, 2);
  if (!found.length) return "";
  const parts = ["СПРАВКА ИЗ ОБЩЕЙ БАЗЫ ИСКРЫ (её проверил владелец):"];
  for (const it of found) parts.push("- " + it.topic + ": " + it.text);
  let text = parts.join("\n");
  const limit = maxChars || 1200;
  if (text.length > limit) text = text.slice(0, limit) + "…";
  return text;
}

/** Для тестов: забыть всё, что было в памяти. */
function reset() {
  items = [];
  loadedAt = 0;
  lastError = "";
}

module.exports = {
  CONFIG, CACHE_FILE, PACK_FILE, TTL, MAX_ITEMS, PAGE_SIZE,
  parseRows, setItems, list, isEmpty, error, age, isFresh,
  refresh, loadCache, saveCache, loadPack, boot, search, miss, promptBlock, reset
};

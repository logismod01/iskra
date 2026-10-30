/**
 * Движки Sye — те же бесплатные, что у Искры, плюс необязательный свой ключ.
 * Названия сервисов в интерфейсе не показываются.
 *
 * Важно: у одного из бесплатных движков нельзя отправлять заголовок Authorization
 * вообще — иначе он отвечает ошибкой.
 */

"use strict";

/* Порядок = качество. Сначала крупные модели, мелкие — только страховка:
   маленькие модели плохо держат протокол действий (<action>/<final>), поэтому
   они стоят в конце и получают укороченный промпт. */
const ENGINES = [
  { id: "e1", base: "https://api.kilo.ai/api/gateway", model: "kilo-auto/free", timeout: 45000, auth: "anonymous" },
  { id: "e2", base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", model: "gpt-oss-120b", timeout: 45000, auth: "none" },
  { id: "e3", url: "https://text.pollinations.ai/openai", model: "openai-fast", timeout: 40000, auth: "none", small: true },
  { id: "e4", base: "https://api.llm7.io/v1", model: "gpt-oss:20b", timeout: 40000, small: true },
  { id: "e5", base: "https://api.llm7.io/v1", model: "mistral-Nemo-Instruct-2407", timeout: 40000, small: true }
];

const VISION_ENGINES = [
  { id: "v1", base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", model: "Qwen3.5-397B-A17B", timeout: 60000, auth: "none" },
  { id: "v2", base: "https://api.kilo.ai/api/gateway", model: "nvidia/nemotron-3.5-super-vl:free", timeout: 60000, auth: "anonymous" }
];

class EngineError extends Error {
  constructor(message, info) {
    super(message);
    this.name = "EngineError";
    Object.assign(this, info || {});
  }
}

function headersFor(engine, extraKey) {
  const h = { "Content-Type": "application/json" };
  if (engine.key) h.Authorization = "Bearer " + engine.key;
  else if (engine.auth === "anonymous") h.Authorization = "Bearer anonymous";
  else if (engine.auth === "none") { /* заголовка быть не должно */ }
  else if (extraKey) h.Authorization = "Bearer " + extraKey;
  return h;
}

function endpointOf(engine) {
  if (engine.url) return engine.url;
  const base = String(engine.base || "").replace(/\/+$/, "");
  return base + "/chat/completions";
}

/* Куда нести ключ, если человек вставил только его: вид ключа говорит сам за себя.
   models — по порядку: если первая модель не найдена или упёрлась в лимит, берём следующую. */
const KEY_ROUTES = [
  {
    kind: "groq", test: /^gsk_[A-Za-z0-9]{20,}$/, base: "https://api.groq.com/openai/v1", list: true,
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
  },
  {
    // бесплатные модели здесь меняются каждый месяц — имя подбирается у сервиса
    kind: "openrouter", test: /^sk-or-[A-Za-z0-9-]{20,}$/, base: "https://openrouter.ai/api/v1",
    discovery: "openrouter",
    models: ["deepseek/deepseek-chat-v3.1:free", "meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-235b-a22b:free"]
  },
  {
    kind: "huggingface", test: /^hf_[A-Za-z0-9]{20,}$/, base: "https://router.huggingface.co/v1", list: true,
    models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct"]
  }
];

function routeForKey(key) {
  const k = String(key || "").trim();
  for (const r of KEY_ROUTES) {
    if (r.test.test(k)) return { base: r.base, models: r.models.slice(), discovery: r.discovery || "", list: !!r.list, kind: r.kind };
  }
  return null;
}

/* Ключей может быть несколько: человек вставляет оба, по одному в строке.
   Отдельный случай — склеенные ключи: однострочное поле вырезало перевод строки,
   и "gsk_…sk-or-…" превращался в один нерабочий ключ. Поэтому режем ещё и
   по началам ключей, а не только по пробелам. */
const KEY_MARKER = /(?=(?:gsk_|sk-or-|hf_))/;
const KEY_TOKEN = /(?:gsk_[A-Za-z0-9_-]{10,}|sk-or-[A-Za-z0-9_-]{10,}|hf_[A-Za-z0-9_-]{10,})/;

function splitKeys(text) {
  const out = [];
  for (const chunk of String(text || "").split(KEY_MARKER)) {
    const m = chunk.match(KEY_TOKEN);
    if (m) out.push(m[0].replace(/[-_]+$/, ""));
  }
  return out;
}

/** Ключей может быть несколько: человек вставляет оба, по одному в строке. */
function parseKeys(text) {
  const out = [];
  for (const key of splitKeys(text)) {
    if (routeForKey(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Свои ключи человека важнее бесплатных движков.
 * Достаточно одного ключа: адрес и модели подставляются по его виду.
 * Если человек вписал адрес и модель сам — они главнее.
 * @returns {Array<object>} движки; у openrouter model пустая — имя подберётся при запросе
 */
function customEngines(settings) {
  const raw = String((settings && settings.apiKey) || "");
  const base = String((settings && settings.apiBase) || "").trim();
  const model = String((settings && settings.apiModel) || "").trim();
  // со своим адресом и моделью подходит любой ключ; без них — только узнаваемый по виду
  // со своим адресом и моделью годится любой ключ, даже незнакомого вида
  const any = [...new Set([...splitKeys(raw), ...raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)])];
  const keys = (base && model) ? any : parseKeys(raw);
  if (!keys.length) return [];
  const out = [];
  keys.forEach((key, index) => {
    const id = index === 0 ? "custom" : "custom" + (index + 1);
    if (base && model) {
      out.push({ id, base, model, key, timeout: 60000 });
      return;
    }
    const route = routeForKey(key);
    if (!route) return;
    if (route.discovery) {
      out.push({ id, base: route.base, model: "", models: route.models, key, timeout: 60000, discovery: route.discovery, provider: route.kind });
      return;
    }
    route.models.forEach((name, i) => {
      out.push({
        id: i === 0 ? id : id + "-" + (i + 1), base: route.base, model: name, key, timeout: 60000,
        provider: route.kind, models: route.models, list: route.list
      });
    });
  });
  return out;
}

/** Первый свой движок — для совместимости со старыми вызовами. */
function customEngine(settings) {
  const list = customEngines(settings);
  return list.length ? list[0] : null;
}

function order(settings, vision) {
  const list = vision ? VISION_ENGINES.slice() : ENGINES.slice();
  const own = customEngines(settings);
  if (own.length) list.unshift(...own);
  return list;
}

/* Бесплатные модели OpenRouter меняются каждый месяц: спрашиваем у сервиса список
   и берём самые крупные бесплатные. Не вышло — работают запасные имена. */
let freeModelsCache = null;
let freeModelsAt = 0;

/** Забыть подобранный список (например, если модели на сервисе сменились). */
function resetFreeModelsCache() {
  freeModelsCache = null;
  freeModelsAt = 0;
}

async function discoverFreeModels(fetchImpl) {
  if (freeModelsCache && Date.now() - freeModelsAt < 6 * 3600e3) return freeModelsCache;
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return freeModelsCache || [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await doFetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
    if (!res || !res.ok) return freeModelsCache || [];
    const json = await res.json();
    const all = (json && Array.isArray(json.data)) ? json.data : [];
    const free = all
      .filter((m) => m && typeof m.id === "string" && /:free$/.test(m.id))
      .map((m) => ({
        id: m.id,
        ctx: Number((m.top_provider && m.top_provider.context_length) || m.context_length || 0),
        vision: Array.isArray(m.architecture && m.architecture.input_modalities)
          && m.architecture.input_modalities.includes("image")
      }))
      .filter((m) => m.ctx >= 8000)
      .sort((a, b) => b.ctx - a.ctx)
      .slice(0, 6);
    if (free.length) { freeModelsCache = free; freeModelsAt = Date.now(); }
    return free;
  } catch (e) {
    return freeModelsCache || [];
  } finally {
    clearTimeout(timer);
  }
}

/* Названия моделей у сервиса меняются, зашитые имена устаревают. Вместо «модель не найдена»
   спрашиваем у сервиса, что у него есть. Кэш на 6 часов, при неудаче — зашитые имена. */
const chatModelsCache = new Map();
const CHAT_ONLY = /(whisper|tts|speech|audio|guard|embed|rerank|moderation|image|dall|stable-diffusion)/i;

function resetChatModelsCache() {
  chatModelsCache.clear();
}

async function discoverChatModels(key, base, fetchImpl) {
  const tag = String(base || "");
  const hit = chatModelsCache.get(tag);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.ids;
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return hit ? hit.ids : [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await doFetch(String(base).replace(/\/+$/, "") + "/models", {
      headers: { Authorization: "Bearer " + key }, signal: controller.signal
    });
    if (!res || !res.ok) return hit ? hit.ids : [];
    const json = await res.json();
    const ids = ((json && json.data) || [])
      .map((m) => (m && (m.id || m.model)) || "")
      .filter((id) => typeof id === "string" && id && !CHAT_ONLY.test(id));
    if (ids.length) chatModelsCache.set(tag, { at: Date.now(), ids });
    return ids;
  } catch (e) {
    return hit ? hit.ids : [];
  } finally {
    clearTimeout(timer);
  }
}

/** Подставляет реальные имена моделей в движки, ждущие подбора. */
async function resolveEngines(list, opts) {
  const options = opts || {};
  if (!list.some((e) => e.discovery || e.list)) return list;
  const found = list.some((e) => e.discovery && !e.model) ? await discoverFreeModels(options.fetch) : [];

  const groups = new Map();
  for (const e of list) {
    if (!e.discovery && !e.list) continue;
    const tag = (e.base || "") + "|" + (e.key || "");
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(e);
  }
  const namesByTag = new Map();
  for (const [tag, group] of groups) {
    const e0 = group[0];
    let names = [];
    if (e0.discovery === "openrouter") {
      const free = (found || []).filter((m) => !options.vision || m.vision).map((m) => m.id);
      names = free.length ? free : (e0.models || []);
    } else {
      const avail = await discoverChatModels(e0.key, e0.base, options.fetch);
      const pref = (e0.models || []).filter((m) => avail.includes(m));
      names = avail.length ? (pref.length ? pref : avail.slice(0, 2)) : (e0.models || []);
    }
    namesByTag.set(tag, names.filter(Boolean).slice(0, 3));
  }

  const out = [];
  const done = new Set();
  for (const e of list) {
    if (!e.discovery && !e.list) { out.push(e); continue; }
    const tag = (e.base || "") + "|" + (e.key || "");
    if (done.has(tag)) continue;
    done.add(tag);
    const group = groups.get(tag) || [e];
    const names = namesByTag.get(tag) || [];
    names.forEach((model, i) => {
      const src = group[Math.min(i, group.length - 1)];
      const meta = (found || []).find((m) => m.id === model) || {};
      out.push(Object.assign({}, src, {
        id: i === 0 ? group[0].id : group[0].id + "-" + (i + 1),
        model,
        vision: !!meta.vision
      }));
    });
  }
  return out;
}

/** Один запрос к одному движку. Возвращает текст (и зовёт onDelta по кускам). */
async function streamOnce(engine, payload, { signal, onDelta } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), engine.timeout || 45000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(endpointOf(engine), {
      method: "POST",
      headers: headersFor(engine, engine.key),
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new EngineError("движок ответил " + res.status, { status: res.status, body: text.slice(0, 300), engine: engine.id });
    }

    const ctype = String(res.headers.get("content-type") || "");
    if (ctype.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let json = null;
          try { json = JSON.parse(data); } catch (e) { continue; }
          const delta = json && json.choices && json.choices[0] &&
            (json.choices[0].delta ? json.choices[0].delta.content : null);
          if (delta) {
            acc += delta;
            if (onDelta) onDelta(delta, acc);
          }
        }
      }
      if (!acc.trim()) throw new EngineError("пустой поток", { engine: engine.id });
      return acc;
    }

    const json = await res.json();
    const text = json && json.choices && json.choices[0] && json.choices[0].message
      ? String(json.choices[0].message.content || "")
      : (json && typeof json.text === "string" ? json.text : "");
    if (!text.trim()) throw new EngineError("пустой ответ", { engine: engine.id });
    if (onDelta) onDelta(text, text);
    return text;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Спросить модель, перебирая движки. Если один занят или молчит — берём следующий.
 * @returns {Promise<{text:string, engine:string}>}
 */
async function askModel({ messages, liteMessages, settings = {}, vision = false, onDelta, signal, maxTokens = 1800, onTry, fetchImpl }) {
  const list = await resolveEngines(order(settings, vision), { vision, fetch: fetchImpl });
  let lastError = null;
  for (let i = 0; i < list.length; i++) {
    const engine = list[i];
    if (onTry) onTry(i + 1, list.length);
    try {
      // мелкая модель тонет в длинном промпте и забывает формат — ей уходит сжатый вариант
      const useMessages = engine.small && Array.isArray(liteMessages) && liteMessages.length ? liteMessages : messages;
      const payload = {
        model: engine.model,
        messages: useMessages,
        stream: true,
        temperature: 0.3,
        max_tokens: maxTokens
      };
      const text = await streamOnce(engine, payload, { signal, onDelta });
      if (text && text.trim()) return { text, engine: engine.id };
      lastError = new EngineError("пустой ответ", { engine: engine.id });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      lastError = e;
    }
  }
  throw lastError || new EngineError("все движки молчат");
}

/** Разбор скриншота: картинку отдаём модели, которая умеет смотреть. */
async function askVision({ imageDataUrl, question, settings = {}, onDelta, signal, maxTokens = 900 }) {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: question || "Что на этом скриншоте? Опиши коротко и по делу: окно, текст, ошибки." },
        { type: "image_url", image_url: { url: imageDataUrl } }
      ]
    }
  ];
  return askModel({ messages, settings, vision: true, onDelta, signal, maxTokens });
}

module.exports = {
  ENGINES, VISION_ENGINES, EngineError, askModel, askVision, streamOnce, order,
  customEngine, customEngines, parseKeys, routeForKey, KEY_ROUTES,
  discoverFreeModels, resolveEngines, resetFreeModelsCache, endpointOf, headersFor,
  discoverChatModels, resetChatModelsCache
};

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

/* Куда нести ключ, если человек вставил только его: вид ключа говорит сам за себя. */
const KEY_ROUTES = [
  { test: /^gsk_[A-Za-z0-9]{20,}$/, base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  { test: /^sk-or-[A-Za-z0-9-]{20,}$/, base: "https://openrouter.ai/api/v1", model: "openai/gpt-oss-120b:free" },
  { test: /^hf_[A-Za-z0-9]{20,}$/, base: "https://router.huggingface.co/v1", model: "meta-llama/Llama-3.3-70B-Instruct" }
];

function routeForKey(key) {
  const k = String(key || "").trim();
  for (const r of KEY_ROUTES) if (r.test.test(k)) return { base: r.base, model: r.model };
  return null;
}

/**
 * Свой ключ человека важнее бесплатных движков.
 * Достаточно одного ключа: адрес и модель подставляются по его виду.
 * Если человек вписал адрес и модель сам — они главнее.
 */
function customEngine(settings) {
  const key = String((settings && settings.apiKey) || "").trim();
  const base = String((settings && settings.apiBase) || "").trim();
  const model = String((settings && settings.apiModel) || "").trim();
  if (!key) return null;
  if (base && model) return { id: "custom", base, model, key, timeout: 60000 };
  const route = routeForKey(key);
  if (route) return { id: "custom", base: route.base, model: model || route.model, key, timeout: 60000 };
  return null;
}

function order(settings, vision) {
  const list = vision ? VISION_ENGINES.slice() : ENGINES.slice();
  const custom = customEngine(settings);
  if (custom) list.unshift(custom);
  return list;
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
async function askModel({ messages, liteMessages, settings = {}, vision = false, onDelta, signal, maxTokens = 1800, onTry }) {
  const list = order(settings, vision);
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

module.exports = { ENGINES, VISION_ENGINES, EngineError, askModel, askVision, streamOnce, order, customEngine, routeForKey, endpointOf, headersFor };

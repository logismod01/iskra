/* ============================================================
   ИСКРА — ИИ-ассистент для учёбы, кода и текстов.
   Один файл со всей логикой: ключ, темы, память, модели,
   стриминг ответов, распознавание фото, генерация картинок.
   ============================================================ */

/* ---------- Бренд ---------- */
const BRAND = {
  name: "Искра",
  tagline: "Твой ИИ-ассистент для учёбы, кода и текстов"
};

/* ---------- SVG иконки (inline) ---------- */
const IC = {
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  regen: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  spark: '<path d="M12 2 L13.5 9.5 L21 12 L13.5 14.5 L12 22 L10.5 14.5 L3 12 L10.5 9.5 Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  brush: '<path d="m14.6 17.9-10.7-2.9"/><path d="M18.4 2.6a1 1 0 1 1 3 3L17.4 9.6a.5.5 0 0 0 0 .8l.9.9a2.4 2.4 0 0 1 0 3.4l-.9 1a.5.5 0 0 1-.7 0L8.4 7.3a.5.5 0 0 1 0-.7l.9-1a2.4 2.4 0 0 1 3.4 0l1 1a.5.5 0 0 0 .7 0z"/><path d="M9 8c-1.8 2.7-4 3.5-6.6 3.9a.5.5 0 0 0-.3.8l7.3 8.9a1 1 0 0 0 1.2.2C12.7 20.4 16 16.8 16 15"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  sigma: '<path d="M18 4H6l6 8-6 8h12"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  attach: '<path d="m21.4 11.05-9.2 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.9 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
};
function ic(name, size = 16, cls = "") {
  const p = IC[name]; if (!p) return "";
  const isSpark = name === "spark";
  return `<svg class="ic ${isSpark ? "fill" : ""} ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" ${isSpark ? "" : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${p}</svg>`;
}


/* ---------- Режимы работы (меняют «обстановку») ---------- */
const MODES = {
  chat: {
    name: "Чат", icon: "spark", motif: "chat",
    ph: "Спроси что угодно…",
    sub: "Просто поговорим — спрашивай что угодно",
    hint: ""
  },
  study: {
    name: "Учёба", icon: "book", motif: "study",
    ph: "Какую тему объяснить?",
    sub: "Объясню тему простыми словами, по шагам",
    hint: "Режим учёбы: объясняй простыми словами, по шагам, с примерами из жизни. В конце задай один проверочный вопрос, чтобы убедиться, что ученик понял."
  },
  code: {
    name: "Код", icon: "code", motif: "code",
    ph: "Что написать или починить?",
    sub: "Пишу и объясняю код на любом языке",
    hint: "Режим программирования: давай рабочий код в блоках ```язык, объясняй кратко и по делу, предупреждай о подводных камнях и крайних случаях."
  },
  text: {
    name: "Текст", icon: "pen", motif: "text",
    ph: "Какой текст написать?",
    sub: "Сочинение, эссе, пост — живым языком",
    hint: "Режим текстов: пиши живым языком, без канцелярита и штампов. Соблюдай заданный объём и жанр."
  },
  art: {
    name: "Картинка", icon: "brush", motif: "art",
    ph: "Опиши картинку — нарисую",
    sub: "Опиши словами — нарисую",
    hint: "", image: true
  },
  math: {
    name: "Задача", icon: "sigma", motif: "math",
    ph: "Вставь условие задачи",
    sub: "Математика, физика, химия — по шагам",
    hint: "Режим решения задач: сначала «Дано», потом формулы, каждое действие с пояснением, ответ и проверка. Не перескакивай шаги."
  },
  homework: {
    name: "Домашка", icon: "camera", motif: "homework",
    ph: "Прикрепи фото домашки",
    sub: "Сфотографируй — распознаю и проверю",
    hint: "Проверка домашки: если есть фото — распознай текст, в том числе рукописный, перепиши его печатными буквами, затем найди ошибки, объясни как правильно и как это решать."
  }
};
const MODE_ORDER = ["chat", "study", "code", "text", "art", "math", "homework"];

/* Узоры для фона под каждый режим */
const MOTIF = {
  chat: '<path d="M60 30l4 16 16 4-16 4-4 16-4-16-16-4 16-4z"/>',
  study: '<path d="M28 44h30v36H28z"/><path d="M62 44h30v36H62z"/><path d="M36 56h14M36 64h10M70 56h14M70 64h10"/>',
  code: '<path d="M44 42l-14 18 14 18"/><path d="M76 42l14 18-14 18"/><circle cx="60" cy="78" r="1.5"/>',
  text: '<path d="M24 42h72M24 54h72M24 66h56M24 78h36"/>',
  art: '<circle cx="46" cy="52" r="13"/><circle cx="76" cy="74" r="17"/><path d="M62 30c16 7 24 20 21 34"/>',
  math: '<path d="M42 42h22l-13 18 13 18H42"/><path d="M74 44v30M65 52h18"/>',
  homework: '<rect x="34" y="36" width="52" height="48" rx="5"/><path d="M46 54h28M46 64h16"/><path d="M66 72l6 6 11-13"/>'
};
function motifSvg(mode) {
  const m = MOTIF[MODES[mode]?.motif] || MOTIF.chat;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs>` +
    `<pattern id="amb" width="170" height="170" patternUnits="userSpaceOnUse" patternTransform="rotate(-10)">` +
    `<g transform="translate(25,25)" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${m}</g>` +
    `</pattern></defs><rect width="100%" height="100%" fill="url(#amb)"/></svg>`;
}


/* ---------- Каталог моделей: Искра +1, бесплатные, платные, свои ---------- */
const BRAND_MODELS = {
  groq: [
    { id: "qwen/qwen3.6-27b", name: "Искра +1", ver: "v1", desc: "Наша модель · видит фото · быстро", vision: true },
    { id: "openai/gpt-oss-120b", name: "Искра +1 Pro", ver: "v1", desc: "Наша модель · сложные задачи · без зрения", vision: false }
  ],
  openrouter: [
    { id: "thinkingmachines/inkling:free", name: "Искра +1", ver: "v1", desc: "Наша модель · 1M контекст · видит фото", vision: true },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Искра +1 Pro", ver: "v1", desc: "Наша модель · рассуждает · 550B", vision: false }
  ],
  custom: []
};

const PAID_FALLBACK = [];

let modelPickerSection = "all";
let paidModelsCache = null;
let paidLoading = false;

function modelDisplayName(id) {
  for (const list of Object.values(BRAND_MODELS)) {
    const hit = list.find(m => m.id === id);
    if (hit) return hit.name;
  }
  for (const list of Object.values(FALLBACK_MODELS)) {
    const hit = list.find(m => m.id === id);
    if (hit && hit.name) return hit.name.replace(/ —.*$/, "");
  }
  return id ? id.split("/").pop().replace(":free", "") : "—";
}

async function loadPaidModels() {
  if (paidModelsCache || paidLoading) return;
  paidLoading = true;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const j = await r.json();
    const list = (j.data || [])
      .filter(m => {
        const p = parseFloat(m.pricing?.prompt || "0");
        return p > 0;
      })
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        price: parseFloat(m.pricing?.prompt || "0") * 1e6,
        ctx: Math.round((m.context_length || 0) / 1000)
      }))
      .sort((a, b) => a.price - b.price);
    paidModelsCache = list.slice(0, 40);
  } catch (e) {
    paidModelsCache = PAID_FALLBACK;
  } finally {
    paidLoading = false;
    renderModelPicker();
  }
}

function renderModelPicker() {
  const box = $("#mpBody");
  if (!box) return;
  box.innerHTML = "";
  const provider = settings.provider;
  const isCustom = provider === "custom";

  const section = (title, note) => {
    const h = document.createElement("div");
    h.className = "mp-sec";
    h.innerHTML = `<span>${esc(title)}</span>${note ? `<em>${esc(note)}</em>` : ""}`;
    box.appendChild(h);
  };

  const row = (m, opts = {}) => {
    const el2 = document.createElement("button");
    el2.type = "button";
    el2.className = "mp-row" + (settings.model === m.id ? " sel" : "");
    const right = [];
    if (m.vision) right.push('<span class="mp-tag eye">фото</span>');
    if (opts.brand) right.push('<span class="mp-tag brand">наша</span>');
    if (opts.price !== undefined) right.push(`<span class="mp-tag price">$${(opts.price < 0.1 ? opts.price.toFixed(3) : opts.price.toFixed(2))}/1M</span>`);
    if (m.ctx) right.push(`<span class="mp-ctx">${m.ctx}K</span>`);
    el2.innerHTML = `
      <span class="mp-main">
        <span class="mp-name">${esc(m.name)}${m.ver ? `<em>${esc(m.ver)}</em>` : ""}</span>
        <span class="mp-desc">${esc(m.desc || m.id)}</span>
      </span>
      <span class="mp-right">${right.join("")}${settings.model === m.id ? ic("check", 16, "mp-check") : ""}</span>`;
    el2.addEventListener("click", () => chooseModel(m.id));
    box.appendChild(el2);
  };

  // Наша модель
  const brand = BRAND_MODELS[provider] || [];
  if (brand.length) {
    section("Искра", "наша модель");
    brand.forEach(m => row(m, { brand: true }));
  }

  // Бесплатные
  const free = (FALLBACK_MODELS[provider] || []).filter(m => !brand.some(b => b.id === m.id));
  if (free.length) {
    section(isCustom ? "Модели сервера" : "Бесплатные", `${free.length} шт · без карты`);
    free.forEach(m => row(m));
  }

  // Платные (OpenRouter)
  if (provider === "openrouter") {
    section("Платные", "нужен баланс на OpenRouter");
    if (!paidModelsCache && !paidLoading) loadPaidModels();
    if (paidLoading) {
      const w = document.createElement("div");
      w.className = "mp-loading";
      w.innerHTML = '<span class="spin"></span> Загружаю список платных моделей…';
      box.appendChild(w);
    } else if (paidModelsCache && paidModelsCache.length) {
      paidModelsCache.slice(0, 12).forEach(m => row({ id: m.id, name: m.name, ctx: m.ctx }, { price: m.price }));
    } else {
      const w = document.createElement("div");
      w.className = "mp-note";
      w.textContent = "Не удалось загрузить список. Проверь интернет.";
      box.appendChild(w);
    }
  }

  // Своя модель
  section("Своя модель", "любой id");
  const custom = document.createElement("div");
  custom.className = "mp-custom";
  custom.innerHTML = `<input type="text" id="mpCustomInput" placeholder="например: meta-llama/llama-4-scout-17b-16e-instruct" value="${settings.model.startsWith("qwen/") || FALLBACK_MODELS[provider]?.some(m => m.id === settings.model) || BRAND_MODELS[provider]?.some(m => m.id === settings.model) ? "" : esc(settings.model)}" />
    <button class="btn btn-ghost" id="mpCustomApply" type="button">Применить</button>`;
  box.appendChild(custom);
  custom.querySelector("#mpCustomApply").addEventListener("click", () => {
    const v = custom.querySelector("#mpCustomInput").value.trim();
    if (!v) { toast("Впиши id модели", "err"); return; }
    chooseModel(v);
  });
  custom.querySelector("#mpCustomInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); custom.querySelector("#mpCustomApply").click(); }
  });
}

function chooseModel(id) {
  settings.model = id;
  lastModelVision = guessVision(id) || !!(BRAND_MODELS[settings.provider] || []).find(m => m.id === id && m.vision);
  saveSettings();
  updateModelChip();
  renderModelPicker();
  const hint = $("#modelHint");
  if (hint) updateModelHint();
  closeModelPicker();
  toast(`Модель: ${modelDisplayName(id)}`, "ok");
}
function openModelPicker() { renderModelPicker(); $("#modelModal").classList.add("open"); }
function closeModelPicker() { $("#modelModal").classList.remove("open"); }

/* ---------- Провайдеры ---------- */
const PROVIDERS = {
  groq: {
    name: "Groq",
    base: "https://api.groq.com/openai/v1",
    hint: "Самый быстрый бесплатный API. 30 запросов в минуту. Ключ: console.groq.com/keys (вход через Google)."
  },
  openrouter: {
    name: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    hint: "Много моделей. Бесплатные помечены :free. Ключ: openrouter.ai/keys (вход через Google)."
  },
  custom: {
    name: "Свой URL",
    base: "",
    hint: "Любой OpenAI-совместимый API (Cloudflare, Ollama, LocalAI, LM Studio)."
  }
};

/* Бесплатные модели. Список сверен с openrouter.ai/api/v1/models (16 бесплатных на 29.10.2026).
   В приложении он всё равно подтягивается живой из API — это запасной вариант. */
const FALLBACK_MODELS = {
  groq: [
    { id: "qwen/qwen3.6-27b", name: "Qwen3.6 27B — видит фото", vision: true, ctx: 131 },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B — умная", vision: false, ctx: 131 },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B — быстрая", vision: false, ctx: 131 },
    { id: "groq/compound", name: "Compound — агент с веб-поиском", vision: false, ctx: 131 },
    { id: "groq/compound-mini", name: "Compound Mini — быстрый агент", vision: false, ctx: 131 }
  ],
  openrouter: [
    { id: "thinkingmachines/inkling:free", name: "Inkling 975B · со зрением — самая умная", vision: true, ctx: 1048 },
    { id: "thinkingmachines/inkling-small:free", name: "Inkling Small · со зрением — 1M контекст", vision: true, ctx: 1048 },
    { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra 550B — рассуждает", vision: false, ctx: 1000 },
    { id: "nvidia/nemotron-3.5-lightning:free", name: "Nemotron 3.5 Lightning — очень быстрая", vision: false, ctx: 1000 },
    { id: "nvidia/nemotron-3.5-super-vl:free", name: "Nemotron 3.5 Super VL · со зрением", vision: true, ctx: 1000 },
    { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano Omni · со зрением", vision: true, ctx: 256 },
    { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B · со зрением (Google)", vision: true, ctx: 262 },
    { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B · со зрением (Google)", vision: true, ctx: 262 },
    { id: "cohere/north-mini-code:free", name: "North Mini Code — для кода", vision: false, ctx: 256 },
    { id: "poolside/laguna-s-2.1:free", name: "Laguna S 2.1 — код 118B", vision: false, ctx: 262 },
    { id: "poolside/laguna-xs-2.1:free", name: "Laguna XS 2.1 — код лёгкий", vision: false, ctx: 262 },
    { id: "dots-studio/dots-3-note-preview:free", name: "Dots3 Note · со зрением", vision: true, ctx: 512 },
    { id: "recursive/flint-v1.0:free", name: "Flint v1.0", vision: false, ctx: 262 },
    { id: "xingchen-agi/xing4.0-29b-a4b:free", name: "Xing4.0 29B", vision: false, ctx: 262 },
    { id: "liquid/lfm-2.5-2.6b:free", name: "LFM 2.5 — самая быстрая", vision: false, ctx: 65 }
  ],
  custom: []
};

/* Модели, которые уже удалили — чтобы у старых пользователей не было 404 */
const DEAD_MODELS = {
  "deepseek/deepseek-chat-v3.1:free": "thinkingmachines/inkling:free",
  "deepseek/deepseek-r1:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "meta-llama/llama-3.3-70b-instruct:free": "thinkingmachines/inkling-small:free",
  "qwen/qwen3-235b-a22b:free": "nvidia/nemotron-3.5-lightning:free",
  "qwen/qwen3-coder:free": "cohere/north-mini-code:free",
  "google/gemma-3-27b-it:free": "google/gemma-4-31b-it:free",
  "google/gemma-3-12b-it:free": "google/gemma-4-26b-a4b-it:free",
  "mistralai/mistral-small-3.2-24b-instruct:free": "thinkingmachines/inkling-small:free",
  "meta-llama/llama-4-scout:free": "thinkingmachines/inkling-small:free",
  "meta-llama/llama-4-maverick:free": "thinkingmachines/inkling:free",
  "meta-llama/llama-4-scout-17b-16e-instruct": "openai/gpt-oss-120b",
  "meta-llama/llama-4-maverick-17b-128e-instruct": "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct": "openai/gpt-oss-120b",
  "deepseek-r1-distill-llama-70b": "openai/gpt-oss-120b"
};

function guessVision(id) {
  const s = String(id || "").toLowerCase();
  return /(\bvl\b|vision|llama-4|scout|maverick|gemma-3|gemini|gpt-4o|gpt-5|claude-3|claude-sonnet-4|pixtral|llava|internvl|glm-4\.5v|mistral-small-3|qwen[\d.]*-vl|qwen3\.6|domo|paligemma)/.test(s);
}

/* ---------- Характеры ---------- */
const PERSONAS = {
  universal: {
    name: "Универсальный",
    desc: "Нейтрально и понятно",
    prompt: "Ты — Искра, умный и дружелюбный ИИ-ассистент. Отвечай понятно, по делу, на русском языке (если пользователь пишет на другом — на том же). Используй markdown для структуры: списки, заголовки, код."
  },
  friend: {
    name: "Друг",
    desc: "С юмором, на равных",
    prompt: "Ты — Искра, друг пользователя. Общайся на равных, с юмором и лёгким сленгом, где уместно. Можешь поспорить, пошутить, поддержать. Будь живым, не официальным."
  },
  tutor: {
    name: "Репетитор",
    desc: "Объясняет по шагам",
    prompt: "Ты — Искра, терпеливый репетитор. Объясняй по шагам, простыми словами. Не давай сразу готовый ответ на задачу — сначала задай наводящие вопросы, помоги понять тему. Хвали за правильные шаги. Используй аналогии из жизни."
  },
  coder: {
    name: "Напарник-программист",
    desc: "Рабочий код с объяснениями",
    prompt: "Ты — Искра, напарник-программист. Пиши чистый, рабочий код с комментариями. Объясняй, почему делаешь именно так. Можешь указать на плохие практики. Поддерживаешь много языков: Python, JavaScript, TypeScript, C++, C#, Java, Go, Rust, PHP, SQL, HTML/CSS, Swift, Kotlin и другие."
  },
  coach: {
    name: "Наставник",
    desc: "Поддержка и мотивация",
    prompt: "Ты — Искра, поддерживающий наставник. Хвали за усилия, а не только за результат. Дроби большие задачи на маленькие шаги. Помогай ставить цели и не сдаваться. Будь тёплым, но честным."
  },
  custom: {
    name: "Свой",
    desc: "Свой промпт",
    prompt: ""
  }
};

/* ---------- 15 тем ---------- */
const THEMES = {
  claude:    { name: "Тёплая",    bg: "#141413", soft: "#1c1b19", soft2: "#25231f", line: "#2e2a26", text: "#f4eee4", softT: "#a89f92", dim: "#6e675c", accent: "#d97757", accentSoft: "#8a4a33", user: "#2d2820", ai: "#1a1815" },
  midnight:  { name: "Полночь",   bg: "#0b1020", soft: "#111933", soft2: "#1a2447", line: "#253162", text: "#e8ecff", softT: "#99a4d4", dim: "#5a6799", accent: "#7aa2ff", accentSoft: "#3d5a99", user: "#1a2447", ai: "#0f1730" },
  ocean:     { name: "Океан",     bg: "#0a1618", soft: "#0f2024", soft2: "#152d32", line: "#1f3e45", text: "#e6f3f5", softT: "#8fb8be", dim: "#577d84", accent: "#3db9c9", accentSoft: "#1e6570", user: "#152d32", ai: "#0c1c1f" },
  forest:    { name: "Лес",       bg: "#0f1512", soft: "#151f1a", soft2: "#1d2b22", line: "#2a3d30", text: "#eaf3ea", softT: "#9db59e", dim: "#5f7a60", accent: "#6db37a", accentSoft: "#3a6b45", user: "#1d2b22", ai: "#111915" },
  neon:      { name: "Неон",      bg: "#0a0a12", soft: "#12121e", soft2: "#1a1a2c", line: "#2a2a44", text: "#f0f0ff", softT: "#a8a8d0", dim: "#6666a0", accent: "#b14cff", accentSoft: "#5a2488", user: "#1a1a2c", ai: "#0d0d17" },
  rose:      { name: "Роза",      bg: "#17100f", soft: "#20161a", soft2: "#2c1d24", line: "#3e2932", text: "#f6eaef", softT: "#c39aa8", dim: "#7a5a67", accent: "#e06890", accentSoft: "#88385a", user: "#2c1d24", ai: "#1a1013" },
  coffee:    { name: "Кофе",      bg: "#16110c", soft: "#201a12", soft2: "#2c2418", line: "#3e3524", text: "#f3e8d4", softT: "#b8a888", dim: "#776850", accent: "#c89858", accentSoft: "#7a5828", user: "#2c2418", ai: "#191210" },
  lavender:  { name: "Лаванда",   bg: "#14101a", soft: "#1c1624", soft2: "#251e30", line: "#332a44", text: "#ece4f8", softT: "#a89bc0", dim: "#6a5d80", accent: "#9670d8", accentSoft: "#5a3c88", user: "#251e30", ai: "#160f1c" },
  graphite:  { name: "Графит",    bg: "#181818", soft: "#202020", soft2: "#2a2a2a", line: "#3a3a3a", text: "#eeeeee", softT: "#a0a0a0", dim: "#666666", accent: "#888888", accentSoft: "#4a4a4a", user: "#2a2a2a", ai: "#1c1c1c" },
  light:     { name: "Светлая",   bg: "#f7f5f2", soft: "#ffffff", soft2: "#eeebe6", line: "#ddd6cc", text: "#1a1815", softT: "#5a5045", dim: "#8a7f70", accent: "#d97757", accentSoft: "#f0b8a0", user: "#f0e8dc", ai: "#faf6f0" },
  paper:     { name: "Бумага",    bg: "#faf6ee", soft: "#ffffff", soft2: "#f0eade", line: "#dcd2be", text: "#2a2418", softT: "#6a5e48", dim: "#9a8e78", accent: "#a06830", accentSoft: "#d8a870", user: "#f0e4d0", ai: "#fffcf5" },
  sunset:    { name: "Закат",     bg: "#1a0e14", soft: "#241418", soft2: "#321a20", line: "#4a2428", text: "#fce8e8", softT: "#d0a0a0", dim: "#885a5a", accent: "#ff7849", accentSoft: "#a04020", user: "#321a20", ai: "#1c0e12" },
  matrix:    { name: "Матрица",   bg: "#000808", soft: "#001010", soft2: "#001a1a", line: "#003030", text: "#b8ffb8", softT: "#60c060", dim: "#308030", accent: "#00ff88", accentSoft: "#008048", user: "#001a1a", ai: "#000d0d" },
  ice:       { name: "Лёд",       bg: "#0c1418", soft: "#121c22", soft2: "#1a2832", line: "#253844", text: "#e8f2ff", softT: "#a0b8d0", dim: "#5f7a90", accent: "#50a8ff", accentSoft: "#2860a0", user: "#1a2832", ai: "#0e1820" },
  cherry:    { name: "Вишня",     bg: "#18080c", soft: "#200e12", soft2: "#2c1418", line: "#44181f", text: "#ffe8ea", softT: "#d0909a", dim: "#884850", accent: "#e83848", accentSoft: "#881828", user: "#2c1418", ai: "#1a0a0e" }
};
const THEME_ORDER = ["claude","midnight","ocean","forest","neon","rose","coffee","lavender","graphite","light","paper","sunset","matrix","ice","cherry"];

/* ---------- Состояние ---------- */
const STORAGE = { settings: "iskra.settings.v1", chats: "iskra.chats.v1" };
let settings = loadSettings();
let chats = loadChats();
let currentChatId = null;
let pendingImages = [];
let pendingWeb = false;
let abortCtrl = null;
let lastModelVision = guessVision(settings.model);

/* Чиним настройки: мёртвые модели и неизвестный режим */
(function migrate() {
  if (DEAD_MODELS[settings.model]) {
    settings.model = DEAD_MODELS[settings.model];
    lastModelVision = guessVision(settings.model);
    saveSettings();
  }
  if (!MODES[settings.mode]) settings.mode = "chat";
})();

/* ---------- Утилиты ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE.settings);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    provider: "groq",
    baseUrl: "",
    apiKey: "",
    model: "qwen/qwen3.6-27b",
    mode: "chat",
    persona: "universal",
    customPersona: "",
    theme: "claude",
    memoryOn: true,
    memory: [],
    knowledge: [],
    knowledgeOn: true,
    webSearch: false
  };
}
function saveSettings() {
  try { localStorage.setItem(STORAGE.settings, JSON.stringify(settings)); } catch(e) {}
}
function loadChats() {
  try {
    const raw = localStorage.getItem(STORAGE.chats);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {};
}
function saveChats() {
  try {
    const json = JSON.stringify(chats);
    localStorage.setItem(STORAGE.chats, json);
  } catch(e) {
    if (e.name === "QuotaExceededError") toast("Память браузера заполнена. Удали старые чаты.", "err");
  }
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show " + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ---------- Темы ---------- */
function applyTheme(name, ev) {
  const html = document.documentElement;
  html.classList.add("theme-fade");
  setTimeout(() => html.classList.remove("theme-fade"), 420);
  if (ev && typeof ev.clientX === "number") {
    const f = document.createElement("div");
    f.className = "theme-flash";
    f.style.left = ev.clientX + "px";
    f.style.top = ev.clientY + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 700);
  }
  const t = THEMES[name] || THEMES.claude;
  const root = document.documentElement.style;
  root.setProperty("--bg", t.bg);
  root.setProperty("--bg-soft", t.soft);
  root.setProperty("--bg-soft-2", t.soft2);
  root.setProperty("--line", t.line);
  root.setProperty("--text", t.text);
  root.setProperty("--text-soft", t.softT);
  root.setProperty("--text-dim", t.dim);
  root.setProperty("--accent", t.accent);
  root.setProperty("--accent-soft", t.accentSoft);
  root.setProperty("--user", t.user);
  root.setProperty("--ai", t.ai);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", t.bg);
}

/* ---------- Markdown-рендер ---------- */
function renderMarkdown(md) {
  let html = md;
  html = html.replace(/\r\n/g, "\n");
  // code blocks
  const codeBlocks = [];
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = codeBlocks.length;
    const l = lang || "код";
    codeBlocks.push({ lang: l, code: code.replace(/\n$/, "") });
    return `\n\n__CODE_${i}__\n\n`;
  });
  // inline code
  const inlineCodes = [];
  html = html.replace(/`([^`\n]+)`/g, (_, c) => {
    const i = inlineCodes.length;
    inlineCodes.push(c);
    return `__INLINE_${i}__`;
  });
  // escape
  html = esc(html);
  // headers
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>")
             .replace(/^## (.*)$/gm, "<h2>$1</h2>")
             .replace(/^# (.*)$/gm, "<h1>$1</h1>");
  // bold / italic
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^\*])\*([^\*\n]+)\*/g, "$1<em>$2</em>");
  // links
  html = html.replace(/\[([^\]]+)\]\((https?:[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // lists
  html = html.replace(/(^|\n)(?:[-*] .+\n?)+/g, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^[-*] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  html = html.replace(/(^|\n)(?:\d+\. .+\n?)+/g, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  // paragraphs
  html = html.split(/\n\n+/).map(p => {
    if (/^<(h\d|ul|ol|__CODE_)/.test(p.trim())) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  // restore inline code
  html = html.replace(/__INLINE_(\d+)__/g, (_, i) => `<code>${esc(inlineCodes[+i])}</code>`);
  // restore code blocks
  html = html.replace(/<p>__CODE_(\d+)__<\/p>/g, (_, i) => {
    const { lang, code } = codeBlocks[+i];
    const id = "cb_" + Math.random().toString(36).slice(2, 8);
    return `<pre data-lang="${esc(lang)}"><div class="code-head"><span class="lang">${esc(lang)}</span><button data-copy="${id}">Копировать</button></div><code id="${id}">${esc(code)}</code></pre>`;
  });
  return html;
}

/* ---------- Сообщения ---------- */
function getCurrentChat() {
  if (!currentChatId) return null;
  return chats[currentChatId];
}
function createChat(firstTitle) {
  const id = uid();
  chats[id] = { id, title: firstTitle || "Новый чат", messages: [], created: Date.now() };
  currentChatId = id;
  saveChats();
  renderChatsList();
  return chats[id];
}
function deleteChat(id) {
  delete chats[id];
  if (currentChatId === id) currentChatId = null;
  saveChats();
  renderChatsList();
  renderMessages();
}
function titleFromText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 48) + "…" : (t || "Новый чат");
}
function renderChatsList() {
  const list = $("#chatsList");
  list.innerHTML = "";
  const q = chatQuery.trim().toLowerCase();
  const entries = Object.values(chats)
    .sort((a, b) => b.created - a.created)
    .filter(c => !q || (c.title || "").toLowerCase().includes(q));
  if (!entries.length) {
    list.innerHTML = `<div style="padding:20px 14px;color:var(--text-dim);font-size:13px;text-align:center">Чатов пока нет.<br>Начни первый ✦</div>`;
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today); week.setDate(week.getDate() - 7);
  const groups = { today: [], yesterday: [], week: [], older: [] };
  for (const c of entries) {
    const d = new Date(c.created);
    if (d >= today) groups.today.push(c);
    else if (d >= yesterday) groups.yesterday.push(c);
    else if (d >= week) groups.week.push(c);
    else groups.older.push(c);
  }
  const labels = { today: "Сегодня", yesterday: "Вчера", week: "На этой неделе", older: "Раньше" };
  for (const k of ["today","yesterday","week","older"]) {
    if (!groups[k].length) continue;
    const gt = document.createElement("div");
    gt.className = "sb-group-title";
    gt.textContent = labels[k];
    list.appendChild(gt);
    for (const c of groups[k]) {
      const row = document.createElement("div");
      row.className = "chat-row" + (c.id === currentChatId ? " active" : "");
      row.innerHTML = `${ic("chat", 16)}<span class="title">${esc(c.title)}</span><button class="del" title="Удалить">${ic("x", 14)}</button>`;
      row.addEventListener("click", () => {
        currentChatId = c.id;
        renderChatsList();
        renderMessages();
        closeSidebar();
      });
      row.querySelector(".del").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Удалить чат «${c.title}»?`)) deleteChat(c.id);
      });
      list.appendChild(row);
    }
  }
}
function renderMessages() {
  const m = $("#messages");
  const chat = getCurrentChat();
  if (!chat || !chat.messages.length) {
    $("#welcome").style.display = "";
    m.querySelectorAll(".msg").forEach(n => n.remove());
    $("#chatTitle").textContent = chat?.title || "Новый чат";
    return;
  }
  $("#welcome").style.display = "none";
  $("#chatTitle").textContent = chat.title;
  m.querySelectorAll(".msg").forEach(n => n.remove());
  for (const msg of chat.messages) appendMessage(msg, false);
  scrollToBottom();
}
function scrollToBottom() {
  const m = $("#messages");
  requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; });
}

function appendMessage(msg, animate = true) {
  const m = $("#messages");
  const el = document.createElement("div");
  el.className = "msg " + msg.role;
  el.dataset.id = msg.id;
  const avatar = msg.role === "user"
    ? `<div class="ava">${ic("chat", 18)}</div>`
    : `<div class="ava">${ic("spark", 18)}</div>`;
  const who = msg.role === "user" ? "Ты" : BRAND.name;
  el.innerHTML = `
    ${avatar}
    <div class="body">
      <div class="who">${who}</div>
      <div class="content">${msg.role === "user" ? escUser(msg.content) : renderMarkdown(msg.content || "")}</div>
      ${msg.images?.length ? `<div class="thumbs">${msg.images.map(src => `<img src="${src}" alt=""/>`).join("")}</div>` : ""}
      <div class="actions"></div>
    </div>`;
  const actions = el.querySelector(".actions");
  if (msg.role === "user") {
    actions.innerHTML = `<button data-act="copy">${ic("copy", 14)} Копировать</button><button data-act="edit">${ic("edit", 14)} Изменить</button>`;
  } else {
    actions.innerHTML = `<button data-act="copy">${ic("copy", 14)} Копировать</button><button data-act="regen">${ic("regen", 14)} Перегенерить</button>`;
  }
  actions.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => onMsgAction(msg.id, b.dataset.act));
  });
  el.querySelectorAll(".thumbs img").forEach(img => {
    img.addEventListener("click", () => openLightbox(img.src));
  });
  el.querySelectorAll(".code-head button").forEach(b => {
    b.addEventListener("click", () => {
      const code = document.getElementById(b.dataset.copy).textContent;
      navigator.clipboard.writeText(code).then(() => {
        b.innerHTML = `${ic("check", 12)} Скопировано`;
        setTimeout(() => b.textContent = "Копировать", 1400);
      }).catch(() => toast("Не удалось скопировать", "err"));
    });
  });
  m.appendChild(el);
  scrollToBottom();
  return el;
}
function escUser(text) {
  return esc(text).replace(/\n/g, "<br>");
}
function onMsgAction(id, act) {
  const chat = getCurrentChat(); if (!chat) return;
  const i = chat.messages.findIndex(m => m.id === id); if (i < 0) return;
  const msg = chat.messages[i];
  if (act === "copy") {
    navigator.clipboard.writeText(msg.content).then(() => toast("Скопировано", "ok")).catch(() => {});
  } else if (act === "edit") {
    $("#input").value = msg.content;
    autoresize();
    $("#input").focus();
  } else if (act === "regen") {
    // удалить этот и все последующие и переотправить
    chat.messages = chat.messages.slice(0, i);
    saveChats();
    renderMessages();
    resendLast();
  }
}
function resendLast() {
  const chat = getCurrentChat(); if (!chat) return;
  const lastUser = [...chat.messages].reverse().find(m => m.role === "user");
  if (!lastUser) return;
  sendMessage(lastUser.content, lastUser.images || [], false, true);
}

/* ---------- API вызов ---------- */
function buildSystemPrompt(userText = "") {
  const p = PERSONAS[settings.persona] || PERSONAS.universal;
  let sys = settings.persona === "custom" && settings.customPersona
    ? `Ты — ${BRAND.name}. ${settings.customPersona}`
    : p.prompt;
  const modeHint = MODES[settings.mode]?.hint;
  if (modeHint) sys += `\n\n${modeHint}`;
  sys += `\n\nСегодня: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}.`;
  if (settings.memoryOn && settings.memory.length) {
    sys += `\n\nЧто ты знаешь о пользователе (учитывай в ответах):\n${settings.memory.map(m => `- ${m}`).join("\n")}`;
  }

  // точные вычисления — чтобы не врала в арифметике
  const calcs = findCalcs(userText);
  if (calcs.length) {
    sys += `\n\nТочный расчёт калькулятора (используй эти числа, не считай сам):\n` +
      calcs.map(c => `- ${c.expr} = ${c.value}`).join("\n");
  }

  // фрагменты из базы знаний пользователя
  const found = searchKnowledge(userText);
  if (found.length) {
    sys += `\n\nФрагменты из БАЗЫ ЗНАНИЙ пользователя. Отвечай, опираясь на них, и укажи, из какого документа взято. Если ответа там нет — честно скажи, что в базе этого нет:\n` +
      found.map(f => `--- «${f.title}» ---\n${f.chunk}`).join("\n\n");
  }
  return sys;
}
function apiPayload(chatMessages, opts = {}) {
  const lastUser = [...chatMessages].reverse().find(m => m.role === "user");
  const lastText = lastUser ? (typeof lastUser.content === "string" ? lastUser.content : (lastUser.content || []).filter(p => p.type === "text").map(p => p.text).join(" ")) : "";
  const sys = buildSystemPrompt(lastText);
  const msgs = [{ role: "system", content: sys }, ...chatMessages.map(toApiMsg)];
  const body = {
    model: settings.model,
    messages: msgs,
    stream: true,
    temperature: 0.7,
    max_tokens: 4096
  };
  if (settings.webSearch && settings.provider === "openrouter") {
    body.plugins = [{ id: "web", max_results: 3 }];
  }
  if (settings.provider === "openrouter") {
    body.provider = { sort: "throughput" };
  }
  return body;
}
function toApiMsg(m) {
  if (!m.images?.length) return { role: m.role, content: m.content };
  if (!lastModelVision) {
    // модель без зрения — отправим только текст + предупрежение
    return { role: m.role, content: m.content + "\n\n[Пользователь прикрепил фото, но текущая модель не поддерживает изображения. Попроси его сменить модель на ту, что с · со зрением.]" };
  }
  const parts = [];
  if (m.content) parts.push({ type: "text", text: m.content });
  for (const src of m.images) parts.push({ type: "image_url", image_url: { url: src } });
  return { role: m.role, content: parts };
}


/* ============================================================
   ФУНКЦИОНАЛ: навыки, база знаний, калькулятор
   ============================================================ */

/* ---------- 1. Библиотека навыков ---------- */
const SKILLS = [
  { cat: "Учёба", items: [
    { t: "Объясни тему", d: "Простыми словами, с примером", p: "Объясни тему «%s» простыми словами, по шагам, с примером из жизни. В конце задай мне один вопрос на проверку." },
    { t: "Реши задачу", d: "С «Дано», формулами и проверкой", p: "Реши задачу по шагам. Сначала «Дано», потом формулы, каждое действие с пояснением, ответ и проверка.\n\nУсловие: %s" },
    { t: "Сделай конспект", d: "Тезисы, формулы, что спросят", p: "Сделай конспект по теме «%s»: главное тезисами, определения и формулы отдельно, в конце 5 фактов, которые точно спросят на контрольной." },
    { t: "Проверь сочинение", d: "Найди ошибки и объясни", p: "Проверь моё сочинение: найди орфографические, пунктуационные, речевые и логические ошибки, объясни каждую и предложи исправление. Не переписывай всё целиком.\n\n%s" },
    { t: "План подготовки", d: "К контрольной за 3 дня", p: "Составь план подготовки к контрольной по теме «%s» на 3 дня: что учить, в каком порядке, какие задачи решить и как проверить себя." },
    { t: "Как пятилетнему", d: "Максимально просто", p: "Объясни «%s» так, чтобы понял пятилетний ребёнок. Потом объясни то же самое взрослому за одну минуту." },
    { t: "Шпаргалка", d: "Компактно, только суть", p: "Сделай шпаргалку по теме «%s»: только формулы, определения и ключевые даты, максимально компактно." },
    { t: "Переведи", d: "С сохранением смысла", p: "Переведи на русский, сохранив смысл и стиль. Идиомы поясни отдельно.\n\n%s" },
    { t: "Проверь мои ответы", d: "Тест по теме", p: "Устрой мне проверку по теме «%s»: задай 5 вопросов по одному, жди мой ответ, после каждого говори правильно или нет и объясняй почему." }
  ]},
  { cat: "Код", items: [
    { t: "Напиши код", d: "С объяснением", p: "Напиши код на %s. Объясни ключевые места и укажи крайние случаи." },
    { t: "Найди ошибку", d: "Причина и исправление", p: "Найди ошибку в коде, объясни причину и покажи исправленный вариант.\n\n```\n%s\n```" },
    { t: "Объясни код", d: "Что делает, по шагам", p: "Объясни, что делает этот код, по шагам. Какие будут крайние случаи?\n\n```\n%s\n```" },
    { t: "Упрости", d: "Короче, без смены поведения", p: "Упрости этот код, не меняя поведение. Покажи до и после и объясни, что улучшил.\n\n```\n%s\n```" },
    { t: "Сделай проект", d: "Пошаговый план для новичка", p: "Помоги сделать проект «%s». Дай план по шагам: что делать, в каком порядке и какой код на каждом шаге. Я новичок." },
    { t: "Собери регулярку", d: "С объяснением", p: "Напиши регулярное выражение для: %s. Объясни каждую часть и покажи примеры, что подходит и что нет." }
  ]},
  { cat: "Текст", items: [
    { t: "Сочинение", d: "План, потом текст", p: "Помоги с сочинением на тему «%s». Сначала план по частям, потом текст живым языком, без штампов и канцелярита." },
    { t: "Сократи", d: "Главное без воды", p: "Сократи текст в три раза, сохранив все главные мысли. Потом сформулируй его в одном предложении.\n\n%s" },
    { t: "Перепиши красиво", d: "Живым языком", p: "Перепиши текст живым, естественным языком. Смысл сохрани, штампы убери.\n\n%s" },
    { t: "Пост или письмо", d: "Под нужный тон", p: "Напиши: %s. Тон: %s. Без штампов и вежливых отговорок." }
  ]},
  { cat: "Жизнь", items: [
    { t: "Составь план", d: "Цель → маленькие шаги", p: "Помоги спланировать: %s. Разбей на маленькие шаги с датами, учитывай, что у меня мало времени." },
    { t: "Выбери из вариантов", d: "Таблица плюсов и минусов", p: "Помоги выбрать. Сравни варианты по плюсам и минусам в таблице и дай честную рекомендацию: %s" },
    { t: "Разбери ситуацию", d: "Спокойно и по делу", p: "Помоги разобраться в ситуации: %s. Скажи прямо, что я делаю не так и что сделать в первую очередь." },
    { t: "Скажи честно", d: "Жёстко, без отговорок", p: "Оцени честно и жёстко, без вежливых отговорок: %s. Скажи, что плохо, и что конкретно исправить." }
  ]}
];

let skillQuery = "";
let chatQuery = "";

function renderSkills() {
  const box = $("#skillsBody");
  if (!box) return;
  box.innerHTML = "";
  const q = skillQuery.trim().toLowerCase();
  let shown = 0;
  for (const group of SKILLS) {
    const items = group.items.filter(it => !q || (it.t + " " + it.d).toLowerCase().includes(q));
    if (!items.length) continue;
    const head = document.createElement("div");
    head.className = "skill-cat";
    head.textContent = group.cat;
    box.appendChild(head);
    for (const it of items) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "skill-card";
      card.innerHTML = `<span class="st">${esc(it.t)}</span><span class="sd">${esc(it.d)}</span>`;
      card.addEventListener("click", () => useSkill(it));
      box.appendChild(card);
      shown++;
    }
  }
  if (!shown) box.innerHTML = '<div class="skill-empty">Ничего не нашлось. Напиши навык иначе.</div>';
}

function useSkill(skill) {
  closeSkills();
  const input = $("#input");
  const has = skill.p.includes("%s");
  // если в поле уже что-то есть — подставим это в место %s
  const existing = input.value.trim();
  if (has && existing) {
    input.value = skill.p.replace("%s", existing);
  } else {
    input.value = skill.p.replace(/%s/g, "");
    input.placeholder = "Допиши тему и нажми Enter…";
  }
  autoresize();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  if (!has) toast("Навык применён");
}
function openSkills() { renderSkills(); $("#skillsModal").classList.add("open"); if ($("#skillSearch")) $("#skillSearch").value = skillQuery = ""; const i = $("#skillSearch"); if (i) setTimeout(() => i.focus(), 50); }
function closeSkills() { $("#skillsModal").classList.remove("open"); }

/* ---------- 2. База знаний (поиск по своим текстам) ---------- */
function chunkText(text, size = 700) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= size) return [clean];
  const parts = [];
  let buf = "";
  for (const sent of clean.split(/(?<=[.!?])\s+/)) {
    if ((buf + " " + sent).length > size && buf) { parts.push(buf.trim()); buf = sent; }
    else buf += (buf ? " " : "") + sent;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [clean];
}
function tokenize(str) {
  return (String(str).toLowerCase().match(/[а-яёa-z0-9]{3,}/gi) || []);
}
function stem(t) {
  return t.replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ией|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ов|ев|ах|ях|ам|ям|ом|ем|ы|и|а|я|е|у|ю|о|ь)$/, "");
}
function searchKnowledge(query, limit = 3) {
  if (!settings.knowledgeOn || !(settings.knowledge || []).length) return [];
  const qStems = [...new Set(tokenize(query).map(stem))].filter(t => t.length > 2);
  if (!qStems.length) return [];
  const scored = [];
  for (const doc of settings.knowledge) {
    for (const chunk of chunkText(doc.text)) {
      const cs = new Set(tokenize(chunk).map(stem));
      let matches = 0;
      for (const q of qStems) if (cs.has(q)) matches++;
      if (!matches) continue;
      scored.push({ title: doc.title, chunk, score: matches / qStems.length });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).filter(r => r.score >= 0.2);
}
function renderKnowledge() {
  const box = $("#kbList");
  if (!box) return;
  const docs = settings.knowledge || [];
  box.innerHTML = "";
  if (!docs.length) {
    box.innerHTML = '<div class="kb-empty">Пока пусто. Вставь конспект или загрузи .txt — Искра будет отвечать по нему.</div>';
    return;
  }
  docs.forEach(doc => {
    const row = document.createElement("div");
    row.className = "kb-item";
    const info = document.createElement("div");
    info.className = "kb-info";
    info.innerHTML = `<b>${esc(doc.title)}</b><span>${doc.text.length.toLocaleString("ru-RU")} символов · ${chunkText(doc.text).length} фрагментов</span>`;
    const del = document.createElement("button");
    del.className = "kb-del";
    del.innerHTML = ic("trash", 15);
    del.title = "Удалить";
    del.addEventListener("click", () => {
      settings.knowledge = settings.knowledge.filter(x => x.id !== doc.id);
      saveSettings(); renderKnowledge(); updateKnowledgeChip();
    });
    row.append(info, del);
    box.appendChild(row);
  });
}
function addKnowledge(title, text) {
  text = String(text || "").trim();
  if (text.length < 20) { toast("Слишком короткий текст", "err"); return; }
  title = (title || "").trim() || ("Документ " + ((settings.knowledge?.length || 0) + 1));
  if (!settings.knowledge) settings.knowledge = [];
  settings.knowledge.push({ id: uid(), title, text: text.slice(0, 200000), ts: Date.now() });
  settings.knowledgeOn = true;
  saveSettings();
  renderKnowledge();
  updateKnowledgeChip();
  updateModelChip();
  toast(`Добавлено: ${title}`, "ok");
}
function updateKnowledgeChip() {
  const b = $("#kbTop");
  if (!b) return;
  const n = (settings.knowledge || []).length;
  b.classList.toggle("on", !!settings.knowledgeOn && n > 0);
  b.title = n ? `База знаний: ${n} док.` : "База знаний пуста";
}
function openKnowledge() {
  renderKnowledge();
  updateKnowledgeChip();
  const t = $("#kbToggle");
  if (t) t.checked = !!settings.knowledgeOn;
  $("#kbModal").classList.add("open");
}
function closeKnowledge() { $("#kbModal").classList.remove("open"); }

/* ---------- 3. Калькулятор (точные вычисления) ---------- */
function safeCalc(expr) {
  let e = String(expr).replace(/,/g, ".").replace(/[×х]/gi, "*").replace(/÷/g, "/").replace(/−/g, "-");
  e = e.replace(/\s+/g, "");
  if (!/^[\d+\-*/^().%]+$/.test(e)) return null;
  if (!/\d/.test(e)) return null;
  if (!/[+\-*/^%]/.test(e)) return null;
  const js = e.replace(/\^/g, "**").replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
  try {
    const v = Function('"use strict";return (' + js + ')')();
    if (typeof v !== "number" || !isFinite(v)) return null;
    return { expr: e, value: Math.round(v * 1e10) / 1e10 };
  } catch (e2) { return null; }
}
function findCalcs(text) {
  const cands = String(text).match(/[\d(][\d\s+\-*/^().%×÷−,]*[\d)]/g) || [];
  const out = [];
  for (const c of cands) {
    const clean = c.trim();
    if (clean.length < 3) continue;
    const r = safeCalc(clean);
    if (r) out.push(r);
    if (out.length >= 3) break;
  }
  return out;
}

/* ---------- Стриминг ---------- */
async function streamChat(payload, onDelta, signal) {
  const base = settings.provider === "custom" ? (settings.baseUrl || "").replace(/\/+$/, "") : PROVIDERS[settings.provider].base;
  if (!/^https?:\/\//i.test(base)) {
    throw new ApiError(0, "Не указан адрес сервера (Base URL). Открой настройки → провайдер «Свой URL» → впиши адрес вида https://api.example.com/v1, либо переключись на Groq или OpenRouter.", "custom-empty");
  }
  const url = base + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) headers["Authorization"] = "Bearer " + settings.apiKey;
  if (settings.provider === "openrouter") {
    headers["HTTP-Referer"] = location.origin || "https://iskra.app";
    headers["X-Title"] = BRAND.name;
  }
  const res = await fetch(url, {
    method: "POST", headers, body: JSON.stringify(payload), signal
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const e = new ApiError(res.status, txt);
    e.url = url;
    throw e;
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    const data = await res.json();
    onDelta(data.choices?.[0]?.message?.content || "");
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content || j.choices?.[0]?.message?.content || "";
        if (delta) onDelta(delta);
      } catch(e) { /* skip */ }
    }
  }
}

class ApiError extends Error {
  constructor(status, body, kind) {
    super(body && typeof body === "string" ? body : "HTTP " + status);
    this.status = status;
    this.body = body;
    this.kind = kind;
  }
}
function friendlyError(err) {
  if (err && err.kind === "custom-empty") {
    return { status: 0, hint: "В настройках выбран «Свой URL», но адрес пустой — запрос уходит в пустоту. Открой ⚙ и либо впиши адрес вида https://api.example.com/v1, либо переключись на Groq." };
  }
  const s = err.status;
  const hint = {
    401: "Неверный API ключ. Проверь в настройках.",
    402: "Кончились кредиты. Попробуй другую :free модель или провайдера.",
    403: "Доступ закрыт. Возможно, регион или модель не разрешены.",
    404: "Модель не найдена или удалена. Выбери другую из списка.",
    405: "Сервер не принимает такой запрос. Чаще всего это значит: в настройках выбран «Свой URL», но адрес пустой или неверный — тогда запрос уходит не туда. Переключись на Groq или OpenRouter.",
    429: "Слишком много запросов. Подожди 30 секунд.",
    500: "Ошибка сервера провайдера. Попробуй ещё раз.",
    503: "Сервис недоступен. Попробуй позже."
  }[s] || "Не удалось получить ответ. Проверь интернет и настройки.";
  return { status: s, hint };
}

/* ---------- Отправка ---------- */
async function sendMessage(text, images = [], addChat = true, isResend = false) {
  const trimmed = text.trim();
  if (!trimmed && !images.length) return;

  // Режим «Картинка»: текст становится промптом для рисования
  if (settings.mode === "art" && trimmed && !images.length) {
    $("#input").value = "";
    autoresize();
    return generateImage(trimmed);
  }
  if (!settings.apiKey && settings.provider !== "custom") {
    toast("Сначала добавь API ключ в настройках ⚙", "err");
    openSettings();
    return;
  }
  if (!settings.model) {
    toast("Выбери модель в настройках", "err");
    return;
  }

  if (!currentChatId) createChat(titleFromText(trimmed));
  const chat = chats[currentChatId];

  // Первое сообщение — задаём заголовок
  if (!isResend && chat.messages.length === 0) {
    chat.title = titleFromText(trimmed);
    renderChatsList();
  }

  const userMsg = { id: uid(), role: "user", content: trimmed, images: images.length ? [...images] : undefined, ts: Date.now() };
  if (addChat) {
    chat.messages.push(userMsg);
    saveChats();
  }
  $("#welcome").style.display = "none";
  appendMessage(userMsg);
  $("#input").value = "";
  pendingImages = [];
  renderImgStrip();
  autoresize();

  // Авто-память
  if (settings.memoryOn) {
    const m = trimmed.match(/^(?:запомни(?:,\s*что)?|сохрани(?:,\s*что)?)[:\s]+(.+)/i);
    if (m) {
      const fact = m[1].trim();
      if (fact && !settings.memory.includes(fact)) {
        settings.memory.push(fact);
        saveSettings();
        toast(`Запомнил: ${fact}`, "ok");
      }
    }
  }

  // AI placeholder
  const aiMsg = { id: uid(), role: "assistant", content: "", ts: Date.now() };
  chat.messages.push(aiMsg);
  const el = appendMessage(aiMsg);
  const contentEl = el.querySelector(".content");
  contentEl.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;

  const sendBtn = $("#send");
  sendBtn.classList.add("stop");
  sendBtn.innerHTML = ic("x", 22);
  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;

  let acc = "";
  try {
    const recent = chat.messages.slice(-20);
    const payload = apiPayload(recent);
    await streamChat(payload, (delta) => {
      acc += delta;
      contentEl.innerHTML = renderMarkdown(acc);
      // rewire copy buttons
      contentEl.querySelectorAll(".code-head button[data-copy]").forEach(b => {
        b.onclick = () => {
          const code = document.getElementById(b.dataset.copy).textContent;
          navigator.clipboard.writeText(code).then(() => {
            b.innerHTML = `${ic("check", 12)} Скопировано`;
            setTimeout(() => b.textContent = "Копировать", 1400);
          }).catch(() => {});
        };
      });
      scrollToBottom();
    }, signal);

    aiMsg.content = acc;

    // Авто-память по ответу (если модель сама выделила факты)
    // Не будем парсить ответ, чтобы не мусорить. Только пользовательские «запомни».

    saveChats();
    // rewire action buttons
    el.querySelector(".actions").innerHTML = `<button data-act="copy">${ic("copy", 14)} Копировать</button><button data-act="regen">${ic("regen", 14)} Перегенерить</button>`;
    el.querySelectorAll(".actions button").forEach(b => {
      b.addEventListener("click", () => onMsgAction(aiMsg.id, b.dataset.act));
    });
  } catch(err) {
    if (err.name === "AbortError") {
      aiMsg.content = acc + "\n\n*[Остановлено]*";
      contentEl.innerHTML = renderMarkdown(aiMsg.content);
      saveChats();
    } else {
      chat.messages.pop();
      saveChats();
      el.remove();
      const { status, hint } = friendlyError(err);
      toast(`Ошибка${status ? " " + status : ""}: ${hint}`, "err");
      if (status === 401 || (err && err.kind === "custom-empty")) openSettings();
    }
  } finally {
    sendBtn.classList.remove("stop");
    sendBtn.innerHTML = ic("send", 22);
    abortCtrl = null;
  }
}

/* ---------- Фото ---------- */
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let { width, height } = img;
          if (width > max || height > max) {
            if (width > height) { height = Math.round(height * max / width); width = max; }
            else { width = Math.round(width * max / height); height = max; }
          }
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = r.result;
      } catch(e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function handleFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    if (pendingImages.length >= 5) { toast("Максимум 5 фото", "err"); break; }
    try {
      const data = await compressImage(f);
      pendingImages.push(data);
    } catch(e) {
      toast("Не удалось прочитать фото", "err");
    }
  }
  renderImgStrip();
}
function renderImgStrip() {
  const s = $("#imgStrip");
  if (!pendingImages.length) { s.style.display = "none"; s.innerHTML = ""; return; }
  s.style.display = "flex";
  s.innerHTML = pendingImages.map((src, i) =>
    `<div class="thumb"><img src="${src}"/><button data-i="${i}" title="Убрать">${ic("x", 12)}</button></div>`
  ).join("");
  s.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      pendingImages.splice(+b.dataset.i, 1);
      renderImgStrip();
    });
  });
}

/* ---------- Генерация картинок (Pollinations) ---------- */
async function generateImage(prompt) {
  if (!prompt.trim()) return;
  if (!currentChatId) createChat(titleFromText("Нарисовать: " + prompt));
  const chat = chats[currentChatId];
  const userMsg = { id: uid(), role: "user", content: "🎨 " + prompt, ts: Date.now() };
  chat.messages.push(userMsg);
  $("#welcome").style.display = "none";
  appendMessage(userMsg);

  const aiMsg = { id: uid(), role: "assistant", content: "", ts: Date.now() };
  chat.messages.push(aiMsg);
  const el = appendMessage(aiMsg);
  const contentEl = el.querySelector(".content");
  contentEl.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;

  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;
  const img = new Image();
  img.onload = () => {
    aiMsg.content = `Готово ✦`;
    aiMsg.image = url;
    contentEl.innerHTML = `
      <p>${esc(prompt)}</p>
      <img class="gen-img" src="${url}" alt=""/>
      <div class="gen-actions">
        <button data-act="dl">${ic("download", 16)} Скачать</button>
        <button data-act="again">${ic("regen", 16)} Ещё вариант</button>
      </div>`;
    contentEl.querySelector(".gen-img").addEventListener("click", () => openLightbox(url));
    contentEl.querySelector('[data-act="dl"]').addEventListener("click", () => downloadImage(url, prompt));
    contentEl.querySelector('[data-act="again"]').addEventListener("click", () => generateImage(prompt));
    saveChats();
  };
  img.onerror = () => {
    contentEl.innerHTML = `<p>Не удалось нарисовать. Сервер мог быть перегружен.</p>
      <div class="gen-actions"><button data-act="again">${ic("regen", 16)} Попробовать снова</button></div>`;
    contentEl.querySelector('[data-act="again"]').addEventListener("click", () => generateImage(prompt));
    chat.messages.pop(); saveChats();
    toast("Ошибка генерации", "err");
  };
  img.src = url;
}
async function downloadImage(url, prompt) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (prompt.slice(0, 40).replace(/[^\wа-яА-ЯёЁ ]+/g, "") || "iskra") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch(e) {
    window.open(url, "_blank");
  }
}

/* ---------- UI: настройки ---------- */
/* Показывает/прячет поле «Base URL» и предупреждение о пустом адресе */
function syncProviderUI() {
  const activeProv = document.querySelector('#providerBtns button.active')?.dataset.p || settings.provider;
  const isCustom = activeProv === "custom";
  const field = $("#customUrlField");
  if (field) field.style.display = isCustom ? "" : "none";
  const hint = $("#provHint");
  if (hint && PROVIDERS[activeProv]) hint.textContent = PROVIDERS[activeProv].hint;
  const warn = $("#baseUrlWarn");
  if (warn) {
    const empty = !(($("#baseUrl")?.value || "").trim());
    warn.style.display = (isCustom && empty) ? "block" : "none";
  }
}

function openSettings() {
  $("#settingsModal").classList.add("open");
  // populate
  $$("#providerBtns button").forEach(b => b.classList.toggle("active", b.dataset.p === settings.provider));
  syncProviderUI();
  $("#apiKey").value = settings.apiKey || "";
  $("#model").value = settings.model || "";
  $("#baseUrl").value = settings.baseUrl || "";
  $("#baseUrl").addEventListener("input", syncProviderUI);
  $("#customUrlField").style.display = settings.provider === "custom" ? "" : "none";
  $("#provHint").textContent = PROVIDERS[settings.provider].hint;
  $("#memoryOn").checked = !!settings.memoryOn;
  $("#webSearch").checked = !!settings.webSearch;
  renderPersonaGrid();
  renderThemeGrid();
  updateModelHint();
  showFallbackModels();
  const cr = $("#connResult"); if (cr) { cr.textContent = ""; cr.className = "conn-result"; }   // сразу показываем проверенный список бесплатных моделей
}
function renderPersonaGrid() {
  const g = $("#personaGrid");
  g.innerHTML = "";
  for (const [k, p] of Object.entries(PERSONAS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "persona-btn" + (settings.persona === k ? " active" : "");
    b.innerHTML = `<span class="pn">${esc(p.name)}</span><span class="pd">${esc(p.desc)}</span>`;
    b.addEventListener("click", () => {
      settings.persona = k;
      renderPersonaGrid();
      $("#customPersona").style.display = k === "custom" ? "" : "none";
    });
    g.appendChild(b);
  }
  $("#customPersona").value = settings.customPersona || "";
  $("#customPersona").style.display = settings.persona === "custom" ? "" : "none";
}
function renderThemeGrid() {
  const g = $("#themeGrid");
  g.innerHTML = "";
  for (const k of THEME_ORDER) {
    const t = THEMES[k];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-btn" + (settings.theme === k ? " active" : "");
    b.dataset.theme = k;
    b.title = t.name;
    const sw = document.createElement("span");
    sw.className = "sw";
    sw.style.background = `linear-gradient(135deg, ${t.accent}, ${t.soft})`;
    const nm = document.createElement("span");
    nm.className = "tn";
    nm.textContent = t.name;
    b.append(sw, nm);
    b.addEventListener("click", () => {
      settings.theme = k;
      applyTheme(k);
      renderThemeGrid();
    });
    g.appendChild(b);
  }
}
function updateModelHint() {
  const models = FALLBACK_MODELS[settings.provider] || [];
  const hit = models.find(m => m.id === settings.model);
  const def = models[0];
  if (hit) {
    $("#modelHint").textContent = `${hit.name} • контекст ${hit.ctx}K`;
  } else if (def) {
    $("#modelHint").textContent = `По умолчанию: ${def.name}`;
  } else {
    $("#modelHint").textContent = "Введи id модели";
  }
}
async function loadModelsList() {
  const base = settings.provider === "custom" ? settings.baseUrl.replace(/\/+$/, "") : PROVIDERS[settings.provider].base;
  const headers = {};
  if (settings.apiKey) headers["Authorization"] = "Bearer " + settings.apiKey;
  $("#loadModels").textContent = "...";
  try {
    const r = await fetch(base + "/models", { headers });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const list = (j.data || j.models || []).map(m => {
      const id = m.id || m.name;
      const ctx = Math.round((m.context_length || 4096) / 1000);
      const modalities = m.architecture?.input_modalities || m.input_modalities || [];
      const vision = Array.isArray(modalities) ? modalities.includes("image") : guessVision(id);
      return { id, ctx, vision };
    }).filter(m => m.id).sort((a,b) => a.id.localeCompare(b.id));
    if (!list.length) { showFallbackModels(); return; }
    renderModelsBox(list);
    $("#modelsListField").style.display = "";
    toast(`Загружено ${list.length} моделей`, "ok");
  } catch(e) {
    showFallbackModels();
  } finally {
    $("#loadModels").textContent = "Список";
  }
}
/* Проверенный список бесплатных моделей — если живой не загрузился */
function showFallbackModels() {
  const list = (FALLBACK_MODELS[settings.provider] || []).map(m => ({
    id: m.id, name: m.name, ctx: m.ctx, vision: m.vision
  }));
  if (!list.length) {
    renderModelsBox([]);
    $("#modelsListField").style.display = "";
    const box = $("#modelsBox");
    if (box) box.innerHTML = '<div class="mp-note">Для своего сервера список неизвестен — впиши id модели в поле выше.</div>';
    return;
  }
  renderModelsBox(list);
  $("#modelsListField").style.display = "";
  toast(`${list.length} бесплатных моделей`, "ok");
}
function renderModelsBox(list) {
  const box = $("#modelsBox");
  box.innerHTML = "";
  for (const m of list) {
    const row = document.createElement("div");
    row.className = "model-row" + (settings.model === m.id ? " sel" : "");
    row.innerHTML = `
      ${m.vision ? ic("eye", 14) : ""}
      <span class="mid">${esc(m.name || m.id)}<em>${m.name ? esc(m.id) : ""}</em></span>
      <span class="mbadge">${m.ctx}K</span>`;
    row.addEventListener("click", () => {
      settings.model = m.id;
      lastModelVision = m.vision;
      $("#model").value = m.id;
      renderModelsBox(list);
      updateModelChip();
      updateModelHint();
    });
    box.appendChild(row);
  }
}
function updateModelChip() {
  const n = settings.model || "—";
  const short = modelDisplayName(n);
  $("#modelChipName").textContent = short;
  $("#modelChip").title = n;
}

/* ---------- Память ---------- */
function openMemory() {
  $("#memoryModal").classList.add("open");
  renderMemList();
}
function renderMemList() {
  const l = $("#memList");
  if (!settings.memory.length) {
    l.innerHTML = `<div class="mem-empty">Пока пусто. Напиши в чате «запомни, что ...» или добавь вручную.</div>`;
    return;
  }
  l.innerHTML = "";
  settings.memory.forEach((m, i) => {
    const it = document.createElement("div");
    it.className = "mem-item";
    it.innerHTML = `<span class="mt">${esc(m)}</span><button title="Удалить">${ic("trash", 14)}</button>`;
    it.querySelector("button").addEventListener("click", () => {
      settings.memory.splice(i, 1);
      saveSettings();
      renderMemList();
    });
    l.appendChild(it);
  });
}

/* ---------- Lightbox ---------- */
function openLightbox(src) {
  $("#lbImg").src = src;
  $("#lightbox").classList.add("show");
}
function closeLightbox() {
  $("#lightbox").classList.remove("show");
  $("#lbImg").src = "";
}

/* ---------- Экспорт ---------- */
function exportChat() {
  const c = getCurrentChat();
  if (!c || !c.messages.length) { toast("Нет чата для экспорта", "err"); return; }
  let md = `# ${c.title}\n\n_Экспорт из ${BRAND.name}, ${new Date().toLocaleString("ru-RU")}_\n\n---\n\n`;
  for (const m of c.messages) {
    md += `## ${m.role === "user" ? "Ты" : BRAND.name}\n\n${m.content}\n\n`;
  }
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (c.title.slice(0, 30).replace(/[^\wа-яА-ЯёЁ ]+/g, "") || "chat") + ".md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Sidebar mobile ---------- */
function openSidebar() { $("#sidebar").classList.add("open"); $("#sbBackdrop").classList.add("show"); }
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sbBackdrop").classList.remove("show"); }

/* ---------- PWA install ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem("iskra.install.dismissed")) {
    $("#installBanner").classList.add("show");
  }
});

/* ---------- События ---------- */

/* ---------- Режимы: отрисовка и переключение ---------- */
function renderModebar() {
  const bar = $("#modebar");
  if (!bar) return;
  bar.innerHTML = "";
  for (const key of MODE_ORDER) {
    const m = MODES[key];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mode-pill" + (settings.mode === key ? " on" : "");
    b.dataset.mode = key;
    b.innerHTML = ic(m.icon, 17) + `<span>${m.name}</span>`;
    b.title = m.sub;
    b.addEventListener("click", () => setMode(key));
    bar.appendChild(b);
  }
}
function renderModeCards() {
  const grid = $("#modesGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const key of MODE_ORDER) {
    const m = MODES[key];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mcard" + (settings.mode === key ? " on" : "");
    b.dataset.mode = key;
    b.innerHTML = `<span class="mic">${ic(m.icon, 21)}</span>
      <span class="mtitle">${m.name}</span>
      <span class="mdesc">${m.desc || m.sub}</span>`;
    b.addEventListener("click", () => { setMode(key); $("#input").focus(); });
    grid.appendChild(b);
  }
}
function setMode(key) {
  if (!MODES[key]) return;
  settings.mode = key;
  saveSettings();
  applyMode();
}
function applyMode() {
  const m = MODES[settings.mode] || MODES.chat;
  document.documentElement.dataset.mode = settings.mode;

  // фон-обстановка
  const amb = $("#ambient");
  if (amb) amb.innerHTML = motifSvg(settings.mode);

  // иконка и подпись на главном экране
  const wi = $("#welcomeIcon");
  if (wi) wi.innerHTML = ic(m.icon, 34, settings.mode === "chat" ? "fill" : "");
  const wt = $("#welcomeTag");
  if (wt) wt.textContent = m.sub;
  const st = $("#send");
  if (st && !st.classList.contains("stop")) st.innerHTML = ic(m.image ? "brush" : "arrowUp", 22);
  const inp = $("#input");
  if (inp) inp.placeholder = m.ph;

  $("#modesGrid") && renderModeCards();
  renderModebar();
}
function onModeChipClick() {
  const k = settings.mode;
  if (k === "art") { $("#input").placeholder = MODES.art.ph; }
  $("#input").focus();
}


/* ---------- Проверка подключения ---------- */
async function testConnection() {
  const box = $("#connResult");
  if (!box) return;
  const key = ($("#apiKey").value || "").trim();
  const provider = $("#provider") ? (document.querySelector('#providerBtns button.active')?.dataset.p || settings.provider) : settings.provider;
  const model = ($("#model").value || "").trim();
  const base = provider === "custom" ? ($("#baseUrl").value || "").replace(/\/+$/, "") : PROVIDERS[provider].base;

  if (!key && provider !== "custom") { box.className = "conn-result err"; box.textContent = "Сначала вставь ключ"; return; }
  if (!model) { box.className = "conn-result err"; box.textContent = "Выбери модель"; return; }
  if (!base) { box.className = "conn-result err"; box.textContent = "Укажи Base URL"; return; }

  box.className = "conn-result wait";
  box.innerHTML = '<span class="spin"></span> Проверяю…';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);

  try {
    const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + key };
    if (provider === "openrouter") { headers["HTTP-Referer"] = location.origin; headers["X-Title"] = BRAND.name; }
    const res = await fetch(base + "/chat/completions", {
      method: "POST", headers, signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Скажи одно слово: работает" }],
        max_tokens: 20,
        stream: false
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.error?.message || j.message || ""; } catch(e) {}
      box.className = "conn-result err";
      box.textContent = `Не работает: HTTP ${res.status}${detail ? " — " + String(detail).slice(0, 90) : ""}`;
      return;
    }
    const j = await res.json().catch(() => ({}));
    const answer = j.choices?.[0]?.message?.content;
    box.className = "conn-result ok";
    box.textContent = answer ? `Работает ✓ Модель ответила: «${String(answer).trim().slice(0, 40)}»` : "Ключ и модель работают ✓";
  } catch (e) {
    clearTimeout(timer);
    box.className = "conn-result err";
    box.textContent = e.name === "AbortError"
      ? "Нет ответа за 20 секунд. Проверь интернет (в превью внутри чата сети нет)"
      : "Ошибка сети: " + e.message;
  }
}

function wire() {
  // Бренд в DOM
  $("#brandName").textContent = BRAND.name;
  document.title = `${BRAND.name} — ИИ-ассистент`;

  // Composer
  const input = $("#input");
  input.addEventListener("input", autoresize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#composer").requestSubmit();
    }
  });
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    if (abortCtrl) { abortCtrl.abort(); return; }
    const txt = input.value;
    const images = [...pendingImages];
    if (pendingWeb) {
      settings.webSearch = true;
      $("#webBtn").classList.add("on");
      pendingWeb = false;
    }
    if (!txt.trim() && !images.length) return;
    sendMessage(txt, images);
  });

  // Attach
  $("#attachBtn").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", (e) => { handleFiles(e.target.files); e.target.value = ""; });
  document.addEventListener("paste", (e) => {
    if (!e.clipboardData) return;
    const files = [...e.clipboardData.items].filter(i => i.kind === "file" && i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) handleFiles(files);
  });

  // Art
  if ($("#artBtn")) {
    $("#artBtn").addEventListener("click", () => setMode("art"));
  }
  $("#webBtn").addEventListener("click", () => {
    const on = !$("#webBtn").classList.contains("on");
    $("#webBtn").classList.toggle("on", on);
    settings.webSearch = on;
    saveSettings();
    if (on && settings.provider !== "openrouter") {
      toast("Веб-поиск работает только на OpenRouter", "err");
    }
  });

  // Чип модели
  $("#modelChip").addEventListener("click", openModelPicker);
  $("#modelClose") && $("#modelClose").addEventListener("click", closeModelPicker);
  $("#modelModal") && $("#modelModal").addEventListener("click", (e) => { if (e.target.id === "modelModal") closeModelPicker(); });

  // Сайдбар
  $("#menuBtn").addEventListener("click", openSidebar);
  $("#sbBackdrop").addEventListener("click", closeSidebar);
  $("#newChat").addEventListener("click", () => {
    currentChatId = null;
    renderChatsList();
    renderMessages();
    closeSidebar();
  });
  $("#exportChat").addEventListener("click", exportChat);
  $("#clearAll").addEventListener("click", () => {
    if (!Object.keys(chats).length) { toast("Уже пусто"); return; }
    if (confirm("Удалить ВСЕ чаты безвозвратно?")) {
      chats = {};
      currentChatId = null;
      saveChats();
      renderChatsList();
      renderMessages();
      toast("Все чаты удалены", "ok");
    }
  });

  // Шапка
  $("#themeBtn").addEventListener("click", (ev) => {
    const i = THEME_ORDER.indexOf(settings.theme);
    const next = THEME_ORDER[(i + 1) % THEME_ORDER.length];
    settings.theme = next;
    saveSettings();
    applyTheme(next, ev);
    toast(`Тема: ${THEMES[next].name}`, "ok");
  });
  $("#memoryTop").addEventListener("click", openMemory);
  $("#settingsIcon").addEventListener("click", openSettings);

  // Модалка настроек
  $$("#providerBtns button").forEach(b => b.addEventListener("click", () => {
    settings.provider = b.dataset.p;
    $$("#providerBtns button").forEach(x => x.classList.toggle("active", x === b));
    $("#customUrlField").style.display = b.dataset.p === "custom" ? "" : "none";
    syncProviderUI();
    $("#provHint").textContent = PROVIDERS[b.dataset.p].hint;
    const fb = FALLBACK_MODELS[b.dataset.p]?.[0];
    if (fb && !settings.model) {
      settings.model = fb.id;
      $("#model").value = fb.id;
    }
    updateModelHint();
    updateModelChip();
  }));
  $("#loadModels").addEventListener("click", loadModelsList);
  $("#testConn") && $("#testConn").addEventListener("click", testConnection);

  // Навыки
  $("#skillsBtn") && $("#skillsBtn").addEventListener("click", openSkills);
  $("#skillsClose") && $("#skillsClose").addEventListener("click", closeSkills);
  $("#skillsModal") && $("#skillsModal").addEventListener("click", (e) => { if (e.target.id === "skillsModal") closeSkills(); });
  $("#skillSearch") && $("#skillSearch").addEventListener("input", (e) => { skillQuery = e.target.value; renderSkills(); });

  // База знаний
  $("#kbTop") && $("#kbTop").addEventListener("click", openKnowledge);
  $("#kbClose") && $("#kbClose").addEventListener("click", closeKnowledge);
  $("#kbModal") && $("#kbModal").addEventListener("click", (e) => { if (e.target.id === "kbModal") closeKnowledge(); });
  $("#kbAdd") && $("#kbAdd").addEventListener("click", () => {
    addKnowledge($("#kbTitle").value, $("#kbText").value);
    $("#kbTitle").value = ""; $("#kbText").value = "";
  });
  $("#kbFile") && $("#kbFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    addKnowledge(f.name.replace(/\.(txt|md|markdown|csv|json)$/i, ""), text);
    e.target.value = "";
  });
  $("#kbToggle") && $("#kbToggle").addEventListener("change", (e) => {
    settings.knowledgeOn = e.target.checked; saveSettings(); updateKnowledgeChip();
  });

  // Поиск по чатам
  $("#chatSearch") && $("#chatSearch").addEventListener("input", (e) => {
    chatQuery = e.target.value;
    renderChatsList();
  });
  $("#closeSettings").addEventListener("click", () => $("#settingsModal").classList.remove("open"));
  $("#saveSettings").addEventListener("click", () => {
    settings.apiKey = $("#apiKey").value.trim();
    settings.model = $("#model").value.trim() || (FALLBACK_MODELS[settings.provider]?.[0]?.id) || "";
    lastModelVision = guessVision(settings.model);
    settings.baseUrl = $("#baseUrl").value.trim();
    settings.customPersona = $("#customPersona").value.trim();
    settings.memoryOn = $("#memoryOn").checked;
    settings.webSearch = $("#webSearch").checked;
    $("#webBtn").classList.toggle("on", settings.webSearch);
    saveSettings();
    updateModelChip();
    $("#settingsModal").classList.remove("open");
    toast("Настройки сохранены", "ok");
  });

  // Память
  $("#closeMemory").addEventListener("click", () => $("#memoryModal").classList.remove("open"));
  $("#memAdd").addEventListener("click", () => {
    const v = $("#memInput").value.trim();
    if (!v) return;
    if (settings.memory.length >= 50) { toast("Максимум 50 фактов", "err"); return; }
    settings.memory.push(v);
    saveSettings();
    $("#memInput").value = "";
    renderMemList();
  });
  $("#memInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#memAdd").click(); } });

  // Lightbox
  $("#lbClose").addEventListener("click", closeLightbox);
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeLightbox(); closeSkills(); closeKnowledge(); closeModelPicker(); closeSettings(); closeMemory(); } });

  // Режимы работы
  renderModeCards();
  applyMode();

  // Install
  $("#installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#installBanner").classList.remove("show");
  });
  $("#installDismiss").addEventListener("click", () => {
    $("#installBanner").classList.remove("show");
    localStorage.setItem("iskra.install.dismissed", "1");
  });

  // Тема
  applyTheme(settings.theme);
  $("#webBtn").classList.toggle("on", !!settings.webSearch);

  // Модель по умолчанию
  if (!settings.model) {
    const fb = FALLBACK_MODELS[settings.provider]?.[0];
    if (fb) settings.model = fb.id;
    saveSettings();
  }
  lastModelVision = guessVision(settings.model);
  updateModelChip();
  renderImgStrip();
  renderModeCards();
  applyMode();

  // Чаты
  renderChatsList();
  // Восстановим последний активный
  const lastId = Object.values(chats).sort((a,b) => b.created - a.created)[0]?.id;
  if (lastId) { currentChatId = lastId; renderChatsList(); renderMessages(); }

  // SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function autoresize() {
  const t = $("#input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 240) + "px";
}

document.addEventListener("DOMContentLoaded", wire);

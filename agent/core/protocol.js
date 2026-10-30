/**
 * Протокол общения с моделью.
 *
 * Модель отвечает либо готовым ответом, либо действием:
 *
 *   <final>готовый ответ</final>
 *   <action>{"tool":"fs.read","args":{"path":"src/app.js"},"why":"посмотреть код"}</action>
 *
 * Понимаем и варианты: ```action {json}```, ```json {"tool":..}```, чистый JSON,
 * а также «действие» без обёртки, если в нём есть tool и args.
 *
 * Задача модуля — вытащить одно действие, проверить его и, если модель
 * ошиблась, вернуть понятную подсказку, которую можно отправить обратно.
 */

"use strict";

const TOOLS = {
  "fs.list": { args: ["path"], desc: "список файлов в папке" },
  "fs.read": { args: ["path"], desc: "прочитать файл (до 200 КБ)" },
  "fs.write": { args: ["path", "content"], desc: "записать файл целиком" },
  "fs.append": { args: ["path", "content"], desc: "дописать в конец файла" },
  "fs.replace": { args: ["path", "find", "replace"], desc: "заменить кусок текста в файле" },
  "fs.search": { args: ["query", "path", "glob"], desc: "поиск текста по файлам проекта" },
  "fs.mkdir": { args: ["path"], desc: "создать папку" },
  "fs.delete": { args: ["path"], desc: "удалить файл или папку (только с подтверждением)" },
  "shell.run": { args: ["command", "cwd"], desc: "выполнить команду в терминале" },
  "web.fetch": { args: ["url"], desc: "прочитать страницу из интернета текстом" },
  "screen.look": { args: ["question"], desc: "посмотреть на скриншот экрана и ответить, что на нём" },
  "kb.search": { args: ["query"], desc: "справка Sye: языки, типовые баги и как их чинить" },
  "task.done": { args: ["summary"], desc: "задача выполнена, короткий итог" }
};

/** Аргументы, без которых инструмент справится сам. */
const OPTIONAL_ARGS = {
  "fs.list": ["path"],
  "fs.search": ["path", "glob"],
  "shell.run": ["cwd"],
  "screen.look": ["question"],
  "task.done": ["summary"]
};

const TOOL_NAMES = Object.keys(TOOLS);

function clamp(text, max) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max) + "\n…(обрезано)" : s;
}

/** Достаёт JSON из строки: сначала как есть, потом внутри ```блока```. */
function extractJson(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const tryParse = (v) => {
    try { return JSON.parse(v); } catch (e) { return null; }
  };
  const direct = tryParse(s);
  if (direct && typeof direct === "object") return direct;
  // ```action { ... } ``` или ```json { ... } ```
  const fence = s.match(/```(?:action|json|tool)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inner = tryParse(fence[1].trim());
    if (inner && typeof inner === "object") return inner;
  }
  // первый объект в тексте — по балансу скобок, без жадных регулярок
  const start = s.indexOf("{");
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const obj = tryParse(s.slice(start, i + 1));
          if (obj && typeof obj === "object") return obj;
          break;
        }
      }
    }
  }
  return null;
}

/** Приводит действие к {tool, args, why} или возвращает ошибку. */
function validateAction(obj) {
  if (!obj || typeof obj !== "object") return { ok: false, error: "действие не распознано: нужен JSON вида {\"tool\":\"fs.read\",\"args\":{...}}" };
  const tool = String(obj.tool || obj.name || obj.action || "").trim();
  if (!tool) return { ok: false, error: "в действии нет поля tool" };
  if (!TOOL_NAMES.includes(tool)) {
    return { ok: false, error: "неизвестный инструмент «" + tool + "». Доступны: " + TOOL_NAMES.join(", ") };
  }
  // некоторые модели присылают args строкой с JSON — разбираем и такой вариант
  let rawArgs = obj.args !== undefined ? obj.args : obj.arguments;
  if (typeof rawArgs === "string") {
    try { rawArgs = JSON.parse(rawArgs); } catch (e) { rawArgs = {}; }
  }
  let args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  // Модель иногда кладёт аргументы рядом с tool — поднимаем их вверх
  for (const key of TOOLS[tool].args) {
    if (args[key] === undefined && obj[key] !== undefined) args[key] = obj[key];
  }
  const optional = OPTIONAL_ARGS[tool] || [];
  for (const key of TOOLS[tool].args) {
    if (optional.includes(key)) continue;
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      return { ok: false, error: "для " + tool + " нужен аргумент «" + key + "»" };
    }
  }
  return { ok: true, action: { tool, args, why: String(obj.why || obj.reason || "").slice(0, 300) } };
}

/**
 * Разбирает ответ модели.
 * @returns {{kind:"final"|"action"|"text", text?:string, action?:object, error?:string}}
 */
function parseModelOutput(raw) {
  const source = String(raw == null ? "" : raw);

  const finalTag = source.match(/<final>([\s\S]*?)<\/final>/i);
  if (finalTag) return { kind: "final", text: finalTag[1].trim() };

  const actionTag = source.match(/<action>([\s\S]*?)<\/action>/i);
  if (actionTag) {
    const v = validateAction(extractJson(actionTag[1]));
    if (v.ok) return { kind: "action", action: v.action };
    return { kind: "text", error: v.error, text: source.trim() };
  }

  const fence = source.match(/```(?:action|tool)\s*([\s\S]*?)```/i);
  if (fence) {
    const v = validateAction(extractJson(fence[1]));
    if (v.ok) return { kind: "action", action: v.action };
    return { kind: "text", error: v.error, text: source.trim() };
  }

  // ответ без обёртки: это действие или готовый текст?
  const obj = extractJson(source);
  if (obj && (obj.tool || obj.action || obj.name)) {
    const v = validateAction(obj);
    if (v.ok) return { kind: "action", action: v.action };
    return { kind: "text", error: v.error, text: source.trim() };
  }

  const finalOpen = source.match(/<final>([\s\S]*)$/i);
  if (finalOpen) return { kind: "final", text: finalOpen[1].trim() };

  if (!source.trim()) return { kind: "text", text: "", error: "пустой ответ модели" };
  return { kind: "final", text: source.trim() };
}

/** Подсказка модели, если она ответила не по формату. */
function formatCorrection(error) {
  return "Не понял действие: " + error + ".\n" +
    "Ответь строго одним из двух вариантов:\n" +
    '<action>{"tool":"имя","args":{...},"why":"зачем"}</action>\n' +
    "или, если задача выполнена:\n" +
    "<final>короткий итог и что сделано</final>\n" +
    "Инструменты: " + TOOL_NAMES.join(", ") + ".";
}

/** Описание инструментов для системного промпта. */
function toolsPrompt() {
  return TOOL_NAMES.map((name) => "- " + name + "(" + TOOLS[name].args.join(", ") + ") — " + TOOLS[name].desc).join("\n");
}

module.exports = { TOOLS, TOOL_NAMES, OPTIONAL_ARGS, parseModelOutput, validateAction, extractJson, formatCorrection, toolsPrompt, clamp };

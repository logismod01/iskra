/**
 * Инструменты агента: файлы, терминал, интернет, скриншот.
 *
 * Все инструменты получают контекст ctx:
 *   workspace   — папка, в которой разрешено работать
 *   settings    — { access: "ask" | "folder" | "full" }
 *   limits      — из license.js (что разрешено на текущей подписке)
 *   confirm     — async ({title, detail}) => boolean  (диалог подтверждения)
 *   exec        — async (command, {cwd, timeout}) => {code, stdout, stderr}
 *   capture     — async () => dataUrl скриншота
 *   vision      — async ({image, question}) => текст
 *   fetchUrl    — async (url) => текст страницы
 */

"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const guard = require("./guard.js");
const knowledge = require("./knowledge.js");

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "out", "target", "__pycache__", ".venv", "venv", ".idea", ".vscode", "coverage"]);
const MAX_READ = 300 * 1024;
const MAX_SCAN_FILES = 5000;
const MAX_SEARCH_RESULTS = 60;

function tooBig(limits, text) {
  const max = (limits && limits.maxOutputChars) || 20000;
  const s = String(text == null ? "" : text);
  return s.length > max ? { text: s.slice(0, max) + "\n…(обрезано)", cut: true } : { text: s, cut: false };
}

function isBinary(buffer) {
  const len = Math.min(buffer.length, 4096);
  for (let i = 0; i < len; i++) if (buffer[i] === 0) return true;
  return false;
}

async function listDir(dir, depth, out, base) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= 400) { out.push("…(список обрезан)"); return out; }
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      out.push(rel + "/");
      if (depth > 1 && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        await listDir(full, depth - 1, out, base);
      }
    } else {
      let size = 0;
      try { size = (await fsp.stat(full)).size; } catch (e) {}
      out.push(rel + "  (" + Math.max(1, Math.round(size / 1024)) + " КБ)");
    }
  }
  return out;
}

async function walk(dir, base, onFile, state) {
  if (state.count >= MAX_SCAN_FILES) return;
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const entry of entries) {
    if (state.count >= MAX_SCAN_FILES) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(full, base, onFile, state);
    } else {
      state.count++;
      await onFile(full, path.relative(base, full).replace(/\\/g, "/"));
    }
  }
}

function isLocalUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return true;
    const host = u.hostname;
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|169\.254\.)/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/\.local$/i.test(host)) return true;
    return false;
  } catch (e) { return true; }
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function denyLimits(limits, what) {
  return {
    ok: false,
    denied: true,
    summary: "«" + what + "» недоступно: подписка Pro закончилась. Доступно чтение файлов и ответы на вопросы.",
    output: limits && limits.note ? limits.note : "Нужна активная подписка Pro."
  };
}

/**
 * Выполняет действие и возвращает { ok, summary, output }.
 * Никогда не бросает: ошибки превращаются в понятный текст для модели.
 */
async function runTool(action, ctx) {
  const limits = (ctx && ctx.limits) || {};
  const settings = (ctx && ctx.settings) || {};
  const workspace = (ctx && ctx.workspace) || "";
  const tool = action && action.tool;
  const args = (action && action.args) || {};

  const confirm = ctx && typeof ctx.confirm === "function" ? ctx.confirm : async () => true;

  try {
    switch (tool) {
      case "fs.list": {
        const r = guard.resolveInWorkspace(workspace, args.path || ".", guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        const list = await listDir(r.path, Number(args.depth || 2), [], r.path);
        const packed = tooBig(limits, list.join("\n") || "(пусто)");
        return { ok: true, summary: "Посмотрел папку: " + args.path, output: packed.text };
      }

      case "fs.read": {
        const r = guard.resolveInWorkspace(workspace, args.path, guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        const stat = await fsp.stat(r.path).catch(() => null);
        if (!stat) return { ok: false, summary: "Файла нет: " + args.path, output: "Файл не найден: " + r.path };
        if (stat.isDirectory()) return { ok: false, summary: "Это папка, а не файл", output: "Это папка. Для папок — fs.list." };
        if (stat.size > MAX_READ) return { ok: false, summary: "Файл слишком большой", output: "Файл " + Math.round(stat.size / 1024) + " КБ — больше 300 КБ не читаю. Попроси конкретный кусок или используй fs.search." };
        const buf = await fsp.readFile(r.path);
        if (isBinary(buf)) return { ok: false, summary: "Это двоичный файл", output: "Файл двоичный (картинка, архив или сборка) — текстом не читается." };
        const text = buf.toString("utf8");
        const numbered = text.split("\n").map((line, i) => String(i + 1).padStart(4, " ") + "│ " + line).join("\n");
        const packed = tooBig(limits, numbered);
        return { ok: true, summary: "Прочитал " + args.path + " (" + text.split("\n").length + " строк)", output: packed.text };
      }

      case "fs.write": {
        if (!limits.write) return denyLimits(limits, "Запись файлов");
        const r = guard.resolveInWorkspace(workspace, args.path, guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        const content = String(args.content == null ? "" : args.content);
        const check = guard.checkWrite(r.path, settings);
        if (check.needsConfirm || guard.pathRisk(r.path)) {
          const ok = await confirm({
            title: "Записать файл?",
            detail: r.path + "\n" + content.length + " символов" + (guard.pathRisk(r.path) ? "\n\nЭто системный путь — лучше не трогать." : "")
          });
          if (!ok) return { ok: false, denied: true, summary: "Человек не разрешил запись", output: "Запись отменена пользователем." };
        }
        await fsp.mkdir(path.dirname(r.path), { recursive: true });
        await fsp.writeFile(r.path, content, "utf8");
        return { ok: true, summary: "Записал " + args.path + " (" + content.length + " символов)", output: "Готово: " + r.path + " (" + content.split("\n").length + " строк)." };
      }

      case "fs.append": {
        if (!limits.write) return denyLimits(limits, "Запись файлов");
        const r = guard.resolveInWorkspace(workspace, args.path, guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        const content = String(args.content == null ? "" : args.content);
        const check = guard.checkWrite(r.path, settings);
        if (check.needsConfirm) {
          const ok = await confirm({ title: "Дописать в файл?", detail: r.path + "\n+" + content.length + " символов" });
          if (!ok) return { ok: false, denied: true, summary: "Человек не разрешил запись", output: "Отменено пользователем." };
        }
        await fsp.mkdir(path.dirname(r.path), { recursive: true });
        await fsp.appendFile(r.path, content, "utf8");
        return { ok: true, summary: "Дописал в " + args.path, output: "Дописано " + content.length + " символов." };
      }

      case "fs.replace": {
        if (!limits.write) return denyLimits(limits, "Правка файлов");
        const r = guard.resolveInWorkspace(workspace, args.path, guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        const find = String(args.find == null ? "" : args.find);
        const replace = String(args.replace == null ? "" : args.replace);
        if (!find) return { ok: false, summary: "Нечего искать", output: "Пустой фрагмент для замены." };
        const before = await fsp.readFile(r.path, "utf8").catch(() => null);
        if (before == null) return { ok: false, summary: "Файла нет", output: "Файл не найден: " + args.path };
        if (!before.includes(find)) return { ok: false, summary: "Фрагмент не найден", output: "В файле нет такого фрагмента. Прочитай файл заново и дай точный текст." };
        const count = before.split(find).length - 1;
        const after = args.all === true ? before.split(find).join(replace) : before.replace(find, replace);
        const check = guard.checkWrite(r.path, settings);
        if (check.needsConfirm) {
          const ok = await confirm({ title: "Изменить файл?", detail: r.path + "\nЗамен: " + (args.all === true ? count : 1) });
          if (!ok) return { ok: false, denied: true, summary: "Человек не разрешил правку", output: "Отменено пользователем." };
        }
        await fsp.writeFile(r.path, after, "utf8");
        return { ok: true, summary: "Заменил в " + args.path + ": " + (args.all === true ? count : 1) + " раз", output: "Готово. Было " + before.length + " символов, стало " + after.length + "." };
      }

      case "fs.search": {
        const query = String(args.query || "");
        if (!query) return { ok: false, summary: "Пустой запрос", output: "Нужен текст для поиска." };
        const rootRes = guard.resolveInWorkspace(workspace, args.path || ".", guard.levelOf(settings));
        if (!rootRes.ok) return { ok: false, summary: rootRes.error, output: rootRes.error };
        let re = null;
        try { re = new RegExp(query, "i"); } catch (e) { re = null; }
        const hits = [];
        const state = { count: 0 };
        await walk(rootRes.path, rootRes.path, async (full, rel) => {
          if (hits.length >= MAX_SEARCH_RESULTS) return;
          const stat = await fsp.stat(full).catch(() => null);
          if (!stat || stat.size > 1024 * 1024) return;
          const buf = await fsp.readFile(full).catch(() => null);
          if (!buf || isBinary(buf)) return;
          const lines = buf.toString("utf8").split("\n");
          for (let i = 0; i < lines.length; i++) {
            const match = re ? re.test(lines[i]) : lines[i].toLowerCase().includes(query.toLowerCase());
            if (match) {
              hits.push(rel + ":" + (i + 1) + "  " + lines[i].trim().slice(0, 180));
              if (hits.length >= MAX_SEARCH_RESULTS) return;
            }
          }
        }, state);
        const packed = tooBig(limits, hits.length ? hits.join("\n") : "Ничего не найдено по запросу «" + query + "».");
        return { ok: true, summary: "Поиск «" + query + "»: " + hits.length + " совпадений", output: packed.text };
      }

      case "fs.mkdir": {
        if (!limits.write) return denyLimits(limits, "Создание папок");
        const r = guard.resolveInWorkspace(workspace, args.path, guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        await fsp.mkdir(r.path, { recursive: true });
        return { ok: true, summary: "Создал папку " + args.path, output: "Готово: " + r.path };
      }

      case "fs.delete": {
        if (!limits.delete) return denyLimits(limits, "Удаление файлов");
        const r = guard.resolveInWorkspace(workspace, args.path, guard.levelOf(settings));
        if (!r.ok) return { ok: false, summary: r.error, output: r.error };
        if (guard.pathRisk(r.path)) return { ok: false, summary: "Системный путь", output: "Такие файлы я не удаляю — это системная папка." };
        const ok = await confirm({ title: "Удалить?", detail: r.path + "\n\nЭто действие нельзя отменить." });
        if (!ok) return { ok: false, denied: true, summary: "Человек не разрешил удаление", output: "Удаление отменено пользователем." };
        await fsp.rm(r.path, { recursive: true, force: true });
        return { ok: true, summary: "Удалил " + args.path, output: "Удалено: " + r.path };
      }

      case "shell.run": {
        if (!limits.shell) return denyLimits(limits, "Терминал");
        const command = String(args.command || "").trim();
        const check = guard.checkCommand(command, settings);
        if (check.blocked) return { ok: false, summary: "Команда запрещена", output: check.reason };
        const cwdRes = args.cwd ? guard.resolveInWorkspace(workspace, args.cwd, guard.levelOf(settings)) : { ok: true, path: workspace };
        if (!cwdRes.ok) return { ok: false, summary: cwdRes.error, output: cwdRes.error };
        if (check.needsConfirm) {
          const ok = await confirm({ title: "Запустить команду?", detail: (check.reason ? check.reason + "\n\n" : "") + command + "\n\nв папке " + cwdRes.path });
          if (!ok) return { ok: false, denied: true, summary: "Человек не разрешил команду", output: "Команда отменена пользователем." };
        }
        const res = await ctx.exec(command, { cwd: cwdRes.path, timeout: 120000 });
        const body = [
          res.stdout ? "stdout:\n" + res.stdout : "",
          res.stderr ? "stderr:\n" + res.stderr : "",
          "код выхода: " + res.code
        ].filter(Boolean).join("\n");
        const packed = tooBig(limits, guard.redactSecrets(body));
        return {
          ok: res.code === 0,
          summary: "Команда: " + command.slice(0, 80) + " → код " + res.code,
          output: packed.text
        };
      }

      case "web.fetch": {
        if (!limits.web) return denyLimits(limits, "Интернет");
        const url = String(args.url || "").trim();
        if (!/^https?:\/\//i.test(url)) return { ok: false, summary: "Нужна ссылка http(s)", output: "Поддерживаются только http и https." };
        if (isLocalUrl(url)) return { ok: false, summary: "Локальные адреса не открываю", output: "Ссылки на локальную сеть и localhost закрыты." };
        const text = await ctx.fetchUrl(url);
        const packed = tooBig(limits, String(text || "").slice(0, 40000));
        return { ok: true, summary: "Прочитал страницу " + url, output: packed.text || "(страница пустая)" };
      }

      case "screen.look": {
        if (!limits.vision) return denyLimits(limits, "Разбор скриншота");
        const image = ctx.pendingShot && ctx.pendingShot.image;
        if (!image) {
          const shot = await ctx.capture();
          return ctx.lookAtShot(shot, args.question || "");
        }
        return ctx.lookAtShot(image, args.question || "");
      }

      case "kb.search": {
        const query = String(args.query || "").trim();
        if (!query) return { ok: false, summary: "Пустой запрос", output: "Что искать? Например: python, IndentationError, null." };
        const found = knowledge.search(query, 3);
        if (!found.length) {
          return {
            ok: false,
            summary: "В справке нет такой темы",
            output: "Ничего не нашлось по запросу «" + query + "». Спроси иначе: язык (python, js, sql) или текст ошибки."
          };
        }
        const body = found.map((x) => "• " + x.title + ": " + x.text).join("\n\n");
        const packed = tooBig(limits, body);
        return { ok: true, summary: "Справка: " + found.map((x) => x.title).join(", "), output: packed.text };
      }

      case "task.done": {
        return { ok: true, summary: String(args.summary || "Задача выполнена"), output: "Задача закрыта.", final: String(args.summary || "") };
      }

      default:
        return { ok: false, summary: "Неизвестный инструмент", output: "Нет такого инструмента: " + tool };
    }
  } catch (e) {
    const msg = (e && e.message) || String(e);
    return { ok: false, summary: "Ошибка: " + msg.slice(0, 160), output: guard.redactSecrets(msg) };
  }
}

module.exports = { runTool, stripHtml, isLocalUrl, listDir, MAX_SEARCH_RESULTS, SKIP_DIRS };

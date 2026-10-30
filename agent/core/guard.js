/**
 * Безопасность агента: где ему можно работать, что нельзя запускать
 * и как не утащить секреты в логи.
 *
 * Три уровня доступа:
 *   ask      — любая запись и любая команда только с подтверждением человека;
 *   folder   — внутри рабочей папки действует сам, опасное спрашивает (по умолчанию);
 *   full     — может выйти за папку, но системное по-прежнему запрещено.
 */

"use strict";

const path = require("node:path");
const os = require("node:os");

const LEVELS = { ask: "Спрашивать всё", folder: "Свободно в папке", full: "Полный доступ" };

/** Команды, которые агент не выполнит никогда — даже с подтверждением. */
const FORBIDDEN = [
  { id: "root-delete", re: /(^|[\s;&|])(rm\s+(-[a-z]*\s+)*-?[rf]{1,2}[a-z]*\s+\/(\s|$|\*))|rm\s+-rf\s+~|rmdir\s+\/s\s+\/q\s+[a-z]:\\?\s*$/i },
  { id: "windows-system", re: /\b(format\s+[a-z]:|diskpart|bcdedit|sfc\s+\/scannow|dism\s+\/|takeown\s+\/f\s+c:\\|icacls\s+c:\\|cipher\s+\/w)/i },
  { id: "reg-system", re: /\breg\s+(delete|add)\s+(hklm|hkey_local_machine)/i },
  { id: "boot", re: /\b(shutdown|reboot|poweroff|halt)\b/i },
  { id: "raw-disk", re: /\bdd\s+if=|mkfs(\.|\s)|fdisk|parted\s+\/dev/i },
  { id: "fork-bomb", re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  { id: "pipe-to-shell", re: /\b(curl|wget|invoke-webrequest|iwr)\b[^\n|]*\|\s*(ba|z|k|da)?sh\b|powershell[^\n]*-e(nc|ncodedcommand)?\s/i },
  { id: "elevation", re: /(^|[\s;&|])(sudo|doas|runas|su)\s/i },
  { id: "kill-all", re: /\b(taskkill\s+\/f\s+\/im\s+(explorer|winlogon|csrss|lsass)\.exe|killall5|kill\s+-9\s+1\b)/i },
  { id: "reverse-shell", re: /\b(nc|ncat|netcat)\s+(-[a-z]+\s+)*\S+\s+\d{2,5}\b|\/dev\/tcp\//i }
];

/** Команды, которые без подтверждения не запускаем никогда, но с подтверждением — можно. */
const RISKY = [
  { id: "delete", re: /(^|[\s;&|])(rm|del|erase|rmdir|rd)\s/i },
  { id: "git-destructive", re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+(-f|--force)|checkout\s+--\s+\.)/i },
  { id: "package-install", re: /\b(npm|pnpm|yarn)\s+(i|install|add)\b|\bpip\s+install\b|\bchoco\s+install\b|\bwinget\s+install\b/i },
  { id: "network-write", re: /\b(curl|wget|invoke-webrequest|iwr)\b[^\n]*\s(-o|--output|-outfile)\s/i },
  { id: "registry", re: /\breg\s+(add|delete|import)\b/i },
  { id: "services", re: /\b(sc|net)\s+(stop|start|delete)\b|\bsystemctl\s+(stop|disable|mask)\b/i },
  { id: "kill", re: /\b(taskkill|pkill|killall)\b/i },
  { id: "move-out", re: /\b(move|mv|ren|rename)\s+[^\n]*\s+([a-z]:\\|\/etc|\/usr|\/windows)/i }
];

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk-or-[A-Za-z0-9-]{16,}/g,
  /gsk_[A-Za-z0-9]{16,}/g,
  /hf_[A-Za-z0-9]{16,}/g,
  /ISKRA-[A-Z0-9-]{6,}/g,
  /\b[A-Za-z0-9_-]{32,}\b/g   // длинные токены
];

function levelOf(settings) {
  const lvl = (settings && settings.access) || "folder";
  return LEVELS[lvl] ? lvl : "folder";
}

/** Приводит путь к абсолютному и проверяет, что он внутри рабочей папки. */
function resolveInWorkspace(workspace, target, level) {
  const ws = workspace ? path.resolve(workspace) : "";
  const raw = String(target == null ? "" : target).trim();
  if (!ws) return { ok: false, error: "не выбрана рабочая папка" };
  if (!raw) return { ok: false, error: "пустой путь" };
  // запрещаем явные попытки выйти наружу, даже если путь «выглядит» внутренним
  if (/^([a-z]:[\\/]|\\\\|\/)/i.test(raw) === false && raw.split(/[\\/]+/).includes("..")) {
    const resolved = path.resolve(ws, raw);
    if (!isInside(ws, resolved)) return { ok: false, error: "путь выходит за рабочую папку: " + raw };
  }
  const full = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(ws, raw);
  if (!isInside(ws, full) && level !== "full") {
    return { ok: false, error: "этот путь вне рабочей папки (" + full + "). Открой нужную папку как рабочую или включи полный доступ." };
  }
  return { ok: true, path: full };
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Проверка команды перед запуском. */
function checkCommand(command, settings) {
  const cmd = String(command == null ? "" : command).trim();
  if (!cmd) return { ok: false, blocked: true, reason: "пустая команда" };
  for (const rule of FORBIDDEN) {
    if (rule.re.test(cmd)) {
      return {
        ok: false, blocked: true, id: rule.id,
        reason: "Такую команду агент не выполняет никогда: " + rule.id + ". Она может стереть систему или открыть доступ извне."
      };
    }
  }
  const level = levelOf(settings);
  const risky = RISKY.find((rule) => rule.re.test(cmd));
  if (risky) {
    const needsAsk = level !== "full";
    return {
      ok: true, blocked: false, id: risky.id, needsConfirm: needsAsk,
      reason: needsAsk ? "Команда может что-то удалить или изменить за пределами кода. Подтверди запуск." : ""
    };
  }
  const needsConfirm = level === "ask";
  return { ok: true, blocked: false, needsConfirm, reason: needsConfirm ? "Уровень «Спрашивать всё»: подтверди запуск команды." : "" };
}

/** Нужно ли подтверждение на запись файла. */
function checkWrite(filePath, settings) {
  const level = levelOf(settings);
  if (level === "ask") return { needsConfirm: true, reason: "Уровень «Спрашивать всё»: подтверди запись файла." };
  return { needsConfirm: false };
}

/** Убирает секреты из текста, который показываем в логах. */
function redactSecrets(text) {
  let out = String(text == null ? "" : text);
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m) => (m.length > 8 ? m.slice(0, 3) + "…" + "•".repeat(6) : "•".repeat(6)));
  return out;
}

/** Риск для пути: системные папки, автозагрузка, домашние настройки. */
function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathRisk(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/").toLowerCase();
  const home = escapeRe(os.homedir().replace(/\\/g, "/").toLowerCase());
  const risky = [
    /^c:\/windows/, /^c:\/program files/, /^c:\/programdata/, /\/system\/library/,
    /^\/etc/, /^\/usr\/bin/, /^\/bin/, /^\/sbin/, /^\/private\/etc/,
    new RegExp("^" + home + "/appdata"),
    new RegExp("^" + home + "/\\.ssh"),
    new RegExp("^" + home + "/library/"),
    new RegExp("^" + home + "/\\.config")
  ];
  return risky.some((re) => re.test(p));
}

module.exports = { LEVELS, FORBIDDEN, RISKY, levelOf, resolveInWorkspace, isInside, checkCommand, checkWrite, redactSecrets, pathRisk };

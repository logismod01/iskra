/**
 * Ещё одна порция тем для общей базы (файл supabase/iskra-shared-kb-batch2.sql).
 *
 * Проверяем то, на чём легко обжечься при ручном запуске в SQL Editor:
 * число колонок совпадает с числом значений, кавычки целы, повторный запуск
 * не ломает базу, в конце есть честный счётчик, а сами темы не пустые.
 *
 * Запуск: node tests/round15.test.mjs
 */
import fs from "node:fs";
import assert from "node:assert/strict";

const url = new URL("../supabase/iskra-shared-kb-batch2.sql", import.meta.url);
assert.ok(fs.existsSync(url), "нет файла supabase/iskra-shared-kb-batch2.sql");
const sql = fs.readFileSync(url, "utf8");

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

/* ---------- Заголовок вставки ---------- */
const header = sql.slice(sql.indexOf("insert into"), sql.indexOf("values"));
ok(/insert into public\.iskra_shared_kb/i.test(header), "вставка должна идти в iskra_shared_kb");
const columns = header.slice(header.indexOf("(") + 1, header.indexOf(")")).split(",").map((c) => c.trim());
ok(columns.length === 4, "в заголовке должно быть 4 колонки, а есть " + columns.length + ": " + columns.join(", "));
ok(columns.join(",") === "topic,topic_norm,body,tags", "ожидались колонки topic, topic_norm, body, tags");
ok(!columns.includes("active"), "колонка active не должна быть в списке: её ставит on conflict");

/* ---------- Строки значений ---------- */
const lines = sql.split("\n").filter((l) => l.startsWith("  ('"));
ok(lines.length >= 50, "ожидалось не меньше 50 тем, а есть " + lines.length);

const rows = [];
for (const line of lines) {
  const strings = [...line.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);
  ok(strings.length === 4, "в строке " + strings.length + " значений вместо 4: " + line.slice(0, 70));
  rows.push({ topic: strings[0], topicNorm: strings[1], body: strings[2], tags: strings[3] });
}

ok(rows.length === lines.length, "каждая строка разобрана");
ok(new Set(rows.map((r) => r.topic.toLowerCase())).size === rows.length, "есть повторяющиеся темы");
ok(rows.every((r) => r.topic.length >= 4), "слишком короткое название темы");
ok(rows.every((r) => r.body.length >= 120), "слишком короткий текст темы — такая тема бесполезна");
ok(rows.every((r) => r.tags.length >= 3), "у темы нет слов для поиска");
ok(rows.every((r) => !/['"]\s*;/.test(r.body)), "в тексте подозрительный обрыв");

/* ---------- Повторный запуск безопасен ---------- */
ok(/on conflict \(topic_norm\) do update/i.test(sql), "нужен on conflict (topic_norm) do update — иначе повторный запуск упадёт");
ok(/active\s*=\s*true/i.test(sql), "повторная публикация должна возвращать тему в базу");
ok(/updated_at\s*=\s*now\(\)/i.test(sql), "дата обновления должна обновляться");

/* ---------- В конце — число, которое увидит человек ---------- */
const tail = sql.trim().split("\n").slice(-3).join("\n");
ok(/select count\(\*\) as тем_в_общей_базе/i.test(tail), "в конце должен быть select count(*) as тем_в_общей_базе");
ok(/from public\.iskra_shared_kb/i.test(tail), "счётчик должен считаться по iskra_shared_kb");
ok(/where active/i.test(tail), "счётчик должен считать только активные темы");

/* ---------- Файл — инструкция, а не мусор ---------- */
ok(sql.startsWith("--"), "файл начинается с пояснения: что это и что делать");
ok(sql.includes("повторный запуск безопасен") || sql.includes("Запускать целиком"), "нужна короткая инструкция в начале");
ok(!/sk_live|service_role|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/.test(sql), "в SQL не должно быть ключей и секретов");

console.log("round15: " + checks + " проверок, тем в порции: " + rows.length + " — ок");

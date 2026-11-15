/**
 * Сравнение версий — маленькая, но обидная штука.
 *
 * Строковое сравнение «0.10.0» и «0.9.0» даёт неверный ответ: «0.10» меньше
 * «0.9» по буквам, хотя число больше. Здесь версии разбираются на числа,
 * поэтому порядок всегда правильный.
 *
 * Отдельным файлом — чтобы это можно было проверить тестом без Electron.
 */

"use strict";

function parse(v) {
  return String(v == null ? "" : v)
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((x) => parseInt(x, 10))
    .filter((x) => !Number.isNaN(x));
}

/**
 * @returns {number} -1 если a старее b, 0 если равны, 1 если a новее b
 */
function cmp(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Нужно ли обновляться: новая версия строго новее текущей. */
function isNewer(candidate, current) {
  return cmp(candidate, current) > 0;
}

module.exports = { parse, cmp, isNewer };

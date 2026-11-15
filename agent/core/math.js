/**
 * Точная математика для Искры и Сью.
 *
 * Зачем: модель предсказывает правдоподобный текст и на числах ошибается —
 * путает знак, теряет корень, врёт в дискриминанте. Там, где ответ можно
 * посчитать, его надо считать, а не сочинять. Тогда «реши 2x+5=13» даёт
 * ровно 4, и это видно по шагам.
 *
 * Что умеем: линейные уравнения, квадратные (с дискриминантом и проверкой
 * по Виету), проценты (процент от числа, сколько процентов, скидка).
 * Чего не умеем — честно говорим «это не ко мне», а не выдаём похожее.
 *
 * Модуль без зависимостей: тот же код работает в браузере (копия в index.html)
 * и в агенте. Тест сверяет, что обе копии дают одинаковый ответ.
 */

"use strict";

const EPS = 1e-9;

/* Число для человека: без хвостов 0.30000000000000004 и без «-0». */
function num(v, digits) {
  if (!Number.isFinite(v)) return "—";
  const d = typeof digits === "number" ? digits : 4;
  let n = Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  if (Math.abs(n) < EPS) n = 0;
  let s = String(n);
  if (s.includes("e")) s = n.toFixed(d);
  s = s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s.replace("-", "−");
}

function numRaw(v) {
  return Number(String(num(v)).replace("−", "-"));
}

/* Приводим текст к одной записи: минусы, умножение, степени. */
function normalize(raw) {
  let s = String(raw == null ? "" : raw);
  s = s.replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/");
  s = s.replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4");
  s = s.replace(/,(\d)/g, ".$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/* ---------- Полиномы: {0: свободный, 1: при x, 2: при x²} ---------- */

function pZero() { return { 0: 0, 1: 0, 2: 0 }; }
function pNum(c) { return { 0: c, 1: 0, 2: 0 }; }
function pX(pow) {
  const p = pZero();
  p[pow || 1] = 1;
  return p;
}
function pAdd(a, b, sign) {
  const k = typeof sign === "number" ? sign : 1;
  return { 0: a[0] + k * b[0], 1: a[1] + k * b[1], 2: a[2] + k * b[2] };
}
function pMul(a, b) {
  return {
    0: a[0] * b[0],
    1: a[1] * b[0] + a[0] * b[1],
    2: a[2] * b[0] + a[1] * b[1] + a[0] * b[2]
  };
}
function pDeg(p) {
  if (Math.abs(p[2]) > EPS) return 2;
  if (Math.abs(p[1]) > EPS) return 1;
  return 0;
}

/* ---------- Разбор выражения ---------- */

function tokenize(src) {
  const out = [];
  let i = 0;
  const s = String(src).replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (c >= "0" && c <= "9") {
      let d = c;
      i++;
      while (i < s.length && s[i] >= "0" && s[i] <= "9") { d += s[i]; i++; }
      if (s[i] === ".") {
        d += ".";
        i++;
        while (i < s.length && s[i] >= "0" && s[i] <= "9") { d += s[i]; i++; }
      }
      out.push({ t: "num", v: parseFloat(d) });
      continue;
    }
    if (c === "x" || c === "X" || c === "х" || c === "Х") { out.push({ t: "x" }); i++; continue; }
    if ("+-*/^()".includes(c)) { out.push({ t: c }); i++; continue; }
    return null;                       // чужая буква — это не уравнение
  }
  return out;
}

/* Рекурсивный разбор: выражение → слагаемые → множители → скобки.
   Возвращает полином или null, если степень выше второй. */
function parsePoly(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isFactorStart = (tk) => tk && (tk.t === "num" || tk.t === "x" || tk.t === "(");

  function expr() {
    let left = term();
    if (!left) return null;
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const sign = peek().t === "+" ? 1 : -1;
      pos++;
      const right = term();
      if (!right) return null;
      left = pAdd(left, right, sign);
    }
    return left;
  }

  function term() {
    let left = factor();
    if (!left) return null;
    for (;;) {
      const tk = peek();
      if (tk && (tk.t === "*" || tk.t === "/")) {
        pos++;
        const right = factor();
        if (!right) return null;
        if (tk.t === "/") {
          if (pDeg(right) !== 0 || Math.abs(right[0]) < EPS) return null;
          left = { 0: left[0] / right[0], 1: left[1] / right[0], 2: left[2] / right[0] };
        } else {
          left = pMul(left, right);
        }
        continue;
      }
      if (isFactorStart(tk)) {          // 2x, 3(x+1), x(x+2)
        const right = factor();
        if (!right) return null;
        left = pMul(left, right);
        continue;
      }
      break;
    }
    return left;
  }

  function factor() {
    const tk = peek();
    if (!tk) return null;
    if (tk.t === "-") {
      pos++;
      const inner = factor();
      return inner ? pAdd(pZero(), inner, -1) : null;
    }
    if (tk.t === "+") { pos++; return factor(); }
    if (tk.t === "num") {
      pos++;
      let base = pNum(tk.v);
      if (peek() && peek().t === "^") {
        pos++;
        const power = peek();
        if (!power || power.t !== "num" || ![0, 1, 2].includes(power.v)) return null;
        pos++;
        if (power.v === 0) base = pNum(1);
        else if (power.v === 2) base = pMul(base, base);
      }
      return base;
    }
    if (tk.t === "x") {
      pos++;
      let pow = 1;
      if (peek() && peek().t === "^") {
        pos++;
        const power = peek();
        if (!power || power.t !== "num" || ![0, 1, 2].includes(power.v)) return null;
        pos++;
        pow = power.v;
      }
      return pX(pow);
    }
    if (tk.t === "(") {
      pos++;
      const inner = expr();
      if (!inner) return null;
      if (!peek() || peek().t !== ")") return null;
      pos++;
      return inner;
    }
    return null;
  }

  const res = expr();
  if (!res || pos !== tokens.length) return null;
  return res;
}

/* ---------- Проценты ---------- */

function solvePercent(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:от|of)\s*(\d+(?:\.\d+)?)/i);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    const v = a / 100 * b;
    return {
      kind: "percent", answer: num(v) + (m[0].trim().endsWith("%") ? "" : ""),
      steps: [
        { label: "Правило", text: "процент — это сотая доля: " + num(a) + "% = " + num(a) + "/100" },
        { label: "Считаем", text: num(a) + "/100 · " + num(b) + " = " + num(v) },
        { label: "Ответ", text: num(v) }
      ],
      raw: v
    };
  }
  m = text.match(/сколько\s+процент[а-яё]*\s+(?:составляет\s+)?(\d+(?:\.\d+)?)\s+(?:от|из)\s+(\d+(?:\.\d+)?)/i);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    if (Math.abs(b) < EPS) return null;
    const v = a / b * 100;
    return {
      kind: "percent", answer: num(v) + "%",
      steps: [
        { label: "Правило", text: "доля в процентах = часть / целое · 100" },
        { label: "Считаем", text: num(a) + " / " + num(b) + " · 100 = " + num(v) },
        { label: "Ответ", text: num(v) + "%" }
      ],
      raw: v
    };
  }
  const skidka = text.match(/скидк[а-яё]*\s*(?:в\s*)?(\d+(?:\.\d+)?)\s*%/i);
  if (skidka) {
    const pct = parseFloat(skidka[1]);
    /* Цену берём как самое большое число без знака «%»: «скидка 20 % на 5000»
       не должна читать 20 как цену. */
    let price = NaN;
    const nums = text.match(/\d+(?:\.\d+)?\s*%?/g) || [];
    for (const raw of nums) {
      if (/%/.test(raw)) continue;
      const v = parseFloat(raw);
      if (!Number.isFinite(v)) continue;
      if (!Number.isFinite(price) || v > price) price = v;
    }
    if (Number.isFinite(price) && price > 0 && price !== pct) {
      const off = price * pct / 100;
      const fin = price - off;
      return {
        kind: "discount", answer: num(fin) + " (скидка " + num(off) + ")",
        steps: [
          { label: "Скидка", text: num(price) + " · " + num(pct) + "/100 = " + num(off) },
          { label: "К оплате", text: num(price) + " − " + num(off) + " = " + num(fin) },
          { label: "Ответ", text: num(fin) }
        ],
        raw: fin
      };
    }
  }
  return null;
}

/* ---------- Уравнения ---------- */

function findEquation(text) {
  const m = text.match(/[-+*/^()0-9xXхХ.,\s]+=[-+*/^()0-9xXхХ.,\s]+/);
  if (!m) return null;
  const s = m[0].trim().replace(/\s+/g, "");
  if ((s.match(/=/g) || []).length !== 1) return null;
  const parts = s.split("=");
  if (!parts[0] || !parts[1]) return null;
  return { left: parts[0], right: parts[1], text: s };
}

function polyLabel(p) {
  const parts = [];
  const push = (coef, tail) => {
    if (Math.abs(coef) < EPS) return;
    const sign = coef < 0 ? "−" : (parts.length ? "+" : "");
    const abs = Math.abs(coef);
    const c = Math.abs(abs - 1) < EPS ? "" : num(abs);
    /* «2x − 8», а не «2x −8»: знак отделяют пробелом */
    parts.push((sign ? sign + " " : "") + c + tail);
  };
  push(p[2], "x²");
  push(p[1], "x");
  push(p[0], "");
  if (!parts.length) return "0";
  return parts.join(" ").replace(/^\+/, "");
}

function solveEquation(text) {
  const eq = findEquation(text);
  if (!eq) return null;
  const lt = tokenize(eq.left), rt = tokenize(eq.right);
  if (!lt || !rt) return null;
  const L = parsePoly(lt), R = parsePoly(rt);
  if (!L || !R) return null;
  const p = pAdd(L, R, -1);            // всё влево: L − R = 0
  const deg = pDeg(p);

  if (deg === 0) {
    const same = Math.abs(p[0]) < EPS;
    return {
      kind: "none", answer: same ? "верно при любом x" : "решений нет",
      steps: [
        { label: "Уравнение", text: eq.text.replace(/=/g, " = ") + "0" },
        { label: "После переноса", text: num(p[0]) + " = 0" },
        { label: "Вывод", text: same ? "получилось 0 = 0 — подходит любой x" : "получилось " + num(p[0]) + " = 0, а это неверно — корней нет" }
      ],
      raw: null
    };
  }

  if (deg === 1) {
    const a = p[1], b = p[0];
    const x = -b / a;
    const checkL = L[1] * x + L[0], checkR = R[1] * x + R[0];
    return {
      kind: "linear",
      answer: "x = " + num(x),
      raw: numRaw(x),
      steps: [
        { label: "Приводим", text: "всё с x — влево, числа — вправо: " + polyLabel({ 0: b, 1: a, 2: 0 }) + " = 0" },
        { label: "Свободный член", text: num(a) + "x = " + num(-b) },
        { label: "Делим", text: "x = " + num(-b) + " / " + num(a) + " = " + num(x) },
        { label: "Проверка", text: "подставили: " + num(checkL) + " = " + num(checkR) + (Math.abs(checkL - checkR) < 1e-6 ? " ✓" : " — осторожно, не сходится") }
      ]
    };
  }

  const a = p[2], b = p[1], c = p[0];
  const D = b * b - 4 * a * c;
  const steps = [
    { label: "Вид", text: "ax² + bx + c = 0, где a = " + num(a) + ", b = " + num(b) + ", c = " + num(c) },
    { label: "Дискриминант", text: "D = b² − 4ac = " + num(b) + "² − 4·" + num(a) + "·" + num(c) + " = " + num(D) }
  ];
  if (D < -1e-9) {
    steps.push({ label: "Вывод", text: "D < 0 — действительных корней нет" });
    return { kind: "quadratic", answer: "действительных корней нет", raw: null, steps };
  }
  const sq = Math.sqrt(Math.max(D, 0));
  const x1 = (-b + sq) / (2 * a);
  const x2 = (-b - sq) / (2 * a);
  steps.push({ label: "Корень из D", text: "√D = " + num(sq) });
  if (Math.abs(D) < 1e-9) {
    steps.push({ label: "Корень", text: "D = 0 — корень один: x = −b/(2a) = " + num(x1) });
    steps.push({ label: "Проверка по Виету", text: "x₁ + x₂ = −b/a = " + num(-b / a) + ", x₁·x₂ = c/a = " + num(c / a) });
    return { kind: "quadratic", answer: "x = " + num(x1), raw: numRaw(x1), steps };
  }
  const exact = Math.abs(sq - Math.round(sq)) < 1e-9 && Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c);
  steps.push({ label: "Формула", text: "x = (−b ± √D) / (2a) = (" + num(-b) + " ± " + num(sq) + ") / " + num(2 * a) });
  steps.push({ label: "Корни", text: "x₁ = " + num(x1) + ", x₂ = " + num(x2) });
  steps.push({
    label: "Проверка по Виету",
    text: "x₁ + x₂ = " + num(x1 + x2) + " (должно быть −b/a = " + num(-b / a) + "), x₁·x₂ = " + num(x1 * x2) + " (должно быть c/a = " + num(c / a) + ")" +
      (exact ? ". Корни целые — ошибки не было" : "")
  });
  return {
    kind: "quadratic",
    answer: "x₁ = " + num(x1) + ", x₂ = " + num(x2),
    raw: [numRaw(x1), numRaw(x2)],
    steps
  };
}

/* ---------- Точка входа ---------- */

/**
 * Решить, что можно решить точно.
 * @param {string} raw вопрос человека
 * @returns {{kind:string, answer:string, steps:Array, raw:*}|null} null — это не наша задача
 */
function solve(raw) {
  const text = normalize(raw);
  if (!text) return null;

  /* Проценты — раньше уравнений: в «15% от 240» нет икса, но есть числа. */
  const pct = solvePercent(text);
  if (pct) return pct;

  const eq = solveEquation(text);
  if (eq) return eq;

  return null;
}

/** Человеческий ответ целиком: заголовок, шаги, итог. */
function explain(result) {
  if (!result) return "";
  const lines = ["**Считаю точно, без догадок**"];
  for (const s of result.steps) lines.push(s.label + ": " + s.text);
  if (result.kind !== "percent" && result.kind !== "discount") lines.push("**Ответ:** " + result.answer);
  return lines.join("\n");
}

module.exports = { solve, explain, normalize, num, parsePoly, tokenize, solveEquation, solvePercent };

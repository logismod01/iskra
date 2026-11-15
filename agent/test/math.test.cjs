const test = require("node:test");
const assert = require("node:assert/strict");

const math = require("../core/math.js");

/* Точный решатель: если он ошибётся, человек получит неверный ответ
   с уверенным видом. Поэтому проверяем и ответы, и отказ от чужих задач. */

test("линейное уравнение: 2x + 5 = 13 даёт 4", () => {
  const r = math.solve("2x+5=13");
  assert.equal(r.kind, "linear");
  assert.equal(r.answer, "x = 4");
  assert.equal(r.raw, 4);
  assert.ok(r.steps.length >= 3, "шагов мало");
});

test("иксы с обеих сторон: 3x − 7 = 2x + 5 даёт 12", () => {
  const r = math.solve("3x-7=2x+5");
  assert.equal(r.raw, 12);
});

test("скобки: 5(x − 2) = 15 даёт 5", () => {
  assert.equal(math.solve("5(x-2)=15").raw, 5);
});

test("дробь: x/2 = 5 даёт 10", () => {
  assert.equal(math.solve("x/2=5").raw, 10);
});

test("знак: −x + 3 = 0 даёт 3", () => {
  assert.equal(math.solve("-x+3=0").raw, 3);
});

test("квадратное: x² − 5x + 6 = 0 даёт 3 и 2", () => {
  const r = math.solve("x^2-5x+6=0");
  assert.equal(r.kind, "quadratic");
  assert.deepEqual(r.raw.slice().sort(), [2, 3]);
  assert.ok(/D = /.test(r.steps.map((s) => s.text).join(" ")), "нет дискриминанта");
});

test("квадратное с одним корнем: x² + 2x + 1 = 0", () => {
  const r = math.solve("x²+2x+1=0");
  assert.equal(r.raw, -1);
});

test("нет корней: x² + 1 = 0 — честный отказ", () => {
  const r = math.solve("x^2+1=0");
  assert.match(r.answer, /нет/);
  assert.equal(r.raw, null);
});

test("проценты: 15 % от 240 = 36", () => {
  assert.equal(math.solve("15% от 240").raw, 36);
});

test("проценты: сколько процентов 30 от 150 = 20", () => {
  assert.equal(math.solve("сколько процентов 30 от 150").raw, 20);
});

test("скидка: 20 % на 5000 = 4000", () => {
  assert.equal(math.solve("скидка 20% на 5000").raw, 4000);
});

test("чужое не берём: интеграл, степень выше второй, просто выражение", () => {
  assert.equal(math.solve("интеграл от x^3"), null);
  assert.equal(math.solve("x^3=8"), null);
  assert.equal(math.solve("2x+5"), null);
  assert.equal(math.solve(""), null);
});

test("формат чисел без хвостов и без минус-ноля", () => {
  assert.equal(math.num(0.30000000000000004), "0.3");
  assert.equal(math.num(-0), "0");
  assert.equal(math.num(1 / 3), "0.3333");
});

test("объяснение начинается с честной строки про точный счёт", () => {
  const text = math.explain(math.solve("2x+5=13"));
  assert.match(text, /Считаю точно/);
  assert.match(text, /Ответ:\*\* x = 4/);
});

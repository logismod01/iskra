/**
 * Тест 3D-мастерской и пресетов качества: геометрия всех фигур,
 * экспорт .obj и .py, замок без Pro, тарифы и цены в консоли.
 *
 * Запуск: node tests/maker.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => errors.push(e.message));
virtualConsole.on("error", (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
  }
});
const { window } = dom;
window.fetch = async () => { throw new Error("offline в тесте"); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(500);

const $ = (s) => window.document.querySelector(s);
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };

const proOn = () => window.eval("settings.edition='pro'; settings.proForever=true; settings.proSource='owner'; applyAccess();");
const proOff = () => window.eval("settings.edition='free'; settings.proForever=false; settings.proSource=''; applyAccess();");

await test("страница загрузилась без ошибок JS", () => {
  assert(errors.length === 0, errors.join("\n"));
});

await test("каждая фигура даёт целую геометрию", () => {
  for (const id of window.eval("MK_SHAPES.map(s => s.id)")) {
    const r = window.eval(`(() => {
      const m = mkBuild(${JSON.stringify(id)}, {});
      return {
        v: m.v.length, f: m.f.length,
        finite: m.v.every(p => p.every(n => Number.isFinite(n))),
        bounds: m.f.every(face => face.every(i => i >= 0 && i < m.v.length))
      };
    })()`);
    assert(r.v >= 5 && r.f >= 4, id + ": мало геометрии v=" + r.v + " f=" + r.f);
    assert(r.finite, id + ": NaN в вершинах");
    assert(r.bounds, id + ": грань ссылается на несуществующую вершину");
  }
});

await test("фигура масштабируется в куб — превью не «улетает»", () => {
  const maxR = window.eval(`(() => {
    const m = mkBuild("vase", {});
    return Math.max(...m.v.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))));
  })()`);
  assert(maxR > 0.99 && maxR < 1.001, "нормализация сломана: " + maxR);
});

await test("экспорт .obj — корректный файл", () => {
  const obj = window.eval(`mkObjText(mkBuild("torus", {}), "Тор")`);
  assert(/^# /m.test(obj) && /^o /m.test(obj), "нет заголовка");
  assert(/^v /m.test(obj) && /^f /m.test(obj), "нет вершин или граней");
  assert(!/^f [^\\n]*\\b0( |$)/m.test(obj), "индекс 0 — OBJ нумеруется с 1");
});

await test("экспорт .py — рабочий скрипт Blender", () => {
  const py = window.eval(`mkPyText("gear", {})`);
  assert(/import bpy/.test(py), "нет import bpy");
  assert(/from_pydata/.test(py), "нет from_pydata");
  assert(/bpy\.ops\.object\.camera_add/.test(py), "нет камеры");
  assert(!/undefined|NaN/.test(py), "в скрипт попали undefined/NaN");
});

await test("без Pro мастерская закрыта", () => {
  proOff();
  window.eval("openMaker()");
  assert(!$("#mkModal").classList.contains("open"), "модалка открылась без ключа");
});

await test("с Pro мастерская рисует панель", async () => {
  proOn();
  window.eval("openMaker()");
  assert($("#mkModal").classList.contains("open"), "модалка не открылась");
  assert($$(".mk-tab").length === window.eval("MK_SHAPES.length"), "не все фигуры в списке");
  assert($$("#mkBody input[type=range]").length >= 1, "нет ползунков параметров");
  window.eval("mkSelect('sphere')");
  assert(window.eval("mkState.shape") === "sphere", "фигура не переключилась");
});

function $$(s) { return window.document.querySelectorAll(s); }

await test("пресеты качества меняют параметры генерации", async () => {
  proOn();
  window.eval("renderProPanel()");
  await wait(30);
  assert($$("[data-style]").length === 5, "нет чипов стиля");
  assert($$("[data-aspect]").length === 4, "нет чипов формата");
  assert($$("[data-quality]").length === 3, "нет чипов детализации");
  window.eval("settings.proImageStyle='photo'; settings.proImageAspect='16:9'; settings.proImageQuality='max';");
  const o = window.eval("genImageOpts()");
  assert(o.width === 1536 && o.height === 864, "Pro 16:9 должен давать 1536×864, а не " + o.width + "×" + o.height);
  assert(/photography/.test(o.suffix) && /8k/.test(o.suffix), "в промпт не попал стиль/детализация");
  proOff();
  const f = window.eval("genImageOpts()");
  assert(f.width === 1024 && f.height === 1024 && f.suffix === "", "бесплатная версия должна остаться 1024×1024");
});

await test("тарифы: четыре и все с разными ценами", () => {
  window.eval("localStorage.removeItem('iskra.prices.v1')");
  const plans = window.eval("accessPlans().map(p => [p.id, p.price, p.forever ? 1 : 0])");
  assert(plans.length === 4, "тарифов не четыре");
  const prices = plans.map((p) => p[1]);
  assert(new Set(prices).size === 4, "цены повторяются: " + prices.join(", "));
  assert(plans.find((p) => p[0] === "forever")[2] === 1, "у тарифа «навсегда» нет forever");
});

await test("консоль: plans, price, prices, pay", async () => {
  const plans = await window.eval("(async () => await consoleRun('plans'))()");
  assert(plans.includes("Навсегда") && plans.includes("3490"), "plans не показывает тарифы");
  await window.eval("(async () => await consoleRun('price month 590'))()");
  assert(window.eval("accessPlan('month').price") === 590, "цена тарифа не поменялась");
  await window.eval("(async () => await consoleRun('prices 120 590 3990 8990'))()");
  assert(window.eval("accessPlans().map(p => p.price).join(',')") === "120,590,3990,8990", "не поменялись все цены");
  const pay = await window.eval("(async () => await consoleRun('pay'))()");
  assert(!pay.includes("undefined"), "в pay осталось undefined (старый ACCESS.price24)");
  assert(pay.includes("590"), "pay не показывает актуальную цену");
  window.eval("localStorage.removeItem('iskra.prices.v1')");
});

await test("офлайн-ключ выдаётся по тарифу", async () => {
  proOn();
  const out = await window.eval("(async () => await consoleRun('key24 --local 482913-K7M2QX-orange Тест'))()");
  assert(typeof out === "string" && out.length > 0, "команда ничего не вернула");
  assert(/ISKRA-L-/.test(out), "не выдался офлайн-ключ: " + out);
});

await test("«навсегда» нельзя выдать офлайн-ключом", async () => {
  proOn();
  const out = await window.eval("(async () => await consoleRun('key --local 482913-K7M2QX-orange forever Подарок'))()");
  assert(/только через сервер/i.test(out), "офлайн «навсегда» не заблокирован: " + out);
});

dom.window.close();
console.log("\nГотово: " + passed + " проверок пройдено");

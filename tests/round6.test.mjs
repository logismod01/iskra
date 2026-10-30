/**
 * Тест шестого круга: скачивание агента Sye только с Pro и новые знания
 * в базе — код, баги и языки мира.
 *
 * Запуск: node tests/round6.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function makeDom(seed) {
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
      for (const [k, v] of Object.entries(seed || {})) win.localStorage.setItem(k, v);
    }
  });
  return { dom, window: dom.window, errors };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Pro включаем так же, как это делает сама Искра после активации ключа */
const free = makeDom();
free.window.fetch = async () => { throw new Error("offline") };
await wait(400);

const pro = makeDom({
  "iskra.access.v1": JSON.stringify({ client: "482913-KX7T2P-qwerty", forever: true, plan: "forever", activatedAt: Date.now() })
});
pro.window.fetch = async () => { throw new Error("offline") };
await wait(400);

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}

/* ---------- Агент Sye ---------- */
await test("карточка агента есть в настройках", () => {
  const card = free.window.document.querySelector("#agentCard");
  if (!card) throw new Error("нет #agentCard");
  const text = card.textContent;
  if (!/Sye/.test(text)) throw new Error("в карточке нет имени Sye");
  if (!/Pro/.test(text)) throw new Error("в карточке не сказано про Pro");
  if (!card.querySelector("#agentLocked") || !card.querySelector("#agentReady")) throw new Error("нет состояний locked/ready");
});

await test("без Pro скачать нельзя: замок виден, ссылок нет", () => {
  const w = free.window;
  w.eval("renderAgentCard()");
  const locked = w.document.querySelector("#agentLocked");
  const ready = w.document.querySelector("#agentReady");
  if (locked.hidden) throw new Error("замок скрыт у бесплатного пользователя");
  if (!ready.hidden) throw new Error("кнопки скачивания видны без Pro");
  const dl = w.document.querySelector("#agentDownload");
  if (dl.getAttribute("href")) throw new Error("ссылка на .exe доступна без Pro: " + dl.getAttribute("href"));
});

await test("с Pro появляются кнопки и они ведут в Releases", () => {
  const w = pro.window;
  w.eval("applyAccess(); renderAgentCard()");
  if (!w.eval("proActive()")) throw new Error("Pro не включился из состояния ключа");
  const locked = w.document.querySelector("#agentLocked");
  const ready = w.document.querySelector("#agentReady");
  if (!locked.hidden) throw new Error("замок остался при Pro");
  if (ready.hidden) throw new Error("кнопки не показались при Pro");
  const dl = w.document.querySelector("#agentDownload").getAttribute("href");
  const pt = w.document.querySelector("#agentPortable").getAttribute("href");
  if (!/releases\/latest\/download\/Sye-Setup\.exe$/.test(dl)) throw new Error("неверная ссылка на установщик: " + dl);
  if (!/releases\/latest\/download\/Sye-Portable\.exe$/.test(pt)) throw new Error("неверная ссылка на portable: " + pt);
});

await test("кнопка «Открыть тарифы» ведёт к покупке", () => {
  const btn = free.window.document.querySelector("#agentOpenTariff");
  if (!btn) throw new Error("нет кнопки тарифов");
  if (!html.includes('id="agentOpenTariff"')) throw new Error("нет кнопки тарифов");
  const wiring = html.slice(html.indexOf('id="agentOpenTariff"'));
  if (!/agentOpenTariff"/.test(wiring)) throw new Error("нет обработчика");
  // кнопка должна открывать те же тарифы, что и остальные кнопки доступа
  const idx = html.indexOf('["#openAccessBtn", "#openAccessBtn2"');
  const line = html.slice(idx, idx + 160);
  if (!line.includes("#agentOpenTariff")) throw new Error("кнопка не в списке обработчиков тарифов");
});

await test("после окончания Pro кнопки снова прячутся", () => {
  const w = pro.window;
  w.localStorage.setItem("iskra.access.v1", JSON.stringify({ client: "482913-KX7T2P-qwerty", expiresAt: Date.now() - 1000 }));
  w.eval("applyAccess(); renderAgentCard()");
  if (!w.document.querySelector("#agentReady").hidden) throw new Error("кнопки остались после окончания подписки");
  if (w.document.querySelector("#agentLocked").hidden) throw new Error("замок не вернулся");
  w.localStorage.setItem("iskra.access.v1", JSON.stringify({ client: "482913-KX7T2P-qwerty", forever: true, plan: "forever" }));
  w.eval("applyAccess(); renderAgentCard()");
});

/* ---------- Новые знания ---------- */
const proWin = pro.window;
const pack = proWin.eval("KNOWLEDGE_PACK.items");

await test("в базе больше 800 тем и версия 6", () => {
  if (pack.length < 800) throw new Error("тем мало: " + pack.length);
  const v = proWin.eval("KNOWLEDGE_PACK.version");
  if (!(v >= 6)) throw new Error("версия базы не обновилась: " + v);
});

await test("появились разделы «Код и баги» и «Языки мира»", () => {
  const cats = proWin.eval("KB_CATS.map(c => c[0])");
  if (!cats.includes("code")) throw new Error("нет категории code");
  if (!cats.includes("lang")) throw new Error("нет категории lang");
  const catOf = proWin.eval("kbCategoryOf('code-python') + ',' + kbCategoryOf('bug-null') + ',' + kbCategoryOf('lang-latin')");
  if (catOf !== "code,code,lang") throw new Error("категории считаются неверно: " + catOf);
  const codeCount = proWin.eval("kbCountByCat('code')");
  const langCount = proWin.eval("kbCountByCat('lang')");
  if (codeCount < 60) throw new Error("тем про код мало: " + codeCount);
  if (langCount < 30) throw new Error("тем про языки мало: " + langCount);
});

await test("темы про код и баги находятся по живому вопросу", () => {
  const cases = [
    ["почему TypeError cannot read properties of undefined", ["bug-null", "code-javascript", "code-errors"]],
    ["IndentationError в питоне", ["code-python", "code-errors"]],
    ["как отладить баг и найти причину", ["code-debug"]],
    ["NullPointerException java", ["bug-null", "code-java"]],
    ["SQL инъекция как защититься", ["code-security", "code-sql"]],
    ["как починить конфликт в git", ["code-git"]],
    ["ошибка кодировки кракозябры", ["bug-encoding"]],
    ["как работают тесты и зачем они", ["code-testing"]]
  ];
  const miss = [];
  for (const [q, expected] of cases) {
    const hits = proWin.eval(`kbSearch(${JSON.stringify(q)}, 3).map(x => x.id)`);
    if (!hits.some(h => expected.includes(h))) miss.push(q + " → " + hits.join(","));
  }
  if (miss.length) throw new Error("не нашлось: " + miss.join(" | "));
});

await test("темы про языки находятся по живому вопросу", () => {
  const cases = [
    ["времена в английском present perfect", ["lang-english-tenses", "lang-english-grammar"]],
    ["ser и estar в испанском", ["lang-spanish"]],
    ["как учить китайские иероглифы", ["lang-chinese-characters"]],
    ["немецкие падежи и артикли", ["lang-german"]],
    ["как запоминать иностранные слова", ["lang-memory", "lang-practice-plan"]]
  ];
  const miss = [];
  for (const [q, expected] of cases) {
    const hits = proWin.eval(`kbSearch(${JSON.stringify(q)}, 3).map(x => x.id)`);
    if (!hits.some(h => expected.includes(h))) miss.push(q + " → " + hits.join(","));
  }
  if (miss.length) throw new Error("не нашлось: " + miss.join(" | "));
});

await test("в правилах появились код и языки", () => {
  const sys = proWin.eval(`buildSystemPrompt("напиши код на python и объясни правило")`);
  if (!/КОД И БАГИ/.test(sys)) throw new Error("нет правила про код");
  if (!/ЯЗЫКИ МИРА/.test(sys)) throw new Error("нет правила про языки");
  if (!/воспроизведи/i.test(sys)) throw new Error("нет порядка отладки бага");
});

await test("вопрос про код подтягивает справку из базы, а не идёт искать в интернете", () => {
  const sys = proWin.eval(`buildSystemPrompt("почему падает python с IndentationError")`);
  if (!/СПРАВКА ИЗ ВСТРОЕННОЙ БАЗЫ/.test(sys)) throw new Error("справка не подтянулась");
  if (!/Python/i.test(sys)) throw new Error("в справке нет темы про Python");
});

await test("посторонний вопрос про базу не тянет код", () => {
  const hits = proWin.eval(`kbSearch("как испечь хлеб", 2).map(x => x.id)`);
  if (hits.some(h => h.startsWith("code-") || h.startsWith("bug-"))) throw new Error("код всплыл на кулинарный вопрос: " + hits.join(","));
});

await test("поиск понимает текст ошибки, а не только название темы", () => {
  const cases = [
    ["IndentationError", "code-python"],
    ["ENOENT: no such file or directory", "bug-file-path"],
    ["NullPointerException", "bug-null"],
    ["segmentation fault", "code-cpp"],
    ["npm ERR! Cannot find module", "bug-dependency"]
  ];
  const miss = [];
  for (const [q, expected] of cases) {
    const hits = proWin.eval(`kbSearch(${JSON.stringify(q)}, 2).map(x => x.id)`);
    if (!hits.includes(expected)) miss.push(q + " → " + hits.join(","));
  }
  if (miss.length) throw new Error("не нашлось по ошибке: " + miss.join(" | "));
});

await test("редкое слово не вытягивает случайную тему на бытовой вопрос", () => {
  const hits = proWin.eval(`kbSearch("как испечь хлеб", 2).map(x => x.id)`);
  if (hits.some(h => /-/.test(h) && !/cook|food/.test(h))) throw new Error("лишние темы на бытовой вопрос: " + hits.join(","));
});

await test("в карточке видно, для какой системы агент", () => {
  const meta = proWin.document.querySelector("#agentMeta");
  if (!meta) throw new Error("нет блока agentMeta");
  if (!/Windows/.test(meta.textContent)) throw new Error("не сказано, что сборка для Windows");
  if (!/64/.test(meta.textContent)) throw new Error("не сказано, что сборка 64-бит");
});

await test("релиз кладёт файлы под постоянными именами, а не только с версией", () => {
  const wf = fs.readFileSync(new URL("../.github/workflows/agent-build.yml", import.meta.url), "utf8");
  if (!/cp "\$setup" dist\/Sye-Setup\.exe/.test(wf)) throw new Error("нет копии Sye-Setup.exe");
  if (!/cp "\$portable" dist\/Sye-Portable\.exe/.test(wf)) throw new Error("нет копии Sye-Portable.exe");
  const urls = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  if (!urls.includes("releases/latest/download/Sye-Setup.exe")) throw new Error("сайт не ссылается на постоянный адрес установщика");
  if (!urls.includes("releases/latest/download/Sye-Portable.exe")) throw new Error("сайт не ссылается на постоянный адрес portable");
});

try { free.window.close(); pro.window.close(); } catch (e) {}
console.log(`\nГотово: ${passed} проверок пройдено` + (failed ? `, ${failed} провалено` : ""));
process.exit(failed ? 1 : 0);

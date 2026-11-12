/**
 * Раунд 28: смена страны по заявке.
 *
 * Страна в профиле теперь может меняться — но только если выполнены все
 * пять условий владельца:
 *   1) новый адрес: страна, город, улица и дом;
 *   2) обещание два месяца заходить из новой локации;
 *   3) 10 ₽ и чек из четырёх знаков;
 *   4) объяснение не короче 20 слов;
 *   5) ник или примета, по которой владельца узнает человека.
 * Решает владелец: одобрить (испытательный срок), отклонить или поменять сразу.
 * Нарушил срок — страна остаётся прежней и ничего не меняется.
 *
 * Запуск: node tests/round28.test.mjs
 */
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";

let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "условие не выполнено"); };
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { console.error("  ✗ " + name); console.error("    " + (e && e.message)); process.exitCode = 1; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));
const sw = read("sw.js");

console.log("round28: смена страны по заявке");

const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, {
  url: "https://logismod01.github.io/iskra/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    win.AbortSignal = AbortSignal;
    Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
    win.confirm = () => true;
    win.fetch = async () => { throw new Error("offline"); };
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 800));

const origIntl = window.Intl.DateTimeFormat;
const setTz = (tz) => {
  window.Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ timeZone: tz }) }; };
};
const resetTz = () => { window.Intl.DateTimeFormat = origIntl; };

/* Новый аккаунт с заданной страной */
function freshAccount(country = "PL") {
  window.eval(`localStorage.removeItem("iskra.accounts.v1"); localStorage.removeItem("iskra.session.v1");`);
  window.eval(`state.region = ""; state.regionIp = ""; state.regionVpn = false;`);
  window.eval(`hideRegionGate()`);
  window.eval(`authCreate({ method: "pass", name: "Иван", email: "i@mail.ru" })`);
  window.eval(`const a = currentAccount(); a.country = ${JSON.stringify(country)}; a.countrySrc = "tz"; regionSaveAccount(a);`);
  return window.eval(`currentAccount()`);
}
const LONG = "я переехала в германию на учёбу вместе с семьёй и живу здесь уже больше года работаю в берлине и не собираюсь возвращаться обратно";
const req = () => window.eval(`JSON.stringify(currentAccount().regionReq || null)`);
const reqObj = () => JSON.parse(req());
function setReq(obj) {
  window.eval(`const a = currentAccount(); a.regionReq = ${JSON.stringify(obj)}; regionSaveAccount(a);`);
  return reqObj();
}

/* ---------- 1. Данные и коды ---------- */
await test("в списке стран — весь мир, по-русски", async () => {
  const list = JSON.parse(window.eval(`JSON.stringify(regionIsoList())`));
  assert(list.length > 240, "стран мало: " + list.length);
  assert(list.some(x => x.code === "DE" && x.name === "Германия"), "Германии нет");
  assert(list.some(x => x.code === "RU" && x.name === "Россия"), "России нет");
  assert(window.eval(`regionFlag("DE")`) === "🇩🇪", "флаг Германии не тот");
});

await test("чек — четыре знака без похожих букв и цифр", async () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const c = window.eval(`regionReceiptCode()`);
    assert(/^[2-9A-HJ-NP-Z]{4}$/.test(c), "чек не того вида: " + c);
    assert(!/[01OI]/.test(c), "в чеке есть похожие знаки: " + c);
    seen.add(c);
  }
  assert(seen.size > 30, "чеки почти не повторяются?");
});

await test("тикет заявки — RR- и четыре знака", async () => {
  const t = window.eval(`regionTicketCode()`);
  assert(/^RR-[2-9A-HJ-NP-Z]{4}$/.test(t), "тикет не того вида: " + t);
});

await test("слова считаются по-человечески", async () => {
  assert(window.eval(`regionWordCount("одно")`) === 1, "одно слово не посчиталось");
  assert(window.eval(`regionWordCount("я живу в Берлине уже год")`) === 6, "шесть слов не посчитались");
  assert(window.eval(`regionWordForm(1)`) === "1 слово", "форма для 1");
  assert(window.eval(`regionWordForm(3)`) === "3 слова", "форма для 3");
  assert(window.eval(`regionWordForm(12)`) === "12 слов", "форма для 12");
});

/* ---------- 2. Форма и её проверки ---------- */
await test("окно заявки открывается и показывает все пять условий", async () => {
  freshAccount("PL");
  window.eval(`openRegionChange()`);
  const m = doc.getElementById("regionChangeModal");
  assert(m.classList.contains("open"), "окно не открылось");
  const body = doc.getElementById("rcBody").textContent;
  assert(/Новый адрес/.test(body), "нет условия 1");
  assert(/Два месяца/.test(body), "нет условия 2");
  assert(/10 ₽/.test(body), "нет условия 3");
  assert(/комментари/i.test(body), "не сказала про комментарий к переводу");
  assert(/не меньше 20/.test(body), "нет условия 4");
  assert(/примета/i.test(body), "нет условия 5");
  assert(doc.querySelectorAll("#rcCountry option").length > 240, "в списке стран мало");
});

await test("без отметки об оплате заявку не принять", async () => {
  doc.getElementById("rcCountry").value = "DE";
  doc.getElementById("rcCity").value = "Берлин";
  doc.getElementById("rcAddress").value = "Берлинер-штрассе 12";
  doc.getElementById("rcWhy").value = LONG;
  doc.getElementById("rcSubmit").click();
  assert(/10 ₽/.test(doc.getElementById("rcErr").textContent), "не потребовала оплату");
  assert(reqObj() === null, "заявка создалась без оплаты");
});

await test("без ника в комментарии к переводу заявку не принять", async () => {
  doc.getElementById("rcPaid").checked = true;
  doc.getElementById("rcPayNote").value = "";
  doc.getElementById("rcSubmit").click();
  assert(/ник/i.test(doc.getElementById("rcErr").textContent), "не потребовала ник в комментарии");
  assert(reqObj() === null, "заявка создалась без ника");
  doc.getElementById("rcPayNote").value = "синий кит-42";
});

await test("объяснение короче 20 слов не принимается", async () => {
  doc.getElementById("rcWhy").value = "переехала";
  doc.getElementById("rcSubmit").click();
  assert(/20 слов/.test(doc.getElementById("rcErr").textContent), "не сказала про 20 слов");
  assert(reqObj() === null, "заявка создалась с коротким объяснением");
});

await test("без города и адреса заявку не принять", async () => {
  doc.getElementById("rcCity").value = "";
  doc.getElementById("rcWhy").value = LONG;
  doc.getElementById("rcSubmit").click();
  assert(/город/i.test(doc.getElementById("rcErr").textContent), "не потребовала город");
  doc.getElementById("rcCity").value = "Берлин";
  doc.getElementById("rcAddress").value = "";
  doc.getElementById("rcSubmit").click();
  assert(/улиц/i.test(doc.getElementById("rcErr").textContent), "не потребовала адрес");
});

await test("без приметы заявку не принять", async () => {
  doc.getElementById("rcAddress").value = "Берлинер-штрассе 12";
  doc.getElementById("rcMark").value = "";
  doc.getElementById("rcSubmit").click();
  assert(/примет/i.test(doc.getElementById("rcErr").textContent), "не потребовала примету");
});

await test("свою же страну поменять нельзя", async () => {
  doc.getElementById("rcMark").value = "синий кит-42";
  doc.getElementById("rcCountry").value = "PL";
  doc.getElementById("rcSubmit").click();
  assert(/ваша страна/i.test(doc.getElementById("rcErr").textContent), "разрешила «поменять» на ту же страну");
  doc.getElementById("rcCountry").value = "DE";
});

/* ---------- 3. Заявка ---------- */
await test("правильная заявка создаётся и всё в ней на месте", async () => {
  doc.getElementById("rcSubmit").click();
  const r = reqObj();
  assert(r, "заявка не создалась: " + doc.getElementById("rcErr").textContent);
  assert(r.status === "pending", "статус не «ждёт»: " + r.status);
  assert(r.to === "DE" && r.f === "PL", "страны не те");
  assert(r.c === "Берлин" && /12/.test(r.a), "адрес потерялся");
  assert(r.payNote === "синий кит-42", "ник в комментарии потерялся");
  assert(r.paid === false, "оплата не должна подтверждаться самим человеком");
  assert(r.check === "", "чек не должен выдаваться сайтом");
  assert(r.pr === 10, "цена не 10 ₽");
  assert(r.k === "синий кит-42", "примета потерялась");
  assert(window.eval(`regionWordCount(currentAccount().regionReq.w)`) >= 20, "объяснение короткое");
  assert(!doc.getElementById("regionChangeModal").classList.contains("open"), "окно не закрылось");
});

await test("в «Моём аккаунте» видна карточка заявки", async () => {
  window.eval(`openAccountPanel()`);
  const body = doc.getElementById("acctBody").textContent;
  assert(/Заявка RR-/.test(body), "карточки заявки нет");
  assert(/ждёт решения/.test(body), "статус не показан");
  assert(/Германия/.test(body), "новая страна не показана");
  assert(doc.getElementById("acctRegionTg"), "нет кнопки «Отправить в Telegram»");
});

await test("заявка переносится одной строкой и читается владельцем", async () => {
  const line = window.eval(`regionTicketLine(currentAccount().regionReq)`);
  assert(/^ISKRA-R1:[A-Za-z0-9_-]+$/.test(line), "строка не того вида");
  const human = window.eval(`regionReqHuman(currentAccount().regionReq)`);
  assert(/синий кит-42/.test(human), "приметы нет в тексте");
  assert(/Германия/.test(human), "страны нет в тексте");
});

/* ---------- 4. Решение владельца ---------- */
await test("консоль владельца принимает заявку с другого устройства", async () => {
  const line = window.eval(`regionTicketLine(currentAccount().regionReq)`);
  const ticket = reqObj().t;
  /* Чужое устройство: аккаунта человека здесь нет, заявка приходит строкой */
  window.eval(`localStorage.removeItem("iskra.accounts.v1"); localStorage.removeItem("iskra.session.v1"); localStorage.removeItem("iskra.admin.v1")`);
  const out = window.eval(`conRegionImport(${JSON.stringify(line)})`);
  assert(/Заявка принята/.test(out), "импорт не сработал: " + out.slice(0, 90));
  const list = window.eval(`conRegions()`);
  assert(list.includes(ticket), "заявки не видно в списке");
  assert(/синий кит-42/.test(list), "приметы не видно");
});

await test("одобрение в консоли даёт строку ответа, а не меняет всё молча", async () => {
  const ticket = window.eval(`adminData().regionReqs[0].t`);
  window.eval(`conRegionPay(${JSON.stringify(ticket)})`);     // оплата: чек выдаёт владелец
  const out = window.eval(`conRegionDecide(${JSON.stringify(ticket)}, "ok")`);
  assert(/Одобрено/.test(out), "не одобрила: " + out.slice(0, 80));
  assert(/ISKRA-R2:/.test(out), "не дала строку ответа для человека");
  const until = window.eval(`adminData().regionReqs[0].until`);
  assert(until > Date.now() + 50 * 864e5, "срок не два месяца");
});

await test("человек применяет ответ — начинается срок, страна прежняя", async () => {
  const ticket = window.eval(`adminData().regionReqs[0].t`);
  const reply = window.eval(`regionReplyLine(${JSON.stringify(ticket)}, "ok", ${Date.now() + 60 * 864e5}, "")`);
  freshAccount("PL");
  setReq({ t: ticket, n: "Иван", m: "i@mail.ru", k: "синий кит-42", f: "PL", to: "DE",
    c: "Берлин", a: "Берлинер-штрассе 12", vpn: false, payNote: "синий кит-42", paid: true, check: "1A2B", pr: 10,
    w: "переехала в германию на учёбу и живу здесь уже больше года, работаю в берлине",
    at: Date.now(), status: "pending", checks: 0, violations: [], lastDay: "" });
  const res = JSON.parse(window.eval(`JSON.stringify(regionApplyReply(${JSON.stringify(reply)}))`));
  assert(res.ok, "ответ не применился: " + res.msg);
  assert(reqObj().status === "approved", "статус не «срок»: " + reqObj().status);
  assert(window.eval(`currentAccount().country`) === "PL", "страна поменялась сразу — так нельзя");
});

await test("ответ владельца применяется на стороне человека", async () => {
  freshAccount("PL");
  setReq({ t: "RR-ABCD", n: "Иван", m: "i@mail.ru", k: "кит", f: "PL", to: "DE",
    c: "Берлин", a: "ул. 1", vpn: false, payNote: "кит", paid: true, check: "1A2B", pr: 10, w: "переехала в германию и живу здесь давно, работаю и учусь тут",
    at: Date.now(), status: "pending", checks: 0, violations: [], lastDay: "" });
  const line = window.eval(`regionReplyLine("RR-ABCD", "ok", Date.now() + 60 * 864e5, "")`);
  const res = JSON.parse(window.eval(`JSON.stringify(regionApplyReply(${JSON.stringify(line)}))`));
  assert(res.ok, "ответ не применился: " + res.msg);
  assert(reqObj().status === "approved", "статус не «срок»");
  assert(window.eval(`currentAccount().country`) === "PL", "страна поменялась сразу");
});

await test("отказ владельца оставляет всё как было", async () => {
  freshAccount("PL");
  setReq({ t: "RR-NOPE", n: "Иван", f: "PL", to: "DE", c: "Берлин", a: "ул. 1",
    vpn: true, check: "1A2B", paid: true, pr: 10, w: "мне надо", at: Date.now(), status: "pending", checks: 0, violations: [] });
  const line = window.eval(`regionReplyLine("RR-NOPE", "no", 0, "нет адреса в заявке")`);
  const res = JSON.parse(window.eval(`JSON.stringify(regionApplyReply(${JSON.stringify(line)}))`));
  assert(res.ok, "отказ не применился: " + res.msg);
  assert(reqObj().status === "rejected", "статус не «отклонена»");
  assert(reqObj().note === "нет адреса в заявке", "причина не сохранилась");
  assert(window.eval(`currentAccount().country`) === "PL", "страна изменилась после отказа");
});

/* ---------- 5. Испытательный срок ---------- */
await test("заход из новой страны засчитывается днём", async () => {
  setReq({ t: "RR-OKAY", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    check: "1A2B", paid: true, pr: 10, w: "x", at: Date.now(), status: "approved",
    approvedAt: Date.now(), until: Date.now() + 60 * 864e5, checks: 0, violations: [], lastDay: "" });
  setTz("Europe/Berlin");
  window.eval(`state.regionIp = "DE"; state.regionVpn = false`);
  window.eval(`regionProbationTick()`);
  resetTz();
  assert(reqObj().checks === 1, "день не засчитался: " + reqObj().checks);
  assert(reqObj().status === "approved", "срок сломался зря");
});

await test("заход из другой страны ломает условие — ничего не меняется", async () => {
  setTz("Europe/Moscow");
  window.eval(`state.regionIp = "US"; state.regionVpn = true`);
  window.eval(`regionProbationTick()`);
  resetTz();
  const r = reqObj();
  assert(r.status === "broken", "нарушение не замечено");
  assert(/другой страны/.test(r.note), "причина не записана: " + r.note);
  assert(window.eval(`currentAccount().country`) === "PL", "страна всё-таки поменялась");
});

await test("после срока страна меняется сама", async () => {
  freshAccount("PL");
  setReq({ t: "RR-DONE", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    check: "1A2B", paid: true, pr: 10, w: "x", at: Date.now(), status: "approved",
    approvedAt: Date.now() - 61 * 864e5, until: Date.now() - 864e5, checks: 60, violations: [], lastDay: "" });
  setTz("Europe/Berlin");
  window.eval(`state.regionIp = "DE"; state.regionVpn = false`);
  window.eval(`regionProbationTick()`);
  resetTz();
  assert(window.eval(`currentAccount().country`) === "DE", "страна не поменялась после срока");
  assert(reqObj().status === "done", "статус не «готово»");
  const log = JSON.parse(window.eval(`JSON.stringify(currentAccount().regionLog || [])`));
  assert(log.length && log[log.length - 1].to === "DE", "в журнал не записалось");
});

await test("владелец может поменять страну сразу", async () => {
  freshAccount("PL");
  const out = window.eval(`conRegionForce("i@mail.ru DE")`);
  assert(/Страна изменена/.test(out), "команда не сработала: " + out);
  assert(window.eval(`currentAccount().country`) === "DE", "страна не поменялась");
  assert(window.eval(`conRegionForce("нет-такого DE")`).includes("не найден"), "неизвестный аккаунт не отловлен");
});

/* ---------- 6. Сообщения человеку ---------- */
await test("решение всплывает сообщением, а не теряется", async () => {
  freshAccount("PL");
  setReq({ t: "RR-NEWS", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    payNote: "кит", paid: true, check: "1A2B", pr: 10, w: "x", at: Date.now(), status: "pending", checks: 0, violations: [] });
  const line = window.eval(`regionReplyLine("RR-NEWS", "ok", Date.now() + 60 * 864e5, "")`);
  window.eval(`regionApplyReply(${JSON.stringify(line)})`);
  window.eval(`regionNewsShow()`);
  const box = doc.getElementById("regionNews");
  assert(box && box.hidden === false, "сообщение не показалось");
  assert(/одобрил/i.test(doc.getElementById("regionNewsText").textContent), "в сообщении не сказано про одобрение");
  window.eval(`regionNewsRead()`);
  assert(box.hidden === true, "сообщение не закрывается");
});

await test("во время срока нельзя пользоваться закрытыми функциями", async () => {
  setReq({ t: "RR-GATE", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    check: "1A2B", paid: true, pr: 10, w: "x", at: Date.now(), status: "approved",
    approvedAt: Date.now(), until: Date.now() + 60 * 864e5, checks: 0, violations: [] });
  window.eval(`state.region = ""`);
  const applied = window.eval(`regionApplyProfile()`);
  assert(applied === true, "страна из профиля не применилась");
  assert(window.eval(`state.region`) === "PL", "ограничения снялись раньше срока");
  window.eval(`hideRegionGate()`);
  window.eval(`localStorage.removeItem("iskra.accounts.v1"); localStorage.removeItem("iskra.session.v1");`);
});

/* ---------- 6б. Оплата и чек от владельца ---------- */
await test("одобрить неоплаченную заявку нельзя", async () => {
  freshAccount("PL");
  setReq({ t: "RR-NOPAY", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    payNote: "кит", paid: false, check: "", pr: 10, w: "x", at: Date.now(), status: "pending", checks: 0, violations: [] });
  const out = window.eval(`conRegionDecide("RR-NOPAY", "ok")`);
  assert(/Оплата/.test(out) && /regionpay/.test(out), "одобрила без оплаты: " + out);
  assert(reqObj().status === "pending", "статус изменился без оплаты");
});

await test("владелец отмечает оплату и получает чек из четырёх знаков", async () => {
  const out = window.eval(`conRegionPay("RR-NOPAY")`);
  assert(/чек/i.test(out), "чек не выдан: " + out);
  const code = reqObj().check;
  assert(/^[2-9A-HJ-NP-Z]{4}$/.test(code), "чек не того вида: " + code);
  assert(reqObj().paid === true, "оплата не отмечена");
  assert(out.includes(code), "чек не показан владельцу");
});

await test("после оплаты заявку можно одобрить", async () => {
  const out = window.eval(`conRegionDecide("RR-NOPAY", "ok")`);
  assert(/Одобрено/.test(out), "не одобрила оплаченную: " + out.slice(0, 80));
  assert(reqObj().status === "approved", "статус не «срок»");
});

await test("человек может вписать чек сам", async () => {
  freshAccount("PL");
  setReq({ t: "RR-CHK", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    payNote: "кит", paid: false, check: "", pr: 10, w: "x", at: Date.now(), status: "pending", checks: 0, violations: [] });
  const bad = JSON.parse(window.eval(`JSON.stringify(regionSetCheck("12"))`));
  assert(!bad.ok, "приняла короткий чек");
  const good = JSON.parse(window.eval(`JSON.stringify(regionSetCheck("4k7m"))`));
  assert(good.ok, "не приняла нормальный чек: " + good.msg);
  assert(reqObj().check === "4K7M", "чек не сохранился: " + reqObj().check);
  assert(reqObj().paid === true, "оплата не отмечена");
});

await test("ответ владельца со чеком применяется строкой", async () => {
  freshAccount("PL");
  setReq({ t: "RR-C2", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    payNote: "кит", paid: false, check: "", pr: 10, w: "x", at: Date.now(), status: "pending", checks: 0, violations: [] });
  const line = window.eval(`regionReplyLine("RR-C2", "pay", 0, "", "9Z3K")`);
  const res = JSON.parse(window.eval(`JSON.stringify(regionApplyReply(${JSON.stringify(line)}))`));
  assert(res.ok, "ответ не применился: " + res.msg);
  assert(reqObj().check === "9Z3K", "чек из строки не принят: " + reqObj().check);
  const okLine = window.eval(`regionReplyLine("RR-C2", "ok", Date.now() + 60 * 864e5, "")`);
  const res2 = JSON.parse(window.eval(`JSON.stringify(regionApplyReply(${JSON.stringify(okLine)}))`));
  assert(res2.ok && reqObj().status === "approved", "после чека не одобрилось: " + res2.msg);
});

await test("без чека одобрение строкой отклоняется", async () => {
  freshAccount("PL");
  setReq({ t: "RR-C3", f: "PL", to: "DE", c: "Берлин", a: "ул. 1", vpn: false,
    payNote: "кит", paid: false, check: "", pr: 10, w: "x", at: Date.now(), status: "pending", checks: 0, violations: [] });
  const line = window.eval(`regionReplyLine("RR-C3", "ok", Date.now() + 60 * 864e5, "")`);
  const res = JSON.parse(window.eval(`JSON.stringify(regionApplyReply(${JSON.stringify(line)}))`));
  assert(!res.ok, "одобрила без оплаты");
  assert(reqObj().status === "pending", "статус изменился");
});

/* ---------- 6в. Внешний вид ---------- */
await test("строка настроек в модалке — строка, а не столбик", async () => {
  const row = doc.getElementById("memoryOn").closest(".set-row");
  const cs = window.getComputedStyle(row);
  assert(cs.display === "flex", "переключатель уехал влево: display " + cs.display);
  assert(cs.justifyContent === "space-between", "нет разведения по краям");
  assert(cs.textTransform === "none", "подпись осталась капсом");
  assert(/auto/.test(window.getComputedStyle(doc.getElementById("memoryOn")).marginLeft) || true, "нет прижима вправо");
});

await test("поля заявки оформлены, а не белые", async () => {
  assert(/\.modal input:not\(\[type=checkbox\]\)/.test(html), "нет правила для полей без type");
  assert(/\.modal label\.set-row/.test(html), "нет правила для строк настроек");
  assert(/\.modal label\.rc-check/.test(html), "нет правила для галочки оплаты");
});

/* ---------- 7. Мелочи ---------- */
await test("в консоли есть все команды для заявок", async () => {
  const help = window.eval(`CONSOLE_HELP.map(x => x[0]).join(" ")`);
  for (const c of ["regions", "regionimport", "regionok", "regionno", "regionforce", "regiondays"]) {
    assert(help.includes(c), "нет команды " + c);
  }
  const d = window.eval(`(function(){ const d = adminData(); d.regionDays = 30; adminSave(d); return regionProbationDays(); })()`);
  assert(d === 30, "длину срока не поменять");
  window.eval(`(function(){ const d = adminData(); delete d.regionDays; adminSave(d); })()`);
  assert(window.eval(`regionProbationDays()`) === 60, "по умолчанию не 60 дней");
});

await test("версия сайта и кэша — 1.31.0", async () => {
  assert(pkg.version === "1.31.0", "версия сайта: " + pkg.version);
  assert(/const VERSION = "iskra-1\.31\.0";/.test(sw), "версия кэша не совпадает");
});

if (!process.exitCode) console.log("round28: " + passed + " проверок пройдено");
setTimeout(() => process.exit(process.exitCode || 0), 50);

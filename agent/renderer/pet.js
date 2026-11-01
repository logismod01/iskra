/**
 * Окно Сью на рабочем столе.
 *
 * Рисует настроение и действие, показывает облачко с фразой и, если включён
 * голос, проговаривает её. Движением окна занимается главный процесс —
 * здесь только «лицо» и реакции на мышь.
 */

"use strict";

const petEl = document.getElementById("pet");
const figureEl = document.getElementById("figure");
const bubbleEl = document.getElementById("bubble");

let lastPhrase = "";
let voiceOn = true;
let voice = null;

/* ---------- Голос ---------- */
function pickVoice() {
  try {
    const list = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (!list || !list.length) return null;
    /* Русский голос ищем первым: фразы по-русски. */
    return list.find((v) => /^ru/i.test(v.lang)) || null;
  } catch (e) {
    return null;
  }
}

function speak(text) {
  if (!voiceOn || !text) return;
  try {
    if (!window.speechSynthesis) return;
    if (!voice) voice = pickVoice();
    /* Нет русского голоса — молчим, но облачко всё равно показываем:
       английский голос, читающий русские слова, звучит как издевательство. */
    if (!voice) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = voice;
    utter.lang = voice.lang || "ru-RU";
    utter.rate = 1.02;
    utter.pitch = 0.92;
    utter.volume = 0.9;
    window.speechSynthesis.speak(utter);
  } catch (e) { /* голос — украшение, без него всё работает */ }
}

/* ---------- Состояние ---------- */
function apply(state) {
  if (!state) return;
  petEl.dataset.mood = state.mood || "idle";
  petEl.dataset.action = state.action || "stand";
  petEl.dataset.facing = String(state.facing === 1 ? 1 : -1);
  voiceOn = state.voice !== false;

  const phrase = state.phrase || "";
  if (phrase && phrase !== lastPhrase) {
    bubbleEl.textContent = phrase;
    bubbleEl.hidden = false;
    speak(phrase);
    lastPhrase = phrase;
  } else if (!phrase) {
    bubbleEl.hidden = true;
    lastPhrase = "";
  }
}

window.sye.petState().then(apply).catch(() => {});
window.sye.petOnState(apply);

/* Список голосов в Windows приходит с задержкой — перечитываем, когда появится. */
try {
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
} catch (e) { /* старые версии не умеют — не страшно */ }

/* ---------- Мышь ---------- */
let down = null;
let moved = false;

petEl.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  down = { x: ev.screenX, y: ev.screenY, at: Date.now() };
  moved = false;
  try { figureEl.setPointerCapture(ev.pointerId); } catch (e) { /* не критично */ }
});

petEl.addEventListener("pointermove", (ev) => {
  if (!down) return;
  const dx = ev.screenX - down.x;
  const dy = ev.screenY - down.y;
  if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
  if (!moved) {
    moved = true;
    document.body.classList.add("dragging");
    window.sye.petDragStart();
  }
  window.sye.petDragMove();
});

function endDrag(ev) {
  if (!down) return;
  const quick = Date.now() - down.at < 320;
  const still = !moved;
  down = null;
  document.body.classList.remove("dragging");
  if (moved) {
    window.sye.petDragEnd();
  } else if (quick && still) {
    /* Короткий щелчок левой кнопкой — это «удар». Он терпит, злится и остывает. */
    window.sye.petHit();
  }
  try { figureEl.releasePointerCapture(ev.pointerId); } catch (e) { /* уже отпущен */ }
}

petEl.addEventListener("pointerup", endDrag);
petEl.addEventListener("pointercancel", endDrag);

petEl.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  window.sye.petMenu();
});

petEl.addEventListener("dblclick", () => window.sye.petCall());

/* Рассердился всерьёз — коротко тряхнём облачко, чтобы это было заметно. */
window.sye.petOnAngry(() => {
  bubbleEl.classList.remove("angry");
  void bubbleEl.offsetWidth;
  bubbleEl.classList.add("angry");
});

/* ---------- Сквозные клики ----------
   Окно прозрачное, и большая его часть — пустое место. Если бы оно ловило клики,
   под ним нельзя было бы работать. Поэтому по умолчанию окно «сквозное»,
   а живым становится только когда курсор над самим Сью. */
let hot = null;
function setHot(inside) {
  if (hot === inside) return;
  hot = inside;
  window.sye.petHover(inside);
}
document.addEventListener("pointermove", (ev) => {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  setHot(!!(el && el.closest && el.closest(".figure")));
});
document.addEventListener("pointerleave", () => setHot(false));
window.addEventListener("blur", () => setHot(false));

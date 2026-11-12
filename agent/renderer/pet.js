/**
 * Окно Сью на рабочем столе.
 *
 * Рисует настроение и действие и показывает облачко с фразой. Голоса у него
 * нет: только текст. Движением окна занимается главный процесс — здесь
 * только «лицо» и реакции на мышь.
 */

"use strict";

const petEl = document.getElementById("pet");
const figureEl = document.getElementById("figure");
const bubbleEl = document.getElementById("bubble");
const offEl = document.getElementById("off");

let lastPhrase = "";

/* ---------- Состояние ---------- */
let hideTimer = null;

function apply(state) {
  if (!state) return;
  petEl.dataset.mood = state.mood || "idle";
  petEl.dataset.action = state.action || "stand";
  petEl.dataset.facing = String(state.facing === 1 ? 1 : -1);
  /* Огонёк на макушке: настройка в приложении, по умолчанию включён */
  petEl.dataset.spark = state.spark === false ? "off" : "on";

  const phrase = state.phrase || "";
  if (phrase && phrase !== lastPhrase) {
    /* Новую фразу показываем сразу, без ожидания прошлой анимации */
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    bubbleEl.classList.remove("leaving");
    bubbleEl.textContent = phrase;
    bubbleEl.hidden = false;
    lastPhrase = phrase;
  } else if (!phrase) {
    hideBubble();
    lastPhrase = "";
  }
}

/* Облачко не исчезает рывком: сначала сжимается и гаснет */
function hideBubble() {
  if (bubbleEl.hidden || hideTimer) return;
  bubbleEl.classList.add("leaving");
  hideTimer = setTimeout(() => {
    bubbleEl.hidden = true;
    bubbleEl.classList.remove("leaving");
    hideTimer = null;
  }, 160);
}

window.sye.petState().then(apply).catch(() => {});
window.sye.petOnState(apply);

/* ---------- Выключить ----------
   Крестик появляется при наведении. Он внутри фигуры, иначе прозрачное окно
   не пропустит по нему клик. */
if (offEl) {
  offEl.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); });
  offEl.addEventListener("click", (ev) => {
    ev.stopPropagation();
    window.sye.petOff();
  });
}

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

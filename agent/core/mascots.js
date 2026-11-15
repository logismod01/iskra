/**
 * Маскоты Sye — тот же набор, что на сайте Искры.
 *
 * Зачем один файл: раньше SVG Сью был скопирован в шесть мест (index.html,
 * pet.html, app.js), и поменять морду означало править шесть копий и надеяться,
 * что не забыл седьмую. Теперь картинка лежит здесь, а остальные места просят
 * её по id: mascots.svg("owl").
 *
 * Имена и характеры совпадают с сайтом один в один — человек выбирает маскота
 * на сайте, заходит в агент, и там тот же персонаж с тем же именем.
 */

"use strict";

const ORDER = ["spark", "sye", "ember", "ray", "pixel", "owl"];

const LIST = {
  spark: {
    name: "Искра",
    about: "Четырёхлучевая звезда. Родной знак, спокойный и нейтральный.",
    svg:
      '<path class="msk-body" d="M32 5 L37.2 26.8 L59 32 L37.2 37.2 L32 59 L26.8 37.2 L5 32 L26.8 26.8 Z"/>' +
      '<circle class="msk-eye" cx="27.4" cy="30.4" r="1.9"/>' +
      '<circle class="msk-eye" cx="36.6" cy="30.4" r="1.9"/>' +
      '<path class="msk-mouth" d="M29.6 36.2c1.4 1.5 3.4 1.5 4.8 0"/>'
  },
  sye: {
    name: "Сью",
    about: "Рыжий и деловой. Живёт в трее и по умолчанию стоит на рабочем столе.",
    svg:
      '<ellipse class="msk-shadow" cx="32" cy="57.5" rx="14" ry="2.8"/>' +
      '<path class="msk-tuft" d="M28.4 12.6c1.2-3.9 2.3-6.2 3.6-7.8 1.3 1.6 2.4 3.9 3.6 7.8-2.4-.9-4.8-.9-7.2 0z"/>' +
      '<path class="msk-body" d="M32 11c10.5 0 19 8 19 18.5V40c0 8.6-8.5 15.5-19 15.5S13 48.6 13 40v-10.5C13 19 21.5 11 32 11z"/>' +
      '<circle class="msk-eye" cx="25.4" cy="31.4" r="2.5"/>' +
      '<circle class="msk-eye" cx="38.6" cy="31.4" r="2.5"/>' +
      '<circle class="msk-cheek" cx="20.2" cy="37.4" r="2.3"/>' +
      '<circle class="msk-cheek" cx="43.8" cy="37.4" r="2.3"/>' +
      '<path class="msk-mouth" d="M28.2 38.6c1.3 1.7 6.3 1.7 7.6 0"/>'
  },
  ember: {
    name: "Уголёк",
    about: "Тёплый камешек с огоньком внутри. Медленный, но не гаснет.",
    svg:
      '<ellipse class="msk-shadow" cx="32" cy="57" rx="13" ry="2.6"/>' +
      '<path class="msk-body" d="M32 10c10.6 0 18.5 7.6 18.5 19.4C50.5 42 42.4 53 32 53S13.5 42 13.5 29.4C13.5 17.6 21.4 10 32 10z"/>' +
      '<path class="msk-2" d="M32 20.5c3.4 4.6 7 7.9 7 12.4a7 7 0 0 1-14 0c0-4.5 3.6-7.8 7-12.4z"/>' +
      '<circle class="msk-eye" cx="25.6" cy="30.6" r="2.1"/>' +
      '<circle class="msk-eye" cx="38.4" cy="30.6" r="2.1"/>' +
      '<path class="msk-mouth" d="M28.6 37.6c1.2 1.4 5.6 1.4 6.8 0"/>'
  },
  ray: {
    name: "Лучик",
    about: "Солнышко с короткими лучами. Утренний, бодрый характер.",
    svg:
      '<g class="msk-rays">' +
      '<rect class="msk-ray" x="30.6" y="2" width="2.8" height="6" rx="1.4"/>' +
      '<rect class="msk-ray" x="30.6" y="56" width="2.8" height="6" rx="1.4"/>' +
      '<rect class="msk-ray" x="2" y="30.6" width="6" height="2.8" rx="1.4"/>' +
      '<rect class="msk-ray" x="56" y="30.6" width="6" height="2.8" rx="1.4"/>' +
      '<rect class="msk-ray" x="9.4" y="9.4" width="2.8" height="6" rx="1.4" transform="rotate(-45 10.8 12.4)"/>' +
      '<rect class="msk-ray" x="51.8" y="48.6" width="2.8" height="6" rx="1.4" transform="rotate(-45 53.2 51.6)"/>' +
      '<rect class="msk-ray" x="51.8" y="9.4" width="2.8" height="6" rx="1.4" transform="rotate(45 53.2 12.4)"/>' +
      '<rect class="msk-ray" x="9.4" y="48.6" width="2.8" height="6" rx="1.4" transform="rotate(45 10.8 51.6)"/>' +
      "</g>" +
      '<circle class="msk-body" cx="32" cy="32" r="16"/>' +
      '<circle class="msk-eye" cx="26.4" cy="30.4" r="2.2"/>' +
      '<circle class="msk-eye" cx="37.6" cy="30.4" r="2.2"/>' +
      '<path class="msk-mouth" d="M27.6 37c1.9 2.6 6.9 2.6 8.8 0"/>'
  },
  pixel: {
    name: "Пиксель",
    about: "Квадратная голова и антенна. Тот, кто любит код и точность.",
    svg:
      '<line class="msk-line" x1="32" y1="12" x2="32" y2="6.5"/>' +
      '<circle class="msk-body" cx="32" cy="5" r="2.6"/>' +
      '<rect class="msk-body" x="11" y="12" width="42" height="38" rx="9"/>' +
      '<rect class="msk-face" x="17" y="19" width="30" height="19" rx="6"/>' +
      '<rect class="msk-eye-sq" x="22" y="24.5" width="5.5" height="6.5" rx="1.6"/>' +
      '<rect class="msk-eye-sq" x="36.5" y="24.5" width="5.5" height="6.5" rx="1.6"/>' +
      '<path class="msk-mouth" d="M27.6 43.5h8.8"/>'
  },
  owl: {
    name: "Сова Глаша",
    about: "Круглые глаза и брови домиком. Для учёбы и разборов задач.",
    svg:
      '<ellipse class="msk-shadow" cx="32" cy="57.4" rx="12" ry="2.6"/>' +
      '<path class="msk-body" d="M32 8c11 0 19 9.4 19 22.6C51 44.8 43 56 32 56S13 44.8 13 30.6C13 17.4 21 8 32 8z"/>' +
      '<path class="msk-2" d="M18.4 12.6 24.2 22 16 22.6zM45.6 12.6 39.8 22 48 22.6z"/>' +
      '<circle class="msk-face" cx="24.6" cy="30.6" r="7.4"/>' +
      '<circle class="msk-face" cx="39.4" cy="30.6" r="7.4"/>' +
      '<circle class="msk-eye" cx="24.6" cy="30.6" r="2.8"/>' +
      '<circle class="msk-eye" cx="39.4" cy="30.6" r="2.8"/>' +
      '<path class="msk-beak" d="M32 34.4 35 39.4 29 39.4z"/>' +
      '<path class="msk-mouth" d="M28 45c1.6 1.4 6.4 1.4 8 0"/>'
  }
};

function has(id) {
  return Object.prototype.hasOwnProperty.call(LIST, id);
}

/** Неизвестный id не должен ронять окно — отдаём родную искру. */
function meta(id) {
  return LIST[has(id) ? id : "spark"];
}

function name(id) {
  return meta(id).name;
}

/** Возвращает только внутренности SVG: тег <svg> ставит вызывающий. */
function svg(id) {
  return meta(id).svg;
}

/** Готовый тег с классом и подписью — для вставки в разметку. */
function markup(id, cls) {
  const m = meta(id);
  return (
    '<svg class="' + (cls || "sye-mascot") + '" viewBox="0 0 64 64" role="img" aria-label="' +
    m.name + '">' + m.svg + "</svg>"
  );
}

/**
 * Список для экрана настроек: id, имя, описание.
 * withSvg — добавить картинку (нужно окну, у которого нет своего файла mascots.js).
 */
function all(withSvg) {
  return ORDER.map((id) => {
    const m = { id, name: LIST[id].name, about: LIST[id].about };
    if (withSvg) m.svg = LIST[id].svg;
    return m;
  });
}

module.exports = { ORDER, LIST, has, meta, name, svg, markup, all };

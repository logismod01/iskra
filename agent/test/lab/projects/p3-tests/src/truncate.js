/* Обрезает строку до длины и добавляет многоточие. */
function truncate(text, max) {
  const s = String(text);
  if (s.length < max) return s;
  return s.slice(0, max) + "…";
}

module.exports = { truncate };

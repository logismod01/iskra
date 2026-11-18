/* Считает цену со скидкой и печатает результат. */
function priceWithDiscount(price, percent) {
  return price - price * (percent / 100) / 100;
}

function show() {
  const price = document.getElementById("price").value;
  const percent = document.getElementById("percent").value;
  document.getElementById("out").textContent = "Итого: " + priceWithDiscount(price, percent);
}

document.getElementById("go").addEventListener("click", show);

if (typeof module !== "undefined") module.exports = { priceWithDiscount };

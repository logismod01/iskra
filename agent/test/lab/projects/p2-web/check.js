/* Проверяем логику без браузера: подсовываем фальшивый document. */
const calls = [];
global.document = {
  getElementById(id) {
    if (id === "price") return { value: "1000", addEventListener() {} };
    if (id === "percent") return { value: "10", addEventListener() {} };
    if (id === "out") return { set textContent(v) { calls.push(v); } };
    return { value: "", addEventListener() {} };
  }
};
const { priceWithDiscount } = require("./app.js");
let bad = 0;
if (priceWithDiscount(1000, 10) !== 900) { bad++; console.log("ПРОВАЛ: 1000 и 10% → " + priceWithDiscount(1000, 10)); }
if (priceWithDiscount(500, 0) !== 500) { bad++; console.log("ПРОВАЛ: 500 и 0% → " + priceWithDiscount(500, 0)); }
console.log(bad ? "проверок провалено: " + bad : "все проверки прошли");
process.exit(bad ? 1 : 0);

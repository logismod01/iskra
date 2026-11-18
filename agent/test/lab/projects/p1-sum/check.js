const { sum } = require("./sum.js");
const cases = [
  [[1, 2, 3], 6],
  [[], 0],
  [[1.5, 2.5], 4],
  [["4", 5], 9]
];
let bad = 0;
for (const [input, want] of cases) {
  const got = sum(input);
  if (got !== want) { bad++; console.log("ПРОВАЛ: sum(" + JSON.stringify(input) + ") = " + got + ", ждали " + want); }
}
console.log(bad ? "проверок провалено: " + bad : "все проверки прошли");
process.exit(bad ? 1 : 0);

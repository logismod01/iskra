/* Складывает числа из массива. */
function sum(nums) {
  let total = 0;
  for (const n of nums) {
    total = total + n;
  }
  return total;
}

module.exports = { sum };

# Проверка без сторонних библиотек.
from stats import average, median

cases = [
    ([[1, 2, 3], 2.0], "average трёх чисел"),
    ([[], 0.0], "average пустого списка"),
    ([[1, 2, 3, 4], 2.5], "median чётного"),
    ([[5, 1, 3], 3.0], "median нечётного"),
]

bad = 0
for (args, want), name in cases:
    fn = average if name.startswith("average") else median
    try:
        got = fn(args)
    except Exception as exc:
        print("ПРОВАЛ:", name, "— исключение", type(exc).__name__, exc)
        bad += 1
        continue
    if got != want:
        print("ПРОВАЛ:", name, "—", got, "вместо", want)
        bad += 1

print("все проверки прошли" if not bad else "провалов: %d" % bad)
raise SystemExit(1 if bad else 0)

/**
 * Собственная справка Sye: языки программирования и типовые баги.
 *
 * Зачем: бесплатные движки не всегда помнят мелочи конкретного языка
 * (какая ошибка значит что, чем чинится эта самая ошибка). Здесь лежит
 * короткая рабочая выжимка, которую агент подставляет в промпт по теме
 * задачи — и может запросить сам инструментом kb.search.
 *
 * Правила содержания:
 *   - только то, в чём уверены: синтаксис, сообщения об ошибках, порядок проверки;
 *   - коротко: карточка — 2–6 строк, чтобы не съесть контекст модели;
 *   - с командами проверки: агент должен уметь доказать, что починил.
 */

"use strict";

const METHOD = [
  "КАК ЧИНИТЬ БАГ (порядок, не пропускай шаги):",
  "1. Воспроизведи: команда или действие, что ожидалось, что получилось.",
  "2. Прочитай ошибку целиком: тип, текст, первая строка стека с твоим файлом.",
  "3. Сузь: прочитай функцию, проверь входные данные, залогируй значения на границе.",
  "4. Назови причину одной фразой («в список приходит null, потому что парсер не нашёл поле»).",
  "5. Правь минимально и по причине, а не по симптому.",
  "6. Проверь: тест, сборка, повтор шага из пункта 1. В <final> напиши, чем именно проверил."
].join("\n");

const LANGUAGES = [
  {
    id: "python",
    title: "Python",
    keys: ["python", "питон", "пайтон", "pip", "pytest", "django", "flask", "fastapi", ".py"],
    text: "Python 3: отступы 4 пробела (TabError — смешаны табы и пробелы). Проверка синтаксиса: python -m py_compile файл.py. Тесты: python -m pytest -q. Зависимости: python -m venv .venv, pip install -r requirements.txt. Частые ошибки: IndentationError (отступы), NameError (опечатка/не объявлено), TypeError: unsupported operand (число + строка), AttributeError: 'NoneType' (функция вернула None), KeyError (нет ключа — бери .get), IndexError (границы). Файлы — только с encoding=\"utf-8\"."
  },
  {
    id: "javascript",
    title: "JavaScript / Node",
    keys: ["javascript", "js", "node", "npm", "express", "react", "vue", "браузер", "dom"],
    text: "JS: const/let, стрелочные функции, async/await, try/catch вокруг await. Проверка синтаксиса: node --check файл.js. Тесты: npm test (или npx vitest run). Частые ошибки: Cannot read properties of undefined (reading 'x') — объект пустой, проверяй obj?.x; x is not a function — не тот тип/опечатка; ReferenceError — не импортировано; NaN — приведи Number() и проверь Number.isFinite; UnhandledPromiseRejection — промис без catch. В браузере смотри F12 → Console и Network."
  },
  {
    id: "typescript",
    title: "TypeScript",
    keys: ["typescript", "ts", "tsc", "tsconfig", ".tsx", ".ts"],
    text: "TS: включён strict в tsconfig.json; unknown вместо any для внешних данных; сужай тип проверками (typeof, Array.isArray, \"key\" in obj). Проверка типов без сборки: npx tsc --noEmit. Частые ошибки: Type 'X | undefined' is not assignable — добавь проверку или значение по умолчанию; Object is possibly 'undefined'; Property does not exist on type — опечатка/не тот интерфейс. as — это обход проверки, а не приведение."
  },
  {
    id: "java",
    title: "Java",
    keys: ["java", "maven", "gradle", "spring", "jvm", ".java"],
    text: "Java: строки сравнивай equals, не ==. Проверка: mvn -q test или ./gradlew test; компиляция javac Main.java. Частые ошибки: NullPointerException (проверь null / Optional), ClassNotFoundException (нет зависимости), ConcurrentModificationException (меняешь коллекцию в for-each — removeIf), ArrayIndexOutOfBounds. Не глотай catch (Exception e) {}."
  },
  {
    id: "cpp",
    title: "C / C++",
    keys: ["c++", "cpp", "c", "gcc", "g++", "cmake", "make", "segfault", "указател"],
    text: "C/C++: сборка с предупреждениями g++ -std=c++17 -Wall -Wextra -g main.cpp -o app. Segfault — nullptr, выход за границы или уже освобождённая память; отладка: gdb ./app → run → bt, либо -fsanitize=address. Undefined reference — не слинковано или нет реализации. Утечка — new без delete (бери std::unique_ptr/std::vector). Проверка: make / cmake --build build."
  },
  {
    id: "csharp",
    title: "C# / .NET",
    keys: ["c#", "csharp", "dotnet", ".net", "linq", "asp.net", "unity"],
    text: "C#: dotnet build, dotnet test, dotnet run. Частые ошибки: NullReferenceException (используй ?. и ??), InvalidOperationException: Sequence contains no elements (FirstOrDefault вместо First), CS0246 (нет using/пакета), IndexOutOfRange. Строки в цикле — StringBuilder; ресурсы — using."
  },
  {
    id: "go",
    title: "Go",
    keys: ["go", "golang", "goroutine", "go.mod"],
    text: "Go: ошибки возвращаются значением (res, err := do(); if err != nil). Проверка: go vet ./..., go test ./..., go build ./..., форматирование gofmt -l. Частые: declared and not used (компилятор), nil pointer dereference, deadlock: all goroutines are asleep (канал не читают), гонки — go run -race."
  },
  {
    id: "rust",
    title: "Rust",
    keys: ["rust", "cargo", "borrow", "владени"],
    text: "Rust: cargo build, cargo test, cargo clippy, cargo fmt. Ошибки компилятора — это подсказки: cannot borrow as mutable more than once (две изменяющие ссылки), value borrowed after move (переместили значение), does not live long enough (ссылка живёт дольше владельца). unwrap() — только в тестах, в коде — match или ?."
  },
  {
    id: "php",
    title: "PHP",
    keys: ["php", "laravel", "composer", "wordpress"],
    text: "PHP 8: php -l файл.php (синтаксис), composer install, php vendor/bin/phpunit. БД — только PDO с prepare/execute, никогда склейка SQL. Частые: Undefined array key (isset/??), Allowed memory size exhausted (бесконечный цикл/огромный массив), Headers already sent (вывод до header), Trying to access array offset on null."
  },
  {
    id: "ruby",
    title: "Ruby / Rails",
    keys: ["ruby", "rails", "gem", "rspec"],
    text: "Ruby: ruby -c файл.rb, bundle exec rspec. Частые: NoMethodError for nil (цепочка на nil — используй &. или проверку), LoadError cannot load such file (bundle install), ActiveRecord::RecordNotFound (нет записи). Стиль — rubocop."
  },
  {
    id: "swift",
    title: "Swift / iOS",
    keys: ["swift", "ios", "swiftui", "xcode"],
    text: "Swift: опционалы достают if let / guard let / ??; ! аварийно. Сборка: xcodebuild build или ⌘B, тесты ⌘U. Ошибки: Unexpectedly found nil while unwrapping (стоял !), Type does not conform to protocol (нет обязательного метода). SwiftUI: @State локально, @Binding наружу, @StateObject для модели."
  },
  {
    id: "kotlin",
    title: "Kotlin / Android",
    keys: ["kotlin", "android", "gradle", "compose"],
    text: "Kotlin: val/var, String? и ?., !!. только при уверенности. Сборка: ./gradlew assembleDebug, тесты ./gradlew test. Частые: KotlinNullPointerException (!!. на null), Only the original thread that created a view hierarchy can touch its views (обновляй UI в главном потоке), Unresolved reference (импорт/зависимость)."
  },
  {
    id: "sql",
    title: "SQL и базы",
    keys: ["sql", "postgres", "mysql", "sqlite", "база", "запрос", "join", "orm", "миграци"],
    text: "SQL: параметры вместо склейки строк (защита от инъекций); LEFT JOIN даёт NULL по правой таблице; HAVING вместо WHERE для агрегатов; перед UPDATE/DELETE выполни тот же фильтр как SELECT. Медленно — индекс на поля WHERE/JOIN и EXPLAIN ANALYZE. N+1 — грузи связи одним запросом."
  },
  {
    id: "bash",
    title: "Bash и терминал",
    keys: ["bash", "shell", "sh", "терминал", "linux", "powershell", "cmd"],
    text: "Bash: set -euo pipefail в начале скрипта, кавычки вокруг \"$переменных\", проверка [ -f файл ], синтаксис bash -n, трассировка bash -x. Поиск: grep -rn \"текст\" ., find . -name \"*.js\". Windows: PowerShell (Get-ChildItem, Select-String, Test-Path)."
  },
  {
    id: "html-css",
    title: "HTML / CSS",
    keys: ["html", "css", "верстк", "вёрстк", "flex", "grid", "адаптив", "страниц"],
    text: "HTML/CSS: box-sizing: border-box, flex с gap, grid repeat(auto-fit, minmax(240px,1fr)), медиазапросы. Частые: элемент не центрируется (display/родитель), z-index без position, горизонтальный скролл от width:100vw + padding, картинка без width/height даёт скачок вёрстки. Проверка — F12 → Elements/Computed, ширина 360 и 1440."
  },
  {
    id: "git",
    title: "Git",
    keys: ["git", "git ", "commit", "ветк", "merge", "rebase", "pull request", "конфликт"],
    text: "Git: git status → git diff → git add -p → git commit -m \"что сделано\". Конфликт: правь между <<<<<<< ======= >>>>>>>, затем git add и merge/rebase --continue. Откат: git restore (файл), git revert (коммит), git reset --hard (стирает — только осознанно). rejected non-fast-forward → git pull --rebase. Force-push в общую ветку не делай."
  },
  {
    id: "tests",
    title: "Тесты",
    keys: ["тест", "test", "pytest", "jest", "junit", "проверк", "assert"],
    text: "Тест = Arrange (данные) → Act (вызов) → Assert (проверка). Обязательные случаи: пусто, один элемент, граница, null, ошибка. Запуск: pytest -q / npm test / mvn test / go test ./... / dotnet test. Тест не должен зависеть от сети, времени и порядка запуска — подменяй (mock) внешние вызовы."
  }
];

const BUGS = [
  {
    id: "null",
    title: "Пустая ссылка: null / None / undefined / nil",
    keys: ["null", "none", "undefined", "nil", "nullpointer", "nonetype", "typeerror", "cannot read", "is not a function"],
    text: "Причина почти всегда одна: функция вернула ничего, объект не найден или поле не заполнено. Чини в месте использования (?. , ?? , проверка is None, Optional) и добавь тест на пустой вход. Не оборачивай весь код в try/catch — это прячет причину."
  },
  {
    id: "boundaries",
    title: "Границы: off-by-one, индекс, пустой список",
    keys: ["indexerror", "out of range", "off by one", "границ", "индекс", "последн", "пуст"],
    text: "Проверь: цикл i < n (не <=), длина-минус-один для последнего, пустой массив, slice: конец не включается. Тесты: 0 элементов, 1, 2, последний. Часто исправление — вынести проверку пустоты в начало функции."
  },
  {
    id: "types",
    title: "Не тот тип и приведение",
    keys: ["typeerror", "valueerror", "nan", "привед", "строк", "числ", "float", "int"],
    text: "Печатай typeof/type() на границе. Числа из форм и файлов приходят строками: приводи явно и проверяй результат (Number.isFinite, int() в try). Деньги — целые копейки или Decimal, не float. 0.1+0.2 !== 0.3."
  },
  {
    id: "async",
    title: "Асинхронность и гонки",
    keys: ["async", "await", "promise", "гонк", "race", "thread", "поток", "deadlock", "блокировк"],
    text: "Симптом: «иногда работает». Причины: забыт await, два изменения одного состояния, обновление UI не в главном потоке, блокировка в разном порядке. Лечи: один владелец состояния, await у каждой операции, мьютекс вокруг критической секции, идемпотентные повторы. Проверка — параллельный прогон и race-детектор."
  },
  {
    id: "encoding",
    title: "Кодировка",
    keys: ["кодировк", "utf", "cp1251", "кракозябр", "decode", "encode", "charset"],
    text: "Везде UTF-8: open(..., encoding=\"utf-8\"), <meta charset=\"utf-8\">, заголовок Content-Type с charset. Если данные пришли из Windows/Excel — пробуй cp1251. Windows-консоль: chcp 65001. Ошибка UnicodeDecodeError почти всегда указывает на не-UTF-8 источник."
  },
  {
    id: "path",
    title: "Файл не найден и права",
    keys: ["enoent", "not found", "file not found", "путь", "permission", "eacces", "403", "404", "папк"],
    text: "Печатай абсолютный путь (path.resolve / Path(__file__).parent) и проверяй существование. Относительные пути считаются от рабочей папки, а не от файла. Permission denied — права (chmod) или другой пользователь. 404 — путь, 403 — роль/владелец."
  },
  {
    id: "parse",
    title: "JSON и парсинг",
    keys: ["json", "parse", "syntaxerror", "unexpected token", "csv", "xml", "yaml"],
    text: "Unexpected token < — пришёл HTML (страница ошибки) вместо JSON: смотри сырой ответ (curl -i, Network → Response). Unexpected end — обрезанный ответ. Лишняя запятая, одинарные кавычки, BOM. CSV парсь библиотекой, а не split(\",\")."
  },
  {
    id: "build",
    title: "Сборка падает / версии зависимостей",
    keys: ["сборк", "build", "webpack", "vite", "npm err", "module not found", "cannot find module", "dependency", "зависимост", "верси"],
    text: "Читай первую ошибку, а не последнюю строку. В 80% случаев: нет пакета (npm ci / pip install -r), не та версия языка, регистр имён файлов (Linux чувствителен), забытая зависимость в package.json. Лок-файл обязателен. Не «обновляй всё» — сначала точная причина."
  },
  {
    id: "loop",
    title: "Зависание и бесконечный цикл",
    keys: ["висит", "завис", "бесконечн", "hang", "timeout", "таймаут", "цикл"],
    text: "Добавь предохранитель: счётчик попыток и дедлайн. Напечатай значения условия на первых 10 итерациях — сразу видно, что не меняется. Для сети всегда таймаут. Рекурсия — явное условие выхода и глубина."
  },
  {
    id: "state",
    title: "Интерфейс не обновляется",
    keys: ["dom", "react", "state", "рендер", "не обновля", "интерфейс", "ui", "кнопк"],
    text: "Меняй данные иммутабельно ({...obj, x}, [...list, item]), не мутируй на месте. Проверь, что обработчик вызывается (лог первой строкой). Списки — устойчивый key. Состояние загрузки и ошибки — отдельно от данных."
  },
  {
    id: "cache",
    title: "Кэш отдаёт старое",
    keys: ["кэш", "cache", "стары", "не обновил", "service worker"],
    text: "Проверь в приватном окне и с Disable cache. Для статики — версия в имени файла или Cache-Control: no-cache для HTML; service worker — новый cacheName и удаление старых. В приложении — TTL и сброс кэша при записи."
  },
  {
    id: "performance",
    title: "Медленно",
    keys: ["медленн", "тормоз", "производительн", "slow", "оптимиз", "долго"],
    text: "Сначала измерь (профилировщик/EXPLAIN), потом меняй. Чаще всего: запрос в цикле (N+1), нет индекса, вложенный цикл по большим данным, выгрузка всей таблицы, кэш отсутствует. Одна правка → замер → следующая."
  }
];

/** Нижний регистр и «ё» → «е», чтобы совпадения не зависели от раскладки. */
function norm(text) {
  return String(text == null ? "" : text).toLowerCase().replace(/ё/g, "е");
}

// Служебные слова, которые ничего не говорят о технике: без них запрос
// «абракадабра-без-смысла» цеплялся к любой карточке, где встретилось «без».
const STOP = new Set(
  ("без для что как или где чем это при под над мне нам все его она они оно так там тут уже еще " +
    "когда если чтобы был была было быть есть нет не ни по на из от до за со об мы вы ты я он ин " +
    "the and for with this that from what when how why not can you some was are has have but all any " +
    "its it's into out over under than then them they your our")
    .split(" ").filter(Boolean)
);

function scoreOf(entry, haystack) {
  let score = 0;
  for (const key of entry.keys) {
    const k = norm(key);
    if (!k) continue;
    if (k.length <= 3) {
      // короткие ключи («go», «c», «ts») ищем только целым словом,
      // иначе они цепляются к любому тексту
      const re = new RegExp("(^|[^a-zа-я0-9+])" + k.replace(/[.+*?^$()|[\]{}\\-]/g, "\\$&") + "([^a-zа-я0-9+]|$)");
      if (re.test(haystack)) score += 2;
    } else if (haystack.includes(k)) {
      score += 2;
    }
  }
  return score;
}

/**
 * Подбирает карточки под задачу.
 * @returns {{method:string, items:Array<{id:string,title:string,text:string}>}}
 */
function pickKnowledge(task, opts) {
  const o = opts || {};
  const hay = norm(task);
  const max = o.max || 3;
  const scored = [];
  for (const entry of LANGUAGES.concat(BUGS)) {
    const score = scoreOf(entry, hay);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    method: METHOD,
    items: scored.slice(0, max).map((x) => ({ id: x.entry.id, title: x.entry.title, text: x.entry.text }))
  };
}

/**
 * Поиск по справке для инструмента kb.search.
 * Сначала совпадения по ключам и названию, потом — по тексту карточки
 * (там лежат сами сообщения об ошибках: IndentationError, ENOENT, 404…).
 */
function search(query, limit) {
  const hay = norm(query).trim();
  if (!hay) return [];
  const words = hay.split(/[^a-zа-я0-9+#.]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  const scored = [];
  for (const entry of LANGUAGES.concat(BUGS)) {
    let score = scoreOf(entry, hay);
    if (norm(entry.title).includes(hay)) score += 4;
    const body = norm(entry.text);
    if (body.includes(hay)) score += 3;
    for (const w of words) {
      if (scoreOf(entry, w) > 0) score += 2;      // слово запроса совпало с ключом
      else if (w.length >= 4 && body.includes(w)) score += 1; // слово встречается в тексте
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit || 3)).map((x) => ({
    id: x.entry.id,
    title: x.entry.title,
    text: x.entry.text
  }));
}

/**
 * Текст для системного промпта: способ отладки плюс карточки по теме.
 * Ограничен, чтобы не съедать контекст модели.
 */
function promptBlock(task, maxChars) {
  const picked = pickKnowledge(task);
  const limit = maxChars || 2200;
  const parts = [picked.method];
  if (picked.items.length) {
    parts.push("", "СПРАВКА ПО ТЕМЕ (проверенная, пользуйся ею):");
    for (const it of picked.items) parts.push("- " + it.title + ": " + it.text);
  }
  let text = parts.join("\n");
  if (text.length > limit) text = text.slice(0, limit) + "…";
  return text;
}

module.exports = { METHOD, LANGUAGES, BUGS, pickKnowledge, search, promptBlock, norm };

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

/* Инструменты и быт разработки: то, на чём спотыкаются чаще, чем на самом языке.
   Те же поля, что у языков и багов: id, title, keys, text. */
const TOOLS = [
  {
    id: "git-work",
    title: "Git на каждый день",
    keys: ["git", "коммит", "commit", "ветк", "branch", "merge", "конфликт", "rebase", "stash", "push", "pull"],
    text: "Порядок: git status → git diff → git add -A → git commit -m \"что и зачем\". Ветка: git switch -c имя. Влить: git switch main && git merge ветка. Конфликт — открой файл, убери маркеры <<<<<<<, =======, >>>>>>>, потом git add и git commit. Отменить правки в файле: git checkout -- файл. Убрать последний коммит, оставив правки: git reset --soft HEAD~1. Спрятать на время: git stash, вернуть: git stash pop."
  },
  {
    id: "npm-errors",
    title: "npm падает",
    keys: ["npm", "node_modules", "package.json", "lock", "eacces", "eresolve", "peer", "npx"],
    text: "ENOENT package.json — команда не в той папке. ERESOLVE / unable to resolve dependency tree — конфликт версий: npx npm install --legacy-peer-deps, потом разберись с версиями. EACCES — права: не запускай npm через sudo, поправь владельца папки. Странные ошибки после обновлений: удали node_modules и package-lock.json, затем npm install. Проверка: npm ls --depth=0."
  },
  {
    id: "python-env",
    title: "Python: окружение и пакеты",
    keys: ["venv", "virtualenv", "pip", "requirements", "python не найден", "модуль не найден", "modulenotfound"],
    text: "Своё окружение: python -m venv .venv, Windows: .venv\\Scripts\\activate, Linux и macOS: source .venv/bin/activate. Ставить: pip install -r requirements.txt. ModuleNotFoundError при установленном пакете — активируй нужное окружение и сравни python -c \"import sys; print(sys.executable)\" с pip -V: они должны быть из одной папки. На Windows python может запускать Store-заглушку — тогда py -3."
  },
  {
    id: "windows-shell",
    title: "Windows: PowerShell и cmd",
    keys: ["powershell", "cmd", "windows", "bat", "пробел в пути", "chcp", "переменная среды"],
    text: "В PowerShell путь с пробелами — в кавычках или через оператор &. Список файлов: Get-ChildItem, поиск: Get-ChildItem -Recurse -Filter *.py. Переменные: $env:PATH. Кодировка вывода: chcp 65001, а файлы пиши с encoding=\"utf-8\". Скрипт .ps1 не запускай двойным кликом — окно откроется и закроется; запускай из терминала."
  },
  {
    id: "ports",
    title: "Порт занят",
    keys: ["порт", "port", "eaddrinuse", "8000", "3000", "занят"],
    text: "EADDRINUSE — порт уже слушает другой процесс. Windows: netstat -ano | findstr :3000, затем taskkill /PID номер /F. Linux и macOS: lsof -i :3000 и kill -9 PID. Быстрый обход — другой порт (3001). В коде не прибивай порт жёстко: бери из переменной окружения с запасным значением."
  },
  {
    id: "env-vars",
    title: "Переменные окружения и .env",
    keys: [".env", "dotenv", "переменн", "env", "секрет", "токен", "конфиг"],
    text: "Секреты и настройки — в .env, а сам файл в .gitignore. Загрузка: Node — dotenv/config или process.env, Python — python-dotenv (load_dotenv). В репозиторий кладут .env.example с пустыми значениями. Значения из .env всегда строки: числа приводи через int() или Number(). Переменная не видна — проверь имя без кавычек в файле и что файл лежит в рабочей папке."
  },
  {
    id: "http-api",
    title: "Запросы к API",
    keys: ["api", "http", "fetch", "axios", "requests", "401", "403", "429", "cors", "таймаут"],
    text: "401 — нет или протух токен, 403 — нет прав, 404 — не тот адрес, 429 — лимит запросов (жди и повторяй с паузой), 5xx — проблема на сервере. Всегда ставь таймаут и проверяй код ответа до чтения JSON: json() на странице ошибки падает. Тело POST — Content-Type: application/json. Не уходит из браузера, а из консоли уходит — это CORS, а не ключ."
  },
  {
    id: "json-yaml",
    title: "JSON и YAML",
    keys: ["json", "yaml", "yml", "парсинг", "config"],
    text: "JSON: только двойные кавычки, без висячих запятых, без комментариев. Проверка: python -m json.tool файл.json. YAML: отступы пробелами, табы запрещены, после двоеточия нужен пробел. Чтобы не было кракозябр: json.dump(..., ensure_ascii=False)."
  },
  {
    id: "regex",
    title: "Регулярные выражения",
    keys: ["regex", "regexp", "регулярк", "шаблон", "grep"],
    text: "Проверяй на regex101.com — там объяснение по шагам. Частые ошибки: точка ловит больше, чем нужно (экранируй \\.); жадность — ставь *?; забыл якоря ^ и $; в Python нужна сырая строка r\"\\d+\". Ищи по одной части за раз: сначала слово, потом окружение. Замена с группами: re.sub(r\"(\\w+)@(\\w+)\", r\"\\1 [at] \\2\", s)."
  },
  {
    id: "encoding-csv",
    title: "Кодировки и CSV/Excel",
    keys: ["кодировк", "utf-8", "cp1251", "кракозябр", "csv", "excel", "xlsx", "pandas"],
    text: "Кракозябры — файл не в UTF-8: читай с encoding=\"utf-8\" или encoding=\"cp1251\", а для диагностики errors=\"replace\" и посмотри, что вышло. CSV в Excel: открывай через «Данные → Из текста» с разделителем либо сохраняй с BOM (utf-8-sig), иначе кириллица сломается. pandas: read_csv(..., encoding=\"utf-8\"), read_excel для .xlsx (нужен openpyxl). Пиши index=False, чтобы не появился лишний столбец."
  },
  {
    id: "tests-work",
    title: "Тесты: как писать и чинить",
    keys: ["тест", "pytest", "jest", "vitest", "unit", "assert", "фикстур"],
    text: "Один тест — одно утверждение. Название описывает поведение: «возвращает 0 на пустом списке». Падающий тест читай сверху вниз: что ожидалось, что пришло, где строка. Сначала воспроизведи падение отдельно (pytest -k имя, npm test -- -t имя), потом правь код, а не тест. Мокай сеть и время, иначе тесты нестабильны."
  },
  {
    id: "docker-basics",
    title: "Docker: минимум",
    keys: ["docker", "контейнер", "compose", "dockerfile", "образ"],
    text: "Собрать: docker build -t имя . Запустить: docker run -p 8000:8000 имя. Список: docker ps -a, логи: docker logs -f контейнер, зайти внутрь: docker exec -it контейнер sh. Compose: docker compose up -d и docker compose down. В Dockerfile ставь установку зависимостей отдельным слоем до копирования кода — сборка быстрее. Порт внутри и снаружи должен совпадать."
  },
  {
    id: "html-page",
    title: "Страница не открывается или пустая",
    keys: ["html", "сайт", "страниц", "белый экран", "localhost", "assets", "404"],
    text: "Белый экран — открой F12 → Console: обычно 404 на .js или .css либо ошибка JS. Пути к файлам считаются от html, регистр букв на сервере важен (Windows прощает, Linux нет). Локальный сервер вместо file://: python -m http.server 8000. Кэш сбрасывай Ctrl+F5. Проверь, что index.html лежит в корне публикуемой папки."
  },
  {
    id: "security-basics",
    title: "Безопасность кода",
    keys: ["безопасн", "sql инъекц", "xss", "пароль", "csrf", "инъекц", "утечк"],
    text: "SQL — только параметрами (? или %s через драйвер), не склейкой строк. HTML — экранируй пользовательский текст, не вставляй его через innerHTML. Пароли — хешем с солью (bcrypt или argon2), никогда в открытом виде. Секреты — в переменных окружения, не в коде и не в git. Файлы от пользователя — проверяй расширение и размер, не доверяй пути из запроса."
  },
  {
    id: "blender-script",
    title: "Скрипт для Blender",
    keys: ["blender", "bpy", "3d", "рендер", "модель"],
    text: "Скрипт запускают в Blender → Scripting → Run Script. Начало: import bpy. Очистка сцены: select_all(action='SELECT') и delete(). Создать: primitive_uv_sphere_add(location=(0,0,0)). Материал: use_nodes=True, цвет в Base Color узла Principled BSDF. Затем свет, камера и render(write_still=True). Внешние аддоны не нужны."
  },
  {
    id: "git-hosting",
    title: "Выложить проект на GitHub",
    keys: ["github", "remote", "origin", "pages", "deploy", "выложить", "репозитори"],
    text: "Первый раз: git init, git add -A, git commit -m \"первый коммит\", git branch -M main, git remote add origin адрес, git push -u origin main. Дальше — git push. Ошибка failed to push some refs — сначала git pull --rebase. Статику раздают через GitHub Pages; проверь, что index.html в корне. .gitignore обязателен: node_modules, .venv, .env."
  }
];

/* Готовые порядки действий для частых задач: агент идёт по шагам,
   а не изобретает заново. Это подсказка, а не жёсткий сценарий. */
const RECIPES = [
  {
    id: "recipe-fix-bug",
    title: "Починить ошибку в проекте",
    keys: ["починить", "исправь", "ошибк", "падает", "не работает", "баг"],
    text: "1) Найди точку входа: scripts в package.json, main.py, README. 2) Запусти и получи текст ошибки. 3) Найди файл и строку из стека. 4) Прочитай функцию целиком. 5) Назови причину одной фразой. 6) Правь минимально. 7) Повтори запуск и покажи, что стало."
  },
  {
    id: "recipe-new-project",
    title: "Собрать проект с нуля",
    keys: ["сделай сайт", "создай проект", "с нуля", "напиши программу", "скрипт"],
    text: "1) Уточни стек и папку. 2) Создай структуру: точка входа, список зависимостей, README с командой запуска. 3) Сделай минимальный работающий вариант и сразу запусти. 4) Добавляй по одной функции, после каждой проверяй. 5) В конце напиши, как запускать."
  },
  {
    id: "recipe-failing-test",
    title: "Почему падает тест",
    keys: ["тест падает", "не проходят тесты", "красные тесты", "failed"],
    text: "1) Запусти только этот тест. 2) Прочитай: ожидалось, получилось, строка. 3) Проверь входные данные, время, часовой пояс, случайность. 4) Повторится ли в одиночку или только вместе со всеми — тогда дело в общем состоянии. 5) Правь код, а не утверждение теста, если требование не менялось."
  },
  {
    id: "recipe-read-project",
    title: "Разобраться в чужом коде",
    keys: ["разберись", "чужой код", "как устроен", "прочитай проект"],
    text: "1) README и package.json или requirements.txt: что это и как запускать. 2) Найди точку входа. 3) Пройди один путь: от действия пользователя до работы с данными. 4) Составь карту: где логика, где хранение, где интерфейс. 5) Только потом правь. Не читай проект целиком — иди по своей задаче."
  },
  {
    id: "recipe-publish",
    title: "Выложить в интернет",
    keys: ["выложи", "опубликов", "задеплой", "хостинг", "netlify", "vercel", "pages"],
    text: "1) Убедись, что проект собирается и в коде нет секретов. 2) .gitignore: зависимости, окружение, большие файлы. 3) Коммит и push в репозиторий. 4) Статика — Pages или Netlify, сервер — Vercel или Render. 5) Открой опубликованный адрес и проверь именно там, а не локально."
  },
  {
    id: "recipe-windows-exe",
    title: "Собрать .exe",
    keys: ["exe", "собра", "установщик", "pyinstaller", "electron", "инсталля"],
    text: "Python: pip install pyinstaller, затем pyinstaller --onefile --windowed main.py, результат в dist. Electron: electron-builder с разделом build в package.json, запуск npm run dist. Частые причины пустого окна: неверный путь к ресурсам (в сборке путь другой), файла нет в списке files, антивирус блокирует свежий exe."
  },
  {
    id: "recipe-data",
    title: "Разобрать данные из файла",
    keys: ["данн", "таблиц", "статистик", "график", "сводк"],
    text: "1) Посмотри первые строки и типы. 2) Почисти: пропуски, дубли, единицы измерения, даты к одному формату. 3) Посчитай нужные числа один раз и покажи их. 4) Проверь себя: сумма долей, общее число строк. 5) Сохрани результат отдельным файлом, исходник не перезаписывай."
  },
  {
    id: "recipe-security-check",
    title: "Проверить проект перед выкладкой",
    keys: ["проверь перед", "секрет в коде", "ключи в репозитори", "аудит"],
    text: "1) Поищи в проекте ключи и пароли: grep по словам key, secret, token, password. 2) Проверь .gitignore. 3) Убедись, что в логах не печатаются секреты и тела запросов с токенами. 4) Проверь обработку ввода: SQL только параметрами, HTML экранирован. 5) Если секрет уже был в git — смени его, чистки истории мало."
  }
];

/* Конкретные сообщения, на которых застревают чаще всего. Отличаются от BUGS тем,
   что здесь ищем по тексту ошибки, а не по типу проблемы. */
const ERRORS = [
  {
    id: "cors",
    title: "CORS: запрос заблокирован",
    keys: ["cors", "access-control", "preflight", "options", "заблокирован", "политикой"],
    text: "Браузер блокирует ответ, если сервер не прислал Access-Control-Allow-Origin. Это делает сервер, а не клиент: на своей стороне ты ничего не исправишь. Проверка: curl -I с тем же адресом работает, из консоли — нет. Node/Python запросы идут мимо браузера, поэтому работают. Для разработки — прокси того же origin; для своего сервера — заголовок с точным доменом, не *."
  },
  {
    id: "ssl",
    title: "SSL: сертификат не проверяется",
    keys: ["ssl", "certificate", "сертификат", "verify failed", "tls", "самоподписанный"],
    text: "Сначала проверь время на машине: неверные часы дают ошибку сертификата. Потом корневые сертификаты (обнови систему) и антивирус с проверкой HTTPS — он подменяет сертификат. Python: pip install --upgrade certifi. Node: NODE_EXTRA_CA_CERTS=путь. Отключать проверку (verify=False) можно только на один отладочный запуск, в коде — никогда."
  },
  {
    id: "rate-limit",
    title: "429: слишком много запросов",
    keys: ["429", "rate limit", "too many requests", "retry-after", "лимит запросов", "слишком много запросов"],
    text: "Сервер просит подождать. Читай Retry-After и жди столько, повторы с нарастающей паузой (1с, 2с, 4с), не в цикле без паузы. Кэшируй одинаковые ответы, объединяй запросы, ставь ограничитель на клиенте. Разные ключи не «лечат» проблему, если лимит на аккаунт. Проверь, не крутится ли запрос в цикле из-за ошибки в условии выхода."
  },
  {
    id: "disk-full",
    title: "Нет места на диске",
    keys: ["enospc", "no space left", "диск заполнен", "мало места", "not enough space"],
    text: "Проверь df -h (Linux/macOS) или свойства диска, включая inode на Linux: df -i. Чаще всего место едят логи, node_modules, .venv, кэши пакетов, docker (docker system prune), старые сборки и временные файлы. Чисти осознанно, не удаляя папку проекта целиком. Для разработки держи на системном диске хотя бы 10–15% свободными."
  },
  {
    id: "oom",
    title: "Закончилась память",
    keys: ["out of memory", "heap", "oom", "memory limit", "память"],
    text: "JavaScript: «JavaScript heap out of memory» — NODE_OPTIONS=--max-old-space-size=4096 на один запуск, но это лечит симптом. Ищи реальную причину: читаешь файл целиком вместо потоков, копишь массив в цикле, кэш без ограничения, подписка без отписки. Python: генераторы вместо списков, pandas — частями (chunksize). Проверь потребление до и после правки."
  },
  {
    id: "command-not-found",
    title: "Команда не найдена",
    keys: ["command not found", "не является внутренней", "не распознан", "path", "npm не найден", "python не найден"],
    text: "Значит, программы нет или её путь не в PATH. Проверь: where node (Windows) или which node, в PowerShell — Get-Command. После установки перезапусти терминал и редактор: они держат старые переменные окружения. На Windows команда python может вести в Store-заглушку — тогда py -3. Если проект ставил зависимости локально, запускай через npx или путь node_modules/.bin."
  },
  {
    id: "line-endings",
    title: "Git показывает весь файл изменённым",
    keys: ["crlf", "lf", "line endings", "autocrlf", "весь файл изменён", "перенос строки"],
    text: "Windows пишет CRLF, Linux и macOS — LF. Отсюда «весь файл изменён» при правке одной строки. Лечение: файл .gitattributes с «* text=auto» и правилом для языков (например, «*.sh text eol=lf»), затем git add --renormalize . и отдельный коммит «normalize line endings». Правки по существу — следующим коммитом, чтобы diff читался."
  },
  {
    id: "flaky-tests",
    title: "Тест иногда падает",
    keys: ["flaky", "нестабильный тест", "иногда падает", "то падает то нет", "нестабильн", "падает не всегда", "падает"],
    text: "Нестабильный тест почти всегда про время, случайность, порядок или сеть. Проверь: нет ли sleep вместо ожидания условия, не зависит ли тест от текущей даты и часового пояса, не общие ли данные между тестами, есть ли зависимость от порядка запуска. Запусти один и тот же тест 20 раз подряд — воспроизведение и есть половина решения. Мокай время и случайность, а не «увеличивай паузу»."
  },
  {
    id: "db-lock",
    title: "База заблокирована",
    keys: ["database is locked", "deadlock", "блокировк", "lock timeout", "sqlite"],
    text: "SQLite: «database is locked» — другой процесс держит запись; закрой лишние соединения, включи WAL (PRAGMA journal_mode=WAL), не держи транзакцию открытой во время долгих операций. Postgres/MySQL: deadlock — две транзакции захватили ресурсы в разном порядке; делай операции в одном порядке, держи транзакции короткими, ставь таймаут ожидания и повторяй при ошибке сериализации."
  },
  {
    id: "layout",
    title: "Вёрстка поехала",
    keys: ["вёрстк", "верстк", "съехало", "flex", "grid", "не там", "перекрывает"],
    text: "Сначала найди виновника: в DevTools выделяй элементы и смотри рамки; временно * { outline: 1px solid red }. Частые причины: box-sizing не border-box, фиксированная ширина родителя, flex-элемент не сжимается (нужен min-width: 0), отступы через margin вместо gap, абсолютное позиционирование от не того родителя. Проверяй в узком окне: если ломается только там — это ширина, а не отступы."
  }
];

/* Не про код, а про работу на рабочем столе: письма, документы, таблицы.
   Sye — не только программист, и эти порядки ему нужны чаще, чем кажется. */
const TASKS = [
  {
    id: "task-letter",
    title: "Написать письмо или сообщение",
    keys: ["письмо", "написать сообщение", "ответить", "заявк", "обращен"],
    text: "Структура: кому и зачем → что нужно сделать → срок → подпись. Первое предложение — суть, без «доброго времени суток, меня зовут». Просьба одной строкой и вежливо, но определённо: «прошу согласовать до пятницы». Факты, даты, номера — точно. Перед отправкой прочитай вслух и убери всё, что можно выкинуть без потери смысла."
  },
  {
    id: "task-document",
    title: "Сделать документ (Word или PDF)",
    keys: ["документ", "word", "docx", "pdf", "оформить", "договор"],
    text: "Порядок: заголовок и структура (разделы) → текст → стили заголовков, а не ручной размер шрифта → нумерация страниц и оглавление → проверка орфографии → сохранить в docx для правок и PDF для отправки. Для официальных бумаг — шапка с адресатом и датой, подпись и приложения. Файл называй по сути и дате."
  },
  {
    id: "task-spreadsheet",
    title: "Посчитать в таблице",
    keys: ["таблиц", "excel", "csv", "посчита", "сводн", "столбец"],
    text: "Сырые данные — отдельным листом, расчёты — на другом, чтобы не портить исходник. Одна строка — одна запись, без объединённых ячеек и пустых строк. Считай формулами, а не на калькуляторе: потом проверят. Итог проверь вторым способом (сумма по столбцу против суммы по группам). Сохрани копию до правок."
  },
  {
    id: "task-slides",
    title: "Сделать презентацию",
    keys: ["презентац", "слайд", "powerpoint", "pptx", "выступлен"],
    text: "Сначала план на бумаге: что человек должен запомнить в конце. Один слайд — одна мысль, не больше 6 строк, крупный шрифт. Цифры — таблицей или графиком, а не текстом. Порядок: проблема → что предлагаю → как это работает → что нужно. Последний слайд — что сделать дальше. Проверь, что читается с трёх метров."
  },
  {
    id: "task-plan",
    title: "Составить план",
    keys: ["план", "расписан", "этап", "срок", "спланиру"],
    text: "Сформулируй цель так, чтобы было понятно, когда она достигнута. Разбей на шаги по 1–3 часа, у каждого — результат. Поставь сроки и порядок: что блокирует что. Отметь, что можно сделать параллельно. В конце — проверка: как поймём, что получилось. План длиннее 20 шагов обычно не выполняют, укрупняй."
  },
  {
    id: "task-edit-text",
    title: "Вычитать и улучшить текст",
    keys: ["вычит", "редакт", "улучши текст", "ошибк в тексте", "сократ"],
    text: "Проходы по одному: (1) смысл и порядок — всё ли на месте; (2) факты, даты, числа, имена; (3) длина — выкинь воду и канцелярит; (4) орфография и пунктуация; (5) вслух. Не правь всё сразу: так теряются ошибки. Сохрани исходную версию, если текст не твой."
  },
  {
    id: "task-screenshot",
    title: "Разобрать скриншот",
    keys: ["скриншот", "скрин", "на картинке", "видно на экране", "снимок экрана"],
    text: "Смотри сверху вниз: что за программа и экран, какой диалог открыт, какой текст ошибки, какие кнопки доступны. Цитируй сообщение дословно — в нём причина. Если ошибка в консоли — нужен кадр с консолью, а не с рабочим столом. Если непонятно, что нажать, — перечисли видимые варианты и предложи самый безопасный."
  },
  {
    id: "task-safe-edit",
    title: "Править файл, ничего не потеряв",
    keys: ["правк", "измен", "не потеря", "бэкап", "откат", "восстанов"],
    text: "Перед изменением: прочитай файл целиком, сделай копию или коммит (git commit -m «до правок»). Меняй минимальным куском и сохраняй по одному изменению за раз. Покажи, что изменилось (git diff). Если проект под git — откат это git checkout -- файл. Не перезаписывай файл целиком, если можно заменить фрагмент."
  },
  {
    id: "task-find-usage",
    title: "Найти, где это используется",
    keys: ["где использует", "найти в проект", "поиск по проект", "все места", "кто вызывает"],
    text: "Ищи по имени целиком, а не по куску: короткие имена дают шум. В проекте — ripgrep/grep с путями, в редакторе — «поиск по всем файлам». Смотри не только вызовы, но и конфиги, строки, шаблоны и тесты. Нашёл одно место — проверь похожие написания (snake_case и camelCase). После списка мест проверь, что ничего не забыл: тесты это покажут."
  },
  {
    id: "task-report",
    title: "Свести данные в отчёт",
    keys: ["отчёт", "отчет", "сводк", "итог", "вывод по данным"],
    text: "Отчёт отвечает на вопрос, а не перечисляет цифры. Порядок: вопрос → что взяли за данные → 3–5 главных чисел → что они значат → что делать. Пропуски и выбросы отмечай честно, не прячь. Каждое число должно быть проверяемо: откуда взялось и за какой период. Итоговую сумму сверь с исходником."
  }
];

const ALL = LANGUAGES.concat(BUGS, TOOLS, RECIPES, ERRORS, TASKS);
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
      // длинный ключ («too many requests») точнее короткого («429») — и весит больше
      score += 2 + (k.length >= 8 ? 1 : 0) + (k.length >= 14 ? 1 : 0);
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
  for (const entry of ALL) {
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
  for (const entry of ALL) {
    let score = scoreOf(entry, hay);
    if (norm(entry.title).includes(hay)) score += 4;
    const body = norm(entry.text);
    if (body.includes(hay)) score += 3;
    for (const w of words) {
      if (scoreOf(entry, w) > 0) score += 2;      // слово запроса совпало с ключом
      else if (w.length >= 4 && body.includes(w)) score += 1; // слово встречается в тексте
    }
    // одно случайное слово из середины чужого текста — ещё не тема:
    // берём совпадение с ключом или названием, иначе справка шумит
    if (score >= 2) scored.push({ entry, score });
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

module.exports = { METHOD, LANGUAGES, BUGS, TOOLS, RECIPES, ERRORS, TASKS, ALL, pickKnowledge, search, promptBlock, norm };

/**
 * Индекс тем Искры — второй слой базы знаний.
 *
 * Конспекты (kb-src/cards) — это готовые карточки с текстом. Индекс — это
 * десятки тысяч названий реальных объектов (страны, города, языки, химические
 * элементы) с проверяемыми фактами: страна, население, столица, код языка.
 * По индексу Искра находит точное название и отвечает без поиска, а если нужен
 * развёрнутый рассказ — берёт статью Википедии по этому названию.
 *
 * Данные — открытые наборы из npm:
 *   world-countries — страны (названия на русском, столицы, площади, валюты);
 *   all-the-cities    — города мира от 1000 жителей (GeoNames);
 *   iso-639-3         — языки мира с кодами ISO;
 *   periodic-table    — 118 химических элементов.
 *
 * Запуск: node kb-src/topic-index.cjs          — собрать topic-index.json
 *         node kb-src/topic-index.cjs --dry    — только посчитать
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const SRC = __dirname;
const CACHE = path.join(SRC, ".cache");
const OUT = path.join(SRC, "..", "topic-index.json");
const dry = process.argv.includes("--dry");
const DATE = process.env.KB_DATE || "2026-10-29";
const CITY_LIMIT = Number(process.env.CITY_LIMIT || 30000);

/* ---------- загрузка наборов ---------- */
const PACKS = {
  "world-countries": "5.1.0",
  "all-the-cities": "3.1.0",
  "iso-639-3": "3.0.1",
  "periodic-table": "0.0.8"
};

function get(url, file) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode + " " + url)); return; }
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(file)));
    }).on("error", reject);
  });
}

const { execFileSync } = require("child_process");
function ensure(name) {
  const dir = path.join(CACHE, name);
  if (fs.existsSync(dir)) return dir;
  fs.mkdirSync(CACHE, { recursive: true });
  const tgz = path.join(CACHE, name + ".tgz");
  const url = "https://registry.npmjs.org/" + name + "/-/" + name + "-" + PACKS[name] + ".tgz";
  console.log("скачиваю", name);
  execFileSync("curl", ["-sL", "-m", "180", url, "-o", tgz]);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("tar", ["xzf", tgz, "-C", dir, "--strip-components=1"]);
  return dir;
}

/* ---------- минимальный разбор protobuf для городов ----------
   Набор all-the-cities лежит в cities.pbf. Полноценная библиотека ради
   одного файла не нужна: поля простые (varint и length-delimited). */
function readVarint(buf, pos) {
  let result = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
    if (!(b & 0x80)) break;
  }
  return [result, pos];
}
function readCities(file) {
  const buf = fs.readFileSync(file);
  let pos = 0;
  let lastLat = 0, lastLon = 0;
  const cities = [];
  while (pos < buf.length) {
    /* каждый город записан как [длина][поля] — длина идёт первой */
    const [len, p2] = readVarint(buf, pos);
    if (!len || len > buf.length) break;
    pos = p2;
    const end = pos + len;
    const city = { name: "", country: "", population: 0 };
    while (pos < end) {
      const [t, p3] = readVarint(buf, pos);
      pos = p3;
      const f = t >> 3, w = t & 7;
      if (w === 2) {
        const [l, p4] = readVarint(buf, pos);
        pos = p4;
        const s = buf.slice(pos, pos + l).toString("utf8");
        pos += l;
        if (f === 2) city.name = s;
        else if (f === 3) city.country = s;
        else if (f === 4) city.altName = s;
      } else if (w === 0) {
        const [v, p5] = readVarint(buf, pos);
        pos = p5;
        if (f === 9) city.population = v;
        else if (f === 10) { lastLon += v; }
        else if (f === 11) { lastLat += v; }
      } else if (w === 1) pos += 8;
      else if (w === 5) pos += 4;
      else break;
    }
    if (city.name && city.country) cities.push(city);
  }
  return cities;
}

/* ---------- русские названия крупных городов ----------
   GeoNames даёт латиницу. Для самых частых городов добавляем привычное
   русское имя, чтобы вопрос «сколько людей в Шанхае» попадал в индекс. */
const CITY_RU = {
  Shanghai: "Шанхай", Beijing: "Пекин", Istanbul: "Стамбул", Karachi: "Карачи",
  Mumbai: "Мумбаи", "São Paulo": "Сан-Паулу", Delhi: "Дели", Lagos: "Лагос",
  Tianjin: "Тяньцзинь", Tokyo: "Токио", Guangzhou: "Гуанчжоу", "Kinshasa": "Киншаса",
  Moscow: "Москва", "Shenzhen": "Шэньчжэнь", Lahore: "Лахор", Jakarta: "Джакарта",
  Seoul: "Сеул", Bengaluru: "Бангалор", Bogotá: "Богота", Chennai: "Ченнаи",
  Cairo: "Каир", Chengdu: "Чэнду", Bangkok: "Бангкок", Hyderabad: "Хайдарабад",
  Lima: "Лима", Baghdad: "Багдад", Tehrān: "Тегеран", Tehran: "Тегеран",
  "Rio de Janeiro": "Рио-де-Жанейро", Wuhan: "Ухань", "Xi’an": "Сиань",
  "Hong Kong": "Гонконг", "Mexico City": "Мехико", "Saint Petersburg": "Санкт-Петербург",
  Dhaka: "Дакка", Lahore2: "", Yangon: "Янгон", Alexandria: "Александрия",
  "Ho Chi Minh City": "Хошимин", Sydney: "Сидней", Melbourne: "Мельбурн",
  Madrid: "Мадрид", Barcelona: "Барселона", Paris: "Париж", London: "Лондон",
  Berlin: "Берлин", Hamburg: "Гамбург", Munich: "Мюнхен", Rome: "Рим", Milan: "Милан",
  Naples: "Неаполь", Lisbon: "Лиссабон", Amsterdam: "Амстердам", Brussels: "Брюссель",
  Vienna: "Вена", Warsaw: "Варшава", Prague: "Прага", Budapest: "Будапешт",
  Bucharest: "Бухарест", Sofia: "София", Belgrade: "Белград", Zagreb: "Загреб",
  Athens: "Афины", Stockholm: "Стокгольм", Oslo: "Осло", Copenhagen: "Копенгаген",
  Helsinki: "Хельсинки", Dublin: "Дублин", Zurich: "Цюрих", Geneva: "Женева",
  Kyiv: "Киев", Kharkiv: "Харьков", Odesa: "Одесса", Odessa: "Одесса",
  Minsk: "Минск", Tashkent: "Ташкент", Almaty: "Алматы", Astana: "Астана",
  Baku: "Баку", Tbilisi: "Тбилиси", Yerevan: "Ереван", Dubai: "Дубай",
  Riyadh: "Рияд", Doha: "Доха", Karachi3: "", Kabul: "Кабул",
  "New York City": "Нью-Йорк", "Los Angeles": "Лос-Анджелес", Chicago: "Чикаго",
  Houston: "Хьюстон", Phoenix: "Финикс", Philadelphia: "Филадельфия",
  Toronto: "Торонто", Montreal: "Монреаль", Vancouver: "Ванкувер",
  "San Francisco": "Сан-Франциско", Seattle: "Сиэтл", Dallas: "Даллас",
  "Buenos Aires": "Буэнос-Айрес", Santiago: "Сантьяго", Caracas: "Каракас",
  Havana: "Гавана", Singapore: "Сингапур", Manila: "Манила", Hanoi: "Ханой",
  "Kuala Lumpur": "Куала-Лумпур", Osaka: "Осака", Nagoya: "Нагоя", Kyoto: "Киото",
  Sapporo: "Саппоро", Busan: "Пусан", Incheon: "Инчхон", Taipei: "Тайбэй",
  Bangkok2: "", "Addis Ababa": "Аддис-Абеба", Nairobi: "Найроби",
  "Cape Town": "Кейптаун", Johannesburg: "Йоханнесбург", Casablanca: "Касабланка",
  Algiers: "Алжир", Tunis: "Тунис", Accra: "Аккра", Abidjan: "Абиджан",
  "Dar es Salaam": "Дар-эс-Салам", Luanda: "Луанда", Khartoum: "Хартум",
  Novosibirsk: "Новосибирск", Yekaterinburg: "Екатеринбург", Kazan: "Казань",
  "Nizhniy Novgorod": "Нижний Новгород", Chelyabinsk: "Челябинск", Samara: "Самара",
  Omsk: "Омск", "Rostov-na-Donu": "Ростов-на-Дону", Ufa: "Уфа", Krasnoyarsk: "Красноярск",
  Voronezh: "Воронеж", Perm: "Пермь", Volgograd: "Волгоград", Krasnodar: "Краснодар",
  Saratov: "Саратов", Tyumen: "Тюмень", Irkutsk: "Иркутск", Khabarovsk: "Хабаровск",
  Vladivostok: "Владивосток", Tomsk: "Томск", Orenburg: "Оренбург", Kemerovo: "Кемерово",
  Ryazan: "Рязань", Astrakhan: "Астрахань", Penza: "Пенза", Lipetsk: "Липецк",
  Kirov: "Киров", Tula: "Тула", Kaliningrad: "Калининград", Kursk: "Курск",
  Sochi: "Сочи", Stavropol: "Ставрополь", Tver: "Тверь", Magnitogorsk: "Магнитогорск",
  Ivanovo: "Иваново", Bryansk: "Брянск", Belgorod: "Белгород", Surgut: "Сургут",
  Vladimir: "Владимир", Arkhangelsk: "Архангельск", Chita: "Чита", Smolensk: "Смоленск",
  Kaluga: "Калуга", Vologda: "Вологда", Saransk: "Саранск", Vladikavkaz: "Владикавказ",
  Murmansk: "Мурманск", Yakutsk: "Якутск", Tambov: "Тамбов", Groznyy: "Грозный",
  Kostroma: "Кострома", Petrozavodsk: "Петрозаводск", "Nizhniy Tagil": "Нижний Тагил",
  Nalchik: "Нальчик", Taganrog: "Таганрог", Bratsk: "Братск", Norilsk: "Норильск",
  Blagoveshchensk: "Благовещенск", "Petropavlovsk-Kamchatskiy": "Петропавловск-Камчатский",
  "Yuzhno-Sakhalinsk": "Южно-Сахалинск", Abakan: "Абакан", Maykop: "Майкоп",
  Elista: "Элиста", Kyzyl: "Кызыл", Magadan: "Магадан", Salekhard: "Салехард",
  "Khanty-Mansiysk": "Ханты-Мансийск", "Nar'yan-Mar": "Нарьян-Мар", Birobidzhan: "Биробиджан",
  /* Иркутская область и соседи — родные места первого пользователя */
  Angarsk: "Ангарск", "Usol'ye-Sibirskoye": "Усолье-Сибирское", Cheremkhovo: "Черемхово",
  "Ust'-Ilimsk": "Усть-Илимск", "Ust-Ilimsk": "Усть-Илимск", Sayansk: "Саянск", Zima: "Зима",
  Tulun: "Тулун", "Ust'-Kut": "Усть-Кут", "Ust-Kut": "Усть-Кут", Bodaybo: "Бодайбо",
  "Zheleznogorsk-Ilimskiy": "Железногорск-Илимский", "Nizhneudinsk": "Нижнеудинск",
  Vikhorevka: "Вихоревка", Slyudyanka: "Слюдянка", "Baykal'sk": "Байкальск", Shelekhov: "Шелехов",
  "Ulan-Ude": "Улан-Удэ", "Ulan Ude": "Улан-Удэ", Kyakhta: "Кяхта", Gusinoozersk: "Гусиноозёрск",
  "Gusinoozërsk": "Гусиноозёрск", "Severobaykal'sk": "Северобайкальск",
  /* остальные крупные города России — те, где простая транслитерация ошибается */
  "Elektrostal'": "Электросталь", "Engel's": "Энгельс", Elista: "Элиста", Elektrougli: "Электроугли",
  "Naberezhnyye Chelny": "Набережные Челны", "Naberezhnye Chelny": "Набережные Челны",
  "Zelënodol'sk": "Зеленодольск", "Zelenodol'sk": "Зеленодольск", "Al'met'yevsk": "Альметьевск",
  Nizhnekamsk: "Нижнекамск", Yelabuga: "Елабуга",
  "Chistopol'": "Чистополь", "Bugul'ma": "Бугульма", "Yoshkar-Ola": "Йошкар-Ола",
  Novocheboksarsk: "Новочебоксарск", Cheboksary: "Чебоксары", Kanash: "Канаш",
  Sarapul: "Сарапул", Votkinsk: "Воткинск", Glazov: "Глазов", Izhevsk: "Ижевск",
  "Tol'yatti": "Тольятти", "Tol'yatti": "Тольятти", "Syzran'": "Сызрань", Novokuybyshevsk: "Новокуйбышевск",
  Chapayevsk: "Чапаевск", Zhigulevsk: "Жигулёвск", "Al'met": "Альметьевск",
  "Staryy Oskol": "Старый Оскол", Gubkin: "Губкин", Shebekino: "Шебекино",
  Novomoskovsk: "Новомосковск", Aleksin: "Алексин", Serpukhov: "Серпухов", Kolomna: "Коломна",
  Lyubertsy: "Люберцы", Mytishchi: "Мытищи", Khimki: "Химки", Balashikha: "Балашиха",
  "Podol'sk": "Подольск", Podolsk: "Подольск", "Korolëv": "Королёв", Korolev: "Королёв",
  Odintsovo: "Одинцово", Krasnogorsk: "Красногорск", Noginsk: "Ногинск",
  "Orekhovo-Zuyevo": "Орехово-Зуево", "Orekhovo-Zuevo": "Орехово-Зуево", Gatchina: "Гатчина",
  Vyborg: "Выборг", Vsevolozhsk: "Всеволожск", "Sosnovyy Bor": "Сосновый Бор",
  "Velikiy Novgorod": "Великий Новгород", Pskov: "Псков", "Staraya Russa": "Старая Русса",
  "Vyaz'ma": "Вязьма", Obninsk: "Обнинск", "Naro-Fominsk": "Наро-Фоминск", Rybinsk: "Рыбинск",
  "Yaroslavl'": "Ярославль", Shuya: "Шуя", Kineshma: "Кинешма", Kovrov: "Ковров",
  Murom: "Муром", Aleksandrov: "Александров", "Kamensk-Ural'skiy": "Каменск-Уральский",
  "Pervoural'sk": "Первоуральск", Serov: "Серов", "Novoural'sk": "Новоуральск", Asbest: "Асбест",
  Irbit: "Ирбит", "Tobol'sk": "Тобольск", Nizhnevartovsk: "Нижневартовск",
  Nefteyugansk: "Нефтеюганск", "Noyabr'sk": "Ноябрьск", "Novyy Urengoy": "Новый Уренгой",
  Nadym: "Надым", Kogalym: "Когалым", Apatity: "Апатиты", Severomorsk: "Североморск",
  Severodvinsk: "Северодвинск", Kotlas: "Котлас", Syktyvkar: "Сыктывкар", Ukhta: "Ухта",
  Vorkuta: "Воркута", "Cherepovets": "Череповец", "Velikiye Luki": "Великие Луки",
  Novokuznetsk: "Новокузнецк", "Prokop'yevsk": "Прокопьевск", Mezhdurechensk: "Междуреченск",
  "Leninsk-Kuznetskiy": "Ленинск-Кузнецкий", Kiselevsk: "Киселёвск", Yurga: "Юрга",
  "Anzhero-Sudzhensk": "Анжеро-Судженск", Belovo: "Белово", Berezovskiy: "Берёзовский",
  Achinsk: "Ачинск", Kansk: "Канск", Zelenogorsk: "Зеленогорск", Minusinsk: "Минусинск",
  Chernogorsk: "Черногорск", Sayanogorsk: "Саяногорск", Zlatoust: "Златоуст", Miass: "Миасс",
  Kopeysk: "Копейск", "Troitsk": "Троицк", "Novoshakhtinsk": "Новошахтинск", Shakhty: "Шахты",
  Volzhskiy: "Волжский", Kamyshin: "Камышин", Balakovo: "Балаково", Balashov: "Балашов",
  "Dimitrovgrad": "Димитровград", "Novocherkassk": "Новочеркасск", "Bataysk": "Батайск",
  "Azov": "Азов", "Novorossiysk": "Новороссийск", "Armavir": "Армавир", "Yeysk": "Ейск",
  "Kislovodsk": "Кисловодск", "Pyatigorsk": "Пятигорск", "Essentuki": "Ессентуки",
  "Yessentuki": "Ессентуки", "Zheleznovodsk": "Железноводск", "Nevinnomyssk": "Невинномысск",
  "Cherkessk": "Черкесск", "Makhachkala": "Махачкала", "Derbent": "Дербент",
  "Khasavyurt": "Хасавюрт", "Kaspiysk": "Каспийск", "Buynaksk": "Буйнакск",
  "Ordzhonikidzevskaya": "Орджоникидзевская", "Nazran'": "Назрань", "Magas": "Магас",
  "Beslan": "Беслан", "Vladikavkaz2": "", "Kyzyl2": "", "Noril'sk": "Норильск",
  "Novosibirsk2": "", "Kemerovo2": "", "Krasnoyarsk2": "", "Perm2": "",
  /* ближнее зарубежье — те, где GeoNames пишет по-своему */
  Brest: "Брест", Hrodna: "Гродно", Grodno: "Гродно", "Homyel'": "Гомель", Gomel: "Гомель",
  Mahilyow: "Могилёв", Mogilev: "Могилёв", Vitebsk: "Витебск", Babruysk: "Бобруйск",
  Baranovichi: "Барановичи", Borisov: "Борисов", Orsha: "Орша", "Salihorsk": "Солигорск",
  Karaganda: "Караганда", Qaraghandy: "Караганда", Shymkent: "Шымкент", Chimkent: "Шымкент",
  Aktobe: "Актобе", Aqtobe: "Актобе", Atyrau: "Атырау", Pavlodar: "Павлодар",
  Semey: "Семей", Oskemen: "Усть-Каменогорск", "Ust-Kamenogorsk": "Усть-Каменогорск",
  Kostanay: "Костанай", Qyzylorda: "Кызылорда", Taraz: "Тараз", Turkestan: "Туркестан",
  "Oral": "Уральск", Aqtau: "Актау", Aktau: "Актау", Temirtau: "Темиртау",
  Namangan: "Наманган", Samarkand: "Самарканд", Bukhara: "Бухара", Andijon: "Андижан",
  Nukus: "Нукус", Fergana: "Фергана", Qarshi: "Карши", "Bishkek": "Бишкек", Osh: "Ош",
  "Jalal-Abad": "Джалал-Абад", Dushanbe: "Душанбе", Khujand: "Худжанд", Ashgabat: "Ашхабад",
  "L'viv": "Львов", Lviv: "Львов", Dnipro: "Днепр", "Dnipropetrovs'k": "Днепропетровск",
  Zaporizhzhya: "Запорожье", "Odesa2": "", Donetsk: "Донецк", Luhansk: "Луганск",
  "Kryvyy Rih": "Кривой Рог", Mykolayiv: "Николаев", Kherson: "Херсон", Poltava: "Полтава",
  Chernihiv: "Чернигов", "Vinnytsya": "Винница", Zhytomyr: "Житомир", Sumy: "Сумы",
  Rivne: "Ровно", Ternopil: "Тернополь", Lutsk: "Луцк", Uzhhorod: "Ужгород", Chernivtsi: "Черновцы",
  "Ivano-Frankivs'k": "Иваново-Франковск", Kremenchuk: "Кременчуг", Cherkasy: "Черкассы"
};

/* ---------- обратная транслитерация ----------
   GeoNames пишет города латиницей. Для России и СНГ это стандартная
   транслитерация, поэтому её можно развернуть обратно: «Angarsk» → «Ангарск».
   Так русские названия появляются у всех городов страны, а не только у тех,
   что вписаны руками выше. Для остальных стран это не делаем: «Paris» → «Парис»
   было бы хуже, чем ничего. */
const RU_LIKE = new Set(["RU"]);
const VOWELS = "аеиоуыэюяё";
function translitRu(name) {
  let s = String(name || "");
  /* убираем диакритику: Korolëv → Korolev (в поиске ё и е всё равно одно) */
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’`]/g, "'");
  if (!/^[A-Za-z' .-]+$/.test(s)) return "";
  const low = s.toLowerCase();
  const out = [];
  const push = (ch) => out.push(ch);
  for (let i = 0; i < low.length; i++) {
    const c = low[i];
    const rest = low.slice(i);
    if (rest.startsWith("shch")) { push("щ"); i += 3; continue; }
    if (rest.startsWith("sch")) { push("щ"); i += 2; continue; }
    if (rest.startsWith("zh")) { push("ж"); i += 1; continue; }
    if (rest.startsWith("kh")) { push("х"); i += 1; continue; }
    if (rest.startsWith("tsk")) { push("тск"); i += 2; continue; }  /* Якутск, Советск */
    if (rest.startsWith("ts")) { push("ц"); i += 1; continue; }
    if (rest.startsWith("ch")) { push("ч"); i += 1; continue; }
    if (rest.startsWith("sh")) { push("ш"); i += 1; continue; }
    if (rest.startsWith("yo")) { push("е"); i += 1; continue; }
    if (rest.startsWith("ya")) { push("я"); i += 1; continue; }
    if (rest.startsWith("yu")) { push("ю"); i += 1; continue; }
    if (rest.startsWith("ye")) { push("е"); i += 1; continue; }
    if (rest.startsWith("yi")) { push("и"); i += 1; continue; }
    if (rest.startsWith("yy")) { push("ый"); i += 1; continue; }
    if (c === "y") {
      const prev = out[out.length - 1] || "";
      push(VOWELS.includes(prev) ? "й" : (prev && prev !== "-" && prev !== " " ? "ы" : "й"));
      continue;
    }
    const map = {
      a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
      j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р",
      s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", z: "з", "'": "ь", "-": "-", " ": " "
    };
    push(map[c] || "");
  }
  let res = out.join("").replace(/(^|[\s-])([а-я])/g, (m, a, b) => a + b.toUpperCase());
  if (!/[А-Яа-я]/.test(res)) return "";
  return res;
}

/* ---------- сборка ---------- */
const wc = JSON.parse(fs.readFileSync(path.join(ensure("world-countries"), "countries.json"), "utf8"));

const CUR_RU = {
  USD: "доллар США", EUR: "евро", RUB: "российский рубль", GBP: "фунт стерлингов",
  CNY: "юань", JPY: "иена", INR: "рупия", TRY: "лира", BRL: "реал", KRW: "вона",
  CAD: "канадский доллар", AUD: "австралийский доллар", UAH: "гривна", KZT: "тенге",
  BYN: "белорусский рубль", CHF: "швейцарский франк", SEK: "шведская крона",
  NOK: "норвежская крона", DKK: "датская крона", PLN: "злотый", CZK: "чешская крона",
  HUF: "форинт", RON: "румынский лей", BGN: "болгарский лев", EGP: "египетский фунт",
  MXN: "мексиканское песо", ARS: "аргентинское песо", ZAR: "южноафриканский рэнд",
  NGN: "найра", PKR: "пакистанская рупия", IDR: "рупия Индонезии", THB: "бат",
  VND: "донг", IRR: "иранский риал", ILS: "шекель", AED: "дирхам ОАЭ",
  SAR: "саудовский риял", QAR: "катарский риал", KWD: "кувейтский динар"
};
/* Столицы world-countries даёт латиницей («Moscow», «Warsaw»). Для русской
   страницы это плохо, поэтому держим свой словарь по коду страны. */
const CAPITAL_RU = {
  AU: "Канберра", AT: "Вена", AZ: "Баку", AX: "Мариехамн", AL: "Тирана", DZ: "Алжир",
  AS: "Паго-Паго", AI: "Валли", AO: "Луанда", AD: "Андорра-ла-Велья", AG: "Сент-Джонс",
  AR: "Буэнос-Айрес", AM: "Ереван", AW: "Ораньестад", AF: "Кабул", BS: "Нассау",
  BD: "Дакка", BB: "Бриджтаун", BH: "Манама", BY: "Минск", BZ: "Бельмопан",
  BE: "Брюссель", BJ: "Порто-Ново", BM: "Гамильтон", BG: "София", BO: "Сукре",
  BA: "Сараево", BW: "Габороне", BR: "Бразилиа", IO: "Диего-Гарсия", VG: "Род-Таун",
  BN: "Бандар-Сери-Бегаван", BF: "Уагадугу", BI: "Гитега", BT: "Тхимпху", VU: "Порт-Вила",
  VA: "Ватикан", GB: "Лондон", HU: "Будапешт", VE: "Каракас", VI: "Шарлотта-Амалия",
  TL: "Дили", VN: "Ханой", GA: "Либревиль", HT: "Порт-о-Пренс", GY: "Джорджтаун",
  GM: "Банжул", GH: "Аккра", GP: "Бас-Тер", GT: "Гватемала", GN: "Конакри", GW: "Бисау",
  DE: "Берлин", GG: "Сент-Питер-Порт", GI: "Гибралтар", HN: "Тегусигальпа", HK: "Гонконг",
  GD: "Сент-Джорджес", GL: "Нуук", GR: "Афины", GE: "Тбилиси", GU: "Хагатна",
  DK: "Копенгаген", CD: "Киншаса", JE: "Сент-Хелиер", DJ: "Джибути", DM: "Розо",
  DO: "Санто-Доминго", EG: "Каир", ZM: "Лусака", EH: "Эль-Аюн", ZW: "Хараре",
  IL: "Иерусалим", IN: "Нью-Дели", ID: "Джакарта", JO: "Амман", IQ: "Багдад", IR: "Тегеран",
  IE: "Дублин", IS: "Рейкьявик", ES: "Мадрид", IT: "Рим", YE: "Сана", CV: "Прая",
  KZ: "Астана", KY: "Джорджтаун", KH: "Пномпень", CM: "Яунде", CA: "Оттава",
  BQ: "Кралендейк", QA: "Доха", KE: "Найроби", CY: "Никосия", KG: "Бишкек",
  KI: "Южная Тарава", CN: "Пекин", CC: "Уэст-Айленд", CO: "Богота", KM: "Морони",
  CR: "Сан-Хосе", CI: "Ямусукро", CU: "Гавана", KW: "Эль-Кувейт", CW: "Виллемстад",
  LA: "Вьентьян", LV: "Рига", LS: "Масеру", LR: "Монровия", LB: "Бейрут", LY: "Триполи",
  LT: "Вильнюс", LI: "Вадуц", LU: "Люксембург", MU: "Порт-Луи", MR: "Нуакшот",
  MG: "Антананариву", YT: "Мамудзу", MW: "Лилонгве", MY: "Куала-Лумпур", ML: "Бамако",
  MV: "Мале", MT: "Валлетта", MA: "Рабат", MQ: "Форт-де-Франс", MH: "Маджуро",
  MX: "Мехико", MZ: "Мапуту", MD: "Кишинёв", MC: "Монако", MN: "Улан-Батор",
  MS: "Плимут", MM: "Нейпьидо", NA: "Виндхук", NR: "Ярен", NP: "Катманду", NE: "Ниамей",
  NG: "Абуджа", NL: "Амстердам", NI: "Манагуа", NU: "Алофи", NZ: "Веллингтон",
  NC: "Нумеа", NO: "Осло", NF: "Кингстон", AE: "Абу-Даби", OM: "Маскат", IM: "Дуглас",
  CX: "Флайинг-Фиш-Коув", CK: "Аваруа", PN: "Адамстаун", SH: "Джеймстаун",
  PK: "Исламабад", PW: "Нгерулмуд", PS: "Рамалла", PA: "Панама", PG: "Порт-Морсби",
  PY: "Асунсьон", PE: "Лима", PL: "Варшава", PT: "Лиссабон", PR: "Сан-Хуан",
  CG: "Браззавиль", XK: "Приштина", RE: "Сен-Дени", RU: "Москва", RW: "Кигали",
  RO: "Бухарест", SV: "Сан-Сальвадор", WS: "Апиа", SM: "Сан-Марино", ST: "Сан-Томе",
  SA: "Эр-Рияд", SZ: "Лобамба", KP: "Пхеньян", MK: "Скопье", MP: "Сайпан", SC: "Виктория",
  BL: "Густавия", MF: "Мариго", PM: "Сен-Пьер", SN: "Дакар", VC: "Кингстаун", KN: "Бастер",
  LC: "Кастри", RS: "Белград", SG: "Сингапур", SX: "Филипсбург", SY: "Дамаск",
  SK: "Братислава", SI: "Любляна", US: "Вашингтон", SB: "Хониара", SO: "Могадишо",
  SD: "Хартум", SR: "Парамарибо", SL: "Фритаун", TJ: "Душанбе", TH: "Бангкок",
  TW: "Тайбэй", TZ: "Додома", TC: "Коберн-Таун", TG: "Ломе", TK: "Факаофо",
  TO: "Нукуалофа", TT: "Порт-оф-Спейн", TV: "Фунафути", TN: "Тунис", TM: "Ашхабад",
  TR: "Анкара", UG: "Кампала", UZ: "Ташкент", UA: "Киев", WF: "Мата-Уту",
  UY: "Монтевидео", FO: "Торсхавн", FM: "Паликир", FJ: "Сува", PH: "Манила",
  FI: "Хельсинки", FK: "Стенли", FR: "Париж", GF: "Кайенна", PF: "Папеэте",
  TF: "Порт-о-Франсэ", HR: "Загреб", CF: "Банги", TD: "Нджамена", ME: "Подгорица",
  CZ: "Прага", CL: "Сантьяго", CH: "Берн", SE: "Стокгольм", SJ: "Лонгйир", LK: "Коломбо",
  EC: "Кито", GQ: "Малабо", ER: "Асмара", EE: "Таллин", ET: "Аддис-Абеба",
  GS: "Кинг-Эдвард-Пойнт", KR: "Сеул", ZA: "Претория", SS: "Джуба", JM: "Кингстон",
  JP: "Токио"
};
const REGION_RU = {
  Africa: "Африка", Americas: "Америка", Asia: "Азия", Europe: "Европа",
  Oceania: "Океания", Antarctic: "Антарктика"
};

/* Языки world-countries тоже латиницей. Переводим частые, остальные оставляем
   как есть — лучше английское название, чем выдуманное русское. */
const LANG_RU = {
  English: "английский", French: "французский", Arabic: "арабский", Spanish: "испанский",
  Portuguese: "португальский", Russian: "русский", Dutch: "нидерландский", German: "немецкий",
  Chinese: "китайский", Mandarin: "китайский", Italian: "итальянский", Swahili: "суахили",
  Swedish: "шведский", Samoan: "самоанский", "Guaraní": "гуарани", Papiamento: "папьяменто",
  Serbian: "сербский", Malay: "малайский", Tamil: "тамильский", Albanian: "албанский",
  Turkmen: "туркменский", Aymara: "аймара", Quechua: "кечуа", Croatian: "хорватский",
  Greek: "греческий", Chamorro: "чаморро", Danish: "датский", Kikongo: "киконго",
  Lingala: "лингала", Berber: "берберский", Chewa: "чева", Sotho: "сото", Tsonga: "тсонга",
  Venda: "венда", Xhosa: "коса", Turkish: "турецкий", Afrikaans: "африкаанс",
  Norwegian: "норвежский", Swazi: "свати", Korean: "корейский", Slovak: "словацкий",
  Azerbaijani: "азербайджанский", Catalan: "каталанский", Armenian: "армянский",
  Dari: "дари", Pashto: "пушту", Bengali: "бенгальский", Belarusian: "белорусский",
  Bulgarian: "болгарский", Bosnian: "боснийский", Kirundi: "кирунди", Dzongkha: "дзонг-кэ",
  Bislama: "бислама", Latin: "латинский", Hungarian: "венгерский", Tetum: "тетум",
  Vietnamese: "вьетнамский", "Haitian Creole": "гаитянский креольский", Tswana: "тсвана",
  Japanese: "японский", Hindi: "хинди", Urdu: "урду", Persian: "персидский",
  Ukrainian: "украинский", Polish: "польский", Czech: "чешский", Romanian: "румынский",
  Finnish: "финский", Estonian: "эстонский", Latvian: "латышский", Lithuanian: "литовский",
  Georgian: "грузинский", Kazakh: "казахский", Uzbek: "узбекский", Kyrgyz: "киргизский",
  Tajik: "таджикский", Mongolian: "монгольский", Nepali: "непальский", Sinhala: "сингальский",
  Thai: "тайский", Lao: "лаосский", Khmer: "кхмерский", Burmese: "бирманский",
  Indonesian: "индонезийский", Tagalog: "тагальский", Hebrew: "иврит", Amharic: "амхарский",
  Somali: "сомалийский", Hausa: "хауса", Yoruba: "йоруба", Igbo: "игбо", Zulu: "зулу",
  Malagasy: "малагасийский", Wolof: "волоф", Bambara: "бамбара", Fula: "фула",
  Icelandic: "исландский", Irish: "ирландский", Welsh: "валлийский", Maltese: "мальтийский",
  Luxembourgish: "люксембургский", Slovenian: "словенский", Macedonian: "македонский",
  Moldavian: "молдавский", "Sango": "санго", Comorian: "коморский",
  /* редкие, но они реально стоят в карточках стран */
  "Austro-Bavarian German": "австро-баварский немецкий", "Belizean Creole": "белизский креольский",
  "Upper Guinea Creole": "верхнегвинейский креольский", "Guernésiais": "гернсийский",
  Greenlandic: "гренландский", Tshiluba: "чилуба", "Jèrriais": "джерсийский",
  Hassaniya: "хассания", Chibarwe: "чибарве", Kalanga: "каланга", Khoisan: "койсанские",
  Ndau: "ндау", "Northern Ndebele": "северный ндебеле", Shona: "шона", Tonga: "тонга",
  "Zimbabwean Sign Language": "зимбабвийский жестовый", Aramaic: "арамейский",
  Sorani: "сорани", "Persian (Farsi)": "персидский", Gilbertese: "гилбертский",
  "Mauritian Creole": "маврикийский креольский", Maldivian: "мальдивский",
  Marshallese: "маршалльский", Herero: "гереро", Khoekhoe: "кхойкхой",
  Kwangali: "квангали", Lozi: "лози", Ndonga: "ндонга", Nauru: "науруанский",
  Niuean: "ниуэ", "Māori": "маори", "New Zealand Sign Language": "новозеландский жестовый",
  "Norwegian Nynorsk": "норвежский нюношк", "Norwegian Bokmål": "норвежский букмол",
  Sami: "саамский", Norfuk: "норфук", Manx: "мэнский",
  "Cook Islands Māori": "маори островов Кука", Palauan: "палау", "Hiri Motu": "хири-моту",
  "Tok Pisin": "ток-писин", Kinyarwanda: "киньяруанда", Carolinian: "каролинский",
  "Seychellois Creole": "сейшельский креольский", Slovene: "словенский",
  Tokelauan: "токелау", Tongan: "тонганский", Tuvaluan: "тувалу",
  Faroese: "фарерский", Fijian: "фиджийский", "Fiji Hindi": "фиджи-хинди",
  Filipino: "филиппинский", Montenegrin: "черногорский", "Swiss German": "швейцарский немецкий",
  Romansh: "романшский", Tigrinya: "тигринья", "Southern Ndebele": "южный ндебеле",
  "Northern Sotho": "северный сото", "Southern Sotho": "южный сото", "Jamaican Patois": "ямайский креольский"
};
const LANG_LIST_RU = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean)
  .map((x) => LANG_RU[x] || x).join(", ");

const countries = wc.map((c) => {
  const ru = (c.translations && c.translations.rus && c.translations.rus.common) || c.name.common;
  const cur = Object.keys(c.currencies || {})[0] || "";
  const langs = LANG_LIST_RU(Object.values(c.languages || {}).join(", "));
  return [
    c.cca2, ru,
    CAPITAL_RU[c.cca2] || (c.capital && c.capital[0]) || "",
    REGION_RU[c.region] || c.region || "",
    Math.round(Number(c.area) || 0),
    cur,
    cur ? (CUR_RU[cur] || "") : "",
    /* телефонный код: хвост добавляем только если он единственный (+351),
       иначе получалось «+73» вместо «+7» у России */
    (c.idd && c.idd.root ? c.idd.root + ((c.idd.suffixes && c.idd.suffixes.length === 1 ? c.idd.suffixes[0] : "") || "") : ""),
    langs
  ];
}).sort((a, b) => a[1].localeCompare(b[1], "ru"));

/* города: 30 000 крупнейших, без повторов «город + страна + население» */
const rawCities = readCities(path.join(ensure("all-the-cities"), "cities.pbf"));
rawCities.sort((a, b) => b.population - a.population);
const seen = new Set();
const cities = [];
for (const c of rawCities) {
  if (cities.length >= CITY_LIMIT) break;
  if (!c.population || !/^[A-Za-zÀ-ž' .-]+$/.test(c.name)) continue;
  const key = c.name.toLowerCase() + "|" + c.country;
  if (seen.has(key)) continue;
  seen.add(key);
  const row = [c.name, c.country, c.population];
  let ru = CITY_RU[c.name];
  if (!ru && RU_LIKE.has(String(c.country || "").toUpperCase())) {
    const t = translitRu(c.name);
    /* очень короткие и странные названия не трогаем: лучше латиница, чем мусор */
    if (t && t.length > 3) ru = t;
  }
  if (ru) row.push(ru);
  cities.push(row);
}

/* языки: только действующие и исторические, без служебных */
const langAll = require(path.join(ensure("iso-639-3"), "iso6393.js"));
const langArr = Array.isArray(langAll) ? langAll : (langAll.iso6393 || Object.values(langAll)[0] || []);
const langs = langArr
  .filter((l) => l && l.name && l.iso6393 && ["living", "historical", "ancient", "constructed"].includes(l.type))
  .map((l) => [l.name, l.iso6393, l.type])
  .sort((a, b) => a[0].localeCompare(b[0], "en"));

/* химические элементы: свои русские названия */
const EL_RU = {
  H: "водород", He: "гелий", Li: "литий", Be: "бериллий", B: "бор", C: "углерод",
  N: "азот", O: "кислород", F: "фтор", Ne: "неон", Na: "натрий", Mg: "магний",
  Al: "алюминий", Si: "кремний", P: "фосфор", S: "сера", Cl: "хлор", Ar: "аргон",
  K: "калий", Ca: "кальций", Sc: "скандий", Ti: "титан", V: "ванадий", Cr: "хром",
  Mn: "марганец", Fe: "железо", Co: "кобальт", Ni: "никель", Cu: "медь", Zn: "цинк",
  Ga: "галлий", Ge: "германий", As: "мышьяк", Se: "селен", Br: "бром", Kr: "криптон",
  Rb: "рубидий", Sr: "стронций", Y: "иттрий", Zr: "цирконий", Nb: "ниобий",
  Mo: "молибден", Tc: "технеций", Ru: "рутений", Rh: "родий", Pd: "палладий",
  Ag: "серебро", Cd: "кадмий", In: "индий", Sn: "олово", Sb: "сурьма", Te: "теллур",
  I: "иод", Xe: "ксенон", Cs: "цезий", Ba: "барий", La: "лантан", Ce: "церий",
  Pr: "празеодим", Nd: "неодим", Pm: "прометий", Sm: "самарий", Eu: "европий",
  Gd: "гадолиний", Tb: "тербий", Dy: "диспрозий", Ho: "гольмий", Er: "эрбий",
  Tm: "тулий", Yb: "иттербий", Lu: "лютеций", Hf: "гафний", Ta: "тантал",
  W: "вольфрам", Re: "рений", Os: "осмий", Ir: "иридий", Pt: "платина", Au: "золото",
  Hg: "ртуть", Tl: "таллий", Pb: "свинец", Bi: "висмут", Po: "полоний", At: "астат",
  Rn: "радон", Fr: "франций", Ra: "радий", Ac: "актиний", Th: "торий", Pa: "протактиний",
  U: "уран", Np: "нептуний", Pu: "плутоний", Am: "америций", Cm: "кюрий",
  Bk: "берклий", Cf: "калифорний", Es: "эйнштейний", Fm: "фермий", Md: "менделевий",
  No: "нобелий", Lr: "лоуренсий", Rf: "резерфордий", Db: "дубний", Sg: "сиборгий",
  Bh: "борий", Hs: "хассий", Mt: "мейтнерий", Ds: "дармштадтий", Rg: "рентгений",
  Cn: "коперниций", Nh: "нихоний", Fl: "флеровий", Mc: "московий", Lv: "ливерморий",
  Ts: "теннесин", Og: "оганесон"
};
const EL_CAT = {
  "nonmetal": "неметалл", "noble gas": "благородный газ", "alkali metal": "щелочной металл",
  "alkaline earth metal": "щелочноземельный металл", "metalloid": "полуметалл",
  "halogen": "галоген", "metal": "металл", "transition metal": "переходный металл",
  "post-transition metal": "постпереходный металл", "lanthanide": "лантаноид",
  "actinide": "актиноид"
};
const elRaw = JSON.parse(fs.readFileSync(path.join(ensure("periodic-table"), "data.json"), "utf8"));
const elements = elRaw.map((e) => [
  e.atomicNumber, e.symbol, EL_RU[e.symbol] || e.name, e.name,
  Number(e.atomicMass ? String(e.atomicMass).replace(/\[.*\]/, "").replace(/\(.*\)/, "") : 0) || 0,
  EL_CAT[String(e.groupBlock || "").toLowerCase()] || e.groupBlock || ""
]);

const pack = {
  v: 1,
  updated: DATE,
  source: "GeoNames / world-countries / ISO 639-3 / periodic-table (открытые данные)",
  counts: { countries: countries.length, cities: cities.length, langs: langs.length, elements: elements.length },
  countries, cities, langs, elements
};

const total = countries.length + cities.length + langs.length + elements.length;
console.log("стран:", countries.length, "| городов:", cities.length, "| языков:", langs.length, "| элементов:", elements.length);
console.log("всего тем в индексе:", total);
if (dry) process.exit(0);
const json = JSON.stringify(pack);
fs.writeFileSync(OUT, json);
console.log("записано:", path.relative(process.cwd(), OUT), (json.length / 1e6).toFixed(2) + " МБ");

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
  "Khanty-Mansiysk": "Ханты-Мансийск", "Nar'yan-Mar": "Нарьян-Мар", Birobidzhan: "Биробиджан"
};

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
const REGION_RU = {
  Africa: "Африка", Americas: "Америка", Asia: "Азия", Europe: "Европа",
  Oceania: "Океания", Antarctic: "Антарктика"
};

const countries = wc.map((c) => {
  const ru = (c.translations && c.translations.rus && c.translations.rus.common) || c.name.common;
  const cur = Object.keys(c.currencies || {})[0] || "";
  const langs = Object.values(c.languages || {}).join(", ");
  return [
    c.cca2, ru,
    (c.capital && c.capital[0]) || "",
    REGION_RU[c.region] || c.region || "",
    Math.round(Number(c.area) || 0),
    cur,
    cur ? (CUR_RU[cur] || "") : "",
    (c.idd && c.idd.root ? c.idd.root + ((c.idd.suffixes && c.idd.suffixes[0]) || "") : ""),
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
  const ru = CITY_RU[c.name];
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

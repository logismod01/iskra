/**
 * Скачивание открытых словарей для волны «10 000 слов и фраз».
 *
 * Кладёт всё в kb-src/raw/ (папка в .gitignore: это 16 МБ чужих данных,
 * им не место в репозитории, но сборка должна быть воспроизводимой).
 *
 * Запуск: node kb-src/words-fetch.cjs
 *
 * Источники и лицензии:
 *   @langle/en-ru              — CC-BY-SA-4.0, слова и фразы с частью речи и переводом;
 *   subtlex-word-frequencies   — ISC, частотность слов в живой английской речи;
 *   en-ru-dictionary-json      — MIT, слова с транскрипцией (rever273);
 *   enru-dict                  — MIT, обратный словарь (нужен для сверки).
 *
 * Если сети нет, скрипт честно скажет, чего не хватает, и не тронет готовое.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const RAW = path.join(__dirname, "raw");
const TMP = path.join(__dirname, ".cache", "words-tmp");
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

function get(url, file) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "iskra-kb-build" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, file).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(url + " → HTTP " + res.statusCode));
      }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(file)));
      out.on("error", reject);
    }).on("error", reject);
  });
}

/* распаковка tgz: tar есть в git-bash, linux и macOS; без него — честная ошибка */
function untar(tgz, dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("tar", ["-xzf", tgz, "-C", dir], { stdio: "inherit" });
}

const need = (file, hint) => {
  if (!fs.existsSync(file)) {
    console.error("нет файла " + path.relative(process.cwd(), file) + " — " + hint);
    process.exitCode = 1;
    return false;
  }
  return true;
};

(async () => {
  const have = (f) => fs.existsSync(path.join(RAW, f));
  try {
    if (!have("langle-1.json")) {
      console.log("качаю @langle/en-ru (CC-BY-SA-4.0)…");
      const t = path.join(TMP, "langle.tgz");
      await get("https://registry.npmjs.org/@langle/en-ru/-/en-ru-2026.1120.4.tgz", t);
      untar(t, path.join(TMP, "langle"));
      for (const n of [1, 2, 3, 4]) {
        fs.copyFileSync(path.join(TMP, "langle", "package", "dict-" + n + ".json"), path.join(RAW, "langle-" + n + ".json"));
      }
      fs.copyFileSync(path.join(TMP, "langle", "package", "LICENSE"), path.join(RAW, "LICENSE-langle.txt"));
    }
    if (!have("subtlex.json")) {
      console.log("качаю subtlex-word-frequencies (ISC)…");
      const t = path.join(TMP, "subtlex.tgz");
      await get("https://registry.npmjs.org/subtlex-word-frequencies/-/subtlex-word-frequencies-2.0.0.tgz", t);
      untar(t, path.join(TMP, "subtlex"));
      fs.copyFileSync(path.join(TMP, "subtlex", "package", "index.json"), path.join(RAW, "subtlex.json"));
    }
    if (!have("en-ru-ipa.json")) {
      console.log("качаю en-ru-dictionary-json (MIT)…");
      const t = path.join(TMP, "ipa.tgz");
      await get("https://codeload.github.com/rever273/english-russian-dictionary-json/tar.gz/refs/heads/main", t);
      untar(t, path.join(TMP, "ipa"));
      fs.copyFileSync(path.join(TMP, "ipa", "english-russian-dictionary-json-main", "en-ru-dictionary.json"), path.join(RAW, "en-ru-ipa.json"));
    }
    if (!have("enru.json")) {
      console.log("качаю enru-dict (MIT)…");
      const t = path.join(TMP, "enru.tgz");
      await get("https://registry.npmjs.org/enru-dict/-/enru-dict-1.1.5.tgz", t);
      untar(t, path.join(TMP, "enru"));
      fs.copyFileSync(path.join(TMP, "enru", "package", "data", "enru.dict.json"), path.join(RAW, "enru.json"));
    }
  } catch (e) {
    console.error("скачать не вышло: " + (e && e.message));
    process.exitCode = 1;
  }
  const files = ["langle-1.json", "langle-2.json", "langle-3.json", "langle-4.json", "subtlex.json", "en-ru-ipa.json", "enru.json"];
  const ok = files.every((f) => need(path.join(RAW, f), "запусти этот скрипт с интернетом"));
  if (ok) console.log("готово: " + files.length + " файлов в kb-src/raw");
})();

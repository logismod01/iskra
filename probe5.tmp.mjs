import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";
const html = fs.readFileSync("index.html", "utf8");
const vc = new VirtualConsole(); vc.on("jsdomError", e => console.log("JSDOM:", e.message));
const dom = new JSDOM(html, { url: "https://logismod01.github.io/iskra/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(win){ win.TextEncoder=TextEncoder; win.TextDecoder=TextDecoder; win.AbortSignal=AbortSignal; Object.defineProperty(win,"crypto",{value:webcrypto,configurable:true}); }});
const { window } = dom;
await new Promise(r => setTimeout(r, 400));
const out = window.eval(`(() => {
  const res = { headOnly: 0, half: 0, none: 0, samples: [] };
  SCHOOL_PLAN.forEach((t) => {
    const words = learnWords(t);
    if (!words.length) return;
    const head = words[0].slice(0, Math.max(4, words[0].length - 2));
    const hits = kbSearch(t, 6);
    let best = 0;
    hits.forEach((h) => {
      const title = String(h.title || "").toLowerCase().replace(/ё/g, "е");
      if (title.includes(head)) best = Math.max(best, 1);
      const n = words.filter(w => title.includes(w.slice(0, Math.max(4, w.length - 2)))).length;
      if (n >= Math.ceil(words.length * 0.6)) best = Math.max(best, 2);
    });
    if (best === 2) res.half++;
    else if (best === 1) { res.headOnly++; if (res.samples.length < 8) res.samples.push([t, (hits[0]||{}).title]); }
    else res.none++;
  });
  return JSON.stringify(res);
})()`);
console.log("KB-покрытие:", out);
process.exit(0);

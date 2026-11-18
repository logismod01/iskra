import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";
const html = fs.readFileSync("index.html", "utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", e => console.log("JSDOM:", e.message));
const dom = new JSDOM(html, { url: "https://logismod01.github.io/iskra/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(win){ win.TextEncoder=TextEncoder; win.TextDecoder=TextDecoder; win.AbortSignal=AbortSignal; Object.defineProperty(win,"crypto",{value:webcrypto,configurable:true}); }});
const { window } = dom;
await new Promise(r => setTimeout(r, 400));
const t0 = Date.now();
const cov = window.eval(`(() => { let same=0, near=0, none=0; const miss=[]; SCHOOL_PLAN.forEach(t => { const e = kbExactTopic(t); if (!e) { none++; miss.push(t); } else if (learnTopicKey(e.title) === learnTopicKey(t)) same++; else near++; }); return JSON.stringify({same, near, none, miss: miss.slice(0,12)}); })()`);
console.log("покрытие базой:", cov, "| мс:", Date.now()-t0);
console.log("school all темы:", window.eval(`isSchoolRequest("выучи все темы по физике")`));
console.log("resume при паузе:", window.eval(`learnQueueAdd(["дроби"]); learnQueuePause(); learnQueueResume()`), window.eval("learnQueueLoad().paused"));
window.eval("learnQueueClear()");
process.exit(0);

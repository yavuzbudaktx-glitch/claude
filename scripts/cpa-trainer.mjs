#!/usr/bin/env node
/**
 * Builds public/cpa-trainer.html — an offline CPA exam trainer.
 *
 *   node scripts/cpa-trainer.mjs      (or: npm run cpa)
 *
 * The bank lives in scripts/cpa/questions.mjs and is merged with the daily-MCQ
 * bank already in src/lib/cpa-questions.ts, so both surfaces share content and
 * adding a question in either place feeds the trainer.
 *
 * The output is one self-contained file: no server, no network, no account.
 * Progress lives in localStorage and can be exported to JSON.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTIONS, SECTIONS } from "./cpa/questions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "cpa-trainer.html");

/* ---------------------------------------------------------------- merge */

/* Pull the existing daily-MCQ bank out of the TypeScript source. The shape is
   regular enough to read with a parser rather than importing the TS. */
function readAppBank() {
  const file = path.join(ROOT, "src/lib/cpa-questions.ts");
  let src;
  try { src = fs.readFileSync(file, "utf8"); } catch { return []; }

  const out = [];
  /* Each entry is { section: "X", q: "...", choices: [...], answer: n, why: "..." } */
  const blocks = src.split(/\n\s*\{\s*\n/).slice(1);
  for (const b of blocks) {
    const section = (b.match(/section:\s*"([A-Z]+)"/) || [])[1];
    const answer = (b.match(/answer:\s*(\d+)/) || [])[1];
    const qm = b.match(/q:\s*"((?:[^"\\]|\\.)*)"/);
    const wm = b.match(/why:\s*"((?:[^"\\]|\\.)*)"/);
    const cm = b.match(/choices:\s*\[([\s\S]*?)\]/);
    if (!section || !qm || !cm || answer === undefined) continue;

    const choices = [...cm[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unesc(m[1]));
    if (choices.length !== 4) continue;

    out.push({
      section,
      area: "I",              // the daily bank is untagged; park it in area I
      diff: 2,
      q: unesc(qm[1]),
      choices,
      answer: Number(answer),
      why: wm ? unesc(wm[1]) : "",
      tag: "daily bank",
    });
  }
  return out;
}
const unesc = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");

const appBank = readAppBank();

/* De-duplicate on the question text so re-runs stay stable. */
const seen = new Set();
const bank = [];
for (const item of [...QUESTIONS, ...appBank]) {
  const key = item.q.trim().toLowerCase().slice(0, 90);
  if (seen.has(key)) continue;
  seen.add(key);
  bank.push({ ...item, id: hash(item.q) });
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* Sanity — a wrong answer index would teach the wrong thing. */
for (const item of bank) {
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.choices.length) {
    throw new Error(`Bad answer index on: ${item.q.slice(0, 60)}`);
  }
  if (item.choices.length !== 4) throw new Error(`Not 4 choices: ${item.q.slice(0, 60)}`);
  if (!SECTIONS[item.section]) throw new Error(`Unknown section ${item.section}`);
  if (!SECTIONS[item.section].areas[item.area]) throw new Error(`Unknown area ${item.section}/${item.area}`);
}

const byS = {};
for (const item of bank) byS[item.section] = (byS[item.section] || 0) + 1;

const data = { generated: new Date().toISOString(), sections: SECTIONS, questions: bank };

/* ================================================================== HTML */

function html(d) {
  const json = JSON.stringify(d).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1a1a19">
<title>CPA Trainer</title>
<style>${CSS}</style>
</head>
<body>
<div id="app"></div>
<script id="bank" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>`;
}

const CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
:root{
  color-scheme:light;
  --plane:#f9f9f7;--surface:#fcfcfb;--raised:#fff;
  --ink:#0b0b0b;--ink-2:#52514e;--muted:#898781;
  --grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);
  --good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;
  --accent:#2a78d6;--accent-ink:#fff;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#4a3aa7;
  --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){
  color-scheme:dark;
  --plane:#0d0d0d;--surface:#1a1a19;--raised:#212120;
  --ink:#fff;--ink-2:#c3c2b7;--muted:#898781;
  --grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);
  --accent:#3987e5;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#9085e9;
}}
:root[data-theme="dark"]{
  color-scheme:dark;
  --plane:#0d0d0d;--surface:#1a1a19;--raised:#212120;
  --ink:#fff;--ink-2:#c3c2b7;--muted:#898781;
  --grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);
  --accent:#3987e5;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#9085e9;
}
html,body{margin:0;padding:0}
body{background:var(--plane);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased;
  overflow-x:hidden;-webkit-text-size-adjust:100%}
#app{max-width:840px;margin:0 auto;padding:20px 18px 120px}
button{font:inherit;color:inherit}
h1,h2,h3{margin:0;font-weight:640;letter-spacing:-.015em}

.bar-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:9px;font-weight:660;font-size:17px;letter-spacing:-.02em}
.mark{width:28px;height:28px;border-radius:8px;background:var(--accent);color:var(--accent-ink);
  display:grid;place-items:center;font-size:13px;font-weight:800}
.tools{display:flex;gap:6px;align-items:center}
.ghost{background:var(--surface);border:1px solid var(--ring);border-radius:9px;padding:7px 11px;
  cursor:pointer;font-size:12.5px;color:var(--ink-2)}
.ghost:hover{color:var(--ink);border-color:var(--axis)}

.secbar{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:18px;scrollbar-width:none}
.secbar::-webkit-scrollbar{display:none}
.secbtn{flex:none;background:var(--surface);border:1px solid var(--ring);border-radius:999px;
  padding:7px 14px;cursor:pointer;font-size:13px;font-weight:560;color:var(--ink-2);white-space:nowrap}
.secbtn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.secbtn i{font-style:normal;opacity:.7;font-size:11.5px;margin-left:5px}

.tabs{display:flex;gap:2px;border-bottom:1px solid var(--grid);margin-bottom:18px;overflow-x:auto}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:9px 14px;cursor:pointer;
  color:var(--ink-2);font-size:13.5px;white-space:nowrap}
.tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent);font-weight:620}

.card{background:var(--surface);border:1px solid var(--ring);border-radius:14px;padding:18px;margin-bottom:12px}
.card h3{font-size:14.5px;margin-bottom:4px}
.kicker{font-size:12.5px;color:var(--muted)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}

.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:13px 15px}
.tile .v{font-size:25px;font-weight:660;letter-spacing:-.02em}
.tile .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}

.meter{height:7px;border-radius:4px;background:var(--grid);overflow:hidden;margin-top:7px}
.meter>i{display:block;height:100%;border-radius:4px;transition:width .35s ease}
.arow{padding:11px 0;border-bottom:1px solid var(--grid)}
.arow:last-child{border-bottom:0}
.arow .t{display:flex;justify-content:space-between;gap:10px;font-size:13.2px;align-items:baseline}
.arow .n{color:var(--ink)}
.arow .m{color:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}

.btn{background:var(--accent);color:var(--accent-ink);border:0;border-radius:11px;padding:12px 18px;
  cursor:pointer;font-size:14.5px;font-weight:600;width:100%}
.btn:disabled{opacity:.5;cursor:default}
.btn.sec{background:var(--surface);color:var(--ink);border:1px solid var(--ring)}
.btn.sm{padding:9px 14px;font-size:13px;width:auto}
.btnrow{display:flex;gap:8px;flex-wrap:wrap}

/* question */
.qmeta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.pillx{font-size:11px;font-weight:640;border-radius:999px;padding:3px 9px;border:1px solid var(--ring);color:var(--ink-2)}
.qtext{font-size:17px;line-height:1.5;margin-bottom:16px;letter-spacing:-.01em}
.choice{display:flex;gap:11px;align-items:flex-start;width:100%;text-align:left;background:var(--surface);
  border:1.5px solid var(--ring);border-radius:12px;padding:13px 15px;margin-bottom:8px;cursor:pointer;
  font-size:14.5px;line-height:1.45;transition:border-color .12s,background .12s}
.choice:hover:not(:disabled){border-color:var(--axis)}
.choice:disabled{cursor:default}
.choice .ltr{flex:none;width:22px;height:22px;border-radius:6px;border:1.5px solid var(--axis);
  display:grid;place-items:center;font-size:11.5px;font-weight:700;color:var(--ink-2);margin-top:1px}
.choice.correct{border-color:var(--good);background:color-mix(in srgb,var(--good) 8%,transparent)}
.choice.correct .ltr{background:var(--good);border-color:var(--good);color:#fff}
.choice.wrong{border-color:var(--critical);background:color-mix(in srgb,var(--critical) 8%,transparent)}
.choice.wrong .ltr{background:var(--critical);border-color:var(--critical);color:#fff}
.choice.picked{border-color:var(--accent)}

.why{border-left:3px solid var(--accent);background:var(--plane);border-radius:0 10px 10px 0;
  padding:13px 15px;margin:14px 0;font-size:13.8px;line-height:1.6;color:var(--ink-2)}
.why b{color:var(--ink)}
.verdict{display:flex;align-items:center;gap:8px;font-weight:660;font-size:14.5px;margin-bottom:10px}
.verdict svg{width:17px;height:17px}
.v-ok{color:var(--good)}.v-no{color:var(--critical)}

.prog{height:4px;background:var(--grid);border-radius:3px;overflow:hidden;margin-bottom:16px}
.prog>i{display:block;height:100%;background:var(--accent);transition:width .3s}
.timer{font-variant-numeric:tabular-nums;font-weight:660;font-size:14px}
.timer.low{color:var(--critical)}

.empty{text-align:center;padding:40px 20px;color:var(--muted);font-size:14px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.foot{text-align:center;color:var(--muted);font-size:11.5px;margin-top:26px;line-height:1.7}
.kbd{font:11px var(--mono);border:1px solid var(--axis);border-bottom-width:2px;border-radius:5px;padding:1px 5px;color:var(--muted)}
@media (max-width:560px){#app{padding:16px 13px 100px}.qtext{font-size:16px}.tile .v{font-size:21px}}
`;

const JS = String.raw`
const D = JSON.parse(document.getElementById("bank").textContent);
const Q = D.questions, SEC = D.sections;
const KEY = "cpaTrainer.v1";
const $ = (s,r)=>(r||document).querySelector(s);
const esc = (s)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SC = {FAR:"var(--s1)",AUD:"var(--s2)",REG:"var(--s3)",BAR:"var(--s4)",ISC:"var(--s5)",TCP:"var(--s6)"};
const LTR = ["A","B","C","D"];
const DAY = 864e5;

const OK = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.2 11.5 3 8.3l1.1-1.1 2.1 2.1 5.6-5.6L13 4.8z"/></svg>';
const NO = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.7 4.4 11.6 3.3 8 6.9 4.4 3.3 3.3 4.4 6.9 8l-3.6 3.6 1.1 1.1L8 9.1l3.6 3.6 1.1-1.1L9.1 8z"/></svg>';

/* ------------------------------------------------------------- storage */

const blank = () => ({ section:"FAR", cards:{}, log:[], streak:{n:0,last:""}, exams:[] });
let S = load();
function load(){
  try { const r = JSON.parse(localStorage.getItem(KEY)); return r && r.cards ? {...blank(),...r} : blank(); }
  catch { return blank(); }
}
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
const today = () => new Date().toISOString().slice(0,10);

/* SM-2, adapted: MCQs grade themselves, so quality comes from correctness
   plus whether the answer was a guess. */
function schedule(id, quality){
  const c = S.cards[id] || { ease:2.5, reps:0, interval:0, due:0, seen:0, right:0 };
  c.seen++;
  if (quality >= 3) {
    c.right++;
    c.reps++;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 4 : Math.round(c.interval * c.ease);
  } else {
    c.reps = 0;
    c.interval = 0;               // back in today's queue
  }
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  c.due = Date.now() + c.interval * DAY;
  c.last = today();
  S.cards[id] = c;

  S.log.push({ id, t: Date.now(), q: quality });
  if (S.log.length > 4000) S.log = S.log.slice(-4000);

  const d = today();
  if (S.streak.last !== d) {
    const y = new Date(Date.now()-DAY).toISOString().slice(0,10);
    S.streak.n = S.streak.last === y ? S.streak.n + 1 : 1;
    S.streak.last = d;
  }
  save();
}

/* --------------------------------------------------------------- model */

const inSection = () => Q.filter(q => q.section === S.section);
const isDue = (q) => { const c = S.cards[q.id]; return !c || c.due <= Date.now(); };

/* Weakest-first: unseen questions, then lowest accuracy, then due date. */
function queue(){
  const list = inSection().filter(isDue);
  return list.sort((a,b)=>{
    const ca = S.cards[a.id], cb = S.cards[b.id];
    if (!ca && cb) return -1;
    if (ca && !cb) return 1;
    if (!ca && !cb) return a.diff - b.diff;
    return (ca.right/ca.seen) - (cb.right/cb.seen) || ca.due - cb.due;
  });
}

function areaStats(section){
  const out = {};
  for (const key of Object.keys(SEC[section].areas)) out[key] = { seen:0, right:0, total:0, attempted:0 };
  for (const q of Q.filter(x=>x.section===section)) {
    const a = out[q.area]; if (!a) continue;
    a.total++;
    const c = S.cards[q.id];
    if (c && c.seen) { a.seen += c.seen; a.right += c.right; a.attempted++; }
  }
  return out;
}

/* Blueprint-weighted readiness. Unseen areas contribute nothing, so the number
   climbs only as coverage grows — it should not read 100% off three questions. */
function readiness(section){
  const st = areaStats(section), areas = SEC[section].areas;
  let score = 0, covW = 0, totalW = 0;
  for (const [k,a] of Object.entries(areas)) {
    const w = (a.weight[0]+a.weight[1])/2;
    totalW += w;
    const s = st[k];
    if (!s.total) continue;
    /* Coverage is the share of an area's questions actually attempted — not
       whether it has been touched at all, which would read 100% off one card. */
    const covered = s.attempted / s.total;
    covW += w * covered;
    if (!s.seen) continue;
    score += w * (s.right/s.seen) * covered;
  }
  return { pct: totalW ? Math.round(score/totalW*100) : 0, coverage: totalW ? Math.round(covW/totalW*100) : 0 };
}

const tone = (p) => p >= 75 ? "var(--good)" : p >= 50 ? "var(--warning)" : p >= 25 ? "var(--serious)" : "var(--critical)";

/* --------------------------------------------------------------- shell */

let tab = "study", session = null, exam = null;

function render(){
  $("#app").innerHTML =
    '<div class="bar-top"><div class="brand"><span class="mark">CPA</span>Trainer</div>'
    + '<div class="tools"><button class="ghost" id="themeBtn">Theme</button>'
    + '<button class="ghost" id="dataBtn">Data</button></div></div>'
    + '<div class="secbar">' + Object.keys(SEC).map(k=>{
        const n = Q.filter(q=>q.section===k).length;
        return '<button class="secbtn" data-sec="'+k+'" aria-pressed="'+(S.section===k)+'">'
             + k + '<i>' + n + '</i></button>';
      }).join("") + '</div>'
    + '<div class="tabs">' + [["study","Study"],["exam","Exam"],["progress","Progress"]].map(([k,l])=>
        '<button class="tab" data-tab="'+k+'" aria-selected="'+(tab===k)+'">'+l+'</button>').join("") + '</div>'
    + '<div id="body"></div>'
    + '<div class="foot">' + Q.length + ' questions · saved on this device only<br>'
    + 'Figures adjusted for inflation are marked with a tax year — verify against the year you sit.</div>';

  $("#themeBtn").onclick = ()=>{
    const r = document.documentElement, c = r.getAttribute("data-theme");
    r.setAttribute("data-theme", c==="dark"?"light":c==="light"?"":"dark");
  };
  $("#dataBtn").onclick = dataPanel;
  document.querySelectorAll(".secbtn").forEach(b=>b.onclick=()=>{
    S.section=b.dataset.sec; save(); session=null; exam=null; render();
  });
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; render(); });

  ({ study:studyView, exam:examView, progress:progressView })[tab]();
}

/* --------------------------------------------------------------- study */

function studyView(){
  if (session && session.i < session.list.length) return drawQuestion();
  if (session) return drawSessionEnd();

  const due = queue().length;
  const total = inSection().length;
  const r = readiness(S.section);

  $("#body").innerHTML =
      '<div class="tiles">'
    +   tile(due, "Due now") + tile(r.pct+"%", "Readiness") + tile(r.coverage+"%","Coverage")
    +   tile(S.streak.n, "Day streak")
    + '</div>'
    + '<div class="card"><div class="row"><div><h3>' + S.section + ' — ' + esc(SEC[S.section].name) + '</h3>'
    + '<div class="kicker">' + total + ' questions in this section · weakest and unseen come first</div></div></div>'
    + '<div class="btnrow" style="margin-top:16px">'
    +   '<button class="btn" id="startBtn"' + (due?"":" disabled") + '>'
    +   (due ? 'Study ' + Math.min(15,due) + ' questions' : 'Nothing due — come back tomorrow') + '</button>'
    + '</div>'
    + (due ? '' : '<div class="btnrow" style="margin-top:8px"><button class="btn sec" id="anyBtn">Review anyway</button></div>')
    + '</div>'
    + areaCard(S.section);

  const go = (all)=>{
    const list = all ? shuffle(inSection()).slice(0,15) : queue().slice(0,15);
    if(!list.length) return;
    session = { list, i:0, right:0, answers:[] };
    render();
  };
  if ($("#startBtn")) $("#startBtn").onclick = ()=>go(false);
  if ($("#anyBtn")) $("#anyBtn").onclick = ()=>go(true);
}

const tile = (v,k)=>'<div class="tile"><div class="v">'+v+'</div><div class="k">'+esc(k)+'</div></div>';

function areaCard(section){
  const st = areaStats(section), areas = SEC[section].areas;
  return '<div class="card"><h3>By blueprint area</h3>'
    + '<div class="kicker">Percentages are the AICPA blueprint weight for this section</div>'
    + '<div style="margin-top:10px">' + Object.entries(areas).map(([k,a])=>{
        const s = st[k], acc = s.seen ? Math.round(s.right/s.seen*100) : 0;
        return '<div class="arow"><div class="t"><span class="n">' + esc(a.name) + '</span>'
          + '<span class="m">' + a.weight[0] + '–' + a.weight[1] + '% · '
          + (s.seen ? acc + '% correct' : 'not started') + '</span></div>'
          + '<div class="meter"><i style="width:' + (s.seen?acc:0) + '%;background:' + (s.seen?tone(acc):"var(--grid)") + '"></i></div></div>';
      }).join("") + '</div></div>';
}

function drawQuestion(){
  const q = session.list[session.i];
  const picked = session.picked;
  const done = picked !== undefined && picked !== null;

  $("#body").innerHTML =
      '<div class="prog"><i style="width:' + (session.i/session.list.length*100) + '%"></i></div>'
    + '<div class="qmeta"><span class="pillx" style="border-color:' + SC[q.section] + ';color:' + SC[q.section] + '">'
    +   q.section + '</span><span class="pillx">Area ' + q.area + '</span>'
    +   (q.tag ? '<span class="pillx">' + esc(q.tag) + '</span>' : '')
    +   '<span class="pillx" style="margin-left:auto">' + (session.i+1) + ' / ' + session.list.length + '</span></div>'
    + '<div class="qtext">' + esc(q.q) + '</div>'
    + q.choices.map((c,i)=>{
        let cls = "choice";
        if (done) {
          if (i === q.answer) cls += " correct";
          else if (i === picked) cls += " wrong";
        }
        return '<button class="' + cls + '" data-i="' + i + '"' + (done?" disabled":"") + '>'
             + '<span class="ltr">' + LTR[i] + '</span><span>' + esc(c) + '</span></button>';
      }).join("")
    + (done ? feedback(q, picked) : '<div class="kicker" style="margin-top:12px">Pick an answer — or press '
        + '<span class="kbd">1</span>–<span class="kbd">4</span></div>');

  document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>answer(Number(b.dataset.i)));
  if (done) {
    $("#nextBtn").onclick = next;
    if ($("#guessBtn")) $("#guessBtn").onclick = ()=>{
      const q2 = session.list[session.i];
      schedule(q2.id, 2);                       // downgrade a lucky guess
      $("#guessBtn").textContent = "Marked as a guess";
      $("#guessBtn").disabled = true;
    };
  }
}

function feedback(q, picked){
  const ok = picked === q.answer;
  return '<div class="why"><div class="verdict ' + (ok?"v-ok":"v-no") + '">' + (ok?OK:NO)
    + (ok ? 'Correct' : 'Not quite — the answer is ' + LTR[q.answer]) + '</div>'
    + '<b>Why:</b> ' + esc(q.why) + '</div>'
    + '<div class="btnrow">'
    + '<button class="btn" id="nextBtn" style="flex:1">'
    + (session.i+1 >= session.list.length ? 'Finish' : 'Next') + '</button>'
    + (ok ? '<button class="btn sec sm" id="guessBtn">That was a guess</button>' : '')
    + '</div>';
}

function answer(i){
  if (session.picked !== undefined && session.picked !== null) return;
  const q = session.list[session.i];
  const ok = i === q.answer;
  session.picked = i;
  if (ok) session.right++;
  session.answers.push({ id:q.id, ok });
  schedule(q.id, ok ? 4 : 0);
  drawQuestion();
}

function next(){
  session.picked = null;
  session.i++;
  session.picked = undefined;
  render();
}

function drawSessionEnd(){
  const pct = Math.round(session.right/session.list.length*100);
  const missed = session.answers.filter(a=>!a.ok).map(a=>Q.find(q=>q.id===a.id));
  $("#body").innerHTML =
      '<div class="card" style="text-align:center;padding:28px 18px">'
    +   '<div style="font-size:44px;font-weight:680;letter-spacing:-.03em;color:' + tone(pct) + '">' + pct + '%</div>'
    +   '<div class="kicker">' + session.right + ' of ' + session.list.length + ' correct</div>'
    + '</div>'
    + (missed.length ? '<div class="card"><h3>Worth another look</h3>'
        + '<div class="kicker">These are back in tomorrow\u2019s queue</div><div style="margin-top:10px">'
        + missed.map(q=>'<div class="arow"><div class="t"><span class="n">' + esc(q.q.slice(0,86))
          + (q.q.length>86?'\u2026':'') + '</span><span class="m">' + q.section + ' ' + q.area + '</span></div></div>').join("")
        + '</div></div>' : '')
    + '<button class="btn" id="againBtn">Back to study</button>';
  $("#againBtn").onclick = ()=>{ session=null; render(); };
}

/* ---------------------------------------------------------------- exam */

function examView(){
  if (exam && !exam.done) return drawExam();
  if (exam && exam.done) return drawExamReport();

  const avail = inSection().length;
  $("#body").innerHTML =
      '<div class="card"><h3>Timed testlet</h3>'
    + '<div class="kicker">No feedback until the end, 1.5 minutes per question — the pace the real exam runs at. '
    + 'Answers still feed spaced repetition.</div>'
    + '<div class="btnrow" style="margin-top:16px">'
    + [10,25,50].filter(n=>n<=avail).map(n=>'<button class="btn sec sm" data-n="'+n+'">'+n+' questions</button>').join("")
    + '</div></div>'
    + (S.exams.length ? '<div class="card"><h3>Past testlets</h3><div style="margin-top:8px">'
        + S.exams.slice(-8).reverse().map(e=>'<div class="arow"><div class="t">'
          + '<span class="n">' + e.section + ' · ' + e.n + ' questions</span>'
          + '<span class="m">' + e.pct + '% · ' + new Date(e.t).toLocaleDateString() + '</span></div></div>').join("")
        + '</div></div>' : '');

  document.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{
    const n = Number(b.dataset.n);
    exam = { list: shuffle(inSection()).slice(0,n), i:0, picks:{}, ends: Date.now() + n*90000, done:false };
    render(); tick();
  });
}

let timerId = null;
function tick(){
  clearInterval(timerId);
  timerId = setInterval(()=>{
    if (!exam || exam.done) return clearInterval(timerId);
    const left = exam.ends - Date.now();
    const el = $("#timer");
    if (!el) return;
    if (left <= 0) { finishExam(); return; }
    const m = Math.floor(left/60000), s = Math.floor(left%60000/1000);
    el.textContent = m + ":" + String(s).padStart(2,"0");
    el.classList.toggle("low", left < 60000);
  }, 250);
}

function drawExam(){
  const q = exam.list[exam.i];
  const picked = exam.picks[exam.i];
  $("#body").innerHTML =
      '<div class="row" style="margin-bottom:10px"><span class="kicker">Question ' + (exam.i+1) + ' of ' + exam.list.length + '</span>'
    + '<span class="timer" id="timer">—</span></div>'
    + '<div class="prog"><i style="width:' + ((exam.i)/exam.list.length*100) + '%"></i></div>'
    + '<div class="qmeta"><span class="pillx" style="border-color:' + SC[q.section] + ';color:' + SC[q.section] + '">'
    + q.section + '</span><span class="pillx">Area ' + q.area + '</span></div>'
    + '<div class="qtext">' + esc(q.q) + '</div>'
    + q.choices.map((c,i)=>'<button class="choice' + (picked===i?" picked":"") + '" data-i="'+i+'">'
        + '<span class="ltr">' + LTR[i] + '</span><span>' + esc(c) + '</span></button>').join("")
    + '<div class="btnrow" style="margin-top:14px">'
    + (exam.i>0?'<button class="btn sec sm" id="prevQ">Back</button>':'')
    + '<button class="btn" id="nextQ" style="flex:1">'
    + (exam.i+1>=exam.list.length?'Submit testlet':'Next') + '</button></div>';

  document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>{
    exam.picks[exam.i] = Number(b.dataset.i); drawExam(); tick();
  });
  if ($("#prevQ")) $("#prevQ").onclick = ()=>{ exam.i--; drawExam(); tick(); };
  $("#nextQ").onclick = ()=>{
    if (exam.i+1 >= exam.list.length) finishExam();
    else { exam.i++; drawExam(); tick(); }
  };
}

function finishExam(){
  clearInterval(timerId);
  let right = 0;
  exam.list.forEach((q,i)=>{
    const ok = exam.picks[i] === q.answer;
    if (ok) right++;
    schedule(q.id, ok ? 4 : 0);
  });
  exam.right = right;
  exam.pct = Math.round(right/exam.list.length*100);
  exam.done = true;
  S.exams.push({ t:Date.now(), section:S.section, n:exam.list.length, pct:exam.pct });
  save();
  render();
}

function drawExamReport(){
  const byArea = {};
  exam.list.forEach((q,i)=>{
    const a = byArea[q.area] || (byArea[q.area] = {n:0,r:0});
    a.n++; if (exam.picks[i]===q.answer) a.r++;
  });
  $("#body").innerHTML =
      '<div class="card" style="text-align:center;padding:28px 18px">'
    +   '<div style="font-size:44px;font-weight:680;letter-spacing:-.03em;color:' + tone(exam.pct) + '">' + exam.pct + '%</div>'
    +   '<div class="kicker">' + exam.right + ' of ' + exam.list.length + ' correct</div>'
    +   '<div class="kicker" style="margin-top:8px">The real exam scales scores and includes simulations — '
    +   'treat this as a pace and recall check, not a predicted score.</div>'
    + '</div>'
    + '<div class="card"><h3>By area</h3><div style="margin-top:8px">'
    + Object.entries(byArea).map(([k,a])=>{
        const p = Math.round(a.r/a.n*100);
        return '<div class="arow"><div class="t"><span class="n">' + esc(SEC[S.section].areas[k].name) + '</span>'
          + '<span class="m">' + a.r + '/' + a.n + '</span></div>'
          + '<div class="meter"><i style="width:'+p+'%;background:'+tone(p)+'"></i></div></div>';
      }).join("") + '</div></div>'
    + '<div class="card"><h3>Review</h3><div style="margin-top:8px">'
    + exam.list.map((q,i)=>{
        const ok = exam.picks[i]===q.answer;
        return '<div class="arow"><div class="t"><span class="n">'
          + (ok?'<span style="color:var(--good)">'+OK+'</span> ':'<span style="color:var(--critical)">'+NO+'</span> ')
          + esc(q.q.slice(0,80)) + (q.q.length>80?'\u2026':'') + '</span></div>'
          + (ok?'':'<div class="kicker" style="margin-top:5px">' + esc(q.why) + '</div>') + '</div>';
      }).join("") + '</div></div>'
    + '<button class="btn" id="doneEx">Done</button>';
  $("#doneEx").onclick = ()=>{ exam=null; render(); };
}

/* ------------------------------------------------------------ progress */

function progressView(){
  const totalSeen = Object.values(S.cards).reduce((n,c)=>n+c.seen,0);
  const totalRight = Object.values(S.cards).reduce((n,c)=>n+c.right,0);
  const acc = totalSeen ? Math.round(totalRight/totalSeen*100) : 0;
  const last7 = S.log.filter(l=>l.t > Date.now()-7*DAY).length;

  $("#body").innerHTML =
      '<div class="tiles">' + tile(totalSeen,"Answers") + tile(acc+"%","Lifetime")
    + tile(last7,"Last 7 days") + tile(S.streak.n,"Day streak") + '</div>'
    + '<div class="card"><h3>Readiness by section</h3>'
    + '<div class="kicker">Blueprint-weighted accuracy, damped by how much of the section you have covered</div>'
    + '<div style="margin-top:10px">' + Object.keys(SEC).map(k=>{
        const r = readiness(k);
        return '<div class="arow"><div class="t"><span class="n">' + k + ' · ' + esc(SEC[k].name)
          + (SEC[k].core?'':' <span class="pillx">discipline</span>') + '</span>'
          + '<span class="m">' + r.pct + '% · ' + r.coverage + '% covered</span></div>'
          + '<div class="meter"><i style="width:'+r.pct+'%;background:'+tone(r.pct)+'"></i></div></div>';
      }).join("") + '</div></div>'
    + areaCard(S.section);
}

/* ---------------------------------------------------------------- data */

function dataPanel(){
  tab = "progress"; render();
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = '<h3>Your data</h3><div class="kicker">Nothing leaves this device. Export before clearing your browser.</div>'
    + '<div class="btnrow" style="margin-top:14px">'
    + '<button class="btn sec sm" id="expBtn">Export JSON</button>'
    + '<label class="btn sec sm" style="text-align:center">Import<input type="file" id="impIn" accept="application/json" class="sr"></label>'
    + '<button class="btn sec sm" id="rstBtn" style="color:var(--critical)">Reset progress</button></div>';
  $("#body").prepend(c);

  $("#expBtn").onclick = ()=>{
    const b = new Blob([JSON.stringify(S,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "cpa-trainer-" + today() + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  };
  $("#impIn").onchange = (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{ try { const j = JSON.parse(r.result); if(j.cards){ S={...blank(),...j}; save(); render(); } } catch{} };
    r.readAsText(f);
  };
  $("#rstBtn").onclick = ()=>{
    if (confirm("Erase all progress on this device? Export first if you want a copy.")) {
      S = blank(); save(); render();
    }
  };
}

/* --------------------------------------------------------------- utils */

function shuffle(a){
  const x = a.slice();
  for (let i=x.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]]; }
  return x;
}

document.addEventListener("keydown",(e)=>{
  if (e.metaKey||e.ctrlKey||e.altKey) return;
  const n = Number(e.key);
  if (n>=1 && n<=4) {
    const b = document.querySelectorAll(".choice")[n-1];
    if (b && !b.disabled) { b.click(); e.preventDefault(); }
  }
  if (e.key==="Enter"||e.key===" ") {
    const b = $("#nextBtn") || $("#nextQ");
    if (b) { b.click(); e.preventDefault(); }
  }
});

render();
`;

/* --------------------------------------------------------------- write */

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html(data));

console.log(`cpa-trainer → ${path.relative(ROOT, OUT)}`);
console.log(`  ${bank.length} questions (${appBank.length} merged from src/lib/cpa-questions.ts)`);
console.log(`  ${Object.entries(byS).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

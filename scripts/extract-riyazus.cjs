// One-shot text extractor for public/riyazus-salihin.pdf.
//
// Reads the bundled PDF, drops Arabic blocks + page markers, splits the
// Turkish body on its "N. " hadith numbers, and writes
// public/data/riyazus-salihin-tr.json — the shape the existing loader in
// src/lib/hadith.ts already accepts. Re-run with `node scripts/extract-riyazus.cjs`
// after replacing the PDF.

const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const PDF = path.join(__dirname, "..", "public", "riyazus-salihin.pdf");
const OUT = path.join(__dirname, "..", "public", "data", "riyazus-salihin-tr.json");

// Keep Turkish letters + Western punctuation; drop Arabic and obscure marks.
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const PAGE_MARKER = /--\s*\d+\s+of\s+\d+\s*--/g;

function cleanText(s) {
  return s
    .replace(ARABIC, "")
    .replace(PAGE_MARKER, "")
    .replace(/[​-‏﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Citation block at the bottom of each hadith, e.g. "(B6579 Buhârî, Birr, 59)"
const CITE = /\(([BMD]\d+[^)]+)\)/;

function parseHadith(num, body) {
  const m = body.match(CITE);
  const source = m ? m[1].trim() : null;
  // Keep only the prose BEFORE the citation; everything after is the next
  // hadith's Arabic preamble and page numbers.
  let text = m ? body.slice(0, m.index ?? body.length) : body;

  let narrator = null;
  const nar = text.match(/^([^.\n]+?)['’]den\s*\(ra\)/);
  if (nar) narrator = nar[1].trim();
  else {
    const alt = text.match(/^([^.\n]+?)['’]dan\s*\(ra\)/);
    if (alt) narrator = alt[1].trim();
  }

  text = text.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  return { n: num, chapter: null, narrator, text, source };
}

(async () => {
  console.log("reading", PDF);
  const data = fs.readFileSync(PDF);
  const parser = new PDFParse({ data });
  const out = await parser.getText();
  const cleaned = cleanText(out.text || "");

  // Hadiths are numbered "1." through "five-hundred-something." at line starts.
  // We anchor on "\n<num>. " so prose mentions like "ayet 4." don't false-match.
  const marker = /(?:^|\n)\s*(\d{1,4})\.\s+/g;
  const hits = [...cleaned.matchAll(marker)];
  // Drop the table-of-contents prefix: keep only matches AFTER the body starts.
  // Body starts at the first time we see two consecutive ascending numbers
  // (e.g. "1." then later "2.") that are NOT both in the first 5% of the doc.
  const bodyStart = (() => {
    for (let i = 0; i < hits.length - 1; i++) {
      const a = Number(hits[i][1]);
      const b = Number(hits[i + 1][1]);
      if (a === 1 && b === 2 && (hits[i].index ?? 0) > cleaned.length * 0.02) {
        return i;
      }
    }
    return 0;
  })();

  const entries = [];
  const seen = new Set();
  for (let i = bodyStart; i < hits.length; i++) {
    const num = Number(hits[i][1]);
    if (num < 1 || num > 2000) continue;
    if (seen.has(num)) continue;
    const start = (hits[i].index ?? 0) + hits[i][0].length;
    // Find the next valid numbered marker that immediately follows this one.
    let end = cleaned.length;
    for (let j = i + 1; j < hits.length; j++) {
      const nextNum = Number(hits[j][1]);
      if (nextNum === num + 1 || nextNum === num) { end = hits[j].index ?? cleaned.length; break; }
      // Also accept a +N jump (skip Arabic-only hadiths the cleaner emptied).
      if (nextNum > num && nextNum - num <= 6) { end = hits[j].index ?? cleaned.length; break; }
    }
    const body = cleaned.slice(start, end).trim();
    if (body.length < 30) continue;
    entries.push(parseHadith(num, body));
    seen.add(num);
  }

  entries.sort((a, b) => a.n - b.n);
  console.log("extracted hadiths:", entries.length);
  if (entries.length) {
    console.log("first num:", entries[0].n, "/ last num:", entries[entries.length - 1].n);
    console.log("sample:", JSON.stringify(entries[0], null, 2).slice(0, 600));
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(entries, null, 2));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log("wrote", OUT, `(${kb} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });

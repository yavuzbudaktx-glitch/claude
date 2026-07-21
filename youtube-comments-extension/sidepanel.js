/* Side panel controller: talks to the active YouTube tab, loads comments,
 * and drives search / filter / sort / analytics / export / pin. */

"use strict";

// ------------------------------- state -------------------------------
const state = {
  tabId: null,
  videoId: null,
  videoTitle: "",
  comments: [], // loaded top-level comments (each may gain .replies)
  pins: new Set(), // pinned comment ids for the current video
  loading: false,
  loadSeq: 0, // bumped to cancel an in-flight load
  stopRequested: false,
  source: "", // "api" | "dom"
  pagesLoaded: 0,
};

// ------------------------------- dom ---------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  reload: $("reloadBtn"),
  controls: $("controls"),
  search: $("search"),
  sort: $("sort"),
  minLikes: $("minLikes"),
  tsOnly: $("tsOnly"),
  pinnedOnly: $("pinnedOnly"),
  copy: $("copyBtn"),
  csv: $("csvBtn"),
  json: $("jsonBtn"),
  txt: $("txtBtn"),
  analyticsBtn: $("analyticsBtn"),
  debugBtn: $("debugBtn"),
  analytics: $("analytics"),
  scrapeBtn: $("scrapeBtn"),
  stopBtn: $("stopBtn"),
  status: $("status"),
  list: $("list"),
  count: $("countLabel"),
  videoTitle: $("videoTitle"),
};

// --------------------------- utilities -------------------------------
const TS_RE = /(?:\d{1,2}:)?\d{1,2}:\d{2}/g;

function tsToSeconds(ts) {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function hasTimestamp(text) {
  TS_RE.lastIndex = 0;
  return TS_RE.test(text);
}

// Parse relative time ("3 months ago", "just now") into an approximate age in
// seconds so we can offer newest/oldest sorting without absolute timestamps.
const UNIT_SECS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2629800,
  year: 31557600,
};
function relativeAge(text) {
  if (!text) return Number.MAX_SAFE_INTEGER;
  const t = text.toLowerCase();
  if (t.includes("just now") || t.includes("moment")) return 0;
  const m = t.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return parseInt(m[1], 10) * (UNIT_SECS[m[2]] || 1);
}

function debounce(fn, ms) {
  let h;
  return (...a) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...a), ms);
  };
}

// Build a text fragment with clickable timestamps + highlighted search matches.
// Uses DOM nodes throughout, so comment text is never treated as HTML (no XSS).
function renderText(text, query) {
  const frag = document.createDocumentFragment();
  TS_RE.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = TS_RE.exec(text)) !== null) {
    if (m.index > last) appendPlain(frag, text.slice(last, m.index), query);
    const span = document.createElement("span");
    span.className = "ts";
    span.textContent = m[0];
    span.dataset.s = String(tsToSeconds(m[0]));
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) appendPlain(frag, text.slice(last), query);
  return frag;
}

function appendPlain(frag, str, query) {
  if (!query) {
    frag.appendChild(document.createTextNode(str));
    return;
  }
  const lower = str.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  let pos;
  while ((pos = lower.indexOf(q, i)) !== -1) {
    if (pos > i) frag.appendChild(document.createTextNode(str.slice(i, pos)));
    const mk = document.createElement("mark");
    mk.textContent = str.slice(pos, pos + q.length);
    frag.appendChild(mk);
    i = pos + q.length;
  }
  if (i < str.length) frag.appendChild(document.createTextNode(str.slice(i)));
}

function setStatus(msg, isError) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", !!isError);
  els.status.hidden = !msg;
}

// --------------------------- tab / video -----------------------------
async function getActiveTab() {
  let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  return tabs[0] || null;
}

function videoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("youtube.com") && u.pathname === "/watch") {
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
  } catch (e) {
    /* ignore */
  }
  return null;
}

// Detect the active YouTube video; reload comments if it changed.
async function detectAndMaybeLoad(force) {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    setStatus("Open a YouTube video to load its comments.");
    return;
  }
  const vid = videoIdFromUrl(tab.url);
  if (!vid) {
    els.controls.hidden = true;
    els.analytics.hidden = true;
    setStatus("This isn't a YouTube video page. Open a video and reopen me.");
    els.videoTitle.textContent = "";
    return;
  }
  state.tabId = tab.id;
  state.videoTitle = (tab.title || "").replace(/\s*-\s*YouTube\s*$/, "");
  els.videoTitle.textContent = state.videoTitle;

  if (vid !== state.videoId || force) {
    state.videoId = vid;
    await loadPins();
    await loadComments();
  }
}

// --------------------------- loading ---------------------------------
async function injectFetch(token) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    world: "MAIN",
    func: YCG_fetchPage,
    args: [token || null, state.videoId || null],
  });
  return (results && results[0] && results[0].result) || null;
}

async function injectScrape(maxScrolls) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    world: "MAIN",
    func: YCG_scrapeDom,
    args: [maxScrolls],
  });
  return (results && results[0] && results[0].result) || null;
}

// Try the internal API; return {ok, debug, error}. Fills state.comments.
// Pages through EVERY comment while a nextToken exists (high safety ceiling
// only to prevent a runaway loop). Stops early if the user hits Stop.
async function loadViaApi(seq) {
  let token = null;
  let pages = 0;
  let firstDebug = null;
  let lastError = null;
  const MAX_PAGES = 5000;
  state.firstDebug = null;
  state.lastDebug = null;
  do {
    const res = await injectFetch(token);
    if (seq !== state.loadSeq) return { ok: false, aborted: true };
    if (!res) {
      lastError = "no-result";
      break;
    }
    if (!firstDebug) firstDebug = res.debug || null;
    state.firstDebug = firstDebug;
    state.lastDebug = res.debug || null; // debug of the page where we stop
    if (res.error) {
      lastError = res.error;
      break;
    }
    state.comments.push(...res.comments);
    token = res.nextToken;
    pages++;
    state.pagesLoaded = pages;
    setStatus(
      `Loaded ${state.comments.length} comments…` +
        (token ? " (still loading — hit Stop to halt)" : "")
    );
    render();
    if (state.stopRequested) break;
    if (token) await new Promise((r) => setTimeout(r, 0));
  } while (token && pages < MAX_PAGES);
  return { ok: state.comments.length > 0, debug: firstDebug, error: lastError };
}

async function loadComments() {
  if (state.loading) return;
  const seq = ++state.loadSeq;
  state.loading = true;
  state.stopRequested = false;
  state.comments = [];
  state.source = "";
  els.list.innerHTML = "";
  els.controls.hidden = false;
  els.reload.classList.add("spinning");
  els.stopBtn.hidden = false;
  setStatus("Loading comments…");

  els.scrapeBtn.hidden = true;
  try {
    // Internal InnerTube API only — never scrolls the page.
    const api = await loadViaApi(seq);
    if (api.aborted) return;
    if (api.ok) {
      state.source = "api";
      setStatus(
        state.stopRequested
          ? `Stopped at ${state.comments.length} comments.`
          : ""
      );
      render();
    } else {
      // Do NOT auto-scroll. Explain, and offer the page-scroll method as an
      // explicit opt-in the user can decline.
      const d = api.debug || {};
      const detail =
        `Couldn't load comments via YouTube's API [${api.error || "0 parsed"}` +
        (d.http != null ? `, http ${d.http}` : "") +
        (d.items != null ? `, items ${d.items}` : "") +
        (d.entities != null ? `, entities ${d.entities}` : "") +
        `]. You can try the page-scroll method below (it briefly scrolls the ` +
        `page, then returns you to your spot).`;
      setStatus(detail, true);
      els.scrapeBtn.hidden = false;
      render();
    }
  } catch (e) {
    if (seq === state.loadSeq) setStatus("Failed: " + e.message, true);
  } finally {
    if (seq === state.loadSeq) {
      state.loading = false;
      els.reload.classList.remove("spinning");
      els.stopBtn.hidden = true;
    }
  }
}

// Explicit, opt-in page-scroll load (only when the API method fails).
async function loadViaScrape() {
  if (state.loading) return;
  const seq = ++state.loadSeq;
  state.loading = true;
  state.comments = [];
  els.list.innerHTML = "";
  els.scrapeBtn.hidden = true;
  els.reload.classList.add("spinning");
  setStatus("Reading comments from the page…");
  try {
    const scrape = await injectScrape(60);
    if (seq !== state.loadSeq) return;
    if (scrape && scrape.comments && scrape.comments.length) {
      state.comments = scrape.comments;
      state.source = "dom";
      setStatus("");
      render();
    } else {
      setStatus("Still couldn't read comments from the page.", true);
      els.scrapeBtn.hidden = false;
    }
  } catch (e) {
    setStatus("Page-scroll failed: " + e.message, true);
    els.scrapeBtn.hidden = false;
  } finally {
    if (seq === state.loadSeq) {
      state.loading = false;
      els.reload.classList.remove("spinning");
    }
  }
}

// --------------------------- replies ---------------------------------
async function loadReplies(comment) {
  if (comment.repliesLoaded || !comment.replyToken) return;
  comment.replies = [];
  let token = comment.replyToken;
  let guard = 0;
  while (token && guard < 100) {
    const res = await injectFetch(token);
    if (!res || res.error) break;
    comment.replies.push(...res.comments);
    token = res.nextToken;
    guard++;
  }
  comment.repliesLoaded = true;
}

// --------------------------- pins ------------------------------------
function pinKey() {
  return "ycg_pins_" + state.videoId;
}
async function loadPins() {
  state.pins = new Set();
  if (!state.videoId) return;
  try {
    const obj = await chrome.storage.local.get(pinKey());
    const arr = obj[pinKey()];
    if (Array.isArray(arr)) state.pins = new Set(arr);
  } catch (e) {
    /* ignore */
  }
}
async function savePins() {
  try {
    await chrome.storage.local.set({ [pinKey()]: [...state.pins] });
  } catch (e) {
    /* ignore */
  }
}
function togglePin(id) {
  if (state.pins.has(id)) state.pins.delete(id);
  else state.pins.add(id);
  savePins();
  render();
}

// --------------------------- filtering -------------------------------
function currentQuery() {
  return els.search.value.trim();
}

function applyFilters(list) {
  const q = currentQuery().toLowerCase();
  const minLikes = parseInt(els.minLikes.value, 10) || 0;
  const tsOnly = els.tsOnly.checked;

  let out = list.filter((c) => {
    if (minLikes && c.likeCount < minLikes) return false;
    if (tsOnly && !hasTimestamp(c.text)) return false;
    if (q) {
      const hay = (c.text + " " + c.author).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sort = els.sort.value;
  out = out.slice();
  if (sort === "top") out.sort((a, b) => b.likeCount - a.likeCount);
  else if (sort === "long") out.sort((a, b) => b.text.length - a.text.length);
  else if (sort === "new")
    out.sort((a, b) => relativeAge(a.publishedTime) - relativeAge(b.publishedTime));
  else if (sort === "old")
    out.sort((a, b) => relativeAge(b.publishedTime) - relativeAge(a.publishedTime));

  return out;
}

// --------------------------- rendering -------------------------------
function commentEl(c, isReply) {
  const el = document.createElement("div");
  el.className = "comment" + (isReply ? " reply" : "");
  el.dataset.id = c.id;

  const avatar = document.createElement("img");
  avatar.className = "avatar" + (isReply ? " small" : "");
  avatar.src = c.authorThumb || "";
  avatar.alt = "";
  avatar.loading = "lazy";
  avatar.referrerPolicy = "no-referrer";
  el.appendChild(avatar);

  const body = document.createElement("div");
  body.className = "body";

  const meta = document.createElement("div");
  meta.className = "meta";
  const author = document.createElement("span");
  author.className = "author";
  author.textContent = c.author;
  meta.appendChild(author);
  if (c.authorIsVerified) {
    const v = document.createElement("span");
    v.className = "verified";
    v.textContent = "✓";
    meta.appendChild(v);
  }
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = c.publishedTime;
  meta.appendChild(time);
  body.appendChild(meta);

  const text = document.createElement("div");
  text.className = "text";
  text.appendChild(renderText(c.text, currentQuery()));
  body.appendChild(text);

  const actions = document.createElement("div");
  actions.className = "actions";

  const likes = document.createElement("span");
  likes.className = "likes";
  likes.textContent = "👍 " + (c.likeLabel || c.likeCount || 0);
  actions.appendChild(likes);

  if (!isReply) {
    const pinBtn = document.createElement("button");
    pinBtn.className = "pin-btn" + (state.pins.has(c.id) ? " pinned" : "");
    pinBtn.textContent = state.pins.has(c.id) ? "📌 Pinned" : "📌 Pin";
    pinBtn.dataset.pin = c.id;
    actions.appendChild(pinBtn);

    if (c.replyCount > 0 && c.replyToken) {
      const rb = document.createElement("button");
      rb.className = "replies-btn";
      rb.dataset.replies = c.id;
      rb.textContent = "▸ " + c.replyCount + " repl" + (c.replyCount === 1 ? "y" : "ies");
      actions.appendChild(rb);
    }
  }
  body.appendChild(actions);

  if (!isReply) {
    const wrap = document.createElement("div");
    wrap.className = "reply-wrap";
    wrap.dataset.replyWrap = c.id;
    body.appendChild(wrap);
  }

  el.appendChild(body);
  return el;
}

function sectionLabel(txt) {
  const d = document.createElement("div");
  d.className = "section-label";
  d.textContent = txt;
  return d;
}

function render() {
  const filtered = applyFilters(state.comments);
  const pinnedOnly = els.pinnedOnly.checked;
  const pinned = filtered.filter((c) => state.pins.has(c.id));
  const rest = pinnedOnly ? [] : filtered.filter((c) => !state.pins.has(c.id));

  els.list.innerHTML = "";

  if (pinned.length) {
    els.list.appendChild(sectionLabel("📌 Pinned"));
    for (const c of pinned) els.list.appendChild(commentEl(c, false));
    if (rest.length) els.list.appendChild(sectionLabel("All comments"));
  }
  for (const c of rest) els.list.appendChild(commentEl(c, false));

  const shown = pinned.length + rest.length;
  const src =
    state.source === "dom"
      ? " · via page"
      : state.source === "api"
      ? ` · via API (${state.pagesLoaded}p)`
      : "";
  els.count.textContent =
    `${shown} shown / ${state.comments.length} loaded` +
    (state.pins.size ? ` · ${state.pins.size} pinned` : "") +
    src;

  if (!state.loading && shown === 0 && state.comments.length > 0) {
    setStatus("No comments match your filters.");
  }

  renderAnalytics();
}

// --------------------------- analytics -------------------------------
const STOPWORDS = new Set(
  ("a an the and or but if then this that these those is are was were be been being " +
    "to of in on for with as at by from about into over after before it its it's im i'm " +
    "you your he she they we me my our their his her them us not no yes do does did done " +
    "have has had will would can could should just so up out down off very really more most " +
    "than too also get got like one all any some what when where who how why which there here " +
    "he's she's don't can't isn't im dont u ur youre you're gonna wanna lol").split(/\s+/)
);
const POS_WORDS = new Set(
  "love loved amazing awesome great good best beautiful perfect nice excellent wonderful fantastic incredible thank thanks helpful brilliant favorite favourite happy enjoyed enjoy fun cool masterpiece goat legend inspiring epic".split(
    /\s+/
  )
);
const NEG_WORDS = new Set(
  "hate hated bad worst terrible awful boring waste horrible annoying disappointing disappointed cringe trash stupid dislike sad angry wrong fake ugly poor sucks worse dumb useless".split(
    /\s+/
  )
);

function renderAnalytics() {
  if (els.analytics.hidden) return;
  const list = state.comments;
  if (!list.length) {
    els.analytics.innerHTML = "";
    return;
  }

  const freq = new Map();
  let totalLen = 0;
  let pos = 0,
    neg = 0,
    neu = 0;
  let top = list[0];

  for (const c of list) {
    totalLen += c.text.length;
    if (c.likeCount > top.likeCount) top = c;
    const words = c.text.toLowerCase().match(/[#]?[a-z0-9']{2,}/g) || [];
    let p = 0,
      n = 0;
    for (const w of words) {
      if (POS_WORDS.has(w)) p++;
      if (NEG_WORDS.has(w)) n++;
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    if (p > n) pos++;
    else if (n > p) neg++;
    else neu++;
  }

  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const total = list.length;
  const avg = Math.round(totalLen / total);
  const pct = (x) => Math.round((x / total) * 100);

  els.analytics.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "stat-grid";
  const stat = (num, lbl) => {
    const s = document.createElement("div");
    s.className = "stat";
    const n = document.createElement("div");
    n.className = "num";
    n.textContent = num;
    const l = document.createElement("div");
    l.className = "lbl";
    l.textContent = lbl;
    s.appendChild(n);
    s.appendChild(l);
    return s;
  };
  grid.appendChild(stat(total, "loaded"));
  grid.appendChild(stat(avg, "avg chars"));
  grid.appendChild(stat(top.likeLabel || top.likeCount, "top likes"));
  grid.appendChild(stat(pct(pos) + "%", "positive"));
  els.analytics.appendChild(grid);

  if (topWords.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const [w, n] of topWords) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `${w} ${n}`;
      chip.dataset.word = w;
      chips.appendChild(chip);
    }
    els.analytics.appendChild(chips);
  }

  const bar = document.createElement("div");
  bar.className = "sentiment-bar";
  const seg = (cls, n) => {
    const d = document.createElement("div");
    d.className = cls;
    d.style.width = pct(n) + "%";
    return d;
  };
  bar.appendChild(seg("pos", pos));
  bar.appendChild(seg("neu", neu));
  bar.appendChild(seg("neg", neg));
  els.analytics.appendChild(bar);

  const legend = document.createElement("div");
  legend.className = "sentiment-legend";
  legend.innerHTML = `<span>🟢 ${pct(pos)}% positive</span><span>⚪ ${pct(
    neu
  )}% neutral</span><span>🔴 ${pct(neg)}% negative</span>`;
  els.analytics.appendChild(legend);
}

// --------------------------- export ----------------------------------
function currentExportSet() {
  return applyFilters(state.comments);
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function baseName() {
  return "youtube-comments-" + (state.videoId || "export");
}

function toTXT(list) {
  return list
    .map(
      (c) =>
        `${c.author} (${c.publishedTime}) [${c.likeLabel || c.likeCount} likes]\n${c.text}\n`
    )
    .join("\n");
}
function toJSON(list) {
  return JSON.stringify(
    list.map((c) => ({
      author: c.author,
      text: c.text,
      likes: c.likeCount,
      likesLabel: c.likeLabel,
      published: c.publishedTime,
      replies: c.replyCount,
    })),
    null,
    2
  );
}
function csvCell(s) {
  const v = String(s == null ? "" : s);
  return '"' + v.replace(/"/g, '""') + '"';
}
function toCSV(list) {
  const header = ["author", "text", "likes", "published", "replies"].join(",");
  const rows = list.map((c) =>
    [c.author, c.text, c.likeCount, c.publishedTime, c.replyCount]
      .map(csvCell)
      .join(",")
  );
  return header + "\n" + rows.join("\n");
}

// --------------------------- events ----------------------------------
const rerender = debounce(render, 120);
els.search.addEventListener("input", rerender);
els.sort.addEventListener("change", render);
els.minLikes.addEventListener("input", rerender);
els.tsOnly.addEventListener("change", render);
els.pinnedOnly.addEventListener("change", render);

els.reload.addEventListener("click", () => detectAndMaybeLoad(true));
els.scrapeBtn.addEventListener("click", loadViaScrape);
els.stopBtn.addEventListener("click", () => {
  state.stopRequested = true;
  els.stopBtn.hidden = true;
});

els.analyticsBtn.addEventListener("click", () => {
  els.analytics.hidden = !els.analytics.hidden;
  renderAnalytics();
});

els.debugBtn.addEventListener("click", async () => {
  const info = {
    version: "1.3.4",
    videoId: state.videoId,
    source: state.source,
    pagesLoaded: state.pagesLoaded,
    commentsLoaded: state.comments.length,
    firstPageDebug: state.firstDebug || null,
    lastPageDebug: state.lastDebug || null,
  };
  const text = JSON.stringify(info, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Debug info copied to clipboard — paste it to the developer.");
  } catch (e) {
    // Fallback: show it so it can be copied manually.
    setStatus("Copy failed; debug below:\n" + text, true);
  }
});

els.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(toTXT(currentExportSet()));
    setStatus("Copied to clipboard.");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    setStatus("Copy failed: " + e.message, true);
  }
});
els.csv.addEventListener("click", () =>
  download(baseName() + ".csv", toCSV(currentExportSet()), "text/csv")
);
els.json.addEventListener("click", () =>
  download(baseName() + ".json", toJSON(currentExportSet()), "application/json")
);
els.txt.addEventListener("click", () =>
  download(baseName() + ".txt", toTXT(currentExportSet()), "text/plain")
);

// Delegated clicks in the list (timestamps, pin, replies) and analytics chips.
els.list.addEventListener("click", async (e) => {
  const ts = e.target.closest(".ts");
  if (ts && state.tabId != null) {
    const secs = parseInt(ts.dataset.s, 10) || 0;
    chrome.scripting
      .executeScript({
        target: { tabId: state.tabId },
        world: "MAIN",
        func: YCG_seek,
        args: [secs],
      })
      .catch((err) => setStatus("Seek failed: " + err.message, true));
    return;
  }

  const pinId = e.target.dataset.pin;
  if (pinId) {
    togglePin(pinId);
    return;
  }

  const repId = e.target.dataset.replies;
  if (repId) {
    const c = state.comments.find((x) => x.id === repId);
    const wrap = els.list.querySelector(`[data-reply-wrap="${CSS.escape(repId)}"]`);
    if (!c || !wrap) return;
    const btn = e.target;
    if (wrap.classList.contains("open")) {
      wrap.classList.remove("open");
      btn.textContent = "▸ " + c.replyCount + " repl" + (c.replyCount === 1 ? "y" : "ies");
      return;
    }
    btn.textContent = "Loading replies…";
    btn.disabled = true;
    if (!c.repliesLoaded) await loadReplies(c);
    btn.disabled = false;
    wrap.innerHTML = "";
    if (c.replies && c.replies.length) {
      for (const r of c.replies) wrap.appendChild(commentEl(r, true));
      wrap.classList.add("open");
      btn.textContent = "▾ Hide replies";
    } else {
      btn.textContent = "⚠ Couldn't load replies";
    }
  }
});

els.analytics.addEventListener("click", (e) => {
  const w = e.target.dataset.word;
  if (w) {
    els.search.value = w;
    render();
  }
});

// Auto-refresh when the user navigates to a different video.
const maybeReload = debounce(() => detectAndMaybeLoad(false), 400);
chrome.tabs.onActivated.addListener(maybeReload);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url || info.status === "complete") maybeReload();
});
if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
  chrome.webNavigation.onHistoryStateUpdated.addListener(maybeReload, {
    url: [{ hostContains: "youtube.com" }],
  });
}

// Kick off on open.
detectAndMaybeLoad(true);

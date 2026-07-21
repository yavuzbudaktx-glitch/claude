/*
 * Functions in this file are injected into the YouTube page's MAIN world via
 * chrome.scripting.executeScript({ func, world: "MAIN" }). They must be fully
 * self-contained (no references to anything outside their own body), because
 * they are serialized and run inside the page, not the side panel.
 *
 * Primary path (YCG_fetchPage): read YouTube's own ytcfg / ytInitialData and
 * call the internal InnerTube `/youtubei/v1/next` endpoint (same-origin, with
 * cookies) to page through comments — no API key setup required.
 *
 * Fallback path (YCG_scrapeDom): if the internal API can't be parsed, scroll the
 * page and read comments straight out of the rendered DOM.
 */

/**
 * Fetch one page of comments (or replies) via the internal InnerTube API.
 * @param {string|null} continuationToken - null for the first top-level page,
 *   otherwise a continuation token (next page, or a thread's reply token).
 * @param {string|null} wantVideoId - the video id the panel expects, used to
 *   resolve a fresh comments token reliably even across YouTube SPA navigations.
 * @returns {{comments:Array, nextToken:string|null, error:?string, debug:object}}
 */
async function YCG_fetchPage(continuationToken, wantVideoId) {
  const debug = {
    hasKey: false,
    hasContext: false,
    hasToken: false,
    http: null,
    items: 0,
    entities: 0,
    parsed: 0,
  };

  const cfg = window.ytcfg;
  const getCfg = (k) => {
    if (!cfg) return undefined;
    if (typeof cfg.get === "function") {
      try {
        const v = cfg.get(k);
        if (v !== undefined) return v;
      } catch (e) {
        /* ignore */
      }
    }
    return cfg.data_ ? cfg.data_[k] : undefined;
  };

  const parseCount = (s) => {
    if (s == null) return 0;
    if (typeof s === "number") return s;
    const str = String(s).trim().replace(/,/g, "");
    const m = str.match(/([\d.]+)\s*([KMB]?)/i);
    if (!m) {
      const n = parseInt(str.replace(/[^\d]/g, ""), 10);
      return isNaN(n) ? 0 : n;
    }
    let n = parseFloat(m[1]);
    const unit = (m[2] || "").toUpperCase();
    if (unit === "K") n *= 1e3;
    else if (unit === "M") n *= 1e6;
    else if (unit === "B") n *= 1e9;
    return Math.round(n);
  };

  const tokenFromContinuationItem = (cir) => {
    if (!cir) return null;
    if (
      cir.continuationEndpoint &&
      cir.continuationEndpoint.continuationCommand &&
      cir.continuationEndpoint.continuationCommand.token
    ) {
      return cir.continuationEndpoint.continuationCommand.token;
    }
    const btn = cir.button && cir.button.buttonRenderer;
    if (
      btn &&
      btn.command &&
      btn.command.continuationCommand &&
      btn.command.continuationCommand.token
    ) {
      return btn.command.continuationCommand.token;
    }
    return null;
  };

  // Find the comments-section continuation token in a watchNext-shaped object.
  const findInitialToken = (root) => {
    let bySection = null;
    const seen = new Set();
    const walk = (node) => {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      if (
        node.itemSectionRenderer &&
        node.itemSectionRenderer.sectionIdentifier === "comment-item-section"
      ) {
        for (const c of node.itemSectionRenderer.contents || []) {
          const t = tokenFromContinuationItem(c && c.continuationItemRenderer);
          if (t) {
            bySection = t;
            return;
          }
        }
      }
      const vals = Array.isArray(node) ? node : Object.values(node);
      for (const v of vals) {
        if (v && typeof v === "object") walk(v);
        if (bySection) return;
      }
    };
    walk(root);
    return bySection;
  };

  // Collect continuation items from ANY container YouTube uses
  // (onResponseReceivedEndpoints / Actions / Commands, or legacy
  // continuationContents), so pagination doesn't depend on the exact shape.
  // Only the commands' own continuationItems are gathered, which keeps
  // per-thread reply tokens out of top-level page-token detection.
  const collectContinuationItems = (root) => {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const cmd =
        node.appendContinuationItemsCommand ||
        node.reloadContinuationItemsCommand;
      if (cmd && Array.isArray(cmd.continuationItems)) {
        out.push(...cmd.continuationItems);
      }
      if (
        node.itemSectionContinuation &&
        Array.isArray(node.itemSectionContinuation.contents)
      ) {
        out.push(...node.itemSectionContinuation.contents);
      }
      if (
        node.commentSectionContinuation &&
        Array.isArray(node.commentSectionContinuation.contents)
      ) {
        out.push(...node.commentSectionContinuation.contents);
      }
      const vals = Array.isArray(node) ? node : Object.values(node);
      for (const v of vals) if (v && typeof v === "object") walk(v);
    };
    walk(root);
    return out;
  };

  // Gather comment entity mutations wherever they live.
  const collectMutations = (root) => {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      if (
        node.entityBatchUpdate &&
        Array.isArray(node.entityBatchUpdate.mutations)
      ) {
        out.push(...node.entityBatchUpdate.mutations);
      }
      const vals = Array.isArray(node) ? node : Object.values(node);
      for (const v of vals) if (v && typeof v === "object") walk(v);
    };
    walk(root);
    return out;
  };

  const apiKey = getCfg("INNERTUBE_API_KEY");
  const context = getCfg("INNERTUBE_CONTEXT");
  debug.hasKey = !!apiKey;
  debug.hasContext = !!context;
  if (!context) {
    return { comments: [], nextToken: null, error: "no-context", debug };
  }

  const nextUrl =
    "https://www.youtube.com/youtubei/v1/next?prettyPrint=false" +
    (apiKey ? "&key=" + encodeURIComponent(apiKey) : "");
  const post = async (bodyObj) => {
    const res = await fetch(nextUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(bodyObj),
    });
    debug.http = res.status;
    return res.json();
  };

  let token = continuationToken;
  if (!token) {
    const pageVid =
      new URL(location.href).searchParams.get("v") ||
      (window.ytInitialPlayerResponse &&
        window.ytInitialPlayerResponse.videoDetails &&
        window.ytInitialPlayerResponse.videoDetails.videoId) ||
      null;
    const vid = wantVideoId || pageVid;

    // Fast path: trust ytInitialData only when it's for the video we want
    // (it goes stale across YouTube's SPA navigations).
    if (vid && pageVid === vid) token = findInitialToken(window.ytInitialData);

    // Authoritative: ask the server for a fresh comments token by videoId.
    // Works even before the comments section is scrolled into view, so we
    // never need to scroll the page, and it's always the correct video.
    if (!token && vid) {
      try {
        const wn = await post({ context, videoId: vid });
        token = findInitialToken(wn);
        debug.viaVideoId = true;
      } catch (e) {
        /* fall through */
      }
    }

    // Last resort: whatever ytInitialData has.
    if (!token) token = findInitialToken(window.ytInitialData);
  }
  debug.hasToken = !!token;
  if (!token) {
    return { comments: [], nextToken: null, error: "no-token", debug };
  }

  let data;
  try {
    data = await post({ context, continuation: token });
  } catch (e) {
    return {
      comments: [],
      nextToken: null,
      error: "fetch-failed: " + e.message,
      debug,
    };
  }

  // Build an entity map keyed by BOTH commentId and entityKey, because
  // commentViewModel may reference an entity by either.
  const entities = {};
  for (const m of collectMutations(data)) {
    const p = m && m.payload && m.payload.commentEntityPayload;
    if (!p) continue;
    debug.entities++;
    const props = p.properties || {};
    if (props.commentId) entities[props.commentId] = p;
    if (p.key) entities[p.key] = p;
    if (m.entityKey) entities[m.entityKey] = p;
  }

  const items = collectContinuationItems(data);
  let nextToken = null;
  debug.items = items.length;

  const comments = [];

  const fromEntity = (ent, replyToken, isReply) => {
    if (!ent) return null;
    const author = ent.author || {};
    const props = ent.properties || {};
    const toolbar = ent.toolbar || {};
    const likeLabel = toolbar.likeCountNotliked || toolbar.likeCountLiked || "";
    return {
      id: props.commentId || ent.key || Math.random().toString(36).slice(2),
      author: author.displayName || "",
      authorThumb:
        author.avatarThumbnailUrl ||
        (author.avatar &&
          author.avatar.image &&
          author.avatar.image.sources &&
          author.avatar.image.sources[0] &&
          author.avatar.image.sources[0].url) ||
        "",
      authorIsVerified: !!author.isVerified,
      text: (props.content && props.content.content) || "",
      likeLabel: likeLabel,
      likeCount: parseCount(likeLabel),
      publishedTime: props.publishedTime || "",
      replyCount: parseCount(toolbar.replyCount),
      replyToken: replyToken || null,
      isReply: !!isReply,
    };
  };

  const lookupEntity = (cvm) => {
    if (!cvm) return null;
    return (
      entities[cvm.commentId] ||
      entities[cvm.commentKey] ||
      entities[cvm.commentSurfaceKey] ||
      null
    );
  };

  // Legacy renderer fallback.
  const fromRenderer = (r, replyToken, isReply) => {
    if (!r) return null;
    const runs = r.contentText && r.contentText.runs;
    return {
      id: r.commentId || Math.random().toString(36).slice(2),
      author: (r.authorText && r.authorText.simpleText) || "",
      authorThumb:
        (r.authorThumbnail &&
          r.authorThumbnail.thumbnails &&
          r.authorThumbnail.thumbnails.slice(-1)[0] &&
          r.authorThumbnail.thumbnails.slice(-1)[0].url) ||
        "",
      authorIsVerified: false,
      text: runs ? runs.map((x) => x.text).join("") : "",
      likeLabel: (r.voteCount && r.voteCount.simpleText) || "",
      likeCount: parseCount(r.voteCount && r.voteCount.simpleText),
      publishedTime:
        (r.publishedTimeText &&
          r.publishedTimeText.runs &&
          r.publishedTimeText.runs[0] &&
          r.publishedTimeText.runs[0].text) ||
        "",
      replyCount: parseCount(r.replyCount),
      replyToken: replyToken || null,
      isReply: !!isReply,
    };
  };

  for (const it of items) {
    if (it.commentThreadRenderer) {
      const ct = it.commentThreadRenderer;
      let replyToken = null;
      const repl =
        ct.replies &&
        ct.replies.commentRepliesRenderer &&
        ct.replies.commentRepliesRenderer.contents;
      if (repl && repl.length) {
        replyToken = tokenFromContinuationItem(
          repl[repl.length - 1].continuationItemRenderer
        );
      }
      const cvm =
        (ct.commentViewModel && ct.commentViewModel.commentViewModel) ||
        ct.commentViewModel;
      const ent = lookupEntity(cvm);
      if (ent) {
        const c = fromEntity(ent, replyToken, false);
        if (c) comments.push(c);
        continue;
      }
      const cr = ct.comment && ct.comment.commentRenderer;
      if (cr) {
        const c = fromRenderer(cr, replyToken, false);
        if (c) comments.push(c);
      }
    } else if (it.commentViewModel) {
      const ent = lookupEntity(it.commentViewModel);
      if (ent) {
        const c = fromEntity(ent, null, true);
        if (c) comments.push(c);
      }
    } else if (it.commentRenderer) {
      const c = fromRenderer(it.commentRenderer, null, true);
      if (c) comments.push(c);
    } else if (it.continuationItemRenderer) {
      const t = tokenFromContinuationItem(it.continuationItemRenderer);
      if (t) nextToken = t;
    }
  }

  debug.parsed = comments.length;
  return { comments, nextToken, error: null, debug };
}

/**
 * Fallback: scroll the page and scrape comments from the rendered DOM.
 * @param {number} maxScrolls
 * @returns {{comments:Array, nextToken:null, error:?string, source:string}}
 */
async function YCG_scrapeDom(maxScrolls) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseCount = (s) => {
    if (!s) return 0;
    const str = String(s).trim().replace(/,/g, "");
    const m = str.match(/([\d.]+)\s*([KMB]?)/i);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    const u = (m[2] || "").toUpperCase();
    if (u === "K") n *= 1e3;
    else if (u === "M") n *= 1e6;
    else if (u === "B") n *= 1e9;
    return Math.round(n);
  };
  const hash = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return "dom-" + (h >>> 0).toString(36);
  };

  // Remember where the user was so we can put them back afterwards.
  const startX = window.scrollX;
  const startY = window.scrollY;

  let last = -1;
  let stable = 0;
  for (let i = 0; i < maxScrolls; i++) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(650);
    const n = document.querySelectorAll("ytd-comment-thread-renderer").length;
    if (n === last) {
      if (++stable >= 3) break;
    } else {
      stable = 0;
      last = n;
    }
  }

  // Restore the user's original scroll position.
  window.scrollTo(startX, startY);

  const threads = document.querySelectorAll("ytd-comment-thread-renderer");
  const comments = [];
  threads.forEach((th) => {
    const textEl = th.querySelector("#content-text");
    const authorEl = th.querySelector("#author-text");
    if (!textEl) return;
    const likeEl = th.querySelector("#vote-count-middle");
    const timeEl = th.querySelector(
      ".published-time-text a, #published-time-text a"
    );
    const imgEl = th.querySelector("#author-thumbnail img, #img");
    const text = (textEl.innerText || textEl.textContent || "").trim();
    const author = (authorEl ? authorEl.textContent : "").trim();
    comments.push({
      id: hash(author + "|" + text.slice(0, 40)),
      author: author,
      authorThumb: imgEl ? imgEl.src : "",
      authorIsVerified: false,
      text: text,
      likeLabel: likeEl ? likeEl.textContent.trim() : "",
      likeCount: parseCount(likeEl ? likeEl.textContent : ""),
      publishedTime: timeEl ? timeEl.textContent.trim() : "",
      replyCount: 0,
      replyToken: null,
      isReply: false,
    });
  });

  return {
    comments,
    nextToken: null,
    error: comments.length ? null : "dom-empty",
    source: "dom",
  };
}

/** Seek the page's <video> to a given number of seconds. */
function YCG_seek(seconds) {
  const v = document.querySelector("video");
  if (v) {
    try {
      v.currentTime = seconds;
      if (typeof v.play === "function") v.play().catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }
}

/*
 * Functions in this file are injected into the YouTube page's MAIN world via
 * chrome.scripting.executeScript({ func, world: "MAIN" }). They must be fully
 * self-contained (no references to anything outside their own body), because
 * they are serialized and run inside the page, not the side panel.
 *
 * They read YouTube's own ytcfg / ytInitialData and call the internal InnerTube
 * `/youtubei/v1/next` endpoint (same-origin, with cookies) to page through
 * comments — no API key setup required from the user.
 */

/**
 * Fetch one page of comments (or replies).
 * @param {string|null} continuationToken - null for the first top-level page,
 *   otherwise a continuation token (next page, or a thread's reply token).
 * @returns {{comments:Array, nextToken:string|null, error?:string, total?:number}}
 */
async function YCG_fetchPage(continuationToken) {
  // ---- helpers (kept inside so the function stays self-contained) ----
  const cfg = window.ytcfg;
  const getCfg = (k) => {
    if (!cfg) return undefined;
    if (typeof cfg.get === "function") {
      try { return cfg.get(k); } catch (e) { /* ignore */ }
    }
    return cfg.data_ ? cfg.data_[k] : undefined;
  };

  const parseCount = (s) => {
    if (s == null) return 0;
    if (typeof s === "number") return s;
    const str = String(s).trim().replace(/,/g, "");
    const m = str.match(/^([\d.]+)\s*([KMB]?)/i);
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

  // Recursively locate the comments-section continuation token in ytInitialData.
  const findInitialToken = (root) => {
    let found = null;
    const seen = new Set();
    const walk = (node) => {
      if (found || !node || typeof node !== "object") return;
      if (seen.has(node)) return;
      seen.add(node);
      if (
        node.itemSectionRenderer &&
        node.itemSectionRenderer.sectionIdentifier === "comment-item-section"
      ) {
        const contents = node.itemSectionRenderer.contents || [];
        for (const c of contents) {
          const t =
            c &&
            c.continuationItemRenderer &&
            c.continuationItemRenderer.continuationEndpoint &&
            c.continuationItemRenderer.continuationEndpoint.continuationCommand &&
            c.continuationItemRenderer.continuationEndpoint.continuationCommand
              .token;
          if (t) {
            found = t;
            return;
          }
        }
      }
      const vals = Array.isArray(node) ? node : Object.values(node);
      for (const v of vals) {
        if (v && typeof v === "object") walk(v);
        if (found) return;
      }
    };
    walk(root);
    return found;
  };

  // Pull a continuation token out of a continuationItemRenderer (page or replies).
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

  const apiKey = getCfg("INNERTUBE_API_KEY");
  const context = getCfg("INNERTUBE_CONTEXT");
  if (!context) {
    return { comments: [], nextToken: null, error: "no-context" };
  }

  let token = continuationToken;
  if (!token) {
    token = findInitialToken(window.ytInitialData);
  }
  if (!token) {
    // Comments may be disabled, or the section hasn't rendered.
    return { comments: [], nextToken: null, error: "no-token" };
  }

  // ---- request ----
  let data;
  try {
    const url =
      "https://www.youtube.com/youtubei/v1/next" +
      (apiKey ? "?key=" + encodeURIComponent(apiKey) : "?prettyPrint=false") +
      (apiKey ? "&prettyPrint=false" : "");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ context, continuation: token }),
    });
    data = await res.json();
  } catch (e) {
    return { comments: [], nextToken: null, error: "fetch-failed: " + e.message };
  }

  // ---- build an entity map from the modern payload format ----
  const entities = {};
  const mutations =
    (data.frameworkUpdates &&
      data.frameworkUpdates.entityBatchUpdate &&
      data.frameworkUpdates.entityBatchUpdate.mutations) ||
    [];
  for (const m of mutations) {
    const p = m && m.payload && m.payload.commentEntityPayload;
    if (p && p.properties && p.properties.commentId) {
      entities[p.properties.commentId] = p;
    }
  }

  // ---- collect the continuation items from either endpoint shape ----
  let items = [];
  let nextToken = null;
  const endpoints = data.onResponseReceivedEndpoints || [];
  for (const ep of endpoints) {
    const cmd =
      ep.reloadContinuationItemsCommand || ep.appendContinuationItemsCommand;
    if (cmd && cmd.continuationItems) {
      items = items.concat(cmd.continuationItems);
    }
  }

  const comments = [];

  const buildFromEntity = (commentId, replyToken, isReply) => {
    const ent = entities[commentId];
    if (!ent) return null;
    const author = ent.author || {};
    const props = ent.properties || {};
    const toolbar = ent.toolbar || {};
    const likeLabel = toolbar.likeCountNotliked || toolbar.likeCountLiked || "";
    return {
      id: commentId,
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

  // Legacy renderer fallback (older accounts / experiments still see this).
  const buildFromRenderer = (r, replyToken, isReply) => {
    if (!r) return null;
    const runs = r.contentText && r.contentText.runs;
    const text = runs ? runs.map((x) => x.text).join("") : "";
    const authorRuns = r.authorText && r.authorText.simpleText;
    return {
      id: r.commentId || "",
      author: authorRuns || "",
      authorThumb:
        (r.authorThumbnail &&
          r.authorThumbnail.thumbnails &&
          r.authorThumbnail.thumbnails[0] &&
          r.authorThumbnail.thumbnails[0].url) ||
        "",
      authorIsVerified: false,
      text: text,
      likeLabel: r.voteCount ? r.voteCount.simpleText || "" : "",
      likeCount: parseCount(r.voteCount ? r.voteCount.simpleText : 0),
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
      // reply continuation token, if this thread has replies
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
      // modern: commentViewModel referencing an entity by id
      const cvm =
        ct.commentViewModel && ct.commentViewModel.commentViewModel;
      if (cvm && cvm.commentId) {
        const c = buildFromEntity(cvm.commentId, replyToken, false);
        if (c) comments.push(c);
        continue;
      }
      // legacy: comment.commentRenderer
      const cr = ct.comment && ct.comment.commentRenderer;
      if (cr) {
        const c = buildFromRenderer(cr, replyToken, false);
        if (c) comments.push(c);
      }
    } else if (it.commentViewModel) {
      // replies come as bare commentViewModel items
      const cvm = it.commentViewModel;
      if (cvm.commentId) {
        const c = buildFromEntity(cvm.commentId, null, true);
        if (c) comments.push(c);
      }
    } else if (it.commentRenderer) {
      const c = buildFromRenderer(it.commentRenderer, null, true);
      if (c) comments.push(c);
    } else if (it.continuationItemRenderer) {
      const t = tokenFromContinuationItem(it.continuationItemRenderer);
      if (t) nextToken = t;
    }
  }

  return { comments, nextToken, error: null };
}

/**
 * Seek the page's <video> to a given number of seconds.
 */
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

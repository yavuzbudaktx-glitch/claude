# YouTube Comment Grabber

A Chrome extension that grabs **all** comments of the YouTube video you're
watching with one click, and opens them in a side panel with search, timestamp
seek, sorting, analytics, replies, pinning, and export — **no API key or setup
required**.

## Features

- **One click** — click the toolbar icon and the side panel opens and loads the
  current video's comments automatically.
- **Loads every comment** — pages through YouTube's own internal comment API
  (`/youtubei/v1/next`) directly from the page, so no Google API key or quota.
- **Search** — live search across comment text and author names, with matches
  highlighted.
- **Timestamps + seek** — filter to comments that mention a timestamp (e.g.
  `2:35`), and click any timestamp to jump the video to that moment.
- **Sort & filter** — top (most liked), newest, oldest, longest; plus a
  minimum-likes filter.
- **Replies** — expand any thread to lazily load its full reply chain.
- **Insights** — total count, average length, most-liked comment, top keywords
  (click to search), and a rough positive/neutral/negative sentiment split.
- **Pin & save** — pin comments you care about; pins persist per video.
- **Export** — copy all, or download as CSV / JSON / TXT.
- **Auto-refresh** — navigate to a new video and the panel reloads for it.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `youtube-comments-extension/` folder.
4. Pin the extension to your toolbar (optional but handy).

## Use

1. Open any `https://www.youtube.com/watch?v=…` page.
2. Click the extension icon — the side panel opens and starts loading comments.
3. Search, filter, sort, expand replies, click timestamps, pin, or export.
4. Hit **⟳** any time to reload; switching videos reloads automatically.

## How it works

Chrome side panels run in their own isolated page and can't read the YouTube
tab's variables directly. So the panel injects a small self-contained function
(`injected.js`) into the tab's page context via `chrome.scripting.executeScript`.
That function reads YouTube's `ytcfg` (InnerTube API key + client context) and
`ytInitialData` (the comments continuation token), then calls
`/youtubei/v1/next` in a loop — same origin, with your cookies — to fetch every
page of comments. Results are sent back to the panel, which handles all
searching, sorting, analytics, and export locally.

## Notes / limitations

- This relies on YouTube's **undocumented internal API**, which can change
  without notice. If comments stop loading after a YouTube update, the parser in
  `injected.js` may need adjusting. The panel shows a clear error rather than
  failing silently.
- "Newest / oldest" sorting is approximated from relative timestamps
  ("3 months ago"), since absolute times aren't exposed.
- Comment counts shown are the ones successfully loaded; extremely large threads
  are capped at 400 pages to stay responsive.
- Nothing is sent anywhere except YouTube itself — all processing is local to
  your browser.

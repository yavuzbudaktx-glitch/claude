#!/usr/bin/env python3
"""Download headshots of all men UFC fighters from ufc.com/athletes/all.

Uses Playwright because the listing is rendered client-side by Drupal Views AJAX.

Usage (Windows PowerShell):
    pip install -r requirements.txt
    python -m playwright install chromium
    python download_ufc_fighters.py --out ufc_fighters
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from playwright.sync_api import sync_playwright

BASE = "https://www.ufc.com"
LIST_URL = BASE + "/athletes/all?gender=Men"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").lower()
    return s or "fighter"


def ext_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    for e in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if path.endswith(e):
            return e
    return ".jpg"


def collect_fighters(headless: bool, max_clicks: int, wait_ms: int) -> list[tuple[str, str]]:
    """Open the listing in a real browser, click 'Load More' until exhausted, scrape cards."""
    fighters: dict[str, tuple[str, str]] = {}  # profile_url -> (name, image_url)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1400, "height": 1000})
        page = ctx.new_page()
        print(f"navigating to {LIST_URL}")
        page.goto(LIST_URL, wait_until="domcontentloaded", timeout=60000)

        # Accept cookie banner if present
        for sel in ("button#onetrust-accept-btn-handler", "button:has-text('Accept')"):
            try:
                page.locator(sel).first.click(timeout=2000)
                print("dismissed cookie banner")
                break
            except Exception:
                pass

        page.wait_for_selector("a[href*='/athlete/']", timeout=30000)

        clicks = 0
        while clicks < max_clicks:
            before = page.locator("a[href*='/athlete/']").count()
            # Find "Load More" pager link (Drupal views_load_more)
            load_more = page.locator(
                "li.pager__item--load-more a, a.button--load-more, a:has-text('Load More')"
            ).first
            if load_more.count() == 0 or not load_more.is_visible():
                print("no more 'Load More' button.")
                break
            try:
                load_more.scroll_into_view_if_needed(timeout=5000)
                load_more.click(timeout=5000)
            except Exception as e:
                print(f"click failed: {e}")
                break
            clicks += 1
            # wait for new cards to appear
            try:
                page.wait_for_function(
                    f"document.querySelectorAll(\"a[href*='/athlete/']\").length > {before}",
                    timeout=wait_ms,
                )
            except Exception:
                print(f"no new cards after click {clicks}, stopping.")
                break
            after = page.locator("a[href*='/athlete/']").count()
            print(f"  click {clicks}: {before} -> {after} fighter links")

        # Extract via DOM
        cards = page.evaluate(
            """
            () => {
              const out = [];
              const seen = new Set();
              document.querySelectorAll("div.c-listing-athlete-flipcard, div.c-listing-athlete, .views-row").forEach(card => {
                const a = card.querySelector("a[href*='/athlete/']");
                if (!a) return;
                const href = a.getAttribute("href");
                if (seen.has(href)) return;
                seen.add(href);
                const nameEl = card.querySelector(".c-listing-athlete__name, .c-listing-athlete-flipcard__name, h3, h4");
                const name = (nameEl ? nameEl.innerText : a.innerText).trim();
                const img = card.querySelector("img");
                let src = "";
                if (img) {
                  src = img.getAttribute("src") || img.getAttribute("data-src") || "";
                  const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset");
                  if (ss) {
                    const parts = ss.split(",").map(s => s.trim().split(" ")[0]).filter(Boolean);
                    if (parts.length) src = parts[parts.length - 1];
                  }
                }
                out.push({ name, href, src });
              });
              return out;
            }
            """
        )

        for c in cards:
            profile = urljoin(BASE, c["href"])
            img = urljoin(BASE, c["src"]) if c["src"] else ""
            if profile not in fighters and c["name"]:
                fighters[profile] = (c["name"], img)

        browser.close()

    return [(name, img) for name, img in ((n, i) for _p, (n, i) in fighters.items())]


def download(session: requests.Session, url: str, dest: Path) -> bool:
    try:
        r = session.get(url, headers={"User-Agent": UA}, timeout=60, stream=True)
        r.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return True
    except requests.RequestException as e:
        print(f"  ! failed: {e}", file=sys.stderr)
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="ufc_fighters")
    ap.add_argument("--max-clicks", type=int, default=200, help="safety cap on 'Load More' clicks")
    ap.add_argument("--wait-ms", type=int, default=15000, help="ms to wait for new cards after a click")
    ap.add_argument("--show", action="store_true", help="show the browser window")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("scraping listing (this will take a few minutes)...")
    fighters = collect_fighters(headless=not args.show, max_clicks=args.max_clicks, wait_ms=args.wait_ms)
    print(f"\nFound {len(fighters)} fighters.")

    if not fighters:
        print("Nothing to download.")
        return 1

    session = requests.Session()
    ok = 0
    for i, (name, img) in enumerate(fighters, 1):
        if not img:
            print(f"[{i}/{len(fighters)}] {name}: no image url, skipping")
            continue
        dest = out_dir / f"{slugify(name)}{ext_from_url(img)}"
        if dest.exists() and dest.stat().st_size > 0:
            ok += 1
            continue
        print(f"[{i}/{len(fighters)}] {name}")
        if download(session, img, dest):
            ok += 1
        time.sleep(0.1)

    print(f"\nDone. {ok}/{len(fighters)} images saved to {out_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())

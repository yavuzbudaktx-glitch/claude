#!/usr/bin/env python3
"""Download headshots of all men UFC fighters from ufc.com/athletes/all.

Usage:
    pip install requests beautifulsoup4
    python download_ufc_fighters.py [--out DIR] [--max-pages N] [--sleep SECONDS]
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = "https://www.ufc.com"
LIST_URL = BASE + "/athletes/all"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").lower()
    return s or "fighter"


def fetch(session: requests.Session, url: str, params: dict | None = None) -> str:
    r = session.get(url, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def parse_listing(html: str) -> list[tuple[str, str, str]]:
    """Return list of (name, profile_url, image_url) from a listing page."""
    soup = BeautifulSoup(html, "html.parser")
    fighters: list[tuple[str, str, str]] = []
    for card in soup.select("div.c-listing-athlete, li.l-flex__item, div.view-content .views-row"):
        link = card.select_one("a[href*='/athlete/']")
        if not link:
            continue
        profile = urljoin(BASE, link.get("href", ""))
        name_el = card.select_one(".c-listing-athlete__name, .field--name-name, h3, .c-listing-athlete-flipcard__name")
        name = (name_el.get_text(" ", strip=True) if name_el else link.get_text(" ", strip=True)).strip()
        img = card.select_one("img")
        img_url = ""
        if img:
            img_url = img.get("src") or img.get("data-src") or ""
            srcset = img.get("srcset") or img.get("data-srcset")
            if srcset:
                # pick the largest from srcset
                candidates = [s.strip().split(" ") for s in srcset.split(",") if s.strip()]
                if candidates:
                    img_url = candidates[-1][0]
        if name and profile:
            fighters.append((name, profile, urljoin(BASE, img_url) if img_url else ""))
    # dedupe by profile url, keep first
    seen = set()
    out = []
    for f in fighters:
        if f[1] in seen:
            continue
        seen.add(f[1])
        out.append(f)
    return out


def fetch_profile_image(session: requests.Session, profile_url: str) -> str:
    try:
        html = fetch(session, profile_url)
    except requests.RequestException:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    # Prefer hero image
    for sel in [
        ".hero-profile__image img",
        ".c-hero__image img",
        "img.hero-profile-image-wrap__image",
        ".field--name-image img",
        "img",
    ]:
        img = soup.select_one(sel)
        if img:
            url = img.get("src") or img.get("data-src") or ""
            if url and "athlete" in url.lower() or url.endswith((".png", ".jpg", ".jpeg", ".webp")):
                return urljoin(BASE, url)
    return ""


def download(session: requests.Session, url: str, dest: Path) -> bool:
    try:
        r = session.get(url, headers=HEADERS, timeout=60, stream=True)
        r.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return True
    except requests.RequestException as e:
        print(f"  ! failed: {e}", file=sys.stderr)
        return False


def ext_from_url(url: str) -> str:
    path = urlparse(url).path
    for e in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if path.lower().endswith(e):
            return e
    return ".jpg"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="ufc_fighters", help="output directory")
    ap.add_argument("--max-pages", type=int, default=200, help="safety cap on pages")
    ap.add_argument("--sleep", type=float, default=0.5, help="delay between requests (seconds)")
    ap.add_argument("--gender", default="Men", help="gender filter (Men/Women)")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()

    all_fighters: dict[str, tuple[str, str]] = {}
    for page in range(args.max_pages):
        print(f"[page {page}] fetching listing...")
        try:
            html = fetch(session, LIST_URL, params={"gender": args.gender, "page": page})
        except requests.HTTPError as e:
            print(f"  stop: {e}", file=sys.stderr)
            break
        fighters = parse_listing(html)
        if not fighters:
            print("  no fighters found, stopping.")
            break
        new = 0
        for name, profile, img in fighters:
            if profile not in all_fighters:
                all_fighters[profile] = (name, img)
                new += 1
        print(f"  {len(fighters)} on page, {new} new (total {len(all_fighters)})")
        if new == 0:
            break
        time.sleep(args.sleep)

    print(f"\nFound {len(all_fighters)} fighters. Downloading images...")
    ok = 0
    for i, (profile, (name, img)) in enumerate(all_fighters.items(), 1):
        if not img:
            img = fetch_profile_image(session, profile)
            time.sleep(args.sleep)
        if not img:
            print(f"[{i}/{len(all_fighters)}] {name}: no image url")
            continue
        dest = out_dir / f"{slugify(name)}{ext_from_url(img)}"
        if dest.exists() and dest.stat().st_size > 0:
            ok += 1
            continue
        print(f"[{i}/{len(all_fighters)}] {name} <- {img}")
        if download(session, img, dest):
            ok += 1
        time.sleep(args.sleep)

    print(f"\nDone. {ok}/{len(all_fighters)} images saved to {out_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())

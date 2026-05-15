#!/usr/bin/env python3
"""Save the UFC athletes listing HTML and report what's in it."""
import re
import requests
from bs4 import BeautifulSoup

URL = "https://www.ufc.com/athletes/all"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

r = requests.get(URL, params={"gender": "Men", "page": 0}, headers=HEADERS, timeout=30)
print(f"status={r.status_code} bytes={len(r.text)}")
with open("ufc_page0.html", "w", encoding="utf-8") as f:
    f.write(r.text)

soup = BeautifulSoup(r.text, "html.parser")
title = soup.find("title")
print("title:", title.get_text(strip=True) if title else "(none)")

text = soup.get_text(" ", strip=True)
print("body text length:", len(text))
print("first 500 chars of body text:")
print(text[:500])
print("---")

print("counts:")
for tag in ("script", "img", "a", "div", "iframe", "noscript"):
    print(f"  <{tag}>: {len(soup.find_all(tag))}")

print("\nlinks containing 'athlete':")
hits = [a.get("href") for a in soup.find_all("a") if a.get("href") and "athlete" in a.get("href").lower()]
print(f"  {len(hits)} links")
for h in hits[:5]:
    print("  ", h)

print("\nany 'cloudflare', 'captcha', 'akamai', 'access denied' strings?")
for kw in ("cloudflare", "captcha", "akamai", "access denied", "blocked", "challenge"):
    if kw in r.text.lower():
        print(f"  FOUND: {kw}")

print("\nfirst 800 chars of raw HTML:")
print(r.text[:800])

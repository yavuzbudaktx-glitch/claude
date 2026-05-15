#!/usr/bin/env python3
"""Save the UFC athletes listing HTML and report key selectors found."""
import sys
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
print("Saved ufc_page0.html")

soup = BeautifulSoup(r.text, "html.parser")
for sel in [
    "div.c-listing-athlete",
    "div.c-listing-athlete-flipcard",
    "li.l-flex__item",
    "div.view-content .views-row",
    "a[href*='/athlete/']",
    "img",
]:
    n = len(soup.select(sel))
    print(f"  {sel!r:50s} -> {n}")

a = soup.select_one("a[href*='/athlete/']")
if a:
    print("first athlete link:", a.get("href"))
    parent = a.find_parent()
    print("parent tag:", parent.name, "classes:", parent.get("class"))

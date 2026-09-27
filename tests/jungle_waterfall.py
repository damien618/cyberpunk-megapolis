"""Run tests/jungle_waterfall.mjs in headless Chromium (no Node on this machine).

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_waterfall.py

The page is index.html (the hub): it is light and carries the import map
that resolves 'three' for the module under test.
"""
import sys
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8000/'
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on('console', lambda m: print(m.text))
    page.on('pageerror', lambda e: print('PAGE ERROR', e))
    page.goto(URL)
    failed = page.evaluate("""async () => {
      await import('/tests/jungle_waterfall.mjs?t=' + Date.now());
      return globalThis.__jungleWaterfallFailed;
    }""")
    browser.close()
sys.exit(1 if failed else 0)

"""Run tests/jungle_wildlife.mjs in headless Chromium (no Node on this machine).

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_wildlife.py
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8000/index.html?map=jungle'
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 640, 'height': 360})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: print(m.text) if m.text.startswith(('  ok', 'FAIL', '\n')) else None)
    page.set_default_timeout(240000)
    page.goto(URL, wait_until='domcontentloaded')
    failed = page.evaluate("""async () => {
      await import('/tests/jungle_wildlife.mjs?t=' + Date.now());
      return globalThis.__jungleWildlifeFailed;
    }""")
    browser.close()

print()
for e in errors[:8]:
    print('PAGE ERROR:', e[:400])
ok = failed == 0 and not errors
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)

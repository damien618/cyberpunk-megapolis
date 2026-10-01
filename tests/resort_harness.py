"""Common real-browser harness for the native Three.js resort (serve.py :8000)."""
import os
from pathlib import Path
from contextlib import contextmanager
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', str(ROOT / '.venv/pw-browsers'))

@contextmanager
def resort_page(viewport=None, url='index.html?map=resort'):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = browser.new_page(viewport=viewport or {'width': 960, 'height': 540})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: print(m.text) if m.type == 'log' else None)
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        def defer(route):
            response = route.fetch()
            body = response.text().replace('\nanimate();', '\nwindow.__testAnimate = animate;')
            route.fulfill(response=response, body=body, content_type='text/javascript')
        page.route('**/main-RESORT.js*', defer)
        page.goto('http://127.0.0.1:8000/' + url)
        page.wait_for_function('window.__resort && window.__resort.ctrl', timeout=180000)
        page.evaluate('async () => { await window.__resort.playerReady; }')
        page.wait_for_timeout(1200)
        page.evaluate("document.getElementById('overlay').style.display='none'")
        yield page, errors
        browser.close()
        assert not errors, '\n'.join(errors)

def check(name, value):
    print(('ok  ' if value else 'FAIL'), name)
    assert value, name

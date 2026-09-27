"""The liner offers the tender when you look at the island from the deck, and
the tender back from the island lands you on the port promenade.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/cruise_island_prompt.py
"""
import asyncio, json, math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.async_api import async_playwright

# Run the real loop without drawing: SwiftShader cannot render the ship in time.
FRAMES = '''async ([n, yaw]) => {
  const v = window.__cruise;
  v.renderer.render = () => {};
  for (let i = 0; i < n; i++) {
    if (yaw !== null) { v.input.yaw = yaw; v.input.pitch = 0; }
    window.requestAnimationFrame = () => 0;
    window.__testAnimate();
    await new Promise(r => setTimeout(r, 16));
  }
  return { pos: v.ctrl.pos.toArray().map(n => +n.toFixed(2)), mode: v.ctrl.mode,
           off: +(v.islandOffAxis() * 180 / Math.PI).toFixed(1), ask: v.islandAskOpen,
           shown: document.getElementById('islandPromptGroup').classList.contains('show') };
}'''

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = await browser.new_page(viewport={'width': 640, 'height': 400})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:400]))
        async def defer(route):
            r = await route.fetch()
            body = (await r.text()).replace('\nrequestAnimationFrame(animate);',
                                            '\nwindow.__testAnimate = animate;')
            await route.fulfill(response=r, body=body, content_type='text/javascript')
        await page.route('**/main-CRUISE.js*', defer)
        await page.goto('http://127.0.0.1:8000/index.html?map=cruise&arrival=jungle', wait_until='domcontentloaded')
        # Poll with plain evaluates: wait_for_function never returned on this
        # page, while the same check by hand sees it ready in ~20 s.
        for _ in range(60):
            await page.wait_for_timeout(10000)
            if await page.evaluate('!!(window.__cruise && window.__cruise.ctrl && window.__testAnimate)'):
                break
        else:
            raise TimeoutError('cruise map never finished booting')
        failed = 0
        def check(name, ok, r):
            nonlocal failed
            print(('ok  ' if ok else 'FAIL'), name, json.dumps(r))
            failed += 0 if ok else 1
        yaw = await page.evaluate('''() => { const p = window.__cruise.islandData.island.position,
            s = window.__cruise.ctrl.pos; return Math.atan2(-(p.x - s.x), -(p.z - s.z)); }''')
        r = await page.evaluate(FRAMES, [40, yaw])
        check('back from the island: on the port promenade deck',
              r['pos'][0] < -13 and abs(r['pos'][1] - 8.0) < 0.6, r)
        check('arrival faces the island but does not ask straight away',
              r['off'] < 5 and not r['shown'], r)
        r = await page.evaluate(FRAMES, [30, -math.pi / 2])
        check('looking inboard: the ship is in the way', r['off'] > 38 and not r['shown'], r)
        r = await page.evaluate(FRAMES, [90, math.pi / 2])   # straight out to port
        check('looking at the island again: the question appears', r['shown'], r)
        await page.click('#islandNoPrompt')
        r = await page.evaluate(FRAMES, [60, yaw])
        check('"non" withdraws it while you keep looking', not r['shown'], r)
        await browser.close()
        sys.exit(1 if failed else 0)

asyncio.run(main())

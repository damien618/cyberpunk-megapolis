# Headless capture of the gate-cafe sit: the pack set down on the floor beside
# the chair, the legs clear of the chair back, then the stand-up with the pack
# back on. Same SwiftShader constraints as capture_cafe_plant.py — the animate
# kickoff is deferred and frames are rendered on demand. Serve the project root
# on port 8123 (python3 -m http.server 8123) before running; needs playwright.
import asyncio, os, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '.venv/pw-browsers')
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'shot_cafe_sit.png'
OUT2 = sys.argv[2] if len(sys.argv) > 2 else None

RENDER = '''() => {
  const v = window.__villa;
  v.renderer.setPixelRatio(0.8);
  window.__raf = window.__raf || window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = window.__raf;
  window.__testAnimate();
  window.requestAnimationFrame = () => 0;
}'''

SIT = '''() => {
  const v = window.__villa;
  const spot = v.furnitureInteractions.find(s => s.type === 'sit'
    && Math.abs(s.x - (-18.45)) < 0.01 && Math.abs(s.z - 9) < 0.01);
  if (!spot) { console.log('SPOT-NOT-FOUND'); return; }
  spot.occupied = false;
  v.enterFurnitureInteraction(spot);
  console.log('SIT-POSE', JSON.stringify(v.activeFurnitureInteraction?.pose));
}'''

async def render_frame(page):
    await page.evaluate(RENDER)
    await page.wait_for_timeout(700)

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = await browser.new_page(viewport={'width': 1100, 'height': 620})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:300]))
        page.on('console', lambda m: print('CONSOLE:', m.text[:200])
                if m.type in ('error', 'warning') else None)

        async def defer_animation(route):
            r = await route.fetch()
            body = (await r.text()).replace(
                '\nanimate();', '\nwindow.__testAnimate = animate;')
            await route.fulfill(response=r, body=body,
                                content_type='text/javascript')
        await page.route('**/main-AIRPORT.js*', defer_animation)
        await page.goto('http://127.0.0.1:8123/index.html?map=airport')
        await page.wait_for_function(
            'window.__villa && window.__villa.ctrl', timeout=300000)
        await page.wait_for_timeout(9000)
        await page.evaluate('''() => {
          window.__startAirport();
          const ov = document.getElementById('overlay');
          if (ov) ov.style.display = 'none';
        }''')
        await page.wait_for_timeout(2500)
        await page.evaluate(SIT)
        await page.evaluate('''() => {
          const v = window.__villa;
          v.rig.update = () => {};
          v.camera.position.set(-19.9, 1.5, 10.7);
          v.camera.lookAt(-18.3, 0.75, 8.9);
        }''')
        await render_frame(page)
        await page.screenshot(path=OUT, timeout=120000)
        print('saved', OUT)
        if OUT2:
            await page.evaluate('''() => {
              const v = window.__villa;
              v.camera.position.set(-19.6, 1.05, 9.9);
              v.camera.lookAt(-18.45, 0.9, 9.0);
            }''')
            await render_frame(page)
            await page.screenshot(path=OUT2, timeout=120000)
            print('saved', OUT2)
        # Stand back up: hold the exit key for one frame, the leave runs there.
        await page.evaluate('''() => {
          const v = window.__villa;
          v.input.down = () => true;
        }''')
        await render_frame(page)
        await page.wait_for_timeout(400)
        await page.evaluate('''() => {
          const v = window.__villa;
          v.input.down = () => false;
          v.ctrl.pos.set(-17.7, 0.47, 10.6);
          v.ctrl.prevY = 0.47;
          v.ctrl.vel.set(0, 0, 0);
          v.camera.position.set(-19.3, 1.4, 11.4);
          v.camera.lookAt(-17.6, 0.95, 10.3);
        }''')
        await render_frame(page)
        await page.screenshot(path=sys.argv[3], timeout=120000)
        print('saved stand-up', sys.argv[3])
        await browser.close()

asyncio.run(main())

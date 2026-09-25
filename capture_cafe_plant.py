# Headless capture of the gate-cafe figs, after the foliage retexture.
# SwiftShader can't keep up with the airport's continuous loop, so the animate
# kickoff is deferred (cruise_arts.py pattern) and frames are rendered on demand.
import asyncio, os, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '.venv/pw-browsers')
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'shot_cafe_plant.png'
OUT2 = sys.argv[2] if len(sys.argv) > 2 else None

RENDER = '''() => {
  const v = window.__villa;
  v.renderer.setPixelRatio(0.8);
  window.__raf = window.__raf || window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = window.__raf;   // re-arm for this frame
  window.__testAnimate();                        // draw one frame
  window.requestAnimationFrame = () => 0;        // ...and stop the chain
}'''

async def render_frame(page):
    await page.evaluate(RENDER)
    await page.wait_for_timeout(700)               # let the frame composite

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = await browser.new_page(viewport={'width': 1100, 'height': 620})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:300]))

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
        # assets (character included) finish loading behind the overlay
        await page.wait_for_timeout(8000)
        await page.evaluate('''() => {
          window.__startAirport();
          const ov = document.getElementById('overlay');
          if (ov) ov.style.display = 'none';
        }''')
        await page.wait_for_timeout(2500)
        # Stand in the cafe walkway; freeze the rig and frame the corner fig.
        await page.evaluate('''() => {
          const v = window.__villa;
          v.ctrl.pos.set(-19.2, 0.47, 7.2);
          v.ctrl.prevY = 0.47;
          v.ctrl.vel.set(0, 0, 0);
          v.ctrl.mode = 'ground';
          v.rig.update = () => {};
          v.camera.position.set(-17.4, 2.2, 7.8);
          v.camera.lookAt(-22.9, 1.3, 3.5);
        }''')
        await render_frame(page)
        await page.screenshot(path=OUT, timeout=120000)
        print('saved', OUT)
        if OUT2:
            # Second angle: the trailing plant on the back bar.
            await page.evaluate('''() => {
              const v = window.__villa;
              v.camera.position.set(-20.6, 2.7, 11.4);
              v.camera.lookAt(-23.5, 2.35, 9.2);
            }''')
            await render_frame(page)
            await page.screenshot(path=OUT2, timeout=120000)
            print('saved', OUT2)
        await browser.close()

asyncio.run(main())
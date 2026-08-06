# Headless capture of the lying pose on the master bed, before/after a change to
# what she is wearing on it. 'before' intercepts limbs.js and serves the pre-fix
# version from git.
import asyncio, os, sys
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '.venv/pw-browsers')
from playwright.async_api import async_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'after'
OUT = sys.argv[2] if len(sys.argv) > 2 else f'shot_{MODE}.png'
OLD_LIMBS = open('/tmp/limbs_old.js', 'rb').read() if MODE == 'before' else None

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = await browser.new_page(viewport={'width': 1100, 'height': 620})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:300]))
        if OLD_LIMBS:
            await page.route('**/limbs.js*', lambda r: r.fulfill(
                status=200, content_type='text/javascript', body=OLD_LIMBS))
        await page.goto('http://127.0.0.1:8123/index.html?map=la')
        await page.wait_for_function(
            'window.__villa && window.__villa.ctrl', timeout=300000)
        # assets (character included) finish loading behind the overlay
        await page.wait_for_timeout(8000)
        await page.click('#startBtn')
        await page.wait_for_timeout(2000)
        # stand on the floor right beside the master bed -> triggers 'lie'
        await page.evaluate('''() => {
          const v = window.__villa;
          v.ctrl.pos.set(-11.4, 0.47, -4.7);
          v.ctrl.prevY = 0.47;
          v.ctrl.vel.set(0, 0, 0);
          v.ctrl.mode = 'ground';
        }''')
        await page.wait_for_timeout(2500)
        print('mode:', await page.evaluate('window.__villa.ctrl.mode'))
        print('skirt visible:', await page.evaluate('''() => {
          let m = null;
          window.__villa.scene.traverse(o => { if (o.name === 'Wardrobe_NightShorts') m = o; });
          return m ? m.visible : 'MISSING';
        }'''))
        # freeze the camera rig and frame the bed from the foot-side corner
        await page.evaluate('''() => {
          const v = window.__villa;
          v.rig.update = () => {};
          v.camera.position.set(-10.5, 2.0, -7.9);
          v.camera.lookAt(-12.7, 0.8, -4.6);
        }''')
        await page.wait_for_timeout(500)
        await page.screenshot(path=OUT)
        await browser.close()
        print('saved', OUT)

asyncio.run(main())

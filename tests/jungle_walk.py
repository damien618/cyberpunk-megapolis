"""Walk the jungle map through the REAL controller (no rendering) and check
that the limits hold and the path is walkable end to end.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_walk.py
"""
import asyncio, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.async_api import async_playwright

WALK = '''async ([name, x, z, yaw, seconds, follow, wallsOnly]) => {
  const v = window.__jungle, THREE = v.THREE;
  // Walls only: every other box stops colliding for this walk, so a tree or
  // a boulder in the way cannot pass the test on the wall's behalf.
  const off = wallsOnly ? v.bw.aabbs.filter(b => !b.wall && b.collide) : [];
  for (const b of off) b.collide = false;
  let minY = Infinity;
  const y = v.terrainHeight(x, z);
  v.ctrl.rescueTo(new THREE.Vector3(x, y + 1.0, z));
  v.ctrl.vel.set(0, 0, 0);
  v.input.keys.clear();
  v.input.keys.add('KeyW');
  const fwd = new THREE.Vector3();
  const path = follow ? v.PATH : null;
  let seg = 0, stuck = 0, last = v.ctrl.pos.clone();
  for (let i = 0; i < seconds * 60; i++) {
    let yw = yaw;
    if (path) {
      while (seg < path.length - 1 && Math.hypot(path[seg][0] - v.ctrl.pos.x, path[seg][1] - v.ctrl.pos.z) < 2.5) seg++;
      const [tx, tz] = path[seg];
      yw = Math.atan2(-(tx - v.ctrl.pos.x), -(tz - v.ctrl.pos.z));
    }
    v.input.yaw = yw;
    fwd.set(-Math.sin(yw), 0, -Math.cos(yw));
    v.ctrl.update(1 / 60, v.input, yw, fwd);
    v.input.endFrame();
    minY = Math.min(minY, v.ctrl.pos.y);
    if (i % 60 === 59) { if (v.ctrl.pos.distanceTo(last) < 0.3) stuck++; else stuck = 0; last.copy(v.ctrl.pos); }
  }
  v.input.keys.clear();
  for (const b of off) b.collide = true;
  const p = v.ctrl.pos;
  return { name, minY: +minY.toFixed(2), x: +p.x.toFixed(1), y: +p.y.toFixed(2), z: +p.z.toFixed(1), mode: v.ctrl.mode,
           ground: +v.terrainHeight(p.x, p.z).toFixed(2), seg, stuck };
}'''

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
        page = await browser.new_page(viewport={'width': 640, 'height': 400})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:400]))
        async def defer(route):
            r = await route.fetch()
            body = (await r.text()).replace('\nanimate();', '\nwindow.__testAnimate = animate;')
            await route.fulfill(response=r, body=body, content_type='text/javascript')
        await page.route('**/main-JUNGLE.js*', defer)
        await page.goto('http://127.0.0.1:8000/index.html?map=jungle')
        await page.wait_for_function('window.__jungle && window.__jungle.ctrl', timeout=300000)
        await page.evaluate('''async () => {
          const L = await import('/jungleLayout.js');
          window.__jungle.PATH = L.PATH;
        }''')
        failed = 0
        def check(name, ok, r):
            nonlocal failed
            print(('ok  ' if ok else 'FAIL'), name, json.dumps(r))
            failed += 0 if ok else 1
        # yaw 0 walks -Z (out to sea), π walks +Z (inland), π/2 walks -X, -π/2 walks +X.
        # Limits, walls alone (see WALK).
        r = await page.evaluate(WALK, ['into the sea', 10, -10, 0, 25, False, True])
        check('stopped by the wade barrier', -39.5 < r['z'] < -36, r)
        for z in (0, 60, 130):
            r = await page.evaluate(WALK, [f'west at z={z}', -30, z, 3.1416 / 2, 30, False, True])
            check(f'stopped by the west wall at z={z}', -81.5 < r['x'] < -70, r)
            r = await page.evaluate(WALK, [f'east at z={z}', 40, z, -3.1416 / 2, 30, False, True])
            check(f'stopped by the east wall at z={z}', 70 < r['x'] < 81.5, r)
        for x in (-60, -20, 50):
            r = await page.evaluate(WALK, [f'cliff at x={x}', x, 120, 3.1416, 30, False, True])
            check(f'stopped at the cliff foot, x={x}', r['z'] < 152 and r['y'] < 16, r)
        # Everything on: the real walk.
        r = await page.evaluate(WALK, ['the path, beach to pool', -8, -6, 3.1416, 40, True, False])
        check('path walkable to its end', r['seg'] >= 100 and abs(r['x'] - 8) < 4 and abs(r['z'] - 133) < 4, r)
        r = await page.evaluate(WALK, ['into the pool', 8, 133, -2.1, 4, False, False])
        check('wading in the pool', r['minY'] < 9.6, r)
        r = await page.evaluate(WALK, ['along the jetty', -40, -4, 0, 12, False, False])
        check('stopped at the jetty head, on the deck', r['z'] < -31 and abs(r['y'] - 0.87) < 0.2, r)
        await browser.close()
        sys.exit(1 if failed else 0)

asyncio.run(main())

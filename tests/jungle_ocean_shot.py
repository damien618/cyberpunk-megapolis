"""Render the jungle map headless and check the ocean's shaders compile and
behave: no THREE errors on the console, waterHeightAt sane at three spots,
and a few screenshots into scratch/ for the eye to judge.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_ocean_shot.py
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SHOT = '''([name, x, y, z, lx, ly, lz]) => {
  const v = window.__jungle;
  v.camera.position.set(x, y, z);
  v.camera.lookAt(lx, ly, lz);
  v.renderer.render(v.scene, v.camera);
  return true;
}'''

PROBE = '''() => {
  const v = window.__jungle, o = v.ocean;
  const sea = o.waterHeightAt(0, -60, 12.5);
  const bar = Math.max(...[-64, -32, 0, 32, 64].map(x =>
    Math.abs(o.waterHeightAt(x, -38, 7.25))));
  const dry = Math.abs(o.waterHeightAt(0, -10, 3.5));
  return { sea, bar, dry,
           uniforms: Object.keys(o.uniforms),
           seaTris: o.sea.geometry.index.count / 3 };
}'''

POSES = [
    ['beach',   0,  2.6,  -2,   0, 0.6, -60],    # from the sand, out to sea
    ['jetty', -40,  2.4, -18, -40, 0.2, -50],    # along the jetty, over water
    ['graze',   0,  1.4, -55,   0, 1.8, -160],   # grazing angle: fresnel + swell
    ['cove',   55, 14,  -95,  -20, 0,   -10],    # high over the lagoon, cove ahead
]

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.on('console', lambda m: errors.append(m.text) if 'THREE' in m.text or 'shader' in m.text.lower() else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    def defer(route):
        r = route.fetch()
        body = r.text().replace('\nanimate();', '\nwindow.__testAnimate = animate;')
        route.fulfill(response=r, body=body, content_type='text/javascript')

    page.route('**/main-JUNGLE.js*', defer)
    page.goto('http://127.0.0.1:8000/index.html?map=jungle')
    page.wait_for_function('window.__jungle && window.__jungle.ocean', timeout=300000)
    page.wait_for_timeout(3500)   # textures in, so the shots are fair
    page.click('#startBtn')       # drop the intro overlay; the loop stays paused
    page.wait_for_timeout(500)

    # Warm-up frame compiles every program once; errors land in the console.
    page.evaluate('() => { const v = window.__jungle; v.renderer.render(v.scene, v.camera); }')
    page.wait_for_timeout(500)

    probe = page.evaluate(PROBE)
    for pose in POSES:
        page.evaluate(SHOT, pose)
        page.wait_for_timeout(120)
        page.screenshot(path=os.path.join(ROOT, 'scratch', f'jungle_ocean_{pose[0]}.png'))
    browser.close()

print('uniforms:', ', '.join(probe['uniforms']))
print(f"sea triangles: {probe['seaTris']:.0f}")
print(f"waterHeightAt offshore(0,-60): {probe['sea']:+.3f} m  (expect |h| ≤ 0.75)")
print(f"waterHeightAt at wade barrier: ±{probe['bar']:.3f} m  (expect ≤ 0.35)")
print(f"waterHeightAt on dry sand:     {probe['dry']:+.3f} m  (expect 0.00)")

bad = [e for e in errors if 'THREE' in e or 'shader' in e.lower() or 'Error' in e]
for e in bad[:12]:
    print('ERROR:', e[:500])
ok = (not bad
      and abs(probe['sea']) <= 0.75
      and probe['bar'] <= 0.36
      and abs(probe['dry']) < 0.02
      and probe['seaTris'] > 50000)
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)

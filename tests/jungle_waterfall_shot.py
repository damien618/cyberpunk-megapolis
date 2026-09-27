"""Render the jungle map headless and check the REFINED waterfall: the falls,
crest feed, pool, foam, splash and mist shaders all compile (no THREE errors
on the console), and a few screenshots land in scratch/ for the eye to judge.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_waterfall_shot.py
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SHOT = '''([name, x, y, z, lx, ly, lz]) => {
  const v = window.__jungle;
  v.falls.update(performance.now() * 0.001);   // a settled moment, not t=0
  v.camera.position.set(x, y, z);
  v.camera.lookAt(lx, ly, lz);
  v.renderer.render(v.scene, v.camera);
  // Grab the pixels in the same JS task: nothing (a running loop included)
  // can re-render or move the camera between this render and the grab.
  return v.renderer.domElement.toDataURL('image/png');
}'''

PROBE = '''() => {
  const v = window.__jungle, f = v.falls;
  v.renderer.render(v.scene, v.camera);
  const info = v.renderer.info.render;
  return {
    calls: info.calls, tris: info.triangles,
    mistDrawn: f.mist.geometry.drawRange.count,
    splashCount: f.splash.geometry.attributes.aSeed.count,
    hasCrest: !!f.crest, hasAnchor: !!f.audioAnchor,
    flow: f.falls.material.uniforms.uFlow.value,
    poolRipples: f.poolUniforms.uRipples.value,
  };
}'''

# Repères : bassin (22, 141, eau 10), lèvre (22, 154.5, y≈29.5), impact (22, 149.7, 10).
POSES = [
    ['pool',  22, 11.6, 127.5,  22, 17, 152],    # from the pool's rim, up at the falls
    ['path',   8, 13.6, 132,     22, 16, 150],   # the walker's first sight of it
    ['lip',   22, 32.5, 163,     22, 28, 151],   # the plateau: the feed pours over
    ['wide',  -8, 21,   112,     22, 15, 150],   # the whole wall from the forest
    ['stream', 26, 11.4, 133,    31, 5,  108],   # down the drain, toward the sea
]

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.on('console', lambda m: errors.append(m.text) if 'THREE' in m.text or 'shader' in m.text.lower() else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    def defer(route):
        r = route.fetch()
        body = r.text().replace('\\nanimate();', '\\nwindow.__testAnimate = animate;')
        route.fulfill(response=r, body=body, content_type='text/javascript')

    page.route('**/main-JUNGLE.js*', defer)
    page.goto('http://127.0.0.1:8000/index.html?map=jungle')
    page.wait_for_function('window.__jungle && window.__jungle.falls && window.__jungle.falls.crest',
                           timeout=300000)
    page.wait_for_timeout(3500)   # textures in, so the shots are fair
    page.click('#startBtn')       # drop the intro overlay; the loop stays paused
    page.wait_for_timeout(500)

    # Warm-up frame compiles every program once; errors land in the console.
    page.evaluate('() => { const v = window.__jungle; v.renderer.render(v.scene, v.camera); }')
    page.wait_for_timeout(500)

    probe = page.evaluate(PROBE)
    import base64
    for pose in POSES:
        data = page.evaluate(SHOT, pose)
        with open(os.path.join(ROOT, 'scratch', f'jungle_falls_{pose[0]}.png'), 'wb') as fh:
            fh.write(base64.b64decode(data.split(',', 1)[1]))
    browser.close()

print(f"draw calls: {probe['calls']}  triangles: {probe['tris']}")
print(f"mist particles drawn: {probe['mistDrawn']}  splash droplets: {probe['splashCount']}")
print(f"crest feed: {probe['hasCrest']}  audio anchor: {probe['hasAnchor']}"
      f"  flow: {probe['flow']}  pool ripples: {probe['poolRipples']}")

bad = [e for e in errors if 'THREE' in e or 'shader' in e.lower() or 'Error' in e]
for e in bad[:12]:
    print('ERROR:', e[:500])
ok = (not bad
      and probe['hasCrest'] and probe['hasAnchor']
      and abs(probe['flow'] - 1) < 1e-5
      and probe['mistDrawn'] == 280
      and probe['splashCount'] == 90)
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)

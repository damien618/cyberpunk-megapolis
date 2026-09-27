"""Render the jungle map headless and check the REFINED vegetation: the wind
patch on every foliage shader compiles (no THREE errors on the console), the
scatter is measured at seven poses (draw calls, triangles), and screenshots
land in scratch/ for the eye to judge.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_vegetation_shot.py
"""
import os, sys, base64
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SHOT = '''([name, x, z, lx, ly, lz]) => {
  const v = window.__jungle;
  const y = v.terrainHeight(x, z) + 2.1;
  v.ctrl.rescueTo({ x, y: y - 1.2, z });   // the shadow frustum follows the player
  v.vegetation.update({ x, z }, 0.5);
  v.camera.position.set(x, y, z);
  v.camera.lookAt(lx, ly, lz);
  v.renderer.render(v.scene, v.camera);
  const i = v.renderer.info.render;
  return { name, calls: i.calls, tris: i.triangles,
    data: v.renderer.domElement.toDataURL('image/png') };
}'''

# Repères : bassin (22, 141), lèvre (22, 154.5), sentier jusqu'à (8, 133).
POSES = [
    ['spawn',      -8,  -4,   0,  6,  60],   # the beach: palms over the sand
    ['beach_edge',  0,  20,   6,  6,  80],   # the forest edge from the sand
    ['path_mid',   -14,  60,   0,  9, 120],   # mid-climb, under the canopy
    ['forest',      -6,  90,  10, 10, 130],   # the deep floor: two statures, bushes
    ['stream_bank', 26, 122,  29,  4, 100],   # down the damp ring, toward the sea
    ['pool',        10, 128,  22, 18, 151],   # the falls framed by the green
    ['falls_view',   8, 131,  22, 18, 150],   # the kept sightline from the last bend
]

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.on('console', lambda m: errors.append(m.text) if 'THREE' in m.text or 'shader' in m.text.lower() else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto('http://127.0.0.1:8000/index.html?map=jungle')
    page.wait_for_function('window.__jungle && window.__jungle.vegetation', timeout=300000)
    page.wait_for_timeout(3500)   # textures in, so the shots are fair
    page.click('#startBtn')       # drop the intro overlay

    # Warm-up frame compiles every program once; errors land in the console.
    page.evaluate('() => { const v = window.__jungle; v.renderer.render(v.scene, v.camera); }')
    page.wait_for_timeout(500)
    counts = page.evaluate('() => JSON.stringify(window.__jungle.vegetation.counts)')
    print('counts:', counts)
    print()
    worst_calls = worst_tris = 0
    for pose in POSES:
        d = page.evaluate(SHOT, pose)
        worst_calls = max(worst_calls, d['calls'])
        worst_tris = max(worst_tris, d['tris'])
        print(f"{d['name']:12s} calls={d['calls']:4d}  tris={d['tris']:7d}")
        with open(os.path.join(ROOT, 'scratch', f"jungle_veg_{d['name']}.png"), 'wb') as fh:
            fh.write(base64.b64decode(d['data'].split(',', 1)[1]))
    print()
    print(f"worst pose: {worst_calls} draw calls, {worst_tris} triangles "
          f"(budget: 180 calls / 650k tris)")
    browser.close()

bad = [e for e in errors if 'THREE' in e or 'shader' in e.lower() or 'Error' in e]
for e in bad[:12]:
    print('ERROR:', e[:500])
ok = not bad and worst_calls <= 180 and worst_tris <= 650000
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
